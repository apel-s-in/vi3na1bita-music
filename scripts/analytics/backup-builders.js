import { metaDB } from './meta-db.js';
import DeviceRegistry from './device-registry.js';
import { normalizeCloudBackupMeta } from './cloud-contract.js';
import { collectSharedSnapshotLocalStorage } from './snapshot-contract.js';
import { buildDeviceSettingsPath, collectDeviceSettingsLocalStorage, normalizeDeviceSettingsSnapshot } from './device-settings-contract.js';
import { normalizeEventList } from './backup-event-cleanup.js';
import { readLedgerCheckpoint } from './event-integrity.js';
import { isBackupSemanticNoiseEvent } from './event-contract.js';
import { AccountDataContext } from './account-data-boundary.js';

const sortObj = v => Array.isArray(v) ? v.map(sortObj) : (!v || typeof v !== 'object') ? v : Object.keys(v).sort().reduce((a, k) => (a[k] = sortObj(v[k]), a), {});
export const stableStringify = v => JSON.stringify(sortObj(v));
export const sha256Hex = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s || ''))))].map(b => b.toString(16).padStart(2, '0')).join('');

export const readBackupOwnerIdentity = async () => {
  const p = window.YandexAuth?.getProfile?.();
  return {
    internalUserId: localStorage.getItem('intel:internal-user-id') || localStorage.getItem('deviceHash') || crypto.randomUUID(),
    ownerYandexId: String(p?.yandexId || p?.id || '').trim() || null,
    ownerLogin: String(p?.login || '').trim() || null,
    ownerDisplayName: String(p?.displayName || p?.realName || '').trim() || null
  };
};

export const readDeviceRegistryForBackup = async () => {
  const [{ getOrCreateDeviceHash, getOrCreateDeviceStableId }, { detectCurrentDeviceProfile }] = await Promise.all([
    import('../core/device-identity.js'),
    import('../core/device-profile.js')
  ]);
  const [h, id] = await Promise.all([getOrCreateDeviceHash(), getOrCreateDeviceStableId()]);
  const prof = detectCurrentDeviceProfile({ registry: DeviceRegistry.getDeviceRegistry(), savedLabel: localStorage.getItem('yandex:onboarding:device_label') || '' });
  const cur = DeviceRegistry.normalizeDeviceRow({
    ...prof,
    deviceHash: h,
    deviceStableId: id,
    platform: prof.platform || (window.Utils?.getPlatform?.()?.isIOS ? 'ios' : (/Android/i.test(navigator.userAgent) ? 'android' : 'web')),
    userAgent: navigator.userAgent,
    firstSeenAt: Number(localStorage.getItem('app:first-install-ts') || Date.now()),
    lastSeenAt: Date.now(),
    lastBackupAt: Date.now(),
    seenHashes: [h]
  });
  const fin = DeviceRegistry.normalizeDeviceRegistry([...DeviceRegistry.normalizeDeviceRegistry(DeviceRegistry.getDeviceRegistry()), cur]);
  const limit = new Set(fin.map(d => d.deviceStableId || d.deviceHash).filter(Boolean)).size;
  const res = fin.length > limit ? fin.slice(0, limit) : fin;
  DeviceRegistry.saveDeviceRegistry(res);
  return res;
};

