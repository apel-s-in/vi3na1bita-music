// UID.003_(Event log truth)_(держать backup честным и пересчитываемым)_(backup должен оставаться event-log-centric) // UID.073_(Hybrid sync orchestrator)_(подготовить backup как transport-слой для multi-provider sync)_(future orchestration жить отдельно от vault) // UID.089_(Future MetaDB stores)_(расширить backup listener/provider/recommendation/collection state)_(когда intel stores начнут наполняться, vault должен включить их без ломки формата) // UID.099_(Multi-device sync model)_(готовить deterministic merge без дублей)_(backup должен знать owner/devices/revision) // UID.100_(Backup snapshot as life capsule)_(сделать один канонический файл пользователя)_(manual/cloud backup используют один и тот же формат)
import { metaDB } from './meta-db.js';

const PROFILE_KEYS = [
  '__favorites_v2__','sc3:playlists','sc3:default','sc3:activeId','sc3:ui_v2','sc3:albumColors',
  'sourcePref','favoritesOnlyMode','qualityMode:v1','offline:mode:v1','offline:cacheQuality:v1',
  'cloud:listenThreshold','cloud:ttlDays','playerVolume','playerStateV2','lyricsViewMode',
  'lyricsAnimationEnabled','lyricsShowAnimBtn','logoPulseEnabled','logoPulsePreset',
  'logoPulseIntensity','logoPulseDebug','profileShowControls','dl_format_v1','app:first-install-ts',
  'sleepTimerState:v2'
];

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
  const cur = {
    deviceHash: localStorage.getItem('deviceHash') || crypto.randomUUID(),
    platform: window.Utils?.getPlatform?.()?.isIOS ? 'ios' : (/Android/i.test(navigator.userAgent) ? 'android' : 'web'),
    userAgent: navigator.userAgent,
    firstSeenAt: Number(localStorage.getItem('app:first-install-ts') || Date.now()),
    lastSeenAt: Date.now()
  };
  let list = [];
  try { list = JSON.parse(localStorage.getItem('backup:device_registry:v1') || '[]'); } catch {}
  const map = new Map((Array.isArray(list) ? list : []).filter(Boolean).map(x => [String(x.deviceHash || '').trim(), x]));
  const prev = map.get(cur.deviceHash) || {};
  map.set(cur.deviceHash, { ...prev, ...cur, firstSeenAt: Number(prev.firstSeenAt || cur.firstSeenAt), lastSeenAt: Date.now() });
  const out = [...map.values()].sort((a, b) => Number(a.firstSeenAt || 0) - Number(b.firstSeenAt || 0));
  try { localStorage.setItem('backup:device_registry:v1', JSON.stringify(out)); } catch {}
  return out;
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

export class BackupVault {
  static async buildBackupObject() {
    const identity = await readOwnerIdentity();
    const devices = await readDeviceRegistry();
    const data = await readSnapshotData();
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
            const seen = new Set();
            const merged = [...await metaDB.getEvents('events_warm'), ...(b.data.eventLog.warm || [])]
              .filter(ev => ev?.eventId && !seen.has(ev.eventId) && seen.add(ev.eventId))
              .sort((x, y) => x.timestamp - y.timestamp);

            await metaDB.clearEvents('events_warm');
            await metaDB.addEvents(merged, 'events_warm');

            for (const s of (b.data.stats || [])) await metaDB.tx('stats', 'readwrite', st => st.put(s));
            if (b.data.achievements) await metaDB.setGlobal('unlocked_achievements', b.data.achievements);
            if (b.data.streaks) await metaDB.setGlobal('global_streak', b.data.streaks);
            if (b.data.userProfileRpg) await metaDB.setGlobal('user_profile_rpg', b.data.userProfileRpg);

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
              try { localStorage.setItem(k, v); } catch {}
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
    return {
      timestamp: Number(b?.revision?.timestamp || b?.createdAt || 0),
      appVersion: String(b?.revision?.appVersion || 'unknown'),
      statsCount: Array.isArray(b?.data?.stats) ? b.data.stats.filter(x => x?.uid && x.uid !== 'global').length : 0,
      eventCount: Array.isArray(b?.data?.eventLog?.warm) ? b.data.eventLog.warm.length : 0,
      achievementsCount: Object.keys(b?.data?.achievements || {}).length,
      favoritesCount: Array.isArray(favs) ? favs.length : 0,
      playlistsCount: Array.isArray(pls) ? pls.length : 0,
      profileName: String(b?.data?.userProfile?.name || 'Слушатель'),
      ownerYandexId: String(b?.identity?.ownerYandexId || ''),
      devicesCount: Array.isArray(b?.devices) ? b.devices.length : 0,
      checksum: String(b?.integrity?.payloadHash || '')
    };
  }
}
