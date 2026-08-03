// Pure policy Backup V7.1 scheduler.
// Не читает storage, не выполняет сеть и не управляет playback.
export const BACKUP_DAILY_MS = 24 * 60 * 60 * 1000;
export const BACKUP_JITTER_MS = 30 * 60 * 1000;
export const BACKUP_CONTINUATION_MS = 3 * 60 * 1000;
export const BACKUP_RETRY_MS = 60 * 60 * 1000;
export const BACKUP_PLAYBACK_DEFER_MS = 30 * 60 * 1000;
export const BACKUP_QUIET_RETRY_MS = 5 * 60 * 1000;

const safe = value => String(value == null ? '' : value).trim();
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const domains = raw => [...new Set((Array.isArray(raw) ? raw : []).map(safe).filter(Boolean))].sort();

const hash32 = value => {
  const text = safe(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const emptyBackupSchedulerState = () => ({
  version: 1,
  enabled: true,
  nextSyncAt: 0,
  continuationAt: 0,
  lastFullSyncAt: 0,
  lastAttemptAt: 0,
  lastSuccessAt: 0,
  lastError: '',
  blockReason: '',
  blockUntil: 0,
  dirtyDomains: [],
  queue: null,
  updatedAt: 0
});

export const normalizeBackupSchedulerState = raw => ({
  ...emptyBackupSchedulerState(),
  version: 1,
  enabled: raw?.enabled !== false,
  nextSyncAt: num(raw?.nextSyncAt),
  continuationAt: num(raw?.continuationAt),
  lastFullSyncAt: num(raw?.lastFullSyncAt),
  lastAttemptAt: num(raw?.lastAttemptAt),
  lastSuccessAt: num(raw?.lastSuccessAt),
  lastError: safe(raw?.lastError).slice(0, 240),
  blockReason: safe(raw?.blockReason).slice(0, 80),
  blockUntil: num(raw?.blockUntil),
  dirtyDomains: domains(raw?.dirtyDomains),
  queue: raw?.queue && typeof raw.queue === 'object' && !Array.isArray(raw.queue) ? { ...raw.queue } : null,
  updatedAt: num(raw?.updatedAt)
});

export const mergeDirtyDomains = (current, additions) =>
  domains([...(Array.isArray(current) ? current : []), ...(Array.isArray(additions) ? additions : [additions])]);

export const removeDirtyDomains = (current, removals) => {
  const removed = new Set((Array.isArray(removals) ? removals : [removals]).map(safe).filter(Boolean));
  return domains((Array.isArray(current) ? current : []).filter(domain => !removed.has(domain)));
};

export const deterministicBackupJitter = ({ owner = '', deviceId = '', anchorAt = 0 } = {}) => {
  const day = Math.floor(num(anchorAt || Date.now()) / BACKUP_DAILY_MS);
  return hash32(`${safe(owner)}:${safe(deviceId)}:${day}`) % (BACKUP_JITTER_MS + 1);
};

export const nextBackupDailyAt = ({ fromAt = Date.now(), owner = '', deviceId = '' } = {}) =>
  num(fromAt) + BACKUP_DAILY_MS + deterministicBackupJitter({ owner, deviceId, anchorAt: fromAt });

export const normalizeBackupBacklog = raw => ({
  pendingRanges: Math.floor(num(raw?.pendingRanges)),
  unpackedEvents: Math.floor(num(raw?.unpackedEvents)),
  pullRemaining: Math.floor(num(raw?.pullRemaining)),
  pageLimitReached: raw?.pageLimitReached === true
});

export const backupNeedsContinuation = raw => {
  const backlog = normalizeBackupBacklog(raw);
  return backlog.pendingRanges > 0 || backlog.unpackedEvents > 0 || backlog.pullRemaining > 0 || backlog.pageLimitReached;
};

export const dirtyDomainsAfterSync = ({ dirtyDomains = [], backlog = {}, sharedWriteRequired = false, sharedWriteConfirmed = false, settingsWriteRequired = false, settingsWriteConfirmed = false } = {}) => {
  const pending = new Set(domains(dirtyDomains));
  const normalized = normalizeBackupBacklog(backlog);

  if (normalized.pendingRanges === 0 && normalized.unpackedEvents === 0) pending.delete('events');
  if (!sharedWriteRequired || sharedWriteConfirmed) pending.delete('playlists');
  if (!settingsWriteRequired || settingsWriteConfirmed) pending.delete('settings');

  return [...pending].sort();
};

export default {
  BACKUP_DAILY_MS,
  BACKUP_JITTER_MS,
  BACKUP_CONTINUATION_MS,
  BACKUP_RETRY_MS,
  BACKUP_PLAYBACK_DEFER_MS,
  BACKUP_QUIET_RETRY_MS,
  emptyBackupSchedulerState,
  normalizeBackupSchedulerState,
  mergeDirtyDomains,
  removeDirtyDomains,
  deterministicBackupJitter,
  nextBackupDailyAt,
  normalizeBackupBacklog,
  backupNeedsContinuation,
  dirtyDomainsAfterSync
};
