// Account-scoped Backup V7.1 scheduler.
// Один selective full sync в сутки; local packing не выполняет сеть.
// Автоматические операции всегда откладываются во время playback.
import { metaDB } from './meta-db.js';
import { syncBackupV7, getBackupV7BacklogStatus, getBackupV7Status, rebuildBackupV7LocalAnalytics } from './backup-v7-sync.js';
import { packLocalBackupV7Ranges } from './backup-v7-range.js';
import { clearBackupV7Checkpoint, getBackupV7Checkpoint, restoreBackupV7Checkpoint } from './backup-v7-recovery.js';
import { STATS_SHARD_VERSION } from './stats-shard-contract.js';
import { isAppQuiet } from '../core/app-activity.js';
import { backupCoordinatorSchedulerPatch, getBackupResourceBusyReason, withBackupCoordinatorLease } from './backup-coordinator-client.js';
import {
  BACKUP_CONTINUATION_MS,
  BACKUP_DAILY_MS,
  BACKUP_PLAYBACK_DEFER_MS,
  BACKUP_QUIET_RETRY_MS,
  BACKUP_RETRY_MS,
  backupNeedsContinuation,
  dirtyDomainsAfterSync,
  emptyBackupSchedulerState,
  mergeDirtyDomains,
  nextBackupDailyAt,
  normalizeBackupSchedulerState
} from './backup-scheduler-policy.js';

const STATE_KEY = 'scheduler:v1';
const LEGACY_KEYS = Object.freeze([
  'backup:v71:next-sync-at',
  'backup:v71:next-phase',
  'backup:v71:dirty',
  'backup:v71:block-reason',
  'backup:v71:block-until'
]);
const DISK_FULL_RETRY_MS = 24 * 60 * 60 * 1000;
const LOCAL_PACK_DELAY_MS = 60 * 1000;
let bound = false;
let ready = false;
let timer = 0;
let packTimer = 0;
let state = emptyBackupSchedulerState();
let stateLoaded = false;
let stateWrite = Promise.resolve();
let duePromise = null;

const safe = value => String(value == null ? '' : value).trim();
const ownerKey = () => safe(window.AccountDataContext?.getCurrentOwner?.());
const deviceId = () => safe(localStorage.getItem('deviceStableId') || localStorage.getItem('deviceHash') || 'web');

const publishState = reason => {
  window.dispatchEvent(new CustomEvent('backup:sync:scheduler', {
    detail: { reason, ...getBackupSchedulerState() }
  }));
};

const persistState = patch => {
  state = normalizeBackupSchedulerState({ ...state, ...(patch || {}), updatedAt: Date.now() });
  stateWrite = stateWrite.catch(() => null).then(() => metaDB.setStoreValue('backup_sync_state', STATE_KEY, state));
  publishState('persist');
  return stateWrite.then(() => state);
};

const loadState = async ({ force = false } = {}) => {
  if (stateLoaded && !force) return state;
  await stateWrite.catch(() => null);
  const row = await metaDB.getStoreValue('backup_sync_state', STATE_KEY).catch(() => null);
  state = normalizeBackupSchedulerState(row?.value || {});
  stateLoaded = true;

  if (!row) {
    const legacyDirty = safe(localStorage.getItem('backup:v71:dirty'));
    const dirtyDomains = legacyDirty
      ? legacyDirty === '1'
        ? ['events', 'playlists', 'settings']
        : legacyDirty.split(',').map(safe).filter(Boolean)
      : [];
    state = normalizeBackupSchedulerState({
      ...state,
      enabled: localStorage.getItem('backup:autosync:enabled') !== '0',
      nextSyncAt: Number(localStorage.getItem('backup:v71:next-sync-at') || 0),
      blockReason: safe(localStorage.getItem('backup:v71:block-reason')),
      blockUntil: Number(localStorage.getItem('backup:v71:block-until') || 0),
      dirtyDomains
    });
    await persistState(state);
  }

  LEGACY_KEYS.forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch {}
  });
  return state;
};

