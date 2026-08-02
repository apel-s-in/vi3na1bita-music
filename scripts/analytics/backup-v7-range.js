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

const packChain = async ({ deviceId, chainId, ownerYandexIdHash, events, storedRanges, maxRanges }) => {
  const key = deviceChainKey(deviceId, chainId);
  const existing = storedRanges
    .filter(range => safe(range.deviceId) === deviceId && safe(range.chainId) === chainId)
    .sort((left, right) => num(left.fromSeq) - num(right.fromSeq));
  const last = existing[existing.length - 1] || null;
  const chainState = await readBackupV7ChainState(deviceId, chainId);
  const packedSeq = Math.max(chainState.packedSeq, num(last?.toSeq));
  const packedRangeHash = safe(last?.hash || chainState.packedRangeHash);
  const source = events.filter(event => num(event.deviceSeq) > packedSeq);
  if (!source.length) return { packed: 0, events: 0, ranges: [] };

  let expectedSeq = packedSeq + 1;
  let previousRangeHash = packedRangeHash;
  let previousEventHash = safe(last?.events?.[last.events.length - 1]?.eventHash);
  let offset = 0;
  const ranges = [];

  if (num(source[0]?.deviceSeq) !== expectedSeq) throw new Error('backup_v71_local_chain_gap');
  if (expectedSeq === 1 && safe(source[0]?.prevHash)) throw new Error('backup_v71_local_genesis_hash_invalid');
  if (expectedSeq > 1 && previousEventHash && safe(source[0]?.prevHash) !== previousEventHash) {
    throw new Error('backup_v71_local_event_head_mismatch');
  }

  while (offset < source.length && ranges.length < maxRanges) {
    const picked = takeRangeEvents(source.slice(offset));
    if (!picked.length) break;
    const fromSeq = num(picked[0].deviceSeq);
    const toSeq = num(picked[picked.length - 1].deviceSeq);

    if (fromSeq !== expectedSeq || picked.some((event, index) => num(event.deviceSeq) !== fromSeq + index)) {
      throw new Error('backup_v71_local_chain_gap');
    }

    const range = await finalizeRange({
      version: BACKUP_V7_VERSION,
      ownerYandexIdHash,
      deviceId,
      chainId,
      fromSeq,
      toSeq,
      previousRangeHash,
      events: picked,
      createdAt: Date.now()
    });
    await verifyBackupV7Range(range, { ownerYandexIdHash });
    const shard = await buildStatsProjectionShard(range);
    await verifyStatsProjectionShard(shard, range);
    await persistPackedRange({ range, shard, eventIds: picked.map(event => event.eventId) });

    ranges.push(range);
    offset += picked.length;
    expectedSeq = toSeq + 1;
    previousRangeHash = range.hash;
    previousEventHash = safe(picked[picked.length - 1]?.eventHash);
    await writeBackupV7ChainState(deviceId, chainId, {
      packedSeq: toSeq,
      packedRangeHash: range.hash
    });
  }

  await clearLocalQuarantine(key);
  return {
    packed: ranges.length,
    events: ranges.reduce((sum, range) => sum + range.events.length, 0),
    ranges
  };
};

const currentOwnerHash = async () => {
  const yandexId = safe(window.YandexAuth?.getProfile?.()?.yandexId || window.YandexAuth?.getProfile?.()?.id);
  return yandexId ? sha256Hex(`ya:${yandexId}`) : '';
};

