// scripts/app/profile/yandex-auto-sync.js
import { YandexDisk } from '../../core/yandex-disk.js';
import { BackupVault } from '../../analytics/backup-vault.js';
import { safeNum, safeString, compareLocalVsCloud } from '../../analytics/backup-summary.js';

function getLocalTs() { return Number(localStorage.getItem('yandex:last_backup_local_ts') || 0); }

function getLocalProfileSummary() {
  const rpg = window.achievementEngine?.profile || { level: 1, xp: 0 };
  const ach = window.achievementEngine?.unlocked || {};
  let favs = 0, playlists = 0;
  try { favs = JSON.parse(localStorage.getItem('__favorites_v2__') || '[]').filter(i => !i?.inactiveAt).length; } catch {}
  try { playlists = JSON.parse(localStorage.getItem('sc3:playlists') || '[]').length; } catch {}
  let statsCount = 0, eventCount = 0, devicesCount = 0, deviceStableCount = 0;
  try {
    const reg = JSON.parse(localStorage.getItem('backup:device_registry:v1') || '[]');
    if (Array.isArray(reg)) {
      devicesCount = reg.length;
      deviceStableCount = new Set(reg.map(d => safeString(d?.deviceStableId || '')).filter(Boolean)).size;
    }
  } catch {}

  return {
    timestamp: getLocalTs(),
    level: safeNum(rpg.level || 1),
    xp: safeNum(rpg.xp || 0),
    achievementsCount: Object.keys(ach || {}).length,
    favoritesCount: safeNum(favs),
    playlistsCount: safeNum(playlists),
    statsCount,
    eventCount,
    devicesCount,
    deviceStableCount
  };
}

async function enrichLocalSummaryWithDb(summary) {
  try {
    const { metaDB } = await import('../../analytics/meta-db.js');
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
}

export async function initYandexAutoSync() {
  const ya = window.YandexAuth;
  if (!ya || ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) {
    _markReady('no_auth_local_only');
    return;
  }
  await _checkCloudMetaOnly();

  window.addEventListener('yandex:auth:changed', async e => {
    if (e.detail?.status === 'active') await _checkCloudMetaOnly();
    else if (e.detail?.status === 'logged_out') _markReady('logged_out_local_only');
  });

}

async function _checkCloudMetaOnly() {
  const ya = window.YandexAuth;
  if (!ya || ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) return;
  if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) {
    _markReady('offline_skip');
    return;
  }

  try {
    const token = ya.getToken();
    const meta = await YandexDisk.getMeta(token).catch(() => null);
    const localSummary = await enrichLocalSummaryWithDb(getLocalProfileSummary());

    if (!meta) {
      _markReady('no_cloud_backup');
      return;
    }

    try { localStorage.setItem('yandex:last_backup_check', JSON.stringify(meta)); } catch {}
    window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));

    const cmp = compareLocalVsCloud(localSummary, meta);
    const diffMin = Math.round((safeNum(cmp.cloudTs) - safeNum(cmp.localTs)) / 60000);
    const isNewDevice = cmp.state === 'cloud_richer_new_device';

    if (cmp.state === 'local_richer' || cmp.state === 'local_probably_richer' || cmp.state === 'equivalent') {
      _markReady(cmp.state === 'equivalent' ? 'diff_too_small' : 'cloud_not_newer');
      return;
    }

    if (cmp.state === 'no_cloud') {
      _markReady('no_cloud_backup');
      return;
    }

    _markReady('cloud_newer_user_choice');

    window.dispatchEvent(new CustomEvent('yandex:cloud:newer', {
      detail: {
        cloudTs: cmp.cloudTs,
        localTs: cmp.localTs,
        diffMin,
        isNewDevice,
        meta,
        compareState: cmp.state,
        localSummary,
        localScore: cmp.localScore,
        cloudScore: cmp.cloudScore
      }
    }));

    // Убираем агрессивное модальное окно. Оранжевое окно в профиле 
    // само покажет, что есть новая копия (через dispatchEvent).
    if (isNewDevice || cmp.state === 'cloud_richer' || cmp.state === 'cloud_probably_richer' || cmp.state === 'conflict') {
      _markReady('cloud_newer_user_choice');
    }
  } catch (e) {
    console.debug('[AutoSync] meta check failed:', e?.message);
    _markReady('meta_check_failed');
  }
}
/* Функция агрессивного модального окна _showRestoreModal удалена по правилу ненавязчивости */

async function _markReady(reason) {
  try {
    const { markSyncReady } = await import('../../analytics/backup-sync-engine.js');
    markSyncReady(reason);
  } catch {}
}

export default { initYandexAutoSync };
