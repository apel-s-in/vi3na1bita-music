// UID.003_(Event log truth)_(держать backup честным и пересчитываемым)_(backup должен оставаться event-log-centric) // UID.073_(Hybrid sync orchestrator)_(подготовить backup как transport-слой для multi-provider sync)_(future orchestration жить отдельно от vault) // UID.089_(Future MetaDB stores)_(расширить backup listener/provider/recommendation/collection state)_(когда intel stores начнут наполняться, vault должен включить их без ломки формата) // UID.099_(Multi-device sync model)_(готовить deterministic merge без дублей)_(backup должен знать owner/devices/revision) // UID.100_(Backup snapshot as life capsule)_(сделать один канонический файл пользователя)_(manual/cloud backup используют один и тот же формат)
import { metaDB } from './meta-db.js';
import {
  toNum, minPositive, maxDateStr,
  mergeNumArrayMax, mergeNumericMapMax, mergeStatRowSafe,
  mergeAchievementsSafe, mergeFavoritesStorageSafe,
  mergePlaylistsStorageSafe, mergeProfileStorageValueSafe
} from './backup-merge.js';
import DeviceRegistry from './device-registry.js';

const PROFILE_KEYS = [
  '__favorites_v2__','sc3:playlists','sc3:default','sc3:activeId','sc3:ui_v2','sc3:albumColors',
  'sourcePref','favoritesOnlyMode','qualityMode:v1','offline:mode:v1','offline:cacheQuality:v1',
  'cloud:listenThreshold','cloud:ttlDays','playerVolume','playerStateV2','lyricsViewMode',
  'lyricsAnimationEnabled','lyricsShowAnimBtn','logoPulseEnabled','logoPulsePreset',
  'logoPulseIntensity','logoPulseDebug','profileShowControls','dl_format_v1','app:first-install-ts',
  'sleepTimerState:v2'
];

// Ключи, которые не синхронизируются между устройствами (device-local)
// Эти настройки каждое устройство хранит своё
const DEVICE_LOCAL_KEYS = new Set([
  'offline:mode:v1',
  'offline:cacheQuality:v1',
  'cloud:listenThreshold',
  'cloud:ttlDays',
  'playerVolume',
  'playerStateV2',
  'sleepTimerState:v2',
  'favoritesOnlyMode',
  'qualityMode:v1'
]);

const PROFILE_ONLY_KEYS = new Set([
  '__favorites_v2__','sc3:playlists','sc3:default','sc3:activeId','sc3:ui_v2','sc3:albumColors',
  'sourcePref','favoritesOnlyMode','qualityMode:v1','offline:mode:v1','offline:cacheQuality:v1',
  'playerVolume','playerStateV2','lyricsViewMode','lyricsAnimationEnabled','lyricsShowAnimBtn',
  'logoPulseEnabled','logoPulsePreset','logoPulseIntensity','logoPulseDebug','profileShowControls',
  'dl_format_v1','sleepTimerState:v2'
]);

const sortObj = v => {
  if (Array.isArray(v)) return v.map(sortObj);
  if (!v || typeof v !== 'object') return v;
  return Object.keys(v).sort().reduce((a, k) => (a[k] = sortObj(v[k]), a), {});
};

const stableStringify = v => JSON.stringify(sortObj(v));

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str || '')));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function rebuildStatsFromWarmEventsSafe() {
  try {
    const [{ StatsAggregator }, { metaDB }] = await Promise.all([
      import('./stats-aggregator.js'),
      import('./meta-db.js')
    ]);
    await metaDB.tx('stats', 'readwrite', s => s.clear());
    const aggr = new StatsAggregator();
    await aggr.processHotEvents();
    return true;
  } catch (e) {
    console.debug('[BackupVault] rebuildStatsFromWarmEventsSafe failed:', e?.message);
    return false;
  }
}

