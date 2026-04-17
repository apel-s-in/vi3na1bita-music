import { YandexDisk } from '../../core/yandex-disk.js';
import { safeNum, safeString, compareLocalVsCloud, getLocalBackupUiSnapshot } from '../../analytics/backup-summary.js';

const getLocalProfileSummary = () => getLocalBackupUiSnapshot({ name: (() => { try { return JSON.parse(localStorage.getItem('profile:last_snapshot') || 'null')?.name || 'Слушатель'; } catch { return 'Слушатель'; } })() });

const enrichLocalSummaryWithDb = async s => { try { const { metaDB } = await import('../../analytics/meta-db.js'), [st, wm] = await Promise.all([metaDB.getAllStats().catch(() => []), metaDB.getEvents('events_warm').catch(() => [])]); return { ...s, statsCount: Array.isArray(st) ? st.filter(x => x?.uid && x.uid !== 'global').length : safeNum(s?.statsCount), eventCount: Array.isArray(wm) ? wm.length : safeNum(s?.eventCount) }; } catch { return s; } };

const _markReady = async r => { try { const { markSyncReady } = await import('../../analytics/backup-sync-engine.js'); markSyncReady(r); } catch {} };

const _checkCloudMetaOnly = async ({ isFreshLogin = false } = {}) => {
  const ya = window.YandexAuth; if (!ya || ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) return;
  if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return _markReady('offline_skip');
  try {
    const m = await YandexDisk.getMeta(ya.getToken()).catch(() => null), lS = await enrichLocalSummaryWithDb(getLocalProfileSummary());
    if (!m) return _markReady('no_cloud_backup');
    try { localStorage.setItem('yandex:last_backup_check', JSON.stringify(m)); } catch {}
    window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));
    const c = compareLocalVsCloud(lS, m);

    if (isFreshLogin && c.state === 'cloud_richer_new_device') {
      try {
        window.NotificationSystem?.info('Найдена облачная копия. Восстанавливаем прогресс...');
        const d = await YandexDisk.download(ya.getToken(), String(m?.path || m?.latestPath || '').trim() || undefined).catch(() => null);
        if (d) {
          const { BackupVault } = await import('../../analytics/backup-vault.js');
          await BackupVault.importData(new Blob([JSON.stringify(d)]), 'all');
          try {
            localStorage.setItem('yandex:last_backup_meta', JSON.stringify(m));
            localStorage.setItem('yandex:last_backup_check', JSON.stringify(m));
            localStorage.setItem('yandex:last_backup_local_ts', String(Number(d?.revision?.timestamp || d?.createdAt || Date.now())));
          } catch {}
          try {
            const { markSyncReady, markRestoreOrSkipDone } = await import('../../analytics/backup-sync-engine.js');
            markSyncReady('restore_completed');
            markRestoreOrSkipDone('auto_restore');
          } catch {}
          try {
            const { runPostRestoreRefresh } = await import('./yandex-runtime-refresh.js');
            await runPostRestoreRefresh({ reason: 'auto_restore_after_login', keepCurrentAlbum: true });
          } catch {}
          window.NotificationSystem?.success('Прогресс из облака восстановлен ✅');
          return;
        }
      } catch (er) {
        console.debug('[AutoSync] safe auto-restore skipped:', er?.message);
      }
    }

    if (['local_richer', 'local_probably_richer', 'equivalent'].includes(c.state)) return _markReady(c.state === 'equivalent' ? 'diff_too_small' : 'cloud_not_newer');
    if (c.state === 'no_cloud') return _markReady('no_cloud_backup');
    _markReady('cloud_newer_user_choice');
    window.dispatchEvent(new CustomEvent('yandex:cloud:newer', { detail: { cloudTs: c.cloudTs, localTs: c.localTs, diffMin: Math.round((safeNum(c.cloudTs) - safeNum(c.localTs)) / 60000), isNewDevice: c.state === 'cloud_richer_new_device', meta: m, items: null, compareState: c.state, localSummary: lS, localScore: c.localScore, cloudScore: c.cloudScore } }));
  } catch (e) { console.debug('[AutoSync] meta check failed:', e?.message); _markReady('meta_check_failed'); }
};

export const initYandexAutoSync = async () => { const ya = window.YandexAuth; if (!ya || ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) return _markReady('no_auth_local_only'); await _checkCloudMetaOnly({ isFreshLogin: false }); window.addEventListener('yandex:auth:changed', async e => { if (e.detail?.status === 'active') await _checkCloudMetaOnly({ isFreshLogin: !!e.detail?.isFreshLogin }); else if (e.detail?.status === 'logged_out') _markReady('logged_out_local_only'); }); };

export default { initYandexAutoSync };
