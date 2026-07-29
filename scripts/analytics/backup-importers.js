import { metaDB } from './meta-db.js';
import { toNum, mergeProfileStorageValueSafe, getBackupConflictPolicy } from './storage-merge.js';
import DeviceRegistry from './device-registry.js';
import { getSharedSnapshotLocalEntries, getDeviceSnapshotLocalEntries, isSharedStorageKey, isDeviceStorageKey, PLAYBACK_SENSITIVE_DEVICE_KEYS } from './snapshot-contract.js';
import { normalizeDeviceSettingsSnapshot, shouldApplyDeviceSettingKey, isPlaybackSensitiveDeviceSettingKey } from './device-settings-contract.js';
import { normalizeEventList } from './backup-event-cleanup.js';
import { readLocalEventLog, mergeEventLogs, rebuildStatsFromEvents } from './stats-state.js';
import { AccountDataContext } from './account-data-boundary.js';

export const rebuildStatsFromWarmEvents = async () => rebuildStatsFromEvents(metaDB, normalizeEventList(await metaDB.getEvents('events_warm').catch(() => []), { limit: 10000 }), { reason: 'legacy_warm_rebuild' }).catch(() => false);

const replaceStoreRows = async (store, rows) => { await metaDB.tx(store, 'readwrite', s => s.clear()).catch(() => {}); if (Array.isArray(rows) && rows.length) await metaDB.tx(store, 'readwrite', s => rows.forEach(x => s.put(x))); };

export const applyBackupImportObject = async (backup, mode = 'all') => {
  window._isRestoring = true;
  try {
    const cY = String(window.YandexAuth?.getProfile?.()?.yandexId || '').trim(), oY = String(backup?.identity?.ownerYandexId || '').trim();
    if (!cY) throw new Error('restore_requires_yandex_login');
    if (!oY || oY !== cY) throw new Error('restore_owner_mismatch');

    const boundary =
      await AccountDataContext.requireCurrentOwner();

    if (boundary.ownerYandexId !== cY) {
      throw new Error('local_data_owner_mismatch');
    }

    if (mode === 'all' || mode === 'stats') {
      const localEvents = await readLocalEventLog(metaDB, { forceFlush: true });
      const mergedEvents = mergeEventLogs(localEvents, Array.isArray(backup.data.eventLog?.warm) ? backup.data.eventLog.warm : []);
      await rebuildStatsFromEvents(metaDB, mergedEvents, { reason: 'backup_restore' });

      try {
        const rbC = toNum((Array.isArray(backup?.data?.stats) ? backup.data.stats : []).find(s => s?.uid === 'global')?.featuresUsed?.backup);
        if (rbC > 0) await metaDB.updateStat('global', s => { s.featuresUsed = s.featuresUsed || {}; s.featuresUsed.backup = Math.max(toNum(s.featuresUsed.backup), rbC); return s; });
      } catch {}

      const intel = backup.data.intel || {};
      for (const st of ['listener_profile', 'provider_identity', 'hybrid_sync', 'recommendation_state', 'collection_state', 'intel_runtime']) await replaceStoreRows(st, intel[st === 'listener_profile' ? 'listenerProfile' : st === 'provider_identity' ? 'providerIdentity' : st === 'hybrid_sync' ? 'hybridSync' : st === 'recommendation_state' ? 'recommendationState' : st === 'collection_state' ? 'collectionState' : 'intelRuntime']);
    }

    if (mode === 'all' || mode === 'profile') {
      if (backup.data.userProfile) await metaDB.setGlobal('user_profile', backup.data.userProfile);
      const isPlay = !!window.playerCore?.isPlaying?.(), lsD = backup.data.localStorage || {};
      Object.entries(getSharedSnapshotLocalEntries(lsD)).forEach(([k, v]) => { if (isSharedStorageKey(k)) try { localStorage.setItem(k, mergeProfileStorageValueSafe(k, localStorage.getItem(k), v)); } catch {} });
      Object.entries(getDeviceSnapshotLocalEntries(lsD)).forEach(([k, v]) => { if (isDeviceStorageKey(k) && !(isPlay && PLAYBACK_SENSITIVE_DEVICE_KEYS.has(k))) try { localStorage.setItem(k, v); } catch {} });
    }

    try { DeviceRegistry.saveDeviceRegistry(DeviceRegistry.normalizeDeviceRegistry([...DeviceRegistry.getDeviceRegistry(), ...(Array.isArray(backup.devices) ? backup.devices : [])])); localStorage.setItem('yandex:last_backup_local_ts', String(Number(backup?.revision?.timestamp || backup?.createdAt || Date.now()))); } catch {}
    ['stats:updated', 'analytics:logUpdated'].forEach(e => window.dispatchEvent(new CustomEvent(e))); return true;
  } finally { window._isRestoring = false; }
};

export const applyDeviceSettingsObject = async (deviceDoc, { allowPlaybackSensitive = false } = {}) => {
  const doc = normalizeDeviceSettingsSnapshot(deviceDoc || {}), policy = getBackupConflictPolicy(), isPlay = !!window.playerCore?.isPlaying?.(), eff = !!allowPlaybackSensitive || policy === 'latest';
  Object.entries(doc.localStorage || {}).forEach(([k, v]) => { if (shouldApplyDeviceSettingKey(k) && !(isPlaybackSensitiveDeviceSettingKey(k) && isPlay) && !(isPlaybackSensitiveDeviceSettingKey(k) && !eff)) try { localStorage.setItem(k, v); } catch {} });
  try { window.eventLogger?.log?.('DEVICE_UPDATED', null, { action: 'device_settings_restore', policy, keysCount: Object.keys(doc.localStorage || {}).length, sourceDeviceStableId: doc.deviceStableId || '' }); } catch {}
  window.dispatchEvent(new CustomEvent('analytics:logUpdated')); return true;
};

export default { rebuildStatsFromWarmEvents, applyBackupImportObject, applyDeviceSettingsObject };