const scheduleAt = timestamp => {
  clearTimeout(timer);
  timer = 0;
  if (!isSyncReady()) return false;
  const delay = Math.max(0, Number(timestamp || 0) - Date.now());
  timer = setTimeout(() => {
    timer = 0;
    runDueSync({ reason: 'scheduled_daily' }).catch(() => null);
  }, Math.min(delay, 2147483647));
  return true;
};

const scheduleRetry = (delayMs, reason, { error = false } = {}) => {
  const at = Date.now() + Math.max(1000, Number(delayMs) || BACKUP_RETRY_MS);
  persistState({
    nextSyncAt: at,
    continuationAt: at,
    deferredReason: error ? '' : safe(reason),
    ...(error ? { lastError: safe(reason) || state.lastError } : {})
  }).catch(() => null);
  scheduleAt(at);
  return at;
};

const markDirty = async (domain = 'events') => {
  await loadState();
  const dirtyDomains = mergeDirtyDomains(state.dirtyDomains, domain);
  await persistState({ dirtyDomains });
  return dirtyDomains;
};

const runLocalPack = async reason => {
  if (document.hidden || window.playerCore?.isPlaying?.() || window.__accountDataSwitching) return false;
  const result = await packLocalBackupV7Ranges().catch(error => ({ ok: false, error: safe(error?.message || error) }));
  if (result?.packed > 0) {
    await markDirty('events');
    window.dispatchEvent(new CustomEvent('backup:local-spool-updated', {
      detail: { reason, packed: result.packed, events: result.events, quarantined: result.quarantined?.length || 0 }
    }));
    if (Number(result.remainingCapacity || 0) === 0) scheduleLocalPack('local_backlog_continue', 1200);
  }
  return result;
};

const scheduleLocalPack = (reason = 'events', delayMs = LOCAL_PACK_DELAY_MS) => {
  clearTimeout(packTimer);
  packTimer = 0;
  if (document.hidden || window.playerCore?.isPlaying?.()) return false;
  packTimer = setTimeout(() => {
    packTimer = 0;
    runLocalPack(reason).catch(() => null);
  }, Math.max(1000, Number(delayMs) || LOCAL_PACK_DELAY_MS));
  return true;
};

const shouldRunStartupRebuild = async restoredCheckpoint => {
  if (restoredCheckpoint) return true;
  const [schema, status] = await Promise.all([
    metaDB.getGlobal('backup_stats_rollup_schema').catch(() => null),
    getBackupV7Status().catch(() => null)
  ]);
  return Number(status?.storedRanges || 0) > 0 && Number(schema?.value?.version || 0) !== STATS_SHARD_VERSION;
};

const finishSuccessfulSync = async ({ result, dirtyDomains, sharedWriteRequired, settingsWriteRequired }) => {
  const backlog = result?.backlog || await getBackupV7BacklogStatus();
  const nextDirty = dirtyDomainsAfterSync({
    dirtyDomains,
    backlog,
    sharedWriteRequired,
    sharedWriteConfirmed: !sharedWriteRequired || result?.shared?.pushed === true,
    settingsWriteRequired,
    settingsWriteConfirmed: !settingsWriteRequired || result?.settings?.confirmed === true
  });
  const continuation = backupNeedsContinuation(backlog);
  const completedAt = Date.now();
  const nextSyncAt = continuation
    ? completedAt + BACKUP_CONTINUATION_MS
    : nextBackupDailyAt({ fromAt: completedAt, owner: ownerKey(), deviceId: deviceId() });

  await persistState({
    dirtyDomains: nextDirty,
    nextSyncAt,
    continuationAt: continuation ? nextSyncAt : 0,
    lastFullSyncAt: continuation ? state.lastFullSyncAt : completedAt,
    lastSuccessAt: completedAt,
    lastError: '',
    deferredReason: '',
    queue: null,
    blockReason: '',
    blockUntil: 0
  });
  scheduleAt(nextSyncAt);
  return { continuation, nextSyncAt, backlog, dirtyDomains: nextDirty };
};

