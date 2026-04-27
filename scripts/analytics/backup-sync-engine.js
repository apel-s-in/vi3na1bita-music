// scripts/analytics/backup-sync-engine.js
// Умный автосейв: публичный фасад. State/scheduler/cloud guard вынесены в отдельные модули.

import { isWatchedStorageKey, markStorageKeyDirty, DOMAIN_DEBOUNCE_MS } from './sync-domains.js';
import {
  isSyncEnabled,
  isSyncReady,
  setSyncEnabledState,
  markSyncReady,
  markRestoreOrSkipDone,
  isRestoreOrSkipDone,
  shouldMarkStatsDirty
} from './sync-state.js';
import { cancelScheduledSync, scheduleSync } from './sync-scheduler.js';

let _bound = false;

export const setSyncEnabled = value => {
  setSyncEnabledState(!!value);
  if (!value) cancelScheduledSync();
};

export const initBackupSyncEngine = () => {
  if (_bound) return;
  _bound = true;

  window.addEventListener('achievements:updated', e => {
    if (e.detail?.unlocked > 0 && isSyncReady()) scheduleSync({ immediate: true, domain: 'achievements' });
  });

  window.addEventListener('backup:domain-dirty', e => {
    if (!isSyncReady()) return;
    scheduleSync({ immediate: !!e.detail?.immediate, domain: e.detail?.domain || 'generic' });
  });

  window.addEventListener('analytics:logUpdated', () => {
    if (!isSyncReady() || !shouldMarkStatsDirty(60000)) return;
    scheduleSync({ immediate: false, domain: 'stats' });
  });

  // Не monkey-patch. Только cross-tab fallback: если другой tab изменил watched key — помечаем домен.
  window.addEventListener('storage', e => {
    if (!isSyncReady() || !isWatchedStorageKey(e.key)) return;
    const state = markStorageKeyDirty(e.key);
    scheduleSync({ immediate: false, domain: state?.domains?.[state.domains.length - 1] || 'generic' });
  });

  setTimeout(() => {
    if (!isSyncReady()) {
      console.warn('[BackupSyncEngine] timeout fallback reached; autosave remains blocked until cloud state is resolved');
      window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason: 'timeout_fallback', blocked: true } }));
    }
  }, 300000);
};

export const getSyncIntervalSec = () => Math.round(DOMAIN_DEBOUNCE_MS.favorites / 1000);

export {
  isSyncReady,
  isSyncEnabled,
  markSyncReady,
  markRestoreOrSkipDone,
  isRestoreOrSkipDone
};

export default {
  initBackupSyncEngine,
  markSyncReady,
  isSyncReady,
  isSyncEnabled,
  setSyncEnabled,
  getSyncIntervalSec,
  markRestoreOrSkipDone,
  isRestoreOrSkipDone
};
