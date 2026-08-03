// Экономный Backup v7.1 scheduler.
// Push и pull чередуются в 12-часовых foreground-слотах; каждая фаза выполняется не чаще раза в 24 часа.
import { syncBackupV7, getBackupV7Status, rebuildBackupV7LocalAnalytics } from './backup-v7-sync.js';
import { packLocalBackupV7Ranges } from './backup-v7-range.js';
import { clearBackupV7Checkpoint, getBackupV7Checkpoint, restoreBackupV7Checkpoint } from './backup-v7-recovery.js';
import { isAppQuiet } from '../core/app-activity.js';

const LS_SYNC = 'backup:autosync:enabled';
const LS_DUE = 'backup:v71:next-sync-at';
const LS_DIRTY = 'backup:v71:dirty';
const LS_PHASE = 'backup:v71:next-phase';
const LS_BLOCK_REASON = 'backup:v71:block-reason';
const LS_BLOCK_UNTIL = 'backup:v71:block-until';
const SLOT_MS = 12 * 60 * 60 * 1000;
const JITTER_MS = 30 * 60 * 1000;
const DISK_FULL_RETRY_MS = 24 * 60 * 60 * 1000;
const PLAYBACK_DEFER_MS = 30 * 60 * 1000;
const LOCAL_PACK_DELAY_MS = 60 * 1000;
let bound = false;
let timer = 0;
let packTimer = 0;
let ready = false;

export const isSyncEnabled = () => localStorage.getItem(LS_SYNC) !== '0';
export const isSyncReady = () => ready && isSyncEnabled();
export const isRestoreOrSkipDone = () => true;
export const markRestoreOrSkipDone = () => true;

const nextDueAt = () => Math.max(0, Number(localStorage.getItem(LS_DUE) || 0));
const setNextDue = at => localStorage.setItem(LS_DUE, String(Math.max(0, Number(at) || 0)));
const readPhase = () => localStorage.getItem(LS_PHASE) === 'pull' ? 'pull' : 'push';
const setPhase = phase => localStorage.setItem(LS_PHASE, phase === 'pull' ? 'pull' : 'push');
const readDirtyDomains = () => {
  const raw = String(localStorage.getItem(LS_DIRTY) || '');
  if (!raw) return new Set();
  if (raw === '1') return new Set(['events', 'playlists', 'settings']);
  return new Set(raw.split(',').map(value => value.trim()).filter(Boolean));
};
const markDirty = (domain = 'events') => {
  const domains = readDirtyDomains();
  domains.add(String(domain || 'events').trim() || 'events');
  localStorage.setItem(LS_DIRTY, [...domains].sort().join(','));
};
const clearDirty = () => localStorage.removeItem(LS_DIRTY);
const readBlock = () => ({ reason: String(localStorage.getItem(LS_BLOCK_REASON) || ''), until: Math.max(0, Number(localStorage.getItem(LS_BLOCK_UNTIL) || 0)) });
const clearBlock = () => {
  localStorage.removeItem(LS_BLOCK_REASON);
  localStorage.removeItem(LS_BLOCK_UNTIL);
};
const setBlock = (reason, until = 0) => {
  localStorage.setItem(LS_BLOCK_REASON, String(reason || 'backup_unavailable'));
  localStorage.setItem(LS_BLOCK_UNTIL, String(Math.max(0, Number(until) || 0)));
  window.dispatchEvent(new CustomEvent('backup:sync:availability', { detail: getBackupV7Availability() }));
};
export const getBackupV7Availability = () => {
  const block = readBlock();
  return {
    available: ready && isSyncEnabled() && (!block.reason || (block.until > 0 && block.until <= Date.now())),
    blocked: !!block.reason && (block.until === 0 || block.until > Date.now()),
    enabled: isSyncEnabled(),
    ready,
    reason: block.reason,
    retryAt: block.until,
    retryInMs: Math.max(0, block.until - Date.now()),
    diskAccess: window.YandexAuth?.hasDiskAccess?.() === true
  };
};
export const clearBackupV7Dirty = () => {
  clearDirty();
  return true;
};
export const clearBackupV7Block = () => {
  clearBlock();
  return true;
};

export const setSyncEnabled = value => {
  localStorage.setItem(LS_SYNC, value ? '1' : '0');
  if (!value) {
    clearTimeout(timer);
    timer = 0;
  }
  window.dispatchEvent(new CustomEvent('backup:sync:settings:changed'));
};

export const markSyncReady = reason => {
  ready = !['no_auth_local_only', 'logged_out_local_only', 'offline_skip', 'account_switch', 'device_initialization_pending', 'disk_access_unavailable'].includes(String(reason || ''));
  window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason, blocked: !ready } }));
};

export const suspendSyncForAccountSwitch = () => {
  clearTimeout(timer);
  clearTimeout(packTimer);
  timer = 0;
  packTimer = 0;
  ready = false;
  window.dispatchEvent(new CustomEvent('backup:sync:state', { detail: { state: 'idle' } }));
  return true;
};

