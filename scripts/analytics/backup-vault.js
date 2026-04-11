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

const toNum = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const minPositive = (...vals) => {
  const xs = vals.map(toNum).filter(v => v > 0);
  return xs.length ? Math.min(...xs) : 0;
};
const maxDateStr = (a, b) => [String(a || '').trim(), String(b || '').trim()].sort().pop() || '';
const mergeNumArrayMax = (a, b, len = 0) => {
  const size = Math.max(len, Array.isArray(a) ? a.length : 0, Array.isArray(b) ? b.length : 0);
  return Array.from({ length: size }, (_, i) => Math.max(toNum(a?.[i]), toNum(b?.[i])));
};
const mergeNumericMapMax = (a = {}, b = {}) => {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out = {};
  keys.forEach(k => {
    const v = Math.max(toNum(a?.[k]), toNum(b?.[k]));
    if (v > 0) out[k] = v;
  });
  return out;
};
const mergeStatRowSafe = (localRow = {}, remoteRow = {}) => {
  const merged = {
    uid: String(remoteRow?.uid || localRow?.uid || '').trim(),
    globalListenSeconds: Math.max(toNum(localRow?.globalListenSeconds), toNum(remoteRow?.globalListenSeconds)),
    globalValidListenCount: Math.max(toNum(localRow?.globalValidListenCount), toNum(remoteRow?.globalValidListenCount)),
    globalFullListenCount: Math.max(toNum(localRow?.globalFullListenCount), toNum(remoteRow?.globalFullListenCount)),
    firstPlayedAt: minPositive(localRow?.firstPlayedAt, remoteRow?.firstPlayedAt),
    lastPlayedAt: Math.max(toNum(localRow?.lastPlayedAt), toNum(remoteRow?.lastPlayedAt)),
    featuresUsed: mergeNumericMapMax(localRow?.featuresUsed || {}, remoteRow?.featuresUsed || {})
  };
  const byHour = mergeNumArrayMax(localRow?.byHour, remoteRow?.byHour, 24);
  const byWeekday = mergeNumArrayMax(localRow?.byWeekday, remoteRow?.byWeekday, 7);
  if (byHour.some(Boolean)) merged.byHour = byHour;
  if (byWeekday.some(Boolean)) merged.byWeekday = byWeekday;
  return merged;
};
const mergeAchievementsSafe = (localMap = {}, remoteMap = {}) => {
  const out = { ...localMap };
  Object.entries(remoteMap || {}).forEach(([key, value]) => {
    const lv = toNum(out[key]);
    const rv = toNum(value);
    out[key] = lv > 0 && rv > 0 ? Math.min(lv, rv) : (rv || lv || Date.now());
  });
  return out;
};
const parseJsonSafe = (raw, fb) => { try { return JSON.parse(raw); } catch { return fb; } };
const mergeFavoritesStorageSafe = (localRaw, remoteRaw) => {
  const local = Array.isArray(parseJsonSafe(localRaw, [])) ? parseJsonSafe(localRaw, []) : [];
  const remote = Array.isArray(parseJsonSafe(remoteRaw, [])) ? parseJsonSafe(remoteRaw, []) : [];
  const map = new Map();
  [...local, ...remote].forEach(item => {
    const uid = String(item?.uid || '').trim();
    if (!uid) return;
    const prev = map.get(uid) || null;
    const prevActive = prev && !prev.inactiveAt;
    const curActive = !item?.inactiveAt;
    if (!prev) {
      map.set(uid, { ...item, uid });
      return;
    }
    if (prevActive || curActive) {
      map.set(uid, {
        ...prev,
        ...item,
        uid,
        inactiveAt: null,
        addedAt: minPositive(prev.addedAt, item.addedAt) || Date.now(),
        sourceAlbum: prev.sourceAlbum || item.sourceAlbum || prev.albumKey || item.albumKey || null,
        albumKey: prev.albumKey || item.albumKey || prev.sourceAlbum || item.sourceAlbum || null
      });
      return;
    }
    map.set(uid, {
      ...prev,
      ...item,
      uid,
      inactiveAt: Math.max(toNum(prev.inactiveAt), toNum(item.inactiveAt))
    });
  });
  return JSON.stringify([...map.values()]);
};
const uniq = arr => [...new Set((Array.isArray(arr) ? arr : []).filter(Boolean))];
const mergePlaylistsStorageSafe = (localRaw, remoteRaw) => {
  const local = Array.isArray(parseJsonSafe(localRaw, [])) ? parseJsonSafe(localRaw, []) : [];
  const remote = Array.isArray(parseJsonSafe(remoteRaw, [])) ? parseJsonSafe(remoteRaw, []) : [];
  const map = new Map();
  [...local, ...remote].forEach(pl => {
    const id = String(pl?.id || '').trim();
    if (!id) return;
    const prev = map.get(id);
    if (!prev) {
      map.set(id, { ...pl, id, order: uniq(pl?.order), hidden: uniq(pl?.hidden) });
      return;
    }
    const order = uniq([...(prev.order || []), ...(pl.order || [])]);
    const hidden = uniq([...(prev.hidden || []), ...(pl.hidden || [])]).filter(uid => order.includes(uid));
    map.set(id, {
      ...prev,
      ...pl,
      id,
      name: prev.name || pl.name || 'Плейлист',
      color: prev.color || pl.color || '',
      createdAt: minPositive(prev.createdAt, pl.createdAt) || Date.now(),
      order,
      hidden
    });
  });
  return JSON.stringify([...map.values()]);
};
const mergeProfileStorageValueSafe = (key, localVal, remoteVal) => {
  if (remoteVal == null) return localVal;
  if (localVal == null) return remoteVal;
  if (key === '__favorites_v2__') return mergeFavoritesStorageSafe(localVal, remoteVal);
  if (key === 'sc3:playlists') return mergePlaylistsStorageSafe(localVal, remoteVal);
  return remoteVal;
};

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
            const [localWarm, localStats, localAchievements, localStreaks, localRpg] = await Promise.all([
              metaDB.getEvents('events_warm'),
              metaDB.getAllStats(),
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

            const localStatsMap = new Map((localStats || []).filter(x => x?.uid).map(x => [x.uid, x]));
            const remoteStatsMap = new Map((b.data.stats || []).filter(x => x?.uid).map(x => [x.uid, x]));
            const allUids = new Set([...localStatsMap.keys(), ...remoteStatsMap.keys()]);
            for (const uid of allUids) {
              const mergedStat = mergeStatRowSafe(localStatsMap.get(uid) || {}, remoteStatsMap.get(uid) || {});
              if (mergedStat?.uid) await metaDB.tx('stats', 'readwrite', st => st.put(mergedStat));
            }

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
