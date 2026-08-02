// Immutable Backup v7.1 local spool.
// Упаковка событий отделена от сети и никогда не управляет playback.
import { metaDB } from './meta-db.js';
import { stableStringify, sha256Hex } from './event-integrity.js';
import { buildStatsProjectionShard, verifyStatsProjectionShard } from './stats-shard-contract.js';

export const BACKUP_V7_VERSION = '7.1';
export const BACKUP_V7_MAX_EVENTS = 500;
export const BACKUP_V7_MAX_PUSH_RANGES = 20;
export const BACKUP_V7_MAX_PACK_RANGES = 8;
const STATE_KEY = 'v71';
const CHAIN_STATE_PREFIX = 'v71_chain:';
const MAX_BATCH_BYTES = 2500 * 1024;
const MAX_RANGE_BYTES = 700 * 1024;
const safe = value => String(value == null ? '' : value).trim();
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
const byteLength = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const storeGet = (store, key) => metaDB.getStoreValue(store, key).catch(() => null);
const storeSet = (store, key, value) => metaDB.setStoreValue(store, key, value);
const chainStateKey = (deviceId, chainId) => `${CHAIN_STATE_PREFIX}${safe(deviceId)}:${safe(chainId)}`;
const deviceChainKey = (deviceId, chainId) => `${safe(deviceId)}:${safe(chainId)}`;