const dedupIntel = arr => Array.isArray(arr) && arr.length ? [...new Map(arr.filter(r => r?.key).map(r => [String(r.key), r])).values()] : [];
const pickArchivableLedgerHead = events => {
  const rows = (Array.isArray(events) ? events : []).filter(e => e?.eventHash && e?.chainId && e?.deviceSeq && !isBackupSemanticNoiseEvent(e)).sort((a,b)=>(Number(a.timestamp||0)-Number(b.timestamp||0)) || (Number(a.deviceSeq||0)-Number(b.deviceSeq||0)));
  const x = rows[rows.length - 1] || null;
  return { archivableLedgerHead:String(x?.eventHash || ''), archivableLedgerSeq:Number(x?.deviceSeq || 0), archivableLedgerDeviceStableId:String(x?.deviceStableId || ''), archivableLedgerChainId:String(x?.chainId || ''), archivableEventCount:rows.length };
};
export const buildBackupDataSnapshot = async () => {
  try {
    window.dispatchEvent(new CustomEvent('analytics:forceFlush'));
    await window.eventLogger?.flush?.();
    await window.statsAggregator?.waitForIdle?.();
  } catch {}

  const [stats, hot, warm, userProfile, listenerProfile, providerIdentity, hybridSync, recommendationState, collectionState, intelRuntime, ledger] = await Promise.all([
    metaDB.getAllStats(),
    metaDB.getEvents('events_hot').catch(() => []),
    metaDB.getEvents('events_warm').catch(() => []),
    metaDB.getGlobal('user_profile'),
    metaDB.getStoreAll('listener_profile').catch(() => []),
    metaDB.getStoreAll('provider_identity').catch(() => []),
    metaDB.getStoreAll('hybrid_sync').catch(() => []),
    metaDB.getStoreAll('recommendation_state').catch(() => []),
    metaDB.getStoreAll('collection_state').catch(() => []),
    metaDB.getStoreAll('intel_runtime').catch(() => []),
    readLedgerCheckpoint(metaDB).catch(() => null)
  ]);

  const warmTrimmed = normalizeEventList([...(Array.isArray(warm) ? warm : []), ...(Array.isArray(hot) ? hot : [])], { limit: 10000 });
  return {
    stats,
    eventLog: { warm: warmTrimmed },
    ledger: ledger || {},
    userProfile: userProfile?.value || { name: 'Слушатель', avatar: '😎' },
    localStorage: collectSharedSnapshotLocalStorage(localStorage),
    intel: {
      listenerProfile: dedupIntel(listenerProfile),
      providerIdentity: dedupIntel(providerIdentity),
      hybridSync: dedupIntel(hybridSync),
      recommendationState: dedupIntel(recommendationState),
      collectionState: dedupIntel(collectionState),
      intelRuntime: dedupIntel(intelRuntime)
    }
  };
};

export const buildBackupRevision = ({ identity: i, devices: dv, data: d, currentDevice: c } = {}) => normalizeCloudBackupMeta({
  timestamp: Date.now(),
  appVersion: window.APP_CONFIG?.APP_VERSION || null,
  version: '6.1',
  eventCount: Array.isArray(d?.eventLog?.warm) ? d.eventLog.warm.length : 0,
  statsCount: Array.isArray(d?.stats) ? d.stats.length : 0,
  devicesCount: Array.isArray(dv) ? dv.length : 0,
  profileName: String(d?.userProfile?.name || 'Слушатель'),
  sourceDeviceStableId: String(c?.deviceStableId || ''),
  sourceDeviceLabel: String(c?.label || ''),
  sourceDeviceClass: String(c?.class || ''),
  sourcePlatform: String(c?.platform || ''),
  ownerYandexId: String(i?.ownerYandexId || ''),
  achievementsCount: 0,
  level: 1,
  xp: 0,
  deviceStableCount: DeviceRegistry.countDeviceStableIds(dv || [])
});

export const buildDeviceSettingsObject = async ({ identity: id, currentDevice: cd } = {}) => {
  const o = id || await readBackupOwnerIdentity();
  const c = cd || (() => {
    const m = DeviceRegistry.getCurrentDeviceIdentity();
    return DeviceRegistry.normalizeDeviceRegistry(DeviceRegistry.getDeviceRegistry()).find(d =>
      (m?.deviceStableId && d.deviceStableId === m.deviceStableId) || (m?.deviceHash && d.deviceHash === m.deviceHash)
    ) || null;
  })();
  const sId = String(c?.deviceStableId || localStorage.getItem('deviceStableId') || '').trim();
  return normalizeDeviceSettingsSnapshot({
    version: '1.0',
    timestamp: Date.now(),
    ownerYandexId: String(o?.ownerYandexId || ''),
    deviceStableId: sId,
    deviceHash: String(c?.deviceHash || localStorage.getItem('deviceHash') || '').trim(),
    sourceDeviceLabel: String(c?.label || ''),
    sourceDeviceClass: String(c?.class || ''),
    sourcePlatform: String(c?.platform || ''),
    path: buildDeviceSettingsPath(sId),
    localStorage: collectDeviceSettingsLocalStorage(localStorage)
  });
};