export const packLocalBackupV7Ranges = async ({
  deviceId = localStorage.getItem('deviceStableId') || '',
  ownerYandexIdHash = '',
  maxRanges = BACKUP_V7_MAX_PACK_RANGES
} = {}) => {
  const cleanDeviceId = safe(deviceId);
  const ownerHash = safe(ownerYandexIdHash) || await currentOwnerHash();
  if (!cleanDeviceId || !/^[a-f0-9]{64}$/.test(ownerHash)) {
    return { ok: false, skipped: true, reason: 'backup_v71_local_spool_identity_required', packed: 0, events: 0 };
  }
  if (window.playerCore?.isPlaying?.()) {
    return { ok: false, skipped: true, reason: 'backup_v71_local_spool_playback_active', packed: 0, events: 0 };
  }

  const [groups, storedRanges] = await Promise.all([
    localEventsByChain(cleanDeviceId),
    getAllRows('backup_event_ranges')
  ]);
  let remaining = Math.max(1, Math.floor(num(maxRanges) || BACKUP_V7_MAX_PACK_RANGES));
  let packed = 0;
  let events = 0;
  const quarantined = [];

  const ordered = [...groups.entries()].sort((left, right) =>
    num(left[1]?.[0]?.timestamp) - num(right[1]?.[0]?.timestamp)
  );

  for (const [key, rows] of ordered) {
    if (remaining <= 0) break;
    const chainId = safe(rows[0]?.chainId);
    if (!chainId) continue;
    try {
      const result = await packChain({
        deviceId: cleanDeviceId,
        chainId,
        ownerYandexIdHash: ownerHash,
        events: rows,
        storedRanges,
        maxRanges: remaining
      });
      packed += result.packed;
      events += result.events;
      remaining -= result.packed;
      storedRanges.push(...result.ranges);
    } catch (error) {
      quarantined.push(await quarantineLocalChain({
        deviceId: cleanDeviceId,
        chainId,
        error,
        events: rows
      }));
    }
  }

  await activateFreshBackupV7Chain();
  const state = await readBackupV7State();
  const currentRanges = storedRanges
    .filter(range => safe(range.deviceId) === cleanDeviceId && safe(range.chainId) === state.chainId)
    .sort((left, right) => num(left.toSeq) - num(right.toSeq));
  const currentLast = currentRanges[currentRanges.length - 1];
  if (currentLast) {
    await writeBackupV7State({
      packedSeq: currentLast.toSeq,
      packedRangeHash: currentLast.hash
    });
  }

  return { ok: true, packed, events, quarantined, remainingCapacity: remaining };
};

export const readPendingBackupV7Batch = async ({
  deviceId = localStorage.getItem('deviceStableId') || ''
} = {}) => {
  const cleanDeviceId = safe(deviceId);
  const rows = (await getAllRows('backup_event_ranges'))
    .filter(range => safe(range.deviceId) === cleanDeviceId)
    .filter(range => range.localPacked === true && !num(range.cloudUploadedAt))
    .sort((left, right) => safe(left.chainId).localeCompare(safe(right.chainId)) || num(left.fromSeq) - num(right.fromSeq));

  const ranges = [];
  let bytes = 0;
  for (const row of rows) {
    if (ranges.length >= BACKUP_V7_MAX_PUSH_RANGES) break;
    const range = canonicalRange(row);
    const size = byteLength(range);
    if (ranges.length && bytes + size > MAX_BATCH_BYTES) break;
    ranges.push(range);
    bytes += size;
  }
  if (!ranges.length) return null;

  return {
    version: BACKUP_V7_VERSION,
    batchId: `batch_${crypto.randomUUID()}`,
    deviceId: cleanDeviceId,
    ranges,
    bytes,
    createdAt: Date.now()
  };
};

export const buildPendingBackupV7Batch = async ({ deviceId, ownerYandexIdHash } = {}) => {
  await packLocalBackupV7Ranges({ deviceId, ownerYandexIdHash });
  return readPendingBackupV7Batch({ deviceId });
};

