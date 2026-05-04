import { metaDB } from './meta-db.js';
import { toNum, mergeProfileStorageValueSafe, getBackupConflictPolicy } from './backup-merge.js';
import DeviceRegistry from './device-registry.js';
import { getSharedSnapshotLocalEntries, getDeviceSnapshotLocalEntries, isSharedStorageKey, isDeviceStorageKey, PLAYBACK_SENSITIVE_DEVICE_KEYS } from './snapshot-contract.js';
import { normalizeDeviceSettingsSnapshot, shouldApplyDeviceSettingKey, isPlaybackSensitiveDeviceSettingKey } from './device-settings-contract.js';
import { normalizeEventList } from './backup-event-cleanup.js';
import { readLocalEventLog, mergeEventLogs, rebuildStatsFromEvents } from './stats-state.js';
import { buildAchievementBackupState, normalizeAchievementState, mergeAchievementStates, applyAchievementStateToMetaDB, deriveAchievementUnlockMetaFromEvents } from './achievement-state.js';

export const rebuildStatsFromWarmEvents = async () => {
  try {
    const warm = normalizeEventList(await metaDB.getEvents('events_warm').catch(() => []), { limit: 10000 });
    return await rebuildStatsFromEvents(metaDB, warm, { reason: 'legacy_warm_rebuild' });
  } catch (e) {
    console.warn('[rbdStats] failed:', e?.message);
    return false;
  }
};

const replaceStoreRows = async (store, rows) => {
  await metaDB.tx(store, 'readwrite', s => s.clear()).catch(() => {});
  if (Array.isArray(rows) && rows.length) await metaDB.tx(store, 'readwrite', s => rows.forEach(x => s.put(x)));
};

