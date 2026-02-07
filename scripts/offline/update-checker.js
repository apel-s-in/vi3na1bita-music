/**
 * update-checker.js — Fix #1.9/#21.1
 * Детекция обновлений по изменению size/size_low в config.json
 */

import { getAllTrackMetas, updateTrackMeta } from './cache-db.js';

const CHECK_INTERVAL = 30 * 60 * 1000;
let _timer = null;

export function initUpdateChecker() {
  setTimeout(() => checkForUpdates(), 5000);
  _timer = setInterval(() => checkForUpdates(), CHECK_INTERVAL);
}

export async function checkForUpdates() {
  if (window.NetPolicy && !window.NetPolicy.isNetworkAllowed()) return;
  if (!navigator.onLine) return;

  try {
    const resp = await fetch('/config.json', { cache: 'no-cache' });
    if (!resp.ok) return;
    const config = await resp.json();

    const metas = await getAllTrackMetas();
    let changed = 0;

    for (const meta of metas) {
      if (!meta.uid || !meta.size) continue;
      if (meta.type !== 'pinned' && meta.type !== 'cloud') continue;

      const ct = _findTrack(config, meta.uid);
      if (!ct) continue;

      const q = meta.quality || 'lo';
      const remoteSize = q === 'hi'
        ? (ct.size || ct.fileSize || 0)
        : (ct.size_low || ct.fileSizeLow || 0);

      if (remoteSize > 0 && remoteSize !== meta.size) {
        if (!meta.needsUpdate) {
          await updateTrackMeta(meta.uid, { needsUpdate: true, remoteSize });
          changed++;
        }
      } else if (meta.needsUpdate) {
        await updateTrackMeta(meta.uid, { needsUpdate: false });
        changed++;
      }
    }

    if (changed > 0) {
      window.dispatchEvent(new CustomEvent('offline:uiChanged'));
    }
  } catch (e) {
    console.warn('[UpdateChecker]', e);
  }
}

function _findTrack(config, uid) {
  if (!config) return null;
  const id = String(uid);
  if (config.tracks) {
    const t = config.tracks.find(t => String(t.uid || t.id) === id);
    if (t) return t;
  }
  if (config.albums) {
    for (const a of config.albums) {
      if (a.tracks) {
        const t = a.tracks.find(t => String(t.uid || t.id) === id);
        if (t) return t;
      }
    }
  }
  return null;
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