const getAllRows = async store => {
  await metaDB.init();
  return new Promise((resolve, reject) => {
    const request = metaDB.db.transaction(store, 'readonly').objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

const deleteRow = async (storeName, key) => {
  await metaDB.init();
  return new Promise((resolve, reject) => {
    const tx = metaDB.db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
};

export const readBackupV7State = async () => {
  const row = await storeGet('backup_sync_state', STATE_KEY);
  const value = row?.value || {};
  return {
    version: BACKUP_V7_VERSION,
    activated: value.version === BACKUP_V7_VERSION && value.activated === true,
    chainId: safe(value.chainId),
    packedSeq: num(value.packedSeq),
    packedRangeHash: safe(value.packedRangeHash),
    uploadedSeq: num(value.uploadedSeq),
    uploadedRangeHash: safe(value.uploadedRangeHash),
    lastSyncAt: num(value.lastSyncAt),
    settingsLocalHash: safe(value.settingsLocalHash),
    settingsServerHash: safe(value.settingsServerHash),
    sharedServerHash: safe(value.sharedServerHash),
    settingsTemplateApplied: value.settingsTemplateApplied === true,
    lastError: safe(value.lastError)
  };
};

export const writeBackupV7State = async patch => {
  const current = await readBackupV7State();
  const next = { ...current, ...(patch || {}), version: BACKUP_V7_VERSION, updatedAt: Date.now() };
  await storeSet('backup_sync_state', STATE_KEY, next);
  return next;
};

export const readBackupV7ChainState = async (deviceId, chainId) => {
  const row = await storeGet('backup_sync_state', chainStateKey(deviceId, chainId));
  const value = row?.value || {};
  return {
    version: BACKUP_V7_VERSION,
    deviceId: safe(deviceId || value.deviceId),
    chainId: safe(chainId || value.chainId),
    packedSeq: num(value.packedSeq),
    packedRangeHash: safe(value.packedRangeHash),
    uploadedSeq: num(value.uploadedSeq),
    uploadedRangeHash: safe(value.uploadedRangeHash),
    updatedAt: num(value.updatedAt)
  };
};

const writeBackupV7ChainState = (deviceId, chainId, patch = {}) =>
  readBackupV7ChainState(deviceId, chainId).then(current =>
    storeSet('backup_sync_state', chainStateKey(deviceId, chainId), {
      ...current,
      ...patch,
      version: BACKUP_V7_VERSION,
      deviceId: safe(deviceId),
      chainId: safe(chainId),
      updatedAt: Date.now()
    })
  );

export const activateFreshBackupV7Chain = async () => {
  const state = await readBackupV7State();
  if (state.activated && state.chainId) return state;

  const chainId = `chain_v71_${crypto.randomUUID()}`;
  if (!window.eventLogger?.rotateChain) throw new Error('backup_v71_event_logger_rotation_required');

  await window.eventLogger.rotateChain({ chainId, reason: 'backup_v71_activation' });
  await writeBackupV7State({
    activated: true,
    chainId,
    packedSeq: 0,
    packedRangeHash: '',
    uploadedSeq: 0,
    uploadedRangeHash: '',
    lastSyncAt: 0,
    lastError: ''
  });

  window.eventLogger?.log?.('SYNC_STATE_CHANGED', null, {
    action: 'backup_v71_chain_started',
    version: BACKUP_V7_VERSION
  });
  await window.eventLogger?.flush?.();
  return readBackupV7State();
};

const rangeCore = range => ({
  version: BACKUP_V7_VERSION,
  ownerYandexIdHash: safe(range?.ownerYandexIdHash),
  deviceId: safe(range?.deviceId),
  chainId: safe(range?.chainId),
  fromSeq: num(range?.fromSeq),
  toSeq: num(range?.toSeq),
  previousRangeHash: safe(range?.previousRangeHash),
  events: Array.isArray(range?.events) ? range.events : [],
  createdAt: num(range?.createdAt)
});

export const computeBackupV7RangeHash = range => sha256Hex(stableStringify(rangeCore(range)));

const finalizeRange = async core => {
  const hash = await computeBackupV7RangeHash(core);
  return {
    ...core,
    hash,
    rangeKey: `${core.deviceId}:${core.chainId}:${core.fromSeq}:${core.toSeq}:${hash}`
  };
};

const takeRangeEvents = rows => {
  const picked = [];
  for (const event of rows) {
    if (picked.length >= BACKUP_V7_MAX_EVENTS) break;
    const candidate = [...picked, event];
    if (picked.length && byteLength({ events: candidate }) > MAX_RANGE_BYTES) break;
    picked.push(event);
  }
  return picked;
};

const canonicalRange = range => ({
  ...rangeCore(range),
  hash: safe(range?.hash),
  rangeKey: safe(range?.rangeKey)
});

const flushAnalytics = async () => {
  window.dispatchEvent(new CustomEvent('analytics:forceFlush'));
  await window.eventLogger?.flush?.().catch(() => null);
  await window.statsAggregator?.waitForIdle?.().catch(() => null);
};

const localEventsByChain = async deviceId => {
  await flushAnalytics();
  const [warm, hot] = await Promise.all([
    metaDB.getEvents('events_warm').catch(() => []),
    metaDB.getEvents('events_hot').catch(() => [])
  ]);
  const groups = new Map();
  const seen = new Set();

  [...warm, ...hot]
    .filter(event => safe(event?.deviceStableId) === safe(deviceId))
    .filter(event => event?.eventId && event?.chainId && num(event?.deviceSeq) > 0)
    .filter(event => !seen.has(event.eventId) && seen.add(event.eventId))
    .forEach(event => {
      const key = deviceChainKey(deviceId, event.chainId);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(event);
    });

  groups.forEach(rows => rows.sort((left, right) => num(left.deviceSeq) - num(right.deviceSeq)));
  return groups;
};

const quarantineLocalChain = async ({ deviceId, chainId, error, events = [] }) => {
  const key = deviceChainKey(deviceId, chainId);
  const row = {
    key,
    deviceId: safe(deviceId),
    chainId: safe(chainId),
    local: true,
    eventIds: events.slice(0, 100).map(event => safe(event.eventId)).filter(Boolean),
    error: safe(error?.message || error).slice(0, 240),
    quarantinedAt: Date.now()
  };
  await storeSet('backup_chain_quarantine', key, row);
  return row;
};

const clearLocalQuarantine = key =>
  deleteRow('backup_chain_quarantine', key).catch(() => null);

const persistPackedRange = async ({ range, shard, eventIds }) => {
  await metaDB.init();
  return new Promise((resolve, reject) => {
    const tx = metaDB.db.transaction(
      ['backup_event_ranges', 'backup_known_ranges', 'backup_stats_rollups', 'events_hot', 'events_warm'],
      'readwrite'
    );
    const storedAt = Date.now();
    tx.objectStore('backup_event_ranges').put({
      ...range,
      deviceChain: deviceChainKey(range.deviceId, range.chainId),
      localPacked: true,
      cloudConfirmed: false,
      cloudUploadedAt: 0,
      verifiedAt: storedAt,
      storedAt,
      projected: true,
      projectedAt: storedAt
    });
    tx.objectStore('backup_known_ranges').put({
      rangeKey: range.rangeKey,
      deviceId: range.deviceId,
      chainId: range.chainId,
      fromSeq: range.fromSeq,
      toSeq: range.toSeq,
      hash: range.hash,
      localPacked: true,
      cloudUploadedAt: 0,
      updatedAt: storedAt
    });
    tx.objectStore('backup_stats_rollups').put(shard);
    eventIds.forEach(eventId => {
      tx.objectStore('events_hot').delete(eventId);
      tx.objectStore('events_warm').delete(eventId);
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('backup_v71_local_spool_aborted'));
  });
};

const packChain = async ({ deviceId, chainId, ownerYandexId`

-> ЗАМЕНИТЬ НА:

```javascript
      shuffle: this.s.shuffle,
      repeat: this.s.repeat,
      launchSource: this.s.launchSource,
      favoritesOnly: this.s.favoritesOnly,
