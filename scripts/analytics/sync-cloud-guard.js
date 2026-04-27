// UID.099_(Multi-device sync model)_(compare-before-write)_(облако не затирается без проверки)
// UID.100_(Backup snapshot as life capsule)_(summary должен быть лёгким и честным)_(cloud meta cache экономит запросы)
// UID.096_(Helper-first anti-duplication policy)_(вынести cloud guard из backup-sync-engine)

import { safeNum, safeString, safeJsonParse, compareLocalVsCloud } from './backup-summary.js';

const META_CACHE_MAX_AGE_MS = 10 * 60000;

export const getLocalSyncSummary = () => {
  const a = window.achievementEngine;
  const f = safeJsonParse(localStorage.getItem('__favorites_v2__'), []);
  const pl = safeJsonParse(localStorage.getItem('sc3:playlists'), []);
  const r = window.DeviceRegistry?.getDeviceRegistry?.() || safeJsonParse(localStorage.getItem('backup:device_registry:v1'), []) || [];
  return {
    timestamp: safeNum(localStorage.getItem('yandex:last_backup_local_ts')),
    level: safeNum(a?.profile?.level || 1),
    xp: safeNum(a?.profile?.xp || 0),
    achievementsCount: Object.keys(a?.unlocked || {}).length,
    favoritesCount: Array.isArray(f) ? f.filter(i => !i?.inactiveAt).length : 0,
    playlistsCount: Array.isArray(pl) ? pl.filter(p => !p?.deletedAt).length : 0,
    statsCount: 0,
    eventCount: 0,
    devicesCount: Array.isArray(r) ? r.length : 0,
    deviceStableCount: window.DeviceRegistry?.countDeviceStableIds?.(r) || new Set((Array.isArray(r) ? r : []).map(d => safeString(d?.deviceStableId)).filter(Boolean)).size
  };
};

export const enrichLocalSyncSummary = async summary => {
  try {
    const { metaDB } = await import('./meta-db.js');
    const [stats, warm] = await Promise.all([
      metaDB.getAllStats().catch(() => []),
      metaDB.getEvents('events_warm').catch(() => [])
    ]);
    return {
      ...summary,
      statsCount: Array.isArray(stats) ? stats.filter(x => x?.uid && x.uid !== 'global').length : safeNum(summary?.statsCount),
      eventCount: Array.isArray(warm) ? warm.length : safeNum(summary?.eventCount)
    };
  } catch {
    return summary;
  }
};

export const readCachedCloudMeta = (maxAgeMs = META_CACHE_MAX_AGE_MS) => {
  try {
    const ts = safeNum(localStorage.getItem('yandex:last_backup_check_ts'));
    if (!ts || Date.now() - ts > maxAgeMs) return null;
    return safeJsonParse(localStorage.getItem('yandex:last_backup_check') || localStorage.getItem('yandex:last_backup_meta') || 'null', null);
  } catch {
    return null;
  }
};

export const writeCachedCloudMeta = meta => {
  try {
    if (!meta) return false;
    localStorage.setItem('yandex:last_backup_check', JSON.stringify(meta));
    localStorage.setItem('yandex:last_backup_check_ts', String(Date.now()));
    return true;
  } catch {
    return false;
  }
};

export const checkCloudSafe = async (disk, token) => {
  try {
    const cached = readCachedCloudMeta();
    const cloudMeta = cached || await disk.getMeta(token).catch(() => null);
    if (cloudMeta && !cached) writeCachedCloudMeta(cloudMeta);

    const localSummary = await enrichLocalSyncSummary(getLocalSyncSummary());
    const compare = compareLocalVsCloud(localSummary, cloudMeta);

    if (compare.state === 'no_cloud') return { ok: true, reason: 'no_cloud', compare, cloudMeta };
    if (['local_richer', 'local_probably_richer', 'equivalent'].includes(compare.state)) {
      return { ok: true, reason: compare.state, compare, cloudMeta };
    }
    return { ok: false, reason: compare.state, compare, cloudMeta };
  } catch (e) {
    const message = String(e?.message || '');
    if (message.includes('disk_forbidden') || message.includes('disk_auth_error') || message.includes('403')) {
      console.warn('[BackupSyncEngine] disk forbidden, blocking autosave until reauth');
      return { ok: false, reason: 'cloud_forbidden', error: message };
    }
    return { ok: false, reason: 'cloud_compare_failed', error: message };
  }
};

export default {
  getLocalSyncSummary,
  enrichLocalSyncSummary,
  readCachedCloudMeta,
  writeCachedCloudMeta,
  checkCloudSafe
};
