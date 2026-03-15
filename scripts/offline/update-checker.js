/**
 * scripts/offline/update-checker.js
 * Informational stale-cache checker.
 * Помечает needsUpdate, но НЕ ставит обновление в очередь автоматически.
 */
import { getAllTrackMetas, updateTrackMeta } from './cache-db.js';

let _timer = null, _running = false;

export function initUpdateChecker() {
  if (_timer) return;
  setTimeout(checkForUpdates, 8000);
  _timer = setInterval(checkForUpdates, 30 * 60 * 1000);
}

export async function checkForUpdates() {
  if (_running) return;
  _running = true;
  try {
    const np = window.NetPolicy;
    if ((np && !np.isNetworkAllowed()) || !navigator.onLine) return;
    if (np?.detectNetworkType?.() === 'cellular') return;

    const targets = new Map((await getAllTrackMetas()).filter(m => ['pinned', 'cloud'].includes(m.type) && m.cachedComplete && m.size).map(m => [m.uid, m]));
    if (!targets.size) return;

    let changed = false;

    await Promise.allSettled((window.albumsIndex || []).map(async a => {
      const b = a.yandex_base || a.github_base;
      if (!b) return;
      const base = b.endsWith('/') ? b : `${b}/`;
      const res = await fetch(`${base}config.json`, { cache: 'force-cache' });
      if (!res.ok) return;

      for (const t of (await res.json()).tracks || []) {
        const meta = targets.get(t.uid);
        if (!meta) continue;

        const q = meta.quality || 'lo';
        const rBytes = Math.round((q === 'hi' ? t.size : t.size_low) * 1048576) || 0;
        const mismatch = rBytes > 0 && Math.abs(rBytes - (meta.size || 0)) > 102400;

        if (mismatch !== !!meta.needsUpdate) {
          await updateTrackMeta(t.uid, {
            needsUpdate: mismatch,
            remoteSize: mismatch ? (rBytes / 1048576) : undefined
          });
          changed = true;
        }
      }
    }));

    if (changed) window.dispatchEvent(new CustomEvent('offline:uiChanged'));
  } finally {
    _running = false;
  }
}

export const countNeedsUpdate = async () => (await getAllTrackMetas()).filter(m => m.needsUpdate).length;
export const getUpdateList = async () => (await getAllTrackMetas()).filter(m => m.needsUpdate);
export const clearNeedsUpdate = async (uid) => uid ? updateTrackMeta(uid, { needsUpdate: false, remoteSize: undefined }) : Promise.resolve(false);

export default { initUpdateChecker, checkForUpdates, countNeedsUpdate, getUpdateList, clearNeedsUpdate };
