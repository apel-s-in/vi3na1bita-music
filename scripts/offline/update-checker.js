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

  const albums = window.albumsIndex || [];
  const metas = await getAllTrackMetas();
  
  // O(1) Lookup: фильтруем только 100% загруженные pinned/cloud файлы
  const targets = new Map();
  for (const m of metas) {
    if ((m.type === 'pinned' || m.type === 'cloud') && m.cachedComplete && m.size) {
      targets.set(m.uid, m);
    }
  }

  if (!albums.length || !targets.size) return;

  let changed = false;
  const mgr = getOfflineManager();

  // Параллельный и безопасный опрос всех remote config.json
  await Promise.allSettled(albums.map(async (album) => {
    const base = album.base.endsWith('/') ? album.base : `${album.base}/`;
    const res = await fetch(`${base}config.json`, { cache: 'no-cache' });
    if (!res.ok) return;

    const { tracks = [] } = await res.json();

    for (const t of tracks) {
      const uid = String(t.uid || t.id || '').trim();
      const meta = targets.get(uid);
      if (!meta) continue;

      const q = meta.quality || 'lo';
      const rSize = q === 'hi' ? (t.size || t.fileSize || 0) : (t.size_low || t.fileSizeLow || 0);
      const rBytes = rSize > 0 ? Math.round(rSize * 1048576) : 0;
      
      // Mismatch: расхождение размера более чем на 1 КБ
      const mismatch = rBytes > 0 && Math.abs(rBytes - meta.size) > 1024;

      if (mismatch && !meta.needsUpdate) {
        await updateTrackMeta(uid, { needsUpdate: true, remoteSize: rSize });
        
        // SPEC FIX 11.2: Автоматическое фоновое обновление
        const audioPath = q === 'hi' ? t.audio : (t.audio_low || t.audio);
        if (audioPath && mgr?.queue) {
          mgr.queue.add({
            uid,
            url: new URL(audioPath, base).toString(),
            quality: q,
            priority: 70, // PRIO.UPD = 70 (ниже окна, выше assets)
            kind: 'update'
          });
        }
        changed = true;
      } else if (!mismatch && meta.needsUpdate) {
        // Если размер совпал, но флаг остался (например, при отмене скачивания)
        await updateTrackMeta(uid, { needsUpdate: false });
        changed = true;
      }
    }
  }));

  if (changed) window.dispatchEvent(new CustomEvent('offline:uiChanged'));
}

export const countNeedsUpdate = async () => (await getAllTrackMetas()).filter(m => m.needsUpdate).length;
export const getUpdateList = async () => (await getAllTrackMetas()).filter(m => m.needsUpdate);

export default { initUpdateChecker, checkForUpdates, countNeedsUpdate, getUpdateList };
