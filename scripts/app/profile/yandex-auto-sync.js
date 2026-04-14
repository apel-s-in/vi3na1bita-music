import { YandexDisk } from '../../core/yandex-disk.js';
import { safeNum, safeString, compareLocalVsCloud } from '../../analytics/backup-summary.js';

const getLocalProfileSummary = () => {
  const ae = window.achievementEngine, rpg = ae?.profile || { level: 1, xp: 0 }, ach = ae?.unlocked || {};
  let f = 0, p = 0, dC = 0, dSC = 0;
  try { f = JSON.parse(localStorage.getItem('__favorites_v2__') || '[]').filter(i => !i?.inactiveAt).length; p = JSON.parse(localStorage.getItem('sc3:playlists') || '[]').length; const r = JSON.parse(localStorage.getItem('backup:device_registry:v1') || '[]'); if (Array.isArray(r)) { dC = r.length; dSC = new Set(r.map(d => safeString(d?.deviceStableId || '')).filter(Boolean)).size; } } catch {}
  return { timestamp: Number(localStorage.getItem('yandex:last_backup_local_ts') || 0), level: safeNum(rpg.level || 1), xp: safeNum(rpg.xp || 0), achievementsCount: Object.keys(ach || {}).length, favoritesCount: safeNum(f), playlistsCount: safeNum(p), statsCount: 0, eventCount: 0, devicesCount: dC, deviceStableCount: dSC };
};

const enrichLocalSummaryWithDb = async s => { try { const { metaDB } = await import('../../analytics/meta-db.js'), [st, wm] = await Promise.all([metaDB.getAllStats().catch(() => []), metaDB.getEvents('events_warm').catch(() => [])]); return { ...s, statsCount: Array.isArray(st) ? st.filter(x => x?.uid && x.uid !== 'global').length : safeNum(s?.statsCount), eventCount: Array.isArray(wm) ? wm.length : safeNum(s?.eventCount) }; } catch { return s; } };

const _markReady = async r => { try { const { markSyncReady } = await import('../../analytics/backup-sync-engine.js'); markSyncReady(r); } catch {} };

const _checkCloudMetaOnly = async () => {
  const ya = window.YandexAuth; if (!ya || ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) return;
  if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return _markReady('offline_skip');
  try {
    const m = await YandexDisk.getMeta(ya.getToken()).catch(() => null), lS = await enrichLocalSummaryWithDb(getLocalProfileSummary());
    if (!m) return _markReady('no_cloud_backup');
    try { localStorage.setItem('yandex:last_backup_check', JSON.stringify(m)); } catch {}
    window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));
    const c = compareLocalVsCloud(lS, m);
    if (['local_richer', 'local_probably_richer', 'equivalent'].includes(c.state)) return _markReady(c.state === 'equivalent' ? 'diff_too_small' : 'cloud_not_newer');
    if (c.state === 'no_cloud') return _markReady('no_cloud_backup');
    _markReady('cloud_newer_user_choice');
    window.dispatchEvent(new CustomEvent('yandex:cloud:newer', { detail: { cloudTs: c.cloudTs, localTs: c.localTs, diffMin: Math.round((safeNum(c.cloudTs) - safeNum(c.localTs)) / 60000), isNewDevice: c.state === 'cloud_richer_new_device', meta: m, compareState: c.state, localSummary: lS, localScore: c.localScore, cloudScore: c.cloudScore } }));
  } catch (e) { console.debug('[AutoSync] meta check failed:', e?.message); _markReady('meta_check_failed'); }
};

export const initYandexAutoSync = async () => { const ya = window.YandexAuth; if (!ya || ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) return _markReady('no_auth_local_only'); await _checkCloudMetaOnly(); window.addEventListener('yandex:auth:changed', async e => { if (e.detail?.status === 'active') await _checkCloudMetaOnly(); else if (e.detail?.status === 'logged_out') _markReady('logged_out_local_only'); }); };

export default { initYandexAutoSync };
