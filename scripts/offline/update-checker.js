import { getAllTrackMetas, updateTrackMeta } from './cache-db.js';
let _timer = null, _running = false;

export const initUpdateChecker = () => {
  if (_timer) return;
  setTimeout(checkForUpdates, 8000); _timer = setInterval(checkForUpdates, 30 * 60 * 1000);
};

export const checkForUpdates = async () => {
  if (_running) return; _running = true;
  try {
    const np = window.NetPolicy;
    if ((np && !np.isNetworkAllowed()) || !navigator.onLine || np?.detectNetworkType?.() === 'cellular') return;
    const tgt = new Map((await getAllTrackMetas()).filter(m => ['pinned', 'cloud'].includes(m.type) && m.cachedComplete && m.size).map(m => [m.uid, m]));
    if (!tgt.size) return;
    let chg = false;

    await Promise.allSettled((window.albumsIndex || []).map(async a => {
      const b = a.yandex_base || a.github_base; if (!b) return;
      const res = await (window.NetPolicy?.guardedFetch?.(`${b.endsWith('/') ? b : `${b}/`}config.json`, { cache: 'force-cache' }) || fetch(`${b.endsWith('/') ? b : `${b}/`}config.json`, { cache: 'force-cache' }));
      if (!res.ok) return;
      for (const t of (await res.json()).tracks || []) {
        const m = tgt.get(t.uid); if (!m) continue;
        const rB = Math.round(((m.quality || 'lo') === 'hi' ? t.size : t.size_low) * 1048576) || 0;
        const mm = rB > 0 && Math.abs(rB - (m.size || 0)) > 102400;
        if (mm !== !!m.needsUpdate) { await updateTrackMeta(t.uid, { needsUpdate: mm, remoteSize: mm ? (rB / 1048576) : undefined }); chg = true; }
      }
    }));
    if (chg) window.dispatchEvent(new CustomEvent('offline:uiChanged'));
  } finally { _running = false; }
};

export const countNeedsUpdate = async () => (await getAllTrackMetas()).filter(m => m.needsUpdate).length;
export const getUpdateList = async () => (await getAllTrackMetas()).filter(m => m.needsUpdate);
export const clearNeedsUpdate = async (uid) => uid ? updateTrackMeta(uid, { needsUpdate: false, remoteSize: undefined }) : Promise.resolve(false);
export default { initUpdateChecker, checkForUpdates, countNeedsUpdate, getUpdateList, clearNeedsUpdate };