const runLocalPack = async reason => {
  if (document.hidden || window.playerCore?.isPlaying?.() || window.__accountDataSwitching) return false;
  const result = await packLocalBackupV7Ranges().catch(error => ({ ok: false, error: String(error?.message || error) }));
  if (result?.packed > 0) {
    markDirty('events');
    window.dispatchEvent(new CustomEvent('backup:local-spool-updated', {
      detail: { reason, packed: result.packed, events: result.events, quarantined: result.quarantined?.length || 0 }
    }));
    if (Number(result.remainingCapacity || 0) === 0) scheduleLocalPack('local_backlog_continue', 1200);
  }
  return result;
};

const scheduleLocalPack = (reason = 'events', delayMs = LOCAL_PACK_DELAY_MS) => {
  clearTimeout(packTimer);
  if (document.hidden || window.playerCore?.isPlaying?.()) return false;
  packTimer = setTimeout(() => {
    packTimer = 0;
    runLocalPack(reason).catch(() => null);
  }, Math.max(1000, Number(delayMs) || LOCAL_PACK_DELAY_MS));
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
  const block = readBlock();
  if (block.reason && block.until > Date.now() && !force) {
    scheduleAt(block.until);
    return false;
  }
  if (block.reason && block.until > 0 && block.until <= Date.now()) {
    clearBlock();
    ready = true;
  }
  if (!isSyncReady() || document.hidden || (!force && isAppQuiet())) return false;
  if (window.playerCore?.isPlaying?.()) {
    scheduleAt(Date.now() + PLAYBACK_DEFER_MS);
    return false;
  }
  if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return false;

  const dueAt = nextDueAt();
  if (!force && dueAt > Date.now()) {
    scheduleAt(dueAt);
    return false;
  }

  try {
    const dirtyDomains = readDirtyDomains();
    let phase = force ? 'full' : readPhase();
    if (!force && phase === 'push' && !dirtyDomains.size) phase = 'pull';

    await syncBackupV7({
      reason: `${reason}:${phase}`,
      pushEnabled: phase !== 'pull',
      pullEnabled: phase !== 'push',
      includeShared: force || phase === 'pull' || dirtyDomains.has('playlists'),
      includeSettings: phase !== 'pull',
      settingsReadEnabled: phase !== 'push',
      maxPullRanges: phase === 'push' ? 1 : 50
    });
    clearBlock();
    ready = true;
    if (phase !== 'pull') clearDirty();
    if (!force) setPhase(phase === 'push' ? 'pull' : 'push');
    const next = Date.now() + SLOT_MS + Math.floor(Math.random() * JITTER_MS);
    setNextDue(next);
    scheduleAt(next);
    return true;
  } catch (error) {
    const status = Number(error?.status || 0);
    const message = String(error?.message || '');

    if (status === 507 || /disk_space_exhausted|not.?enough.?space|insufficient.?storage/i.test(message)) {
      const retry = Date.now() + DISK_FULL_RETRY_MS;
      setBlock('disk_space_exhausted', retry);
      setNextDue(retry);
      scheduleAt(retry);
      return false;
    }

    if (status === 401 || status === 403 || /disk.*(?:access|scope|forbidden)|oauth|required/i.test(message)) {
      setBlock('disk_access_unavailable', 0);
      return false;
    }

    const retry = Date.now() + 60 * 60 * 1000;
    setNextDue(retry);
    scheduleAt(retry);
    return false;
  }
};

export const scheduleBackupV7Sync = ({ immediate = false, reason = 'autosync' } = {}) => {
  markDirty('events');
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

    if (window.YandexAuth?.hasDiskAccess?.() !== true) {
      setBlock('disk_access_unavailable', 0);
      markSyncReady('disk_access_unavailable');
      return;
    }

    clearBlock();

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

    const checkpoint = await getBackupV7Checkpoint().catch(() => null);
    if (checkpoint?.checkpointId) {
      await restoreBackupV7Checkpoint(checkpoint);
      await clearBackupV7Checkpoint();
      window.NotificationSystem?.info?.('Локальные данные восстановлены после прерванной синхронизации');
    }

    await rebuildBackupV7LocalAnalytics({ reason: 'backup_v71_startup_repair' }).catch(() => null);
    const status = await getBackupV7Status().catch(() => null);
    const due = nextDueAt() || (status?.lastSyncAt ? status.lastSyncAt + SLOT_MS : Date.now());
    setNextDue(due);
    if (!document.hidden) runDueSync({ reason: 'startup_due' }).catch(() => null);
  };

  window.addEventListener('backup:domain-dirty', event => {
    if (window.__backupV7SharedApplying || event.detail?.domain === 'favorites') return;
    const domain = String(event.detail?.domain || '');
    markDirty(domain === 'playlists' ? 'playlists' : domain === 'deviceSettings' ? 'settings' : 'events');
  });
  window.addEventListener('analytics:logUpdated', event => {
    const reason = String(event.detail?.reason || '');
    if (reason.startsWith('backup_v71_')) return;
    markDirty('events');
    scheduleLocalPack(`analytics:${reason || 'updated'}`);
  });
  ['player:pause', 'player:stop', 'player:ended'].forEach(name => {
    window.addEventListener(name, () => scheduleLocalPack(name, 1500));
  });
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

  scheduleLocalPack('startup', 2500);
  enable();
};

export const getSyncIntervalSec = () => SLOT_MS / 1000;
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
  syncBackupV7,
  getBackupV7Status,
  getSyncIntervalSec
};
