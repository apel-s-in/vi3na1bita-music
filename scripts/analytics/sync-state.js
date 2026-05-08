// UID.073_(Hybrid sync orchestrator)_(state отдельно от transport/scheduler)_(sync-ready gate не должен жить внутри upload runner) UID.099_(Multi-device sync model)_(restore decision gate)_(не затирать облако до решения пользователя) UID.096_(Helper-first anti-duplication policy)_(вынести общий sync-state из backup-sync-engine)
const LS_SYNC = 'backup:autosync:enabled', LS_RESTORE = 'backup:restore_or_skip_done';
let _ready = false, _lastUploadAt = 0, _lastStatsDirtyAt = 0;
export const isSyncEnabled = () => localStorage.getItem(LS_SYNC) !== '0';
export const isSyncReady = () => _ready;
export const isRestoreOrSkipDone = () => localStorage.getItem(LS_RESTORE) === '1';
export const canUpload = () => _ready && isSyncEnabled() && isRestoreOrSkipDone();
export const getLastUploadAt = () => _lastUploadAt;
export const setLastUploadAt = ts => { _lastUploadAt = Number(ts || Date.now()) || Date.now(); };
export const shouldMarkStatsDirty = (cd = 60000) => { if (Date.now() - _lastStatsDirtyAt < cd) return false; _lastStatsDirtyAt = Date.now(); return true; };
export const emitSyncState = state => window.dispatchEvent(new CustomEvent('backup:sync:state', { detail: { state } }));
export const markRestoreOrSkipDone = r => { localStorage.setItem(LS_RESTORE, '1'); };
export const setSyncEnabledState = v => { localStorage.setItem(LS_SYNC, v ? '1' : '0'); window.dispatchEvent(new CustomEvent('backup:sync:settings:changed')); };
export const markSyncReady = raw => {
  const r = String(raw || '').trim();
  if (['meta_check_failed', 'timeout_fallback'].includes(r)) { _ready = false; window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason: r, blocked: true } })); return; }
  if (['cloud_newer_user_choice'].includes(r)) { _ready = false; window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason: r, pending: true } })); return; }
  if (['no_auth_local_only', 'logged_out_local_only', 'offline_skip'].includes(r)) { _ready = false; window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason: r, localOnly: true } })); return; }
  const done = ['restore_completed', 'manual_save', 'user_skipped_restore', 'no_cloud_backup', 'cloud_not_newer', 'diff_too_small', 'local_richer', 'local_probably_richer'];
  if (_ready && !done.includes(r)) return;
  _ready = true; if (done.includes(r)) markRestoreOrSkipDone(r);
  window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason: r } }));
};
export default { isSyncEnabled, isSyncReady, isRestoreOrSkipDone, canUpload, getLastUploadAt, setLastUploadAt, shouldMarkStatsDirty, emitSyncState, markRestoreOrSkipDone, setSyncEnabledState, markSyncReady };
