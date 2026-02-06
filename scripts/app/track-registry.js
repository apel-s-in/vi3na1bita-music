/**
 * track-resolver.js — Резолвер URL трека (кэш → онлайн)
 * ТЗ 6.3: Приоритет кэшированного аудио над онлайн
 */

import { getOfflineManager } from './offline-manager.js';
import { getAudioBlob } from './cache-db.js';

/**
 * Определяет URL для воспроизведения трека.
 * Если трек есть в кэше — возвращает blob URL.
 * Иначе — оригинальный URL.
 *
 * @param {string} uid - UID трека
 * @param {string} originalUrl - исходный URL трека
 * @param {object} [options] - { quality: 'hi'|'lo' }
 * @returns {Promise<{url: string, source: 'cache'|'network', quality: string}>}
 */
export async function resolveTrackUrl(uid, originalUrl, options = {}) {
  const mgr = getOfflineManager();
  const mode = mgr.getMode();

  // В R0 — всегда онлайн
  if (mode === 'R0') {
    return { url: originalUrl, source: 'network', quality: 'original' };
  }

  const quality = options.quality || mgr.getActivePlaybackQuality();
  const q = quality === 'lo' ? 'low' : 'high';

  // Пробуем получить из кэша
  try {
    const blob = await getAudioBlob(uid, q);
    if (blob) {
      const blobUrl = URL.createObjectURL(blob);
      return { url: blobUrl, source: 'cache', quality };
    }

    // Пробуем альтернативное качество
    const altQ = q === 'high' ? 'low' : 'high';
    const altBlob = await getAudioBlob(uid, altQ);
    if (altBlob) {
      const blobUrl = URL.createObjectURL(altBlob);
      return { url: blobUrl, source: 'cache', quality: altQ === 'high' ? 'hi' : 'lo' };
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

/**
 * Предзагрузка трека в кэш
 */
export async function preloadTrack(uid, url, quality) {
  const mgr = getOfflineManager();
  if (mgr.getMode() === 'R0') return;

  const complete = await mgr.isTrackComplete(uid, quality);
  if (complete) return;

  mgr.enqueueAudioDownload({ uid, quality, priority: 30, kind: 'preload' });
}

export default resolveTrackUrl;
