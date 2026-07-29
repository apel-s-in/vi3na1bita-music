// scripts/analytics/backup-sync-engine.js
// Умный автосейв: публичный фасад. State/scheduler/cloud guard вынесены в отдельные модули.
import { isWatchedStorageKey, markStorageKeyDirty, DOMAIN_DEBOUNCE_MS } from './sync-domains.js';
import { isSyncEnabled, isSyncReady, setSyncEnabledState, markSyncReady, markRestoreOrSkipDone, isRestoreOrSkipDone, shouldMarkStatsDirty, suspendSyncForAccountSwitch as suspendSyncState } from './sync-state.js';
import { cancelScheduledSync, scheduleSync } from './sync-scheduler.js';

let _bound = false;

export const setSyncEnabled = value => { setSyncEnabledState(!!value); if (!value) cancelScheduledSync(); };

export const initBackupSyncEngine = () => {
  if (_bound) return; _bound = true;
  window.addEventListener('backup:domain-dirty', event => {
    const domain = String(event.detail?.domain || 'generic').trim() || 'generic';
    if (domain === 'favorites') return;
    if (isSyncReady()) scheduleSync({ immediate: !!event.detail?.immediate, domain });
  });
  window.addEventListener('analytics:logUpdated', () => isSyncReady() && shouldMarkStatsDirty(60000) && scheduleSync({ immediate: false, domain: 'stats' }));
  window.addEventListener('storage', e => { if (isSyncReady() && isWatchedStorageKey(e.key)) { const state = markStorageKeyDirty(e.key); scheduleSync({ immediate: false, domain: state?.domains?.[state.domains.length - 1] || 'generic' }); } });
  setTimeout(() => !isSyncReady() && (console.warn('[BackupSyncEngine] timeout fallback reached'), window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason: 'timeout_fallback', blocked: true } }))), 300000);
};

export const getSyncIntervalSec = () => Math.round(DOMAIN_DEBOUNCE_MS.favorites / 1000);

export const suspendSyncForAccountSwitch = () => {
  cancelScheduledSync();
  return suspendSyncState();
};

export { isSyncReady, isSyncEnabled, markSyncReady, markRestoreOrSkipDone, isRestoreOrSkipDone };
export default { initBackupSyncEngine, markSyncReady, isSyncReady, isSyncEnabled, setSyncEnabled, getSyncIntervalSec, suspendSyncForAccountSwitch, markRestoreOrSkipDone, isRestoreOrSkipDone };