export const buildFullBackupObject = async () => {
  if (
    window.YandexAuth?.getSessionStatus?.() === 'active'
  ) {
    await AccountDataContext.requireCurrentOwner();
  }

  const [identity, devices, data] = await Promise.all([
    readBackupOwnerIdentity(),
    readDeviceRegistryForBackup(),
    buildBackupDataSnapshot()
  ]);
  const curIdentity = DeviceRegistry.getCurrentDeviceIdentity();
  const currentDevice = Array.isArray(devices)
    ? devices.find(x => (curIdentity?.deviceStableId && x.deviceStableId === curIdentity.deviceStableId) || (curIdentity?.deviceHash && x.deviceHash === curIdentity.deviceHash)) || devices[0] || null
    : null;

  const eventLogHash = await sha256Hex(stableStringify(data?.eventLog?.warm || []));
  const sharedStorageHash = await sha256Hex(stableStringify(data?.localStorage || {}));
  const ledger = data?.ledger || {}, arch = pickArchivableLedgerHead(data?.eventLog?.warm || []);
  const revision = {
    ...buildBackupRevision({ identity, devices, data, currentDevice }),
    eventLedgerHead: String(ledger.headHash || ''),
    eventLedgerSeq: Number(ledger.deviceSeq || 0),
    eventLedgerDeviceStableId: String(ledger.deviceStableId || currentDevice?.deviceStableId || ''),
    archivableLedgerHead: arch.archivableLedgerHead,
    archivableLedgerSeq: arch.archivableLedgerSeq,
    archivableLedgerDeviceStableId: arch.archivableLedgerDeviceStableId,
    archivableLedgerChainId: arch.archivableLedgerChainId,
    archivableEventCount: arch.archivableEventCount,
    eventLogHash,
    sharedStorageHash
  };
  const payloadHash = await sha256Hex(stableStringify({ identity, devices, revision, data }));

  return {
    version: '6.1',
    createdAt: Date.now(),
    identity,
    devices,
    revision,
    integrity: {
      algorithm: 'SHA-256',
      payloadHash,
      ownerBinding: await sha256Hex(`${identity.ownerYandexId || 'anon'}::${identity.internalUserId || 'local'}::${payloadHash}`),
      createdByAppVersion: window.APP_CONFIG?.APP_VERSION || 'unknown',
      schemaVersion: '6.1',
      minReaderVersion: '8.3.0',
      sourceDeviceStableId: String(currentDevice?.deviceStableId || ''),
      eventLedgerHead: revision.eventLedgerHead,
      eventLedgerSeq: revision.eventLedgerSeq,
      eventLedgerDeviceStableId: revision.eventLedgerDeviceStableId,
      archivableLedgerHead: revision.archivableLedgerHead,
      archivableLedgerSeq: revision.archivableLedgerSeq,
      archivableLedgerDeviceStableId: revision.archivableLedgerDeviceStableId,
      archivableLedgerChainId: revision.archivableLedgerChainId,
      archivableEventCount: revision.archivableEventCount,
      eventLogHash,
      sharedStorageHash
    },
    data
  };
};

export default {
  stableStringify,
  sha256Hex,
  readBackupOwnerIdentity,
  readDeviceRegistryForBackup,
  buildBackupDataSnapshot,
  buildBackupRevision,
  buildDeviceSettingsObject,
  buildFullBackupObject
};
