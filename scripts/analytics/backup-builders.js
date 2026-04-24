import { metaDB } from './meta-db.js';
import DeviceRegistry from './device-registry.js';
import { normalizeCloudBackupMeta } from './cloud-contract.js';
import { collectSnapshotLocalStorage } from './snapshot-contract.js';

const sortObj = v => Array.isArray(v) ? v.map(sortObj) : (!v || typeof v !== 'object') ? v : Object.keys(v).sort().reduce((a, k) => (a[k] = sortObj(v[k]), a), {});
export const stableStringify = v => JSON.stringify(sortObj(v));
export const sha256Hex = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s||''))))].map(b => b.toString(16).padStart(2,'0')).join('');

export const readBackupOwnerIdentity = async () => {
  const p = window.YandexAuth?.getProfile?.();
  return {
    internalUserId: localStorage.getItem('intel:internal-user-id') || localStorage.getItem('deviceHash') || crypto.randomUUID(),
    ownerYandexId: String(p?.yandexId||p?.id||'').trim()||null,
    ownerLogin: String(p?.login||'').trim()||null,
    ownerDisplayName: String(p?.displayName||p?.realName||'').trim()||null
  };
};

export const readDeviceRegistryForBackup = async () => {
  const { getOrCreateDeviceHash, getOrCreateDeviceStableId } = await import('../core/device-identity.js');
  const h = await getOrCreateDeviceHash();
  const id = await getOrCreateDeviceStableId();
  const cur = DeviceRegistry.normalizeDeviceRow({
    deviceHash: h,
    deviceStableId: id,
    platform: window.Utils?.getPlatform?.()?.isIOS ? 'ios' : (/Android/i.test(navigator.userAgent) ? 'android' : 'web'),
    userAgent: navigator.userAgent,
    firstSeenAt: Number(localStorage.getItem('app:first-install-ts') || Date.now()),
    lastSeenAt: Date.now(),
    seenHashes: [h]
  });
  const raw = DeviceRegistry.getDeviceRegistry();
  const deduped = DeviceRegistry.normalizeDeviceRegistry(raw);
  const withCurrent = DeviceRegistry.normalizeDeviceRegistry([...deduped, cur]);
  const expectedMax = new Set([...withCurrent.map(d => d.deviceStableId || d.deviceHash)].filter(Boolean)).size;
  const finalList = withCurrent.length > expectedMax ? withCurrent.slice(0, expectedMax) : withCurrent;
  if (finalList.length < raw.length) console.debug(`[BackupVault] device registry deduplicated: ${raw.length} → ${finalList.length}`);
  DeviceRegistry.saveDeviceRegistry(finalList);
  return finalList;
};

export const readDeviceCacheMetaForBackup = async () => {
  try {
    const [{ getAllTrackMetas }, { getCurrentDeviceHash, getCurrentDeviceStableId }] = await Promise.all([
      import('../offline/cache-db.js'),
      import('../core/device-identity.js')
    ]);
    return {
      deviceHash: getCurrentDeviceHash?.() || localStorage.getItem('deviceHash') || '',
      deviceStableId: getCurrentDeviceStableId?.() || localStorage.getItem('deviceStableId') || '',
      items: (await getAllTrackMetas()).filter(m => ['pinned','cloud'].includes(m.type)).map(m => ({
        uid:m.uid, type:m.type, quality:m.quality, size:m.size||0, cloudExpiresAt:m.cloudExpiresAt||null, pinnedAt:m.pinnedAt||null
      }))
    };
  } catch { return null; }
};

const dedupIntel = arr => {
  if (!Array.isArray(arr) || !arr.length) return [];
  const m = new Map();
  arr.forEach(r => { if (r?.key) m.set(String(r.key), r); });
  return [...m.values()];
};

const WARM_MAX = 2000;
export const trimWarmEvents = events => {
  if (!Array.isArray(events)) return [];
  if (events.length <= WARM_MAX) return events;
  return [...events].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).slice(-WARM_MAX);
};

