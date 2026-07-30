// Экономный Backup v7.1 scheduler.
// Плановый sync выполняется раз в 24 часа и только в foreground.
import { syncBackupV7, getBackupV7Status, rebuildBackupV7LocalAnalytics } from './backup-v7-sync.js';

const LS_SYNC = 'backup:autosync:enabled';
const LS_DUE = 'backup:v71:next-sync-at';
const LS_DIRTY = 'backup:v71:dirty';
const INTERVAL_MS = 24 * 60 * 60 * 1000;
const JITTER_MS = 30 * 60 * 1000;
let bound = false;
let timer = 0;
let ready = false;

export const isSyncEnabled = () => localStorage.getItem(LS_SYNC) !== '0';
export const isSyncReady = () => ready && isSyncEnabled();
export const isRestoreOrSkipDone = () => true;
export const markRestoreOrSkipDone = () => true;

const nextDueAt = () => Math.max(0, Number(localStorage.getItem(LS_DUE) || 0));
const setNextDue = at => localStorage.setItem(LS_DUE, String(Math.max(0, Number(at) || 0)));
const markDirty = () => localStorage.setItem(LS_DIRTY, '1');
const clearDirty = () => localStorage.removeItem(LS_DIRTY);

export const setSyncEnabled = value => {
  localStorage.setItem(LS_SYNC, value ? '1' : '0');
  if (!value) {
    clearTimeout(timer);
    timer = 0;
  }
  window.dispatchEvent(new CustomEvent('backup:sync:settings:changed'));
};

export const markSyncReady = reason => {
  ready = !['no_auth_local_only', 'logged_out_local_only', 'offline_skip', 'account_switch', 'device_initialization_pending'].includes(String(reason || ''));
  window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason, blocked: !ready } }));
};

export const suspendSyncForAccountSwitch = () => {
  clearTimeout(timer);
  timer = 0;
  ready = false;
  window.dispatchEvent(new CustomEvent('backup:sync:state', { detail: { state: 'idle' } }));
  return true;
};

const scheduleAt = timestamp => {
  clearTimeout(timer);
  if (!isSyncReady()) return false;

  const delay = Math.max(0, timestamp - Date.now());
  timer = setTimeout(() => {
    timer = 0;
    runDueSync({ reason: 'scheduled_24h' }).catch(() => null);
  }, Math.min(delay, 2147483647));
  return true;
};

const runDueSync = async ({ reason = 'scheduled_24h', force = false } = {}) => {
  if (!isSyncReady() || document.hidden) return false;
  if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return false;

  const dueAt = nextDueAt();
  if (!force && dueAt > Date.now()) {
    scheduleAt(dueAt);
    return false;
  }

  try {
    await syncBackupV7({ reason, includeSettings: true });
    clearDirty();
    const next = Date.now() + INTERVAL_MS + Math.floor(Math.random() * JITTER_MS);
    setNextDue(next);
    scheduleAt(next);
    return true;
  } catch {
    const retry = Date.now() + 60 * 60 * 1000;
    setNextDue(retry);
    scheduleAt(retry);
    return false;
  }
};

export const scheduleBackupV7Sync = ({ immediate = false, reason = 'autosync' } = {}) => {
  markDirty();
  if (!isSyncReady()) return false;

  if (immediate) {
    if (document.hidden) return false;
    queueMicrotask(() => runDueSync({ reason, force: true }).catch(() => null));
    return true;
  }

  const due = nextDueAt() || Date.now();
  scheduleAt(due);
  return true;
};

export const initBackupSyncEngine = () => {
  if (bound) return;
  bound = true;

  const enable = async () => {
    if (window.YandexAuth?.getSessionStatus?.() !== 'active' || !window.YandexAuth?.isTokenAlive?.()) {
      markSyncReady('no_auth_local_only');
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
      ready = false;
      window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason: 'device_authorization_unavailable', blocked: true } }));
      return;
    }

    ready = true;
    window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason: 'backup_v71_ready' } }));

    await rebuildBackupV7LocalAnalytics({ reason: 'backup_v71_startup_repair' }).catch(() => null);
    const status = await getBackupV7Status().catch(() => null);
    const due = nextDueAt() || (status?.lastSyncAt ? status.lastSyncAt + INTERVAL_MS : Date.now());
    setNextDue(due);
    if (!document.hidden) runDueSync({ reason: 'startup_due' }).catch(() => null);
  };

  window.addEventListener('backup:domain-dirty', event => {
    if (event.detail?.domain === 'favorites') return;
    markDirty();
  });
  window.addEventListener('analytics:logUpdated', markDirty);
  window.addEventListener('online', () => {
    if (!document.hidden) runDueSync({ reason: 'online_due' }).catch(() => null);
  });
  window.addEventListener('account:device-initialized', () => {
    scheduleBackupV7Sync({ immediate: true, reason: 'device_initialized' });
  });
  window.addEventListener('yandex:auth:changed', event => {
    if (event.detail?.status === 'active') enable();
    else suspendSyncForAccountSwitch();
  });
  window.addEventListener('account:data-switched', enable);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) runDueSync({ reason: 'foreground_due' }).catch(() => null);
  });

  enable();
};

export const getSyncIntervalSec = () => INTERVAL_MS / 1000;
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
  syncBackupV7,
  getBackupV7Status,
  getSyncIntervalSec
};