const runDueSyncImpl = async ({ reason = 'scheduled_daily', force = false } = {}) => {
  await loadState();

  if (state.blockReason && state.blockUntil > Date.now()) {
    scheduleAt(state.blockUntil);
    return false;
  }
  if (state.blockReason && state.blockUntil > 0 && state.blockUntil <= Date.now()) {
    await persistState({ blockReason: '', blockUntil: 0 });
  }
  if (!isSyncReady()) return false;
  if (document.hidden) return false;
  if (!force && isAppQuiet()) {
    scheduleRetry(BACKUP_QUIET_RETRY_MS, 'quiet_mode');
    return false;
  }
  const busyReason = getBackupResourceBusyReason();
  if (busyReason) {
    scheduleRetry(
      busyReason === 'playback_active'
        ? BACKUP_PLAYBACK_DEFER_MS
        : BACKUP_QUIET_RETRY_MS,
      busyReason
    );
    return false;
  }
  if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) {
    scheduleRetry(BACKUP_RETRY_MS, 'network_unavailable');
    return false;
  }
  if (!force && state.nextSyncAt > Date.now()) {
    scheduleAt(state.nextSyncAt);
    return false;
  }

  await runLocalPack(`before_sync:${reason}`).catch(() => null);
  await loadState({ force: true });
  const dirtyDomains = [...state.dirtyDomains];
  const sharedWriteRequired = dirtyDomains.includes('playlists');
  const settingsWriteRequired = dirtyDomains.includes('settings');

  await persistState({ lastAttemptAt: Date.now(), lastError: '' });
  window.dispatchEvent(new CustomEvent('backup:sync:state', { detail: { state: 'syncing', reason } }));

  try {
    const backlogBefore = await getBackupV7BacklogStatus();
    const coordinated = await withBackupCoordinatorLease({
      reason: state.continuationAt ? 'continuation' : reason === 'device_initialized' ? 'initial_device' : 'daily',
      manual: false,
      dirtyDomains,
      pendingRanges: backlogBefore.pendingRanges,
      task: coordinatorLease => syncBackupV7({
        reason: `${reason}:daily_full`,
        pushEnabled: true,
        pullEnabled: true,
        sharedReadEnabled: true,
        sharedWriteEnabled: sharedWriteRequired,
        includeSettings: true,
        settingsReadEnabled: false,
        maxPullRanges: 50,
        coordinatorLease
      })
    });

    if (!coordinated.granted) {
      const patch = backupCoordinatorSchedulerPatch(coordinated, Date.now() + BACKUP_QUIET_RETRY_MS);
      await persistState(patch);
      scheduleAt(patch.nextSyncAt);
      return false;
    }

    const result = coordinated.result;
    await finishSuccessfulSync({ result, dirtyDomains, sharedWriteRequired, settingsWriteRequired });
    window.dispatchEvent(new CustomEvent('backup:sync:state', { detail: { state: 'ok', reason, backlog: result.backlog } }));
    return result;
  } catch (error) {
    const status = Number(error?.status || 0);
    const message = safe(error?.message);

    if (status === 507 || /disk_space_exhausted|not.?enough.?space|insufficient.?storage/i.test(message)) {
      const retryAt = Date.now() + DISK_FULL_RETRY_MS;
      await persistState({ blockReason: 'disk_space_exhausted', blockUntil: retryAt, nextSyncAt: retryAt, lastError: message });
      scheduleAt(retryAt);
    } else if (status === 401 || status === 403 || /disk.*(?:access|scope|forbidden)|oauth|required/i.test(message)) {
      await persistState({ blockReason: 'disk_access_unavailable', blockUntil: 0, lastError: message });
    } else {
      scheduleRetry(BACKUP_RETRY_MS, message || 'backup_sync_failed', { error: true });
    }

    window.dispatchEvent(new CustomEvent('backup:sync:state', { detail: { state: 'idle', reason, error: message } }));
    return false;
  }
};