export const buildBackupDataSnapshot = async () => {
  const [st, w, a, str, uP, uR, lP, pI, hS, rS, cS, iR] = await Promise.all([
    metaDB.getAllStats(),
    metaDB.getEvents('events_warm'),
    metaDB.getGlobal('unlocked_achievements'),
    metaDB.getGlobal('global_streak'),
    metaDB.getGlobal('user_profile'),
    metaDB.getGlobal('user_profile_rpg'),
    metaDB.getStoreAll('listener_profile').catch(()=>[]),
    metaDB.getStoreAll('provider_identity').catch(()=>[]),
    metaDB.getStoreAll('hybrid_sync').catch(()=>[]),
    metaDB.getStoreAll('recommendation_state').catch(()=>[]),
    metaDB.getStoreAll('collection_state').catch(()=>[]),
    metaDB.getStoreAll('intel_runtime').catch(()=>[])
  ]);
  const wClean = w.filter(x => x.type !== 'ACHIEVEMENT_UNLOCK' && !(x.type === 'FEATURE_USED' && String(x.data?.feature).startsWith('backup')));
  const warmTrimmed = trimWarmEvents(wClean);
  if (warmTrimmed.length < w.length || wClean.length < w.length) console.debug(`[BackupVault] warm events trimmed/cleaned: ${w.length} → ${warmTrimmed.length}`);
  return {
    stats: st,
    eventLog: { warm: warmTrimmed },
    achievements: a?.value || {},
    streaks: str?.value || {},
    userProfile: uP?.value || { name: 'Слушатель', avatar: '😎' },
    userProfileRpg: uR?.value || { xp: 0, level: 1 },
    localStorage: collectSnapshotLocalStorage(localStorage),
    intel: {
      listenerProfile: dedupIntel(lP),
      providerIdentity: dedupIntel(pI),
      hybridSync: dedupIntel(hS),
      recommendationState: dedupIntel(rS),
      collectionState: dedupIntel(cS),
      intelRuntime: dedupIntel(iR)
    }
  };
};

export const buildBackupRevision = ({ identity, devices, data, currentDevice } = {}) => normalizeCloudBackupMeta({
  timestamp: Date.now(),
  appVersion: window.APP_CONFIG?.APP_VERSION || null,
  version: '6.0',
  eventCount: Array.isArray(data?.eventLog?.warm) ? data.eventLog.warm.length : 0,
  statsCount: Array.isArray(data?.stats) ? data.stats.length : 0,
  devicesCount: Array.isArray(devices) ? devices.length : 0,
  profileName: String(data?.userProfile?.name || 'Слушатель'),
  sourceDeviceStableId: String(currentDevice?.deviceStableId || ''),
  sourceDeviceLabel: String(currentDevice?.label || ''),
  sourceDeviceClass: String(currentDevice?.class || ''),
  sourcePlatform: String(currentDevice?.platform || ''),
  latestPath: '',
  historyPath: '',
  ownerYandexId: String(identity?.ownerYandexId || ''),
  favoritesCount: 0,
  playlistsCount: 0,
  achievementsCount: Object.keys(data?.achievements || {}).length,
  level: Math.max(1, Number(data?.userProfileRpg?.level || 1)),
  xp: Number(data?.userProfileRpg?.xp || 0),
  deviceStableCount: DeviceRegistry.countDeviceStableIds(devices || []),
  checksum: ''
});

export const buildFullBackupObject = async () => {
  const identity = await readBackupOwnerIdentity();
  const devices = await readDeviceRegistryForBackup();
  const data = await buildBackupDataSnapshot();
  const cacheMeta = await readDeviceCacheMetaForBackup();
  if (cacheMeta?.deviceHash || cacheMeta?.deviceStableId) {
    const d = devices.find(x => (cacheMeta.deviceStableId && x.deviceStableId === cacheMeta.deviceStableId) || (cacheMeta.deviceHash && x.deviceHash === cacheMeta.deviceHash));
    if (d) d._cacheMeta = cacheMeta.items;
  }
  const currentDevice = Array.isArray(devices) ? devices.find(x => (cacheMeta?.deviceStableId && x.deviceStableId === cacheMeta.deviceStableId) || (cacheMeta?.deviceHash && x.deviceHash === cacheMeta.deviceHash)) || devices[0] || null : null;
  const revision = buildBackupRevision({ identity, devices, data, currentDevice });
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
      ownerBinding: await sha256Hex(`${identity.ownerYandexId||'anon'}::${identity.internalUserId||'local'}::${payloadHash}`)
    },
    data
  };
};

export default {
  stableStringify,
  sha256Hex,
  readBackupOwnerIdentity,
  readDeviceRegistryForBackup,
  readDeviceCacheMetaForBackup,
  trimWarmEvents,
  buildBackupDataSnapshot,
  buildBackupRevision,
  buildFullBackupObject
};
