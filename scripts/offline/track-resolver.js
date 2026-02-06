/**
 * track-resolver.js — Резолвер URL трека (кэш → онлайн)
 */

import { getOfflineManager } from './offline-manager.js';
import { getAudioBlob } from './cache-db.js';

export async function resolveTrackUrl(uid, originalUrl, options = {}) {
  const mgr = getOfflineManager();
  const mode = mgr.getMode();

  if (mode === 'R0') {
    return { url: originalUrl, source: 'network', quality: 'original' };
  }

  const quality = options.quality || mgr.getActivePlaybackQuality();
  const q = quality === 'lo' ? 'low' : 'high';

  try {
    // Пробуем запрошенное качество
    let blob = await getAudioBlob(uid, q);
    if (blob) {
      return { url: URL.createObjectURL(blob), source: 'cache', quality };
    }

    // Пробуем альтернативное качество
    const altQ = q === 'high' ? 'low' : 'high';
    blob = await getAudioBlob(uid, altQ);
    if (blob) {
      return { url: URL.createObjectURL(blob), source: 'cache', quality: altQ === 'high' ? 'hi' : 'lo' };
    }
  } catch (err) {
    console.warn('[TrackResolver] cache read error:', err);
  }

  // R3 — только кэш, нет сети
  if (mode === 'R3') {
    return { url: null, source: 'none', quality: null };
  }

  // R1/R2 — фолбэк на онлайн
  return { url: originalUrl, source: 'network', quality: 'original' };
}

export async function preloadTrack(uid, url, quality) {
  const mgr = getOfflineManager();
  if (mgr.getMode() === 'R0') return;

  const complete = await mgr.isTrackComplete(uid, quality);
  if (complete) return;

  mgr.enqueueAudioDownload({ uid, quality, priority: 30, kind: 'preload' });
}

export default resolveTrackUrl;
