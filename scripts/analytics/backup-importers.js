import { metaDB } from './meta-db.js';
import { toNum, maxDateStr, mergeAchievementsSafe, mergeProfileStorageValueSafe } from './backup-merge.js';
import DeviceRegistry from './device-registry.js';
import { getSharedSnapshotLocalEntries, getDeviceSnapshotLocalEntries, isSharedStorageKey, isDeviceStorageKey, PLAYBACK_SENSITIVE_DEVICE_KEYS } from './snapshot-contract.js';

export const rebuildStatsFromWarmEvents = async () => {
  try {
    const [{ StatsAggregator }] = await Promise.all([import('./stats-aggregator.js')]);
    const agg = new StatsAggregator();
    const warm = await metaDB.getEvents('events_warm').catch(() => []);
    await metaDB.tx('stats', 'readwrite', s => s.clear());
    await metaDB.clearEvents('events_hot').catch(() => {});
    if (!Array.isArray(warm) || !warm.length) { await new Promise(r => setTimeout(r, 0)); return true; }
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
      const seen = new Set();
      let mergedEvents = [...lW, ...(backup.data.eventLog.warm || [])]
        .filter(x => x?.eventId && !seen.has(x.eventId) && seen.add(x.eventId))
        .filter(x => x.type !== 'ACHIEVEMENT_UNLOCK' && !(x.type === 'FEATURE_USED' && String(x.data?.feature).startsWith('backup')))
        .sort((x, y) => x.timestamp - y.timestamp);
      const WARM_LIMIT = 2000;
      if (mergedEvents.length > WARM_LIMIT) {
        console.debug(`[BackupVault] warm merge trimmed: ${mergedEvents.length} → ${WARM_LIMIT}`);
        mergedEvents = mergedEvents.slice(-WARM_LIMIT);
      }
      await metaDB.clearEvents('events_warm');
      await metaDB.addEvents(mergedEvents, 'events_warm');
      await rebuildStatsFromWarmEvents();

      const mergedAchievements = mergeAchievementsSafe(lA?.value || {}, backup.data.achievements || {});
      await metaDB.setGlobal('unlocked_achievements', mergedAchievements);
      if (window.achievementEngine) window.achievementEngine.unlocked = mergedAchievements;

      const remoteStreak = backup.data.streaks || {}, localStreak = lS?.value || {};
      await metaDB.setGlobal('global_streak', {
        ...localStreak,
        ...remoteStreak,
        current: Math.max(toNum(localStreak.current), toNum(remoteStreak.current)),
        longest: Math.max(toNum(localStreak.longest), toNum(remoteStreak.longest)),
        lastActiveDate: maxDateStr(localStreak.lastActiveDate, remoteStreak.lastActiveDate)
      });

      const remoteRpg = backup.data.userProfileRpg || {}, localRpg = lR?.value || {};
      const mergedRpg = {
        ...localRpg,
        ...remoteRpg,
        xp: Math.max(toNum(localRpg.xp), toNum(remoteRpg.xp)),
        level: Math.max(toNum(localRpg.level || 1), toNum(remoteRpg.level || 1), 1)
      };
      await metaDB.setGlobal('user_profile_rpg', mergedRpg);
      if (window.achievementEngine) window.achievementEngine.profile = mergedRpg;

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
      localStorage.setItem('backup:device_registry:v1', JSON.stringify(Array.isArray(backup.devices) ? backup.devices : []));
      localStorage.setItem('yandex:last_backup_local_ts', String(Number(backup?.revision?.timestamp || backup?.createdAt || Date.now())));
    } catch {}

    window.dispatchEvent(new CustomEvent('stats:updated'));
    window.dispatchEvent(new CustomEvent('analytics:logUpdated'));
    return true;
  } finally {
    window._isRestoring = false;
  }
};

export default {
  rebuildStatsFromWarmEvents,
  applyBackupImportObject
};
