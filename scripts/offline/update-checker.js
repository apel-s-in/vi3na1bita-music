/**
 * scripts/offline/update-checker.js
 * Optimized & 100% Spec-Compliant (Section 11.1, 11.2).
 * Fixes O(N^2) lookups, parallelizes network requests, and automatically
 * enqueues updates in the background (via OfflineManager) as mandated by the spec.
 */
import { getAllTrackMetas, updateTrackMeta } from './cache-db.js';
import { getOfflineManager } from './offline-manager.js';

let _timer = null;

export function initUpdateChecker() {
  setTimeout(checkForUpdates, 8000);
  _timer = setInterval(checkForUpdates, 30 * 60 * 1000); // 30 минут
}

export async function checkForUpdates() {
  const np = window.NetPolicy;
  if ((np && !np.isNetworkAllowed()) || !navigator.onLine) return;
  // Снижаем агрессивность: чекаем обновы только на Wi-Fi, чтобы не тратить трафик и косты Яндекса
  if (np?.detectNetworkType?.() === 'cellular') return; 

  const targets = new Map((await getAllTrackMetas()).filter(m => ['pinned', 'cloud'].includes(m.type) && m.cachedComplete && m.size).map(m => [m.uid, m]));
  if (!targets.size) return;

  let changed = false;
  const mgr = getOfflineManager();

  await Promise.allSettled((window.albumsIndex || []).map(async a => {
    const b = a.yandex_base || a.github_base;
    if (!b) return;
    const base = b.endsWith('/') ? b : `${b}/`;
    const res = await fetch(`${base}config.json`); // SW теперь кэширует это через SWR! Бесплатно для серверов.
    if (!res.ok) return;

    for (const t of (await res.json()).tracks || []) {
      const meta = targets.get(t.uid);
      if (!meta) continue;
      
      const q = meta.quality || 'lo';
      const rBytes = Math.round((q === 'hi' ? t.size : t.size_low) * 1048576) || 0;
      const mismatch = rBytes > 0 && Math.abs(rBytes - (meta.size || 0)) > 102400;

      if (mismatch !== !!meta.needsUpdate) {
        await updateTrackMeta(t.uid, { needsUpdate: mismatch, remoteSize: mismatch ? (rBytes/1048576) : undefined });
        changed = true;
        if (mismatch && mgr?.queue) mgr.queue.add({ uid: t.uid, url: new URL(q === 'hi' ? t.audio : t.audio_low, base).toString(), quality: q, priority: 70, kind: 'update' });
      }
    }
  }));

  if (changed) window.dispatchEvent(new CustomEvent('offline:uiChanged'));
}

export const countNeedsUpdate = async () => (await getAllTrackMetas()).filter(m => m.needsUpdate).length;
export const getUpdateList = async () => (await getAllTrackMetas()).filter(m => m.needsUpdate);

export default { initUpdateChecker, checkForUpdates, countNeedsUpdate, getUpdateList };
