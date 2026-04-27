// UID.073_(Hybrid sync orchestrator)_(state отдельно от transport/scheduler)_(sync-ready gate не должен жить внутри upload runner)
// UID.099_(Multi-device sync model)_(restore decision gate)_(не затирать облако до решения пользователя)
// UID.096_(Helper-first anti-duplication policy)_(вынести общий sync-state из backup-sync-engine)

const LS_SYNC = 'backup:autosync:enabled';
const LS_RESTORE = 'backup:restore_or_skip_done';

let _ready = false;
let _lastUploadAt = 0;
let _lastStatsDirtyAt = 0;

export const isSyncEnabled = () => localStorage.getItem(LS_SYNC) !== '0';
export const isSyncReady = () => _ready;
export const isRestoreOrSkipDone = () => localStorage.getItem(LS_RESTORE) === '1';
export const canUpload = () => _ready && isSyncEnabled() && isRestoreOrSkipDone();

export const getLastUploadAt = () => _lastUploadAt;
export const setLastUploadAt = ts => { _lastUploadAt = Number(ts || Date.now()) || Date.now(); };

export const shouldMarkStatsDirty = (cooldownMs = 60000) => {
  if (Date.now() - _lastStatsDirtyAt < cooldownMs) return false;
  _lastStatsDirtyAt = Date.now();
  return true;
};

export const emitSyncState = state =>
  window.dispatchEvent(new CustomEvent('backup:sync:state', { detail: { state } }));

export const markRestoreOrSkipDone = reason => {
  localStorage.setItem(LS_RESTORE, '1');
  console.debug('[BackupSyncEngine] restore/skip done:', reason);
};

export const setSyncEnabledState = value => {
  localStorage.setItem(LS_SYNC, value ? '1' : '0');
  window.dispatchEvent(new CustomEvent('backup:sync:settings:changed'));
};

export const markSyncReady = reasonRaw => {
  const reason = String(reasonRaw || '').trim();
  const riskyBlocked = ['meta_check_failed', 'timeout_fallback'];
  const pendingUserChoice = ['cloud_newer_user_choice'];
  const localOnly = ['no_auth_local_only', 'logged_out_local_only', 'offline_skip'];
  const explicitDoneReasons = ['restore_completed', 'manual_save', 'user_skipped_restore', 'no_cloud_backup', 'cloud_not_newer', 'diff_too_small', 'local_richer', 'local_probably_richer'];

  if (riskyBlocked.includes(reason)) {
    _ready = false;
    console.warn('[BackupSyncEngine] sync NOT ready due to risky state:', reason);
    window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason, blocked: true } }));
    return;
  }

  if (pendingUserChoice.includes(reason)) {
    _ready = false;
    console.debug('[BackupSyncEngine] sync pending user choice:', reason);
    window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason, pending: true } }));
    return;
  }

  if (localOnly.includes(reason)) {
    _ready = false;
    window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason, localOnly: true } }));
    return;
  }

  if (_ready && !explicitDoneReasons.includes(reason)) return;

  _ready = true;
  if (explicitDoneReasons.includes(reason)) markRestoreOrSkipDone(reason);
  console.debug('[BackupSyncEngine] sync READY:', reason);
  window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason } }));
};

export default {
  isSyncEnabled,
  isSyncReady,
  isRestoreOrSkipDone,
  canUpload,
  getLastUploadAt,
  setLastUploadAt,
  shouldMarkStatsDirty,
  emitSyncState,
  markRestoreOrSkipDone,
  setSyncEnabledState,
  markSyncReady
};