export const verifyBackupV7Range = async (range, { ownerYandexIdHash = '' } = {}) => {
  if (!range || typeof range !== 'object' || Array.isArray(range)) throw new Error('backup_v71_range_invalid');
  if (safe(range.version) !== BACKUP_V7_VERSION) throw new Error('backup_v71_version_invalid');
  if (!/^[a-f0-9]{64}$/.test(safe(range.ownerYandexIdHash))) throw new Error('backup_v71_range_owner_invalid');
  if (ownerYandexIdHash && safe(range.ownerYandexIdHash) !== safe(ownerYandexIdHash)) throw new Error('backup_v71_range_owner_mismatch');

  const events = Array.isArray(range.events) ? range.events : [];
  const fromSeq = num(range.fromSeq);
  const toSeq = num(range.toSeq);
  if (!events.length || events.length !== toSeq - fromSeq + 1) throw new Error('backup_v71_range_not_contiguous');

  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    if (num(event?.deviceSeq) !== fromSeq + index) throw new Error('backup_v71_event_sequence_mismatch');
    if (safe(event?.chainId) !== safe(range.chainId)) throw new Error('backup_v71_event_chain_mismatch');
    if (safe(event?.deviceStableId) !== safe(range.deviceId)) throw new Error('backup_v71_event_device_mismatch');
    if (index > 0 && safe(event.prevHash) !== safe(events[index - 1]?.eventHash)) throw new Error('backup_v71_event_link_mismatch');
    const { eventHash, ...payload } = event;
    if (!/^[a-f0-9]{64}$/.test(safe(eventHash)) || await sha256Hex(stableStringify(payload)) !== safe(eventHash)) {
      throw new Error('backup_v71_event_hash_mismatch');
    }
    if (safe(event.ownerYandexIdHash) && safe(event.ownerYandexIdHash) !== safe(range.ownerYandexIdHash)) {
      throw new Error('backup_v71_event_owner_mismatch');
    }
  }

  const expectedHash = await computeBackupV7RangeHash(range);
  if (safe(range.hash) !== expectedHash) throw new Error('backup_v71_range_hash_mismatch');
  const expectedKey = `${safe(range.deviceId)}:${safe(range.chainId)}:${fromSeq}:${toSeq}:${expectedHash}`;
  if (safe(range.rangeKey) !== expectedKey) throw new Error('backup_v71_range_key_mismatch');
  return { ...range, hash: expectedHash, rangeKey: expectedKey };
};

export const commitUploadedBackupV7Batch = async batch => {
  const ranges = Array.isArray(batch?.ranges) ? batch.ranges : [];
  if (!ranges.length) return readBackupV7State();
  await metaDB.init();

  await new Promise((resolve, reject) => {
    const tx = metaDB.db.transaction(['backup_event_ranges', 'backup_known_ranges'], 'readwrite');
    const rangeStore = tx.objectStore('backup_event_ranges');
    const knownStore = tx.objectStore('backup_known_ranges');
    const uploadedAt = Date.now();

    ranges.forEach(range => {
      const request = rangeStore.get(range.rangeKey);
      request.onsuccess = () => {
        const stored = request.result;
        if (stored) {
          rangeStore.put({ ...stored, cloudConfirmed: true, cloudUploadedAt: stored.cloudUploadedAt || uploadedAt });
        }
      };
      knownStore.put({
        rangeKey: range.rangeKey,
        deviceId: range.deviceId,
        chainId: range.chainId,
        fromSeq: range.fromSeq,
        toSeq: range.toSeq,
        hash: range.hash,
        localPacked: true,
        cloudUploadedAt: uploadedAt,
        updatedAt: uploadedAt
      });
    });

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('backup_v71_upload_commit_aborted'));
  });

  const byChain = new Map();
  ranges.forEach(range => byChain.set(deviceChainKey(range.deviceId, range.chainId), range));
  for (const range of byChain.values()) {
    await writeBackupV7ChainState(range.deviceId, range.chainId, {
      uploadedSeq: range.toSeq,
      uploadedRangeHash: range.hash
    });
  }

  const state = await readBackupV7State();
  const currentLast = [...ranges].reverse().find(range => safe(range.chainId) === state.chainId);
  return currentLast
    ? writeBackupV7State({
        uploadedSeq: currentLast.toSeq,
        uploadedRangeHash: currentLast.hash,
        lastError: ''
      })
    : state;
};

export default {
  BACKUP_V7_VERSION,
  BACKUP_V7_MAX_EVENTS,
  BACKUP_V7_MAX_PUSH_RANGES,
  BACKUP_V7_MAX_PACK_RANGES,
  readBackupV7State,
  writeBackupV7State,
  readBackupV7ChainState,
  activateFreshBackupV7Chain,
  packLocalBackupV7Ranges,
  readPendingBackupV7Batch,
  buildPendingBackupV7Batch,
  computeBackupV7RangeHash,
  verifyBackupV7Range,
  commitUploadedBackupV7Batch
};
