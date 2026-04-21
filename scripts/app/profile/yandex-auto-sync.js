import { YandexDisk } from '../../core/yandex-disk.js';
import { safeNum, safeString, compareLocalVsCloud, getLocalBackupUiSnapshot } from '../../analytics/backup-summary.js';

const getLocalProfileSummary = () => getLocalBackupUiSnapshot({ name: (() => { try { return JSON.parse(localStorage.getItem('profile:last_snapshot') || 'null')?.name || 'Слушатель'; } catch { return 'Слушатель'; } })() });

const enrichLocalSummaryWithDb = async s => { try { const { metaDB } = await import('../../analytics/meta-db.js'), [st, wm] = await Promise.all([metaDB.getAllStats().catch(() => []), metaDB.getEvents('events_warm').catch(() => [])]); return { ...s, statsCount: Array.isArray(st) ? st.filter(x => x?.uid && x.uid !== 'global').length : safeNum(s?.statsCount), eventCount: Array.isArray(wm) ? wm.length : safeNum(s?.eventCount) }; } catch { return s; } };

const _markReady = async r => { try { const { markSyncReady } = await import('../../analytics/backup-sync-engine.js'); markSyncReady(r); } catch {} };

const _tryAutoRestore = async (m, token) => {
  try {
    window.NotificationSystem?.info('Найдена облачная копия. Восстанавливаем прогресс...');
    const d = await YandexDisk.download(token, String(m?.path || m?.latestPath || '').trim() || undefined).catch(() => null);
    if (!d) return false;
    const { BackupVault } = await import('../../analytics/backup-vault.js');
    await BackupVault.importData(new Blob([JSON.stringify(d)]), 'all');
    try {
      localStorage.setItem('yandex:last_backup_meta', JSON.stringify(m));
      localStorage.setItem('yandex:last_backup_check', JSON.stringify(m));
      localStorage.setItem('yandex:last_backup_local_ts', String(Number(d?.revision?.timestamp || d?.createdAt || Date.now())));
    } catch {}
    try {
      const { markSyncReady } = await import('../../analytics/backup-sync-engine.js');
      markSyncReady('restore_completed');
    } catch {}
    try {
      const { runPostRestoreRefresh } = await import('./yandex-runtime-refresh.js');
      await runPostRestoreRefresh({ reason: 'auto_restore_after_login', keepCurrentAlbum: true });
    } catch {}
    window.NotificationSystem?.success('Прогресс из облака восстановлен ✅');
    return true;
  } catch (er) {
    console.warn('[AutoSync] safe auto-restore failed:', er?.message);
    return false;
  }
};

const _checkCloudMetaOnly = async ({ isFreshLogin = false } = {}) => {
  const ya = window.YandexAuth; if (!ya || ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) return;
  if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return _markReady('offline_skip');
  try {
    const m = await YandexDisk.getMeta(ya.getToken()).catch((e) => { console.warn('[AutoSync] getMeta failed:', e?.message); return null; });
    const lS = await enrichLocalSummaryWithDb(getLocalProfileSummary());

    if (!m) {
      try { localStorage.removeItem('yandex:last_backup_meta'); localStorage.removeItem('yandex:last_backup_check'); } catch {}
      return _markReady('no_cloud_backup');
    }

    try { localStorage.setItem('yandex:last_backup_check', JSON.stringify(m)); } catch {}
    window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));
    const c = compareLocalVsCloud(lS, m);
    const localIsPoor = safeNum(lS?.level) <= 1 && safeNum(lS?.xp) < 500 && safeNum(lS?.achievementsCount) < 3 && safeNum(lS?.favoritesCount) < 3 && safeNum(lS?.playlistsCount) < 1;

    if (!isFreshLogin && ['local_richer', 'local_probably_richer', 'equivalent'].includes(c.state)) {
      return _markReady(c.state === 'equivalent' ? 'diff_too_small' : 'cloud_not_newer');
    }
    if (c.state === 'no_cloud') return _markReady('no_cloud_backup');

    // Защита от бесконечного цикла "cloud_richer" для той же облачной копии после успешного restore.
    try {
      const { isRestoreOrSkipDone } = await import('../../analytics/backup-sync-engine.js');
      const localTs = safeNum(localStorage.getItem('yandex:last_backup_local_ts'));
      const cloudTs = safeNum(m?.timestamp);
      const sameSnapshot = cloudTs > 0 && localTs > 0 && Math.abs(cloudTs - localTs) < 5000;
      if (isRestoreOrSkipDone() && (sameSnapshot || !isFreshLogin)) {
        console.debug('[AutoSync] cloud_newer suppressed — restore already done for same snapshot');
        return _markReady('cloud_not_newer');
      }
    } catch {}

    _markReady('cloud_newer_user_choice');
    const detail = { cloudTs: c.cloudTs, localTs: c.localTs, diffMin: Math.round((safeNum(c.cloudTs) - safeNum(c.localTs)) / 60000), isNewDevice: c.state === 'cloud_richer_new_device' || localIsPoor, meta: m, items: null, compareState: c.state, localSummary: lS, localScore: c.localScore, cloudScore: c.cloudScore, isFreshLogin };

    // Для fresh-login весь flow идёт через auth-onboarding-orchestrator (вызывается из yandex-auth.js после имени).
    // Здесь эмитим только badge-событие для случая, когда пользователь уже залогинен и в облаке появились новые данные.
    if (!isFreshLogin) {
      window.dispatchEvent(new CustomEvent('yandex:cloud:newer', { detail }));
    }
  } catch (e) { console.debug('[AutoSync] meta check failed:', e?.message); _markReady('meta_check_failed'); }
};

export const initYandexAutoSync = async () => { const ya = window.YandexAuth; if (!ya || ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) return _markReady('no_auth_local_only'); await _checkCloudMetaOnly({ isFreshLogin: false }); window.addEventListener('yandex:auth:changed', async e => { if (e.detail?.status === 'active') { const delay = e.detail?.phase === 'name_saved' ? 350 : (!!e.detail?.isFreshLogin ? 700 : 0); setTimeout(() => _checkCloudMetaOnly({ isFreshLogin: !!e.detail?.isFreshLogin }).catch(() => {}), delay); } else if (e.detail?.status === 'logged_out') _markReady('logged_out_local_only'); }); };

export default { initYandexAutoSync };