export const applyBackupImportObject = async (backup, mode = 'all') => {
  window._isRestoring = true;
  try {
    const cY = String(window.YandexAuth?.getProfile?.()?.yandexId || '').trim();
    const oY = String(backup?.identity?.ownerYandexId || '').trim();
    if (!cY) throw new Error('restore_requires_yandex_login');
    if (!oY || oY !== cY) throw new Error('restore_owner_mismatch');

    const intel = backup.data.intel || {};

    if (mode === 'all' || mode === 'stats') {
      const [localEvents, lA, lM, lS, lR] = await Promise.all([
        readLocalEventLog(metaDB, { forceFlush: true }),
        metaDB.getGlobal('unlocked_achievements'),
        metaDB.getGlobal('achievement_unlock_meta'),
        metaDB.getGlobal('global_streak'),
        metaDB.getGlobal('user_profile_rpg')
      ]);
      const remoteEvents = Array.isArray(backup.data.eventLog.warm) ? backup.data.eventLog.warm : [];
      const beforeMergeCount = localEvents.length + remoteEvents.length;
      const mergedEvents = mergeEventLogs(localEvents, remoteEvents);
      if (mergedEvents.length < beforeMergeCount) console.debug(`[BackupVault] event merge cleaned: ${beforeMergeCount} → ${mergedEvents.length}`);
      await rebuildStatsFromEvents(metaDB, mergedEvents, { reason: 'backup_restore' });

      try {
        const remoteGlobal = (Array.isArray(backup?.data?.stats) ? backup.data.stats : []).find(s => s?.uid === 'global') || null;
        const remoteBackupCount = toNum(remoteGlobal?.featuresUsed?.backup);
        if (remoteBackupCount > 0) {
          await metaDB.updateStat('global', s => {
            s.featuresUsed = s.featuresUsed || {};
            s.featuresUsed.backup = Math.max(toNum(s.featuresUsed.backup), remoteBackupCount);
            return s;
          });
        }
      } catch {}

      const eventUnlockMeta = deriveAchievementUnlockMetaFromEvents(mergedEvents);
      const eventUnlockMap = Object.fromEntries(Object.entries(eventUnlockMeta).map(([id, x]) => [id, x.unlockedAt]));
      const localAchState = buildAchievementBackupState({ unlocked: lA?.value || {}, unlockMeta: lM?.value || {}, profileRpg: lR?.value || { xp: 0, level: 1 }, streaks: lS?.value || {}, events: localEvents });
      const remoteAchState = normalizeAchievementState(backup.data.achievementState || {
        unlocked: backup.data.achievements || {},
        unlockMeta: {},
        profileRpg: backup.data.userProfileRpg || {},
        streaks: backup.data.streaks || {}
      });
      const eventAchState = buildAchievementBackupState({ unlocked: eventUnlockMap, unlockMeta: eventUnlockMeta });
      const mergedAchState = mergeAchievementStates(mergeAchievementStates(localAchState, remoteAchState), eventAchState);
      await applyAchievementStateToMetaDB(metaDB, mergedAchState);
      if (window.achievementEngine) {
        window.achievementEngine.unlocked = mergedAchState.unlocked;
        window.achievementEngine.profile = mergedAchState.profileRpg;
        window.achievementEngine.unlockMeta = mergedAchState.unlockMeta;
        window.achievementEngine.achievements = window.achievementEngine._buildUIArray?.() || window.achievementEngine.achievements || [];
      }

      await replaceStoreRows('listener_profile', intel.listenerProfile);
      await replaceStoreRows('provider_identity', intel.providerIdentity);
      await replaceStoreRows('hybrid_sync', intel.hybridSync);
      await replaceStoreRows('recommendation_state', intel.recommendationState);
      await replaceStoreRows('collection_state', intel.collectionState);
      await replaceStoreRows('intel_runtime', intel.intelRuntime);
    }

    if (mode === 'all' || mode === 'profile') {
      if (backup.data.userProfile) await metaDB.setGlobal('user_profile', backup.data.userProfile);
      if (Array.isArray(backup.devices)) {
        backup.devices = DeviceRegistry.normalizeDeviceRegistry(backup.devices);
        console.debug(`[BackupVault] devices dedup on import: ${(backup.devices || []).length}`);
      }
      const isPlaying = !!window.playerCore?.isPlaying?.();
      const sharedLocal = getSharedSnapshotLocalEntries(backup.data.localStorage || {});
      const deviceLocal = getDeviceSnapshotLocalEntries(backup.data.localStorage || {});
      Object.entries(sharedLocal).forEach(([k, v]) => {
        if (!isSharedStorageKey(k)) return;
        try { localStorage.setItem(k, mergeProfileStorageValueSafe(k, localStorage.getItem(k), v)); } catch {}
      });
      Object.entries(deviceLocal).forEach(([k, v]) => {
        if (!isDeviceStorageKey(k)) return;
        if (isPlaying && PLAYBACK_SENSITIVE_DEVICE_KEYS.has(k)) return;
        try { localStorage.setItem(k, v); } catch {}
      });
    }

    try {
      const localDevices = DeviceRegistry.getDeviceRegistry();
      const remoteDevices = Array.isArray(backup.devices) ? backup.devices : [];
      const mergedDevices = DeviceRegistry.normalizeDeviceRegistry([...localDevices, ...remoteDevices]);
      DeviceRegistry.saveDeviceRegistry(mergedDevices);
      localStorage.setItem('yandex:last_backup_local_ts', String(Number(backup?.revision?.timestamp || backup?.createdAt || Date.now())));
    } catch {}

    window.dispatchEvent(new CustomEvent('stats:updated'));
    window.dispatchEvent(new CustomEvent('analytics:logUpdated'));
    return true;
  } finally {
    window._isRestoring = false;
  }
};

export const applyDeviceSettingsObject = async (deviceDoc, { allowPlaybackSensitive = false } = {}) => {
  const doc = normalizeDeviceSettingsSnapshot(deviceDoc || {});
  const policy = getBackupConflictPolicy();
  const isPlaying = !!window.playerCore?.isPlaying?.();
  const effectiveAllowSensitive = !!allowPlaybackSensitive || policy === 'latest';
  Object.entries(doc.localStorage || {}).forEach(([k, v]) => {
    if (!shouldApplyDeviceSettingKey(k)) return;
    const sensitive = isPlaybackSensitiveDeviceSettingKey(k);
    if (sensitive && isPlaying) return;
    if (sensitive && !effectiveAllowSensitive) return;
    try { localStorage.setItem(k, v); } catch {}
  });
  try { window.eventLogger?.log?.('DEVICE_UPDATED', null, { action: 'device_settings_restore', policy, keysCount: Object.keys(doc.localStorage || {}).length, sourceDeviceStableId: doc.deviceStableId || '' }); } catch {}
  window.dispatchEvent(new CustomEvent('analytics:logUpdated'));
  return true;
};

export default {
  rebuildStatsFromWarmEvents,
  applyBackupImportObject,
  applyDeviceSettingsObject
};
