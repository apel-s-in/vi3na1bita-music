/**
 * track-resolver.js — Выбор источника воспроизведения трека.
 *
 * ТЗ: Приложение П.6.1–П.6.3
 *
 * Порядок:
 *   1. Локальная копия (🔒/☁) в текущем качестве → blob URL
 *   2. Локальная копия в другом качестве → blob URL + needsReCache
 *   3. Стриминг с GitHub (если сеть и режим позволяют)
 *   4. Недоступно
 */

import offlineManager from './offline-manager.js';

/**
 * resolveTrackUrl(uid, trackData)
 *
 * @param {string}  uid       — уникальный id трека
 * @param {Object}  trackData — { audio, audio_low, src, ... } или строка URL
 * @returns {Promise<{ url: string|null, source: 'local'|'stream'|'unavailable', quality: string, needsReCache: boolean }>}
 */
export async function resolveTrackUrl(uid, trackData) {
  /* Нормализация: если передали строку — обернуть в объект */
  if (typeof trackData === 'string') {
    trackData = { audio: trackData, src: trackData };
  }
  if (!trackData) trackData = {};

  const result = await offlineManager.resolveTrackSource(uid, trackData);

  if (result.source === 'local' && result.blob) {
    /* Создаём Object URL из blob для <audio> */
    const objectUrl = URL.createObjectURL(result.blob);

    return {
      url: objectUrl,
      source: 'local',
      quality: result.quality,
      needsReCache: result.needsReCache,
      _blobUrl: true  /* флаг: нужно revokeObjectURL после использования */
    };
  }

  if (result.source === 'stream' && result.url) {
    return {
      url: result.url,
      source: 'stream',
      quality: result.quality,
      needsReCache: false,
      _blobUrl: false
    };
  }

  /* Недоступно */
  return {
    url: null,
    source: 'unavailable',
    quality: null,
    needsReCache: false,
    _blobUrl: false
  };
}

/**
 * Освободить Object URL (вызывать когда трек больше не нужен).
 */
export function revokeTrackUrl(resolved) {
  if (resolved && resolved._blobUrl && resolved.url) {
    try { URL.revokeObjectURL(resolved.url); } catch {}
  }
}

export default { resolveTrackUrl, revokeTrackUrl };