async function readOwnerIdentity() {
  const ya = window.YandexAuth;
  const p = ya?.getProfile?.() || null;
  const yandexId = String(p?.yandexId || p?.id || '').trim() || null;
  return {
    internalUserId: localStorage.getItem('intel:internal-user-id') || localStorage.getItem('deviceHash') || crypto.randomUUID(),
    ownerYandexId: yandexId,
    ownerLogin: String(p?.login || '').trim() || null,
    ownerDisplayName: String(p?.displayName || p?.realName || '').trim() || null
  };
}

async function readDeviceRegistry() {
  const { getOrCreateDeviceHash, getOrCreateDeviceStableId } = await import('../core/device-identity.js');
  const deviceHash = await getOrCreateDeviceHash();
  const deviceStableId = await getOrCreateDeviceStableId();

  const cur = DeviceRegistry.normalizeDeviceRow({
    deviceHash,
    deviceStableId,
    platform: window.Utils?.getPlatform?.()?.isIOS ? 'ios' : (/Android/i.test(navigator.userAgent) ? 'android' : 'web'),
    userAgent: navigator.userAgent,
    firstSeenAt: Number(localStorage.getItem('app:first-install-ts') || Date.now()),
    lastSeenAt: Date.now(),
    seenHashes: [deviceHash]
  });

  const list = DeviceRegistry.getDeviceRegistry();
  const merged = DeviceRegistry.normalizeDeviceRegistry([...list, cur]);
  DeviceRegistry.saveDeviceRegistry(merged);
  return merged;
}

async function readDeviceCacheMeta() {
  try {
    const [{ getAllTrackMetas }, { getCurrentDeviceHash, getCurrentDeviceStableId }] = await Promise.all([
      import('../offline/cache-db.js'),
      import('../core/device-identity.js')
    ]);
    const metas = await getAllTrackMetas();
    const deviceHash = getCurrentDeviceHash?.() || localStorage.getItem('deviceHash') || '';
    const deviceStableId = getCurrentDeviceStableId?.() || localStorage.getItem('deviceStableId') || '';
    const relevant = metas.filter(m => ['pinned', 'cloud'].includes(m.type)).map(m => ({
      uid: m.uid,
      type: m.type,
      quality: m.quality,
      size: m.size || 0,
      cloudExpiresAt: m.cloudExpiresAt || null,
      pinnedAt: m.pinnedAt || null
    }));
    return { deviceHash, deviceStableId, items: relevant };
  } catch { return null; }
}

async function readSnapshotData() {
  const [
    stats, warm, achievements, streaks, userProfile, userProfileRpg,
    listenerProfile, providerIdentity, hybridSync, recommendationState, collectionState, intelRuntime
  ] = await Promise.all([
    metaDB.getAllStats(),
    metaDB.getEvents('events_warm'),
    metaDB.getGlobal('unlocked_achievements'),
    metaDB.getGlobal('global_streak'),
    metaDB.getGlobal('user_profile'),
    metaDB.getGlobal('user_profile_rpg'),
    metaDB.getStoreAll('listener_profile').catch(() => []),
    metaDB.getStoreAll('provider_identity').catch(() => []),
    metaDB.getStoreAll('hybrid_sync').catch(() => []),
    metaDB.getStoreAll('recommendation_state').catch(() => []),
    metaDB.getStoreAll('collection_state').catch(() => []),
    metaDB.getStoreAll('intel_runtime').catch(() => [])
  ]);

  const local = PROFILE_KEYS.reduce((acc, key) => {
    const val = localStorage.getItem(key);
    if (val != null) acc[key] = val;
    return acc;
  }, {});

  return {
    stats,
    eventLog: { warm },
    achievements: achievements?.value || {},
    streaks: streaks?.value || {},
    userProfile: userProfile?.value || { name: 'Слушатель', avatar: '😎' },
    userProfileRpg: userProfileRpg?.value || { xp: 0, level: 1 },
    localStorage: local,
    intel: { listenerProfile, providerIdentity, hybridSync, recommendationState, collectionState, intelRuntime }
  };
}

// merge-функции вынесены в ./backup-merge.js