const runDueSync = options => {
  if (duePromise) return duePromise;
  duePromise = runDueSyncImpl(options).finally(() => {
    duePromise = null;
  });
  return duePromise;
};

export const getBackupSchedulerState = () => ({
  ...normalizeBackupSchedulerState(state),
  ready,
  loaded: stateLoaded,
  playing: window.playerCore?.isPlaying?.() === true,
  hidden: document.hidden
});

export const isSyncEnabled = () => state.enabled !== false;
export const isSyncReady = () => ready && isSyncEnabled();
export const isRestoreOrSkipDone = () => true;
export const markRestoreOrSkipDone = () => true;

export const getBackupV7Availability = () => ({
  available: ready && isSyncEnabled() && (!state.blockReason || (state.blockUntil > 0 && state.blockUntil <= Date.now())),
  blocked: !!state.blockReason && (state.blockUntil === 0 || state.blockUntil > Date.now()),
  enabled: isSyncEnabled(),
  ready,
  reason: state.blockReason,
  retryAt: state.blockUntil,
  retryInMs: Math.max(0, state.blockUntil - Date.now()),
  diskAccess: window.YandexAuth?.hasDiskAccess?.() === true
});

export const clearBackupV7Dirty = async ({ result = null } = {}) => {
  await loadState();
  const backlog = result?.backlog || await getBackupV7BacklogStatus();
  if (backupNeedsContinuation(backlog)) return false;
  await persistState({ dirtyDomains: [] });
  return true;
};

export const clearBackupV7Block = async () => {
  await loadState();
  await persistState({ blockReason: '', blockUntil: 0, lastError: '' });
  return true;
};

export const setSyncEnabled = value => {
  state.enabled = value === true;
  localStorage.setItem('backup:autosync:enabled', state.enabled ? '1' : '0');
  persistState({ enabled: state.enabled }).catch(() => null);
  if (!state.enabled) {
    clearTimeout(timer);
    timer = 0;
  } else {
    scheduleAt(state.nextSyncAt || Date.now());
  }
  window.dispatchEvent(new CustomEvent('backup:sync:settings:changed'));
};

export const markSyncReady = reason => {
  ready = !['no_auth_local_only', 'logged_out_local_only', 'offline_skip', 'account_switch', 'device_initialization_pending', 'disk_access_unavailable'].includes(safe(reason));
  window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason, blocked: !ready } }));
};

export const suspendSyncForAccountSwitch = () => {
  clearTimeout(timer);
  clearTimeout(packTimer);
  timer = 0;
  packTimer = 0;
  ready = false;
  stateLoaded = false;
  state = emptyBackupSchedulerState();
  window.dispatchEvent(new CustomEvent('backup:sync:state', { detail: { state: 'idle' } }));
  return true;
};

export const scheduleBackupV7Sync = ({ immediate = false, reason = 'autosync', domain = 'events' } = {}) => {
  markDirty(domain).then(() => {
    if (!isSyncReady()) return;
    if (immediate) queueMicrotask(() => runDueSync({ reason, force: true }).catch(() => null));
    else scheduleAt(state.nextSyncAt || Date.now());
  }).catch(() => null);
  return true;
};

