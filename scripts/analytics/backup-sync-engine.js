// Backup v7 public facade.
// Не управляет playback и не использует v6 restore/lease/archive.
import { syncBackupV7, getBackupV7Status } from './backup-v7-sync.js';

const LS_SYNC = 'backup:autosync:enabled';
let bound = false;
let timer = 0;
let ready = false;

export const isSyncEnabled = () => localStorage.getItem(LS_SYNC) !== '0';
export const isSyncReady = () => ready && isSyncEnabled();
export const isRestoreOrSkipDone = () => true;
export const markRestoreOrSkipDone = () => true;

export const setSyncEnabled = value => {
  localStorage.setItem(LS_SYNC, value ? '1' : '0');
  if (!value) clearTimeout(timer);
  window.dispatchEvent(new CustomEvent('backup:sync:settings:changed'));
};

export const markSyncReady = reason => {
  ready = !['no_auth_local_only', 'logged_out_local_only', 'offline_skip', 'account_switch'].includes(String(reason || ''));
  window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason, blocked: !ready } }));
};

export const suspendSyncForAccountSwitch = () => {
  clearTimeout(timer);
  timer = 0;
  ready = false;
  window.dispatchEvent(new CustomEvent('backup:sync:state', { detail: { state: 'idle' } }));
  return true;
};

export const scheduleBackupV7Sync = ({ immediate = false, reason = 'autosync' } = {}) => {
  if (!isSyncEnabled() || window.YandexAuth?.getSessionStatus?.() !== 'active') return false;
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = 0;
    syncBackupV7({ reason }).catch(() => null);
  }, immediate ? 0 : 30000);
  return true;
};

export const initBackupSyncEngine = () => {
  if (bound) return;
  bound = true;

  const enable = () => {
    if (window.YandexAuth?.getSessionStatus?.() !== 'active' || !window.YandexAuth?.isTokenAlive?.()) {
      markSyncReady('no_auth_local_only');
      return;
    }
    ready = true;
    window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason: 'backup_v7_ready' } }));
    scheduleBackupV7Sync({ immediate: true, reason: 'startup' });
  };

  window.addEventListener('backup:domain-dirty', event => {
    if (event.detail?.domain === 'favorites') return;
    scheduleBackupV7Sync({ immediate: event.detail?.immediate === true, reason: `dirty:${event.detail?.domain || 'generic'}` });
  });
  window.addEventListener('analytics:logUpdated', () => scheduleBackupV7Sync({ reason: 'events' }));
  window.addEventListener('online', () => scheduleBackupV7Sync({ immediate: true, reason: 'online' }));
  window.addEventListener('yandex:auth:changed', event => {
    if (event.detail?.status === 'active') enable();
    else suspendSyncForAccountSwitch();
  });
  window.addEventListener('account:data-switched', enable);
  enable();
};

export const getSyncIntervalSec = () => 30;
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
