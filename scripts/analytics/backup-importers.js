import { metaDB } from './meta-db.js';
import { toNum, maxDateStr, mergeAchievementsSafe, mergeProfileStorageValueSafe, getBackupConflictPolicy } from './backup-merge.js';
import DeviceRegistry from './device-registry.js';
import { getSharedSnapshotLocalEntries, getDeviceSnapshotLocalEntries, isSharedStorageKey, isDeviceStorageKey, PLAYBACK_SENSITIVE_DEVICE_KEYS } from './snapshot-contract.js';
import { normalizeDeviceSettingsSnapshot, shouldApplyDeviceSettingKey, isPlaybackSensitiveDeviceSettingKey } from './device-settings-contract.js';
import { normalizeEventList } from './backup-event-cleanup.js';
import { buildAchievementBackupState, normalizeAchievementState, mergeAchievementStates, applyAchievementStateToMetaDB } from './achievement-state.js';

export const rebuildStatsFromWarmEvents = async () => {
  try {
    const [{ StatsAggregator }] = await Promise.all([import('./stats-aggregator.js')]);
    const agg = new StatsAggregator({ bindEvents: false });
    const warm = normalizeEventList(await metaDB.getEvents('events_warm').catch(() => []), { limit: 10000 });
    await metaDB.clearEvents('events_warm').catch(() => {});
    if (warm.length) await metaDB.addEvents(warm, 'events_warm');
    await metaDB.tx('stats', 'readwrite', s => s.clear());
    await metaDB.clearEvents('events_hot').catch(() => {});
    if (!warm.length) { await new Promise(r => setTimeout(r, 0)); return true; }
    console.debug(`[rbdStats] rebuilding from ${warm.length} events...`);
    const BATCH_SIZE = 500;
    let processed = 0;
    for (let i = 0; i < warm.length; i += BATCH_SIZE) {
      const batch = warm.slice(i, i + BATCH_SIZE);
      await metaDB.addEvents(batch, 'events_hot');
      await agg.processHotEvents();
      const remaining = await metaDB.getEvents('events_hot').catch(() => []);
      if (Array.isArray(remaining) && remaining.length) await agg.processHotEvents();
      processed += batch.length;
      if (i + BATCH_SIZE < warm.length) await new Promise(r => setTimeout(r, 10));
    }
    console.debug(`[rbdStats] processed ${processed} events`);
    await new Promise(r => setTimeout(r, 50));
    return true;
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
      const [lW, lA, lS, lR] = await Promise.all([
        metaDB.getEvents('events_warm'),
        metaDB.getGlobal('unlocked_achievements'),
        metaDB.getGlobal('global_streak'),
        metaDB.getGlobal('user_profile_rpg')
      ]);
      const beforeMergeCount = (Array.isArray(lW) ? lW.length : 0) + (Array.isArray(backup.data.eventLog.warm) ? backup.data.eventLog.warm.length : 0);
      let mergedEvents = normalizeEventList([...lW, ...(backup.data.eventLog.warm || [])], { limit: 10000 });
      if (mergedEvents.length < beforeMergeCount) console.debug(`[BackupVault] warm merge cleaned: ${beforeMergeCount} → ${mergedEvents.length}`);
      await metaDB.clearEvents('events_warm');
      await metaDB.addEvents(mergedEvents, 'events_warm');
      await rebuildStatsFromWarmEvents();

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

      const localAchState = buildAchievementBackupState({ unlocked: lA?.value || {}, profileRpg: lR?.value || { xp: 0, level: 1 }, streaks: lS?.value || {} });
      const remoteAchState = normalizeAchievementState(backup.data.achievementState || {
        unlocked: backup.data.achievements || {},
        profileRpg: backup.data.userProfileRpg || {},
        streaks: backup.data.streaks || {}
      });
      const mergedAchState = mergeAchievementStates(localAchState, remoteAchState);
      await applyAchievementStateToMetaDB(metaDB, mergedAchState);
      if (window.achievementEngine) {
        window.achievementEngine.unlocked = mergedAchState.unlocked;
        window.achievementEngine.profile = mergedAchState.profileRpg;
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