export class BackupVault {
  static async buildBackupObject() {
    const identity = await readOwnerIdentity();
    const devices = await readDeviceRegistry();
    const data = await readSnapshotData();
    const deviceCacheMeta = await readDeviceCacheMeta();
    // Добавляем device-specific кэш в devices registry
    if (deviceCacheMeta?.deviceHash || deviceCacheMeta?.deviceStableId) {
      const devIdx = devices.findIndex(d =>
        (deviceCacheMeta.deviceStableId && d.deviceStableId === deviceCacheMeta.deviceStableId) ||
        (deviceCacheMeta.deviceHash && d.deviceHash === deviceCacheMeta.deviceHash)
      );
      if (devIdx >= 0) devices[devIdx]._cacheMeta = deviceCacheMeta.items;
    }
    const revision = {
      timestamp: Date.now(),
      appVersion: window.APP_CONFIG?.APP_VERSION || null,
      schemaVersion: '6.0',
      eventCount: Array.isArray(data?.eventLog?.warm) ? data.eventLog.warm.length : 0,
      statsCount: Array.isArray(data?.stats) ? data.stats.length : 0,
      devicesCount: devices.length
    };
    const payloadHash = await sha256Hex(stableStringify({ identity, devices, revision, data }));
    return {
      version: '6.0',
      createdAt: Date.now(),
      identity,
      devices,
      revision,
      integrity: {
        algorithm: 'SHA-256',
        payloadHash,
        ownerBinding: await sha256Hex(`${identity.ownerYandexId || 'anon'}::${identity.internalUserId || 'local'}::${payloadHash}`)
      },
      data
    };
  }

