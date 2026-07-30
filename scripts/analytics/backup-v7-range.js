// Immutable Backup v7.1 range builder/verifier.
// Range хранит только полную последовательную event-chain.
import { metaDB } from './meta-db.js';
import { stableStringify, sha256Hex } from './event-integrity.js';

export const BACKUP_V7_VERSION = '7.1';
export const BACKUP_V7_MAX_EVENTS = 500;
export const BACKUP_V7_MAX_PUSH_RANGES = 20;
const STATE_KEY = 'v71';
const PENDING_KEY = 'v71_batch';
const MAX_BATCH_BYTES = 2500 * 1024;
const MAX_RANGE_BYTES = 700 * 1024;
const safe = value => String(value == null ? '' : value).trim();
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
const byteLength = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;

const storeGet = (store, key) => metaDB.getStoreValue(store, key).catch(() => null);
const storeSet = (store, key, value) => metaDB.setStoreValue(store, key, value);

export const readBackupV7State = async () => {
  const row = await storeGet('backup_sync_state', STATE_KEY);
  const value = row?.value || {};
  return {
    version: BACKUP_V7_VERSION,
    activated: value.version === BACKUP_V7_VERSION && value.activated === true,
    chainId: safe(value.chainId),
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

export const activateFreshBackupV7Chain = async () => {
  const state = await readBackupV7State();
  if (state.activated && state.chainId) return state;

  const chainId = `chain_v71_${crypto.randomUUID()}`;
  if (window.eventLogger?.rotateChain) {
    await window.eventLogger.rotateChain({ chainId, reason: 'backup_v71_activation' });
  } else {
    throw new Error('backup_v71_event_logger_rotation_required');
  }

  await writeBackupV7State({
    activated: true,
    chainId,
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

const readChainEvents = async ({ chainId, afterSeq = 0 } = {}) => {
  window.dispatchEvent(new CustomEvent('analytics:forceFlush'));
  await window.eventLogger?.flush?.().catch(() => null);
  await window.statsAggregator?.waitForIdle?.().catch(() => null);

  const [warm, hot] = await Promise.all([
    metaDB.getEvents('events_warm').catch(() => []),
    metaDB.getEvents('events_hot').catch(() => [])
  ]);
  const seen = new Set();

  return [...warm, ...hot]
    .filter(event => safe(event?.chainId) === safe(chainId) && num(event?.deviceSeq) > num(afterSeq) && event?.eventId && !seen.has(event.eventId) && seen.add(event.eventId))
    .sort((left, right) => num(left.deviceSeq) - num(right.deviceSeq));
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

export const readPendingBackupV7Batch = async () => (await storeGet('backup_pending_ranges', PENDING_KEY))?.value || null;
export const savePendingBackupV7Batch = batch => storeSet('backup_pending_ranges', PENDING_KEY, batch);
export const clearPendingBackupV7Batch = () => metaDB.tx('backup_pending_ranges', 'readwrite', store => store.delete(PENDING_KEY));

export const buildPendingBackupV7Batch = async ({ deviceId, ownerYandexIdHash } = {}) => {
  const existing = await readPendingBackupV7Batch();
  if (existing?.version === BACKUP_V7_VERSION && Array.isArray(existing.ranges)) return existing;

  const state = await activateFreshBackupV7Chain();
  const source = await readChainEvents({ chainId: state.chainId, afterSeq: state.uploadedSeq });
  if (!source.length) return null;

  const ranges = [];
  let offset = 0;
  let expectedSeq = state.uploadedSeq + 1;
  let previousRangeHash = state.uploadedRangeHash;
  let batchBytes = 0;

  while (offset < source.length && ranges.length < BACKUP_V7_MAX_PUSH_RANGES) {
    const events = takeRangeEvents(source.slice(offset));
    if (!events.length) break;

    const fromSeq = num(events[0].deviceSeq);
    const toSeq = num(events[events.length - 1].deviceSeq);
    if (fromSeq !== expectedSeq || events.some((event, index) => num(event.deviceSeq) !== fromSeq + index)) {
      throw new Error('backup_v71_local_chain_gap');
    }

    const range = await finalizeRange({
      version: BACKUP_V7_VERSION,
      ownerYandexIdHash: safe(ownerYandexIdHash),
      deviceId: safe(deviceId),
      chainId: state.chainId,
      fromSeq,
      toSeq,
      previousRangeHash,
      events,
      createdAt: Date.now()
    });
    const rangeBytes = byteLength(range);

    if (ranges.length && batchBytes + rangeBytes > MAX_BATCH_BYTES) break;
    ranges.push(range);
    batchBytes += rangeBytes;
    offset += events.length;
    expectedSeq = toSeq + 1;
    previousRangeHash = range.hash;
  }

  const batch = {
    version: BACKUP_V7_VERSION,
    batchId: `batch_${crypto.randomUUID()}`,
    deviceId: safe(deviceId),
    chainId: state.chainId,
    ranges,
    bytes: batchBytes,
    createdAt: Date.now()
  };
  await savePendingBackupV7Batch(batch);
  return batch;
};

export const verifyBackupV7Range = async (range, { ownerYandexIdHash = '' } = {}) => {
  if (!range || typeof range !== 'object' || Array.isArray(range)) throw new Error('backup_v71_range_invalid');
  if (safe(range.version) !== BACKUP_V7_VERSION) throw new Error('backup_v71_version_invalid');
  if (!/^[a-f0-9]{64}$/.test(safe(range.ownerYandexIdHash))) throw new Error('backup_v71_range_owner_invalid');
  if (ownerYandexIdHash && safe(range.ownerYandexIdHash) !== safe(ownerYandexIdHash)) {
    throw new Error('backup_v71_range_owner_mismatch');
  }

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
  const last = ranges[ranges.length - 1];
  if (!last) return readBackupV7State();

  const state = await writeBackupV7State({
    uploadedSeq: num(last.toSeq),
    uploadedRangeHash: safe(last.hash),
    lastError: ''
  });
  await clearPendingBackupV7Batch();
  return state;
};

export default {
  BACKUP_V7_VERSION,
  BACKUP_V7_MAX_EVENTS,
  BACKUP_V7_MAX_PUSH_RANGES,
  readBackupV7State,
  writeBackupV7State,
  activateFreshBackupV7Chain,
  readPendingBackupV7Batch,
  savePendingBackupV7Batch,
  clearPendingBackupV7Batch,
  buildPendingBackupV7Batch,
  computeBackupV7RangeHash,
  verifyBackupV7Range,
  commitUploadedBackupV7Batch
};