export const initBackupSyncEngine = () => {
  if (bound) return;
  bound = true;

  const enable = async () => {
    await loadState({ force: true });
    if (window.YandexAuth?.getSessionStatus?.() !== 'active' || !window.YandexAuth?.isTokenAlive?.()) {
      markSyncReady('no_auth_local_only');
      return;
    }
    if (window.YandexAuth?.hasDiskAccess?.() !== true) {
      await persistState({ blockReason: 'disk_access_unavailable', blockUntil: 0 });
      markSyncReady('disk_access_unavailable');
      return;
    }

    try {
      const { getSocialSession } = await import('../core/social-session.js');
      const session = await getSocialSession();
      if (session?.accountDeviceInitializationRequired || session?.accountDevice?.initializationPending === true) {
        markSyncReady('device_initialization_pending');
        return;
      }
    } catch {
      markSyncReady('device_authorization_unavailable');
      return;
    }

    ready = true;
    await persistState({ blockReason: '', blockUntil: 0 });
    window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason: 'backup_v71_ready' } }));

    const checkpoint = await getBackupV7Checkpoint().catch(() => null);
    let restored = false;
    if (checkpoint?.checkpointId) {
      await restoreBackupV7Checkpoint(checkpoint);
      await clearBackupV7Checkpoint();
      restored = true;
      window.NotificationSystem?.info?.('Локальные данные восстановлены после прерванной синхронизации');
    }

    if (await shouldRunStartupRebuild(restored)) {
      await rebuildBackupV7LocalAnalytics({ reason: 'backup_v71_startup_repair' }).catch(() => null);
    }

    const status = await getBackupV7Status().catch(() => null);
    const fallbackDue = status?.lastSyncAt
      ? nextBackupDailyAt({ fromAt: status.lastSyncAt, owner: ownerKey(), deviceId: deviceId() })
      : Date.now();
    if (!state.nextSyncAt) await persistState({ nextSyncAt: fallbackDue });
    scheduleLocalPack('startup', 2500);
    if (!document.hidden) runDueSync({ reason: 'startup_due' }).catch(() => null);
  };

  window.addEventListener('backup:domain-dirty', event => {
    if (window.__backupV7SharedApplying || event.detail?.domain === 'favorites') return;
    const domain = safe(event.detail?.domain);
    markDirty(domain === 'playlists' ? 'playlists' : domain === 'deviceSettings' ? 'settings' : 'events').catch(() => null);
  });
  window.addEventListener('analytics:logUpdated', event => {
    const reason = safe(event.detail?.reason);
    if (reason.startsWith('backup_v71_')) return;
    markDirty('events').catch(() => null);
    scheduleLocalPack(`analytics:${reason || 'updated'}`);
  });
  ['player:pause', 'player:stop', 'player:ended'].forEach(name => {
    window.addEventListener(name, () => {
      scheduleLocalPack(name, 1500);
      if (state.continuationAt || state.nextSyncAt <= Date.now()) runDueSync({ reason: name }).catch(() => null);
    });
  });
  window.addEventListener('online', () => {
    if (!document.hidden) runDueSync({ reason: 'online_due' }).catch(() => null);
  });
  window.addEventListener('app:activity-mode', event => {
    if (event.detail?.mode === 'active' && !document.hidden) runDueSync({ reason: 'activity_resumed' }).catch(() => null);
  });
  window.addEventListener('account:device-initialized', () => scheduleBackupV7Sync({ immediate: true, reason: 'device_initialized' }));
  window.addEventListener('yandex:auth:changed', event => {
    if (event.detail?.status === 'active') enable();
    else suspendSyncForAccountSwitch();
  });
  window.addEventListener('account:data-switched', enable);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    scheduleLocalPack('foreground', 1200);
    runDueSync({ reason: 'foreground_due' }).catch(() => null);
  });

  window.BackupSyncEngine = { getSchedulerState: getBackupSchedulerState };
  enable();
};

export const getSyncIntervalSec = () => BACKUP_DAILY_MS / 1000;
export { syncBackupV7, getBackupV7Status };
export default {
  initBackupSyncEngine,
  isSyncReady,
  isSyncEnabled,
  setSyncEnabled,
  markSyncReady,
  markRestoreOrSkipDone,
  isRestoreOrSkipDone,
  suspendSyncForAccountSwitch,
  scheduleBackupV7Sync,
  clearBackupV7Dirty,
  clearBackupV7Block,
  getBackupV7Availability,
  getBackupSchedulerState,
  syncBackupV7,
  getBackupV7Status,
  getSyncIntervalSec
};