  static async exportData() {
    const data = await this.buildBackupObject();
    const blob = new Blob([stableStringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vi3na1bita_backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.vi3bak`;
    a.click();
    URL.revokeObjectURL(url);
    if (window.eventLogger) {
      window.eventLogger.log('FEATURE_USED', 'global', { feature: 'backup_export_manual' });
      window.dispatchEvent(new CustomEvent('analytics:forceFlush'));
    }
    return data;
  }

  static async parseBackupText(text) {
    const b = JSON.parse(text);
    if (!b?.data?.eventLog || !b?.identity || !b?.integrity?.payloadHash) throw new Error('Invalid format v6.0 required');
    const calcHash = await sha256Hex(stableStringify({
      identity: b.identity,
      devices: b.devices || [],
      revision: b.revision || {},
      data: b.data
    }));
    if (calcHash !== b.integrity.payloadHash) throw new Error('backup_integrity_failed');
    return b;
  }

  static async importData(fileOrBlob, mode = 'all') {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = async e => {
        try {
          const b = await this.parseBackupText(e.target.result);
          const curY = String(window.YandexAuth?.getProfile?.()?.yandexId || '').trim();
          const ownY = String(b?.identity?.ownerYandexId || '').trim();
          if (!curY) throw new Error('restore_requires_yandex_login');
          if (!ownY || ownY !== curY) throw new Error('restore_owner_mismatch');

          const intel = b.data.intel || {};
          const writeStoreAll = async (store, rows) => {
            if (!Array.isArray(rows) || !rows.length) return;
            await metaDB.tx(store, 'readwrite', s => rows.forEach(row => s.put(row)));
          };

          if (mode === 'all' || mode === 'stats') {
            const [localWarm, localAchievements, localStreaks, localRpg] = await Promise.all([
              metaDB.getEvents('events_warm'),
              metaDB.getGlobal('unlocked_achievements'),
              metaDB.getGlobal('global_streak'),
              metaDB.getGlobal('user_profile_rpg')
            ]);

            const seen = new Set();
            const mergedEvents = [...localWarm, ...(b.data.eventLog.warm || [])]
              .filter(ev => ev?.eventId && !seen.has(ev.eventId) && seen.add(ev.eventId))
              .sort((x, y) => x.timestamp - y.timestamp);

            await metaDB.clearEvents('events_warm');
            await metaDB.addEvents(mergedEvents, 'events_warm');

            await rebuildStatsFromWarmEventsSafe();

            const mergedAchievements = mergeAchievementsSafe(localAchievements?.value || {}, b.data.achievements || {});
            await metaDB.setGlobal('unlocked_achievements', mergedAchievements);

            const remoteStreaks = b.data.streaks || {};
            const localStreakValue = localStreaks?.value || {};
            await metaDB.setGlobal('global_streak', {
              ...localStreakValue,
              ...remoteStreaks,
              current: Math.max(toNum(localStreakValue.current), toNum(remoteStreaks.current)),
              longest: Math.max(toNum(localStreakValue.longest), toNum(remoteStreaks.longest)),
              lastActiveDate: maxDateStr(localStreakValue.lastActiveDate, remoteStreaks.lastActiveDate)
            });

            const remoteRpg = b.data.userProfileRpg || {};
            const localRpgValue = localRpg?.value || {};
            await metaDB.setGlobal('user_profile_rpg', {
              ...localRpgValue,
              ...remoteRpg,
              xp: Math.max(toNum(localRpgValue.xp), toNum(remoteRpg.xp)),
              level: Math.max(toNum(localRpgValue.level || 1), toNum(remoteRpg.level || 1), 1)
            });

            await writeStoreAll('listener_profile', intel.listenerProfile);
            await writeStoreAll('provider_identity', intel.providerIdentity);
            await writeStoreAll('hybrid_sync', intel.hybridSync);
            await writeStoreAll('recommendation_state', intel.recommendationState);
            await writeStoreAll('collection_state', intel.collectionState);
            await writeStoreAll('intel_runtime', intel.intelRuntime);
          }

          if (mode === 'all' || mode === 'profile') {
            if (b.data.userProfile) await metaDB.setGlobal('user_profile', b.data.userProfile);
            for (const [k, v] of Object.entries(b.data.localStorage || {})) {
              if (!PROFILE_ONLY_KEYS.has(k)) continue;
              // Device-local ключи НЕ синхронизируем с других устройств
              if (DEVICE_LOCAL_KEYS.has(k)) continue;
              try {
                const localVal = localStorage.getItem(k);
                localStorage.setItem(k, mergeProfileStorageValueSafe(k, localVal, v));
              } catch {}
            }
          }

          try {
            localStorage.setItem('backup:device_registry:v1', JSON.stringify(Array.isArray(b.devices) ? b.devices : []));
            localStorage.setItem('yandex:last_backup_local_ts', String(Number(b?.revision?.timestamp || b?.createdAt || Date.now())));
          } catch {}

          window.dispatchEvent(new CustomEvent('stats:updated'));
          window.dispatchEvent(new CustomEvent('analytics:logUpdated'));
          res(true);
        } catch (err) { rej(err); }
      };
      r.readAsText(fileOrBlob);
    });
  }

  static summarizeBackupObject(b) {
    const ls = b?.data?.localStorage || {};
    const favs = (() => { try { return JSON.parse(ls['__favorites_v2__'] || '[]'); } catch { return []; } })();
    const pls = (() => { try { return JSON.parse(ls['sc3:playlists'] || '[]'); } catch { return []; } })();
    const devices = Array.isArray(b?.devices) ? DeviceRegistry.normalizeDeviceRegistry(b.devices) : [];
    return {
      timestamp: Number(b?.revision?.timestamp || b?.createdAt || 0),
      appVersion: String(b?.revision?.appVersion || 'unknown'),
      statsCount: Array.isArray(b?.data?.stats) ? b.data.stats.filter(x => x?.uid && x.uid !== 'global').length : 0,
      eventCount: Array.isArray(b?.data?.eventLog?.warm) ? b.data.eventLog.warm.length : 0,
      achievementsCount: Object.keys(b?.data?.achievements || {}).length,
      favoritesCount: Array.isArray(favs) ? favs.filter(x => !x?.inactiveAt).length : 0,
      playlistsCount: Array.isArray(pls) ? pls.length : 0,
      profileName: String(b?.data?.userProfile?.name || 'Слушатель'),
      ownerYandexId: String(b?.identity?.ownerYandexId || ''),
      devicesCount: devices.length,
      deviceStableCount: DeviceRegistry.countDeviceStableIds(devices),
      checksum: String(b?.integrity?.payloadHash || '')
    };
  }
}
