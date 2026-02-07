/**
 * eviction.js — Fix #20.1/#20.2
 * Eviction transient файлов при нехватке места.
 */

import { getAllTrackMetas, deleteTrackCache } from './cache-db.js';

const MIN_FREE_MB = 30;

export async function runEviction(protectedUids = new Set()) {
  const hasFree = await _checkFreeSpace();
  if (hasFree) return 0;

  const metas = await getAllTrackMetas();
  const evictable = metas
    .filter(m => m.type === 'playbackCache' && !protectedUids.has(m.uid))
    .sort((a, b) => (a.lastAccessedAt || 0) - (b.lastAccessedAt || 0));

  if (!evictable.length) return 0;

  let evicted = 0;
  for (const m of evictable) {
    await deleteTrackCache(m.uid);
    evicted++;
    if (await _checkFreeSpace()) break;
  }

  // Fix #20.2: Toast
  if (evicted > 0) {
    const toast = window.NotificationSystem?.warning || window.toast;
    if (toast) toast(`Кэш переполнен. Удалены самые старые треки (${evicted}).`);
    window.dispatchEvent(new CustomEvent('offline:uiChanged'));
  }

  return evicted;
}

async function _checkFreeSpace() {
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      return ((est.quota || 0) - (est.usage || 0)) / 1048576 >= MIN_FREE_MB;
    }
    return true;
  } catch { return true; }
}

export default { runEviction };
