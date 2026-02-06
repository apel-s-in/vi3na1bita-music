/**
 * track-resolver.js — Резолвер аудио-источника.
 *
 * Порядок (ТЗ П.6.1):
 *   1. Кэш (pinned/cloud blob) нужного качества
 *   2. Кэш (pinned/cloud blob) альтернативного качества → пометить needsReCache
 *   3. Online URL
 *
 * Возвращает: { src: string|Blob, fromCache: boolean, quality: string, needsReCache: boolean }
 */

import { getAudioBlobAny, updateTrackMeta, getTrackMeta } from './cache-db.js';
import { getOfflineManager } from './offline-manager.js';

/**
 * Получить аудио-источник для трека.
 * @param {string} uid
 * @param {Object} trackData — объект трека из TrackRegistry
 * @returns {Promise<{src: string, fromCache: boolean, quality: string, needsReCache: boolean}>}
 */
export async function resolveTrackSource(uid, trackData) {
  const mgr = getOfflineManager();
  const preferredQuality = mgr.getCacheQuality();

  /* Шаг 1–2: Ищем blob в кэше */
  const found = await getAudioBlobAny(uid, preferredQuality);

  if (found) {
    const src = URL.createObjectURL(found.blob);
    const needsReCache = found.quality !== preferredQuality;

    if (needsReCache) {
      /* ТЗ П.6.1: Пометить для перекачки */
      await updateTrackMeta(uid, { needsReCache: true });

      /* Поставить в очередь на тихую перекачку */
      mgr.enqueueAudioDownload(uid, { kind: 'reCache', priority: 1 });
    }

    return {
      src,
      fromCache: true,
      quality: found.quality,
      needsReCache
    };
  }

  /* Шаг 3: Online URL */
  const q = preferredQuality;
  let url = null;

  if (trackData) {
    if (q === 'lo') {
      url = trackData.audio_low || trackData.audio || trackData.src || null;
    } else {
      url = trackData.audio || trackData.src || null;
    }
  }

  if (!url) {
    /* Fallback: попробовать через TrackRegistry */
    const reg = window.TrackRegistry?.getTrackByUid?.(uid);
    if (reg) {
      url = q === 'lo'
        ? (reg.audio_low || reg.audio || reg.src)
        : (reg.audio || reg.src);
    }
  }

  return {
    src: url || '',
    fromCache: false,
    quality: q,
    needsReCache: false
  };
}

/**
 * После полного проигрывания трека — зарегистрировать прослушивание.
 * Вызывается из PlayerCore после завершения трека.
 */
export async function onTrackPlayedFull(uid) {
  const mgr = getOfflineManager();
  await mgr.registerFullListen(uid);
}
