// Immutable Backup v7 range builder/verifier.
// Не выполняет сеть и не управляет playback.
import { metaDB } from './meta-db.js';
import { buildStatsProjection, normalizeStatsProjection } from './stats-shard-contract.js';
import { describeEventForUi, isBackupSemanticNoiseEvent } from './event-contract.js';
import { readLedgerCheckpoint, stableStringify, sha256Hex, writeLedgerCheckpoint } from './event-integrity.js';

export const BACKUP_V7_VERSION = '7.0';
export const BACKUP_V7_MAX_EVENTS = 500;
const STATE_KEY = 'v7';
const safe = value => String(value == null ? '' : value).trim();
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;

const storeGet = (store, key) => metaDB.getStoreValue(store, key).catch(() => null);
const storeSet = (store, key, value) => metaDB.setStoreValue(store, key, value);

const readJson = (raw, fallback) => {
  try {
    const value = JSON.parse(raw || '');
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
};

const auditRows = events => (Array.isArray(events) ? events : [])
  .filter(event => event?.eventId && !isBackupSemanticNoiseEvent(event))
  .map(event => {
    const view = describeEventForUi(event);
    return {
      eventId: safe(event.eventId),
      type: safe(event.type),
      uid: event.uid == null ? null : safe(event.uid),
      timestamp: num(event.timestamp),
      deviceId: safe(event.deviceStableId),
      icon: safe(view.icon),
      title: safe(view.title).slice(0, 100),
      description: safe(view.desc).slice(0, 240)
    };
  });

const mutationClock = events => Math.max(Date.now(), ...events.map(event => num(event?.timestamp)));

const collectMutations = async events => {
  const clock = mutationClock(events);
  const profile = (await metaDB.getGlobal('user_profile').catch(() => null))?.value || { name: 'Слушатель', avatar: '😎' };
  return {
    profile: { key: 'profile', updatedAt: clock, value: profile },
    playlists: { key: 'sc3:playlists', updatedAt: clock, value: readJson(localStorage.getItem('sc3:playlists'), []) },
    showcaseDefault: { key: 'sc3:default', updatedAt: clock, value: readJson(localStorage.getItem('sc3:default'), {}) },
    albumColors: { key: 'sc3:albumColors', updatedAt: clock, value: readJson(localStorage.getItem('sc3:albumColors'), {}) }
  };
};

export const readBackupV7State = async () => {
  const row = await storeGet('backup_sync_state', STATE_KEY);
  return {
    version: BACKUP_V7_VERSION,
    activated: row?.value?.activated === true,
    chainId: safe(row?.value?.chainId),
    uploadedSeq: num(row?.value?.uploadedSeq),
    lastSyncAt: num(row?.value?.lastSyncAt),
    lastError: safe(row?.value?.lastError)
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

  const chainId = `chain_v7_${crypto.randomUUID()}`;
  const old = await readLedgerCheckpoint(metaDB).catch(() => ({}));
  await writeLedgerCheckpoint(metaDB, {
    ...old,
    chainId,
    deviceSeq: 0,
    headHash: '',
    updatedAt: Date.now(),
    repairedAt: 0,
    repairReason: '',
    repairedEvents: 0
  });
  await writeBackupV7State({ activated: true, chainId, uploadedSeq: 0, lastSyncAt: 0, lastError: '' });

  window.eventLogger?.log?.('SYNC_STATE_CHANGED', null, { action: 'backup_v7_chain_started', version: BACKUP_V7_VERSION });
  await window.eventLogger?.flush?.().catch(() => null);
  await window.statsAggregator?.waitForIdle?.().catch(() => null);
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
    .sort((left, right) => num(left.deviceSeq) - num(right.deviceSeq))
    .slice(0, BACKUP_V7_MAX_EVENTS);
};

export const readPendingBackupV7Range = async () => (await storeGet('backup_pending_ranges', STATE_KEY))?.value || null;

export const savePendingBackupV7Range = range => storeSet('backup_pending_ranges', STATE_KEY, range);

export const clearPendingBackupV7Range = () => metaDB.tx('backup_pending_ranges', 'readwrite', store => store.delete(STATE_KEY));

export const buildNextBackupV7Range = async ({ deviceId, ownerYandexIdHash } = {}) => {
  const existing = await readPendingBackupV7Range();
  if (existing) return existing;

  const state = await activateFreshBackupV7Chain();
  const events = await readChainEvents({ chainId: state.chainId, afterSeq: state.uploadedSeq });
  if (!events.length) return null;

  const fromSeq = num(events[0].deviceSeq);
  const toSeq = num(events[events.length - 1].deviceSeq);
  if (fromSeq !== state.uploadedSeq + 1 || events.some((event, index) => num(event.deviceSeq) !== fromSeq + index)) {
    throw new Error('backup_v7_local_chain_gap');
  }

  const range = {
    version: BACKUP_V7_VERSION,
    ownerYandexIdHash: safe(ownerYandexIdHash),
    deviceId: safe(deviceId),
    chainId: state.chainId,
    fromSeq,
    toSeq,
    events,
    projection: normalizeStatsProjection(buildStatsProjection(events)),
    audit: auditRows(events),
    mutations: await collectMutations(events),
    createdAt: Date.now()
  };
  await savePendingBackupV7Range(range);
  return range;
};

export const computeBackupV7RangeHash = range => sha256Hex(stableStringify({
  version: BACKUP_V7_VERSION,
  ownerYandexIdHash: safe(range?.ownerYandexIdHash),
  deviceId: safe(range?.deviceId),
  chainId: safe(range?.chainId),
  fromSeq: num(range?.fromSeq),
  toSeq: num(range?.toSeq),
  events: Array.isArray(range?.events) ? range.events : [],
  projection: range?.projection && typeof range.projection === 'object' ? range.projection : {},
  audit: Array.isArray(range?.audit) ? range.audit : [],
  mutations: range?.mutations && typeof range.mutations === 'object' ? range.mutations : {},
  createdAt: num(range?.createdAt)
}));

export const verifyBackupV7Range = async range => {
  if (!range || typeof range !== 'object' || Array.isArray(range)) throw new Error('backup_v7_range_invalid');
  const events = Array.isArray(range.events) ? range.events : [];
  const fromSeq = num(range.fromSeq);
  const toSeq = num(range.toSeq);
  if (!events.length || events.length !== toSeq - fromSeq + 1) throw new Error('backup_v7_range_not_contiguous');

  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    if (num(event?.deviceSeq) !== fromSeq + index) throw new Error('backup_v7_event_sequence_mismatch');
    if (safe(event?.chainId) !== safe(range.chainId)) throw new Error('backup_v7_event_chain_mismatch');
    if (safe(event?.deviceStableId) !== safe(range.deviceId)) throw new Error('backup_v7_event_device_mismatch');
    if (index > 0 && safe(event.prevHash) !== safe(events[index - 1]?.eventHash)) throw new Error('backup_v7_event_link_mismatch');
    const { eventHash, ...payload } = event;
    if (!/^[a-f0-9]{64}$/.test(safe(eventHash)) || await sha256Hex(stableStringify(payload)) !== safe(eventHash)) {
      throw new Error('backup_v7_event_hash_mismatch');
    }
  }

  const expectedHash = await computeBackupV7RangeHash(range);
  if (safe(range.hash) !== expectedHash) throw new Error('backup_v7_range_hash_mismatch');
  const expectedKey = `${safe(range.deviceId)}:${safe(range.chainId)}:${fromSeq}:${toSeq}:${expectedHash}`;
  if (safe(range.rangeKey) !== expectedKey) throw new Error('backup_v7_range_key_mismatch');

  const projection = normalizeStatsProjection(buildStatsProjection(events));
  if (stableStringify(projection) !== stableStringify(normalizeStatsProjection(range.projection))) {
    throw new Error('backup_v7_projection_mismatch');
  }
  return { ...range, projection };
};

export default {
  BACKUP_V7_VERSION,
  BACKUP_V7_MAX_EVENTS,
  readBackupV7State,
  writeBackupV7State,
  activateFreshBackupV7Chain,
  readPendingBackupV7Range,
  savePendingBackupV7Range,
  clearPendingBackupV7Range,
  buildNextBackupV7Range,
  computeBackupV7RangeHash,
  verifyBackupV7Range
};
