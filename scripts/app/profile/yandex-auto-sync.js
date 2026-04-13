// scripts/app/profile/yandex-auto-sync.js
import { YandexDisk } from '../../core/yandex-disk.js';
import { BackupVault } from '../../analytics/backup-vault.js';

function getLocalTs() { return Number(localStorage.getItem('yandex:last_backup_local_ts') || 0); }

function safeNum(v) {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

function safeString(v) {
  return String(v == null ? '' : v).trim();
}

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

function getRichnessScore(summary = {}) {
  return (
    safeNum(summary.level) * 1000 +
    safeNum(summary.xp) +
    safeNum(summary.achievementsCount) * 250 +
    safeNum(summary.favoritesCount) * 40 +
    safeNum(summary.playlistsCount) * 60 +
    safeNum(summary.statsCount) * 6 +
    safeNum(summary.eventCount) * 2 +
    safeNum(summary.devicesCount) * 25 +
    safeNum(summary.deviceStableCount) * 30
  );
}

function compareLocalVsCloud(localSummary, cloudMeta) {
  const localTs = safeNum(localSummary?.timestamp);
  const cloudTs = safeNum(cloudMeta?.timestamp);
  const localScore = getRichnessScore(localSummary);
  const cloudScore = getRichnessScore(cloudMeta);
  const scoreDiff = cloudScore - localScore;
  const tsDiff = cloudTs - localTs;

  const noCloudData = !cloudMeta || (!cloudTs && cloudScore === 0);
  const noLocalEvidence = localTs === 0 && localScore <= 1200;

  if (noCloudData) return { state: 'no_cloud', localTs, cloudTs, localScore, cloudScore, scoreDiff, tsDiff };
  if (noLocalEvidence && cloudScore > 0) return { state: 'cloud_richer_new_device', localTs, cloudTs, localScore, cloudScore, scoreDiff, tsDiff };
  if (cloudTs > localTs && cloudScore >= localScore) return { state: 'cloud_richer', localTs, cloudTs, localScore, cloudScore, scoreDiff, tsDiff };
  if (localTs > cloudTs && localScore >= cloudScore) return { state: 'local_richer', localTs, cloudTs, localScore, cloudScore, scoreDiff, tsDiff };
  if (Math.abs(tsDiff) < 2 * 60000 && Math.abs(scoreDiff) < 300) return { state: 'equivalent', localTs, cloudTs, localScore, cloudScore, scoreDiff, tsDiff };
  if (cloudScore > localScore && cloudTs >= localTs) return { state: 'cloud_probably_richer', localTs, cloudTs, localScore, cloudScore, scoreDiff, tsDiff };
  if (localScore > cloudScore && localTs >= cloudTs) return { state: 'local_probably_richer', localTs, cloudTs, localScore, cloudScore, scoreDiff, tsDiff };
  return { state: 'conflict', localTs, cloudTs, localScore, cloudScore, scoreDiff, tsDiff };
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

    if (isNewDevice || cmp.state === 'cloud_richer' || cmp.state === 'cloud_probably_richer' || cmp.state === 'conflict') {
      _showRestoreModal(meta, token, { localSummary, compare: cmp });
    }
  } catch (e) {
    console.debug('[AutoSync] meta check failed:', e?.message);
    _markReady('meta_check_failed');
  }
}

function _showRestoreModal(meta, token, ctx = {}) {
  const localSummary = ctx.localSummary || getLocalProfileSummary();
  const cmp = ctx.compare || compareLocalVsCloud(localSummary, meta);

  window.Modals?.confirm?.({
    title: '☁️ Найден ваш облачный прогресс',
    textHtml: `
      <div style="color:#eaf2ff;font-size:13px;margin-bottom:12px;line-height:1.5">
        Обнаружена облачная копия данных. Восстановить прогресс на этом устройстве?
      </div>
      <div style="display:flex;gap:10px;margin:0 0 12px;text-align:center">
        <div style="flex:1;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:10px 8px">
          <div style="font-size:10px;color:#888;margin-bottom:6px;text-transform:uppercase">💾 Сейчас</div>
          <div style="font-size:13px;font-weight:900;color:#fff">Ур. ${localSummary.level || 1}</div>
          <div style="font-size:11px;color:#eaf2ff">⭐ ${localSummary.favoritesCount || 0} треков · ▶ ${localSummary.playlistsCount || 0}</div>
        </div>
        <div style="flex:1;background:rgba(77,170,255,.08);border:1px solid rgba(77,170,255,.2);border-radius:12px;padding:10px 8px">
          <div style="font-size:10px;color:#8ab8fd;margin-bottom:6px;text-transform:uppercase">☁️ Облако</div>
          <div style="font-size:13px;font-weight:900;color:#fff">Ур. ${meta.level || 1}</div>
          <div style="font-size:11px;color:#eaf2ff">⭐ ${meta.favoritesCount || 0} треков · ▶ ${meta.playlistsCount || 0}</div>
        </div>
      </div>
      <div style="font-size:11px;color:#7f93b5">
        Сравнение: ${cmp.state}. Применяется безопасное слияние — высокие результаты не будут понижены.
      </div>`,
    maxWidth: 460,
    confirmText: '📥 Восстановить',
    cancelText: 'Пропустить',
    onCancel: () => {
      _markReady('user_skipped_restore');
    },
    onConfirm: async () => {
      window.NotificationSystem?.info('Загружаем резервную копию...');
      try {
        const data = await YandexDisk.download(token);
        if (!data) return window.NotificationSystem?.warning('Файл backup не найден.');
        const sum = BackupVault.summarizeBackupObject(data);
        const curYId = String(window.YandexAuth?.getProfile?.()?.yandexId || '').trim();
        if (sum.ownerYandexId && sum.ownerYandexId !== curYId) {
          return window.NotificationSystem?.error('Backup принадлежит другому аккаунту.');
        }
        await BackupVault.importData(new Blob([JSON.stringify(data)]), 'all');
        _markReady('auto_restore');
        window.NotificationSystem?.success('Прогресс восстановлен ✅ Обновляем...');
        setTimeout(() => window.location.reload(), 1500);
      } catch (e) {
        _markReady('restore_failed');
        window.NotificationSystem?.error('Ошибка: ' + String(e?.message || ''));
      }
    }
  });
}

async function _markReady(reason) {
  try {
    const { markSyncReady } = await import('../../analytics/backup-sync-engine.js');
    markSyncReady(reason);
  } catch {}
}

export default { initYandexAutoSync };
