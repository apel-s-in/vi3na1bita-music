/**
 * update-checker.js — Fix #1.9/#21.1
 * Детекция обновлений по изменению size/size_low в remote config.json
 * Проверяет каждый альбом из albumsIndex.
 */

import { getAllTrackMetas, updateTrackMeta } from './cache-db.js';

const CHECK_INTERVAL = 30 * 60 * 1000;
let _timer = null;

export function initUpdateChecker() {
  setTimeout(() => checkForUpdates(), 8000);
  _timer = setInterval(() => checkForUpdates(), CHECK_INTERVAL);
}

export async function checkForUpdates() {
  if (window.NetPolicy && !window.NetPolicy.isNetworkAllowed()) return;
  if (!navigator.onLine) return;

  const albums = window.albumsIndex || [];
  if (!albums.length) return;

  const metas = await getAllTrackMetas();
  if (!metas.length) return;

  let changed = 0;

  for (const album of albums) {
    try {
      const base = album.base.endsWith('/') ? album.base : `${album.base}/`;
      const resp = await fetch(`${base}config.json`, { cache: 'no-cache' });
      if (!resp.ok) continue;
      const config = await resp.json();
      const tracks = config.tracks || [];

      for (const ct of tracks) {
        const uid = String(ct.uid || ct.id || '').trim();
        if (!uid) continue;

        const meta = metas.find(m => m.uid === uid);
        if (!meta || !meta.size) continue;
        if (meta.type !== 'pinned' && meta.type !== 'cloud') continue;

        const q = meta.quality || 'lo';
        const remoteSize = q === 'hi'
          ? (ct.size || ct.fileSize || 0)
          : (ct.size_low || ct.fileSizeLow || 0);

        const remoteBytes = remoteSize > 0 ? Math.round(remoteSize * 1048576) : 0;

        // meta.size у нас в байтах (blob.size). remoteSize в MB.
        const mismatch = remoteBytes > 0 && meta.size > 0 && Math.abs(remoteBytes - meta.size) > 1024;

        if (mismatch) {
          if (!meta.needsUpdate) {
            await updateTrackMeta(meta.uid, { needsUpdate: true, remoteSize });
            changed++;
          }
        } else if (meta.needsUpdate) {
          await updateTrackMeta(meta.uid, { needsUpdate: false });
          changed++;
        }
      }
    } catch (e) {
      console.warn('[UpdateChecker] album check failed:', album.key, e);
    }
  }

  if (changed > 0) {
    window.dispatchEvent(new CustomEvent('offline:uiChanged'));
  }
}

export async function countNeedsUpdate() {
  const metas = await getAllTrackMetas();
  return metas.filter(m => m.needsUpdate).length;
}

export async function getUpdateList() {
  const metas = await getAllTrackMetas();
  return metas.filter(m => m.needsUpdate);
}

export default { initUpdateChecker, checkForUpdates, countNeedsUpdate };
