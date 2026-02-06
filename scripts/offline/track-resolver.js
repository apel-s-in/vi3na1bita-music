/**
 * track-resolver.js — Выбор источника воспроизведения (ТЗ П.6.1).
 *
 * Порядок:
 *   1. Локальная копия (🔒/☁) в текущем качестве → blob URL
 *   2. Локальная копия в другом качестве → blob URL (needsReCache)
 *   3. Стриминг с GitHub (если сеть + режим позволяет)
 *   4. null → «Недоступно»
 */

import offlineManager from './offline-manager.js';

const _activeBlobs = new Map(); // uid → blobUrl (для revoke)

/**
 * Resolve track URL.
 * @param {string} uid
 * @param {object} trackData - { audio, audio_low, src }
 * @returns {{ url: string, source: 'local'|'stream', quality: string, needsReCache: boolean } | null}
 */
export async function resolveTrackUrl(uid, trackData) {
  /* Revoke предыдущий blob для этого uid */
  _revoke(uid);

  /* ТЗ П.6.1 шаг 1-2: Попытка из локального кэша */
  const local = await offlineManager.resolveLocalBlob(uid);
  if (local) {
    _activeBlobs.set(uid, local.blobUrl);
    return {
      url: local.blobUrl,
      source: 'local',
      quality: local.quality,
      needsReCache: local.needsReCache
    };
  }

  /* ТЗ П.6.1 шаг 3: Стриминг */
  if (!navigator.onLine) return null;

  const mode = offlineManager.getMode();
  if (mode === 'R3') return null; /* В R3 только локальные файлы */

  const q = offlineManager.getCacheQuality();
  let url;
  if (q === 'lo') {
    url = trackData?.audio_low || trackData?.audio || trackData?.src;
  } else {
    url = trackData?.audio || trackData?.src;
  }

  if (!url) return null;

  return {
    url,
    source: 'stream',
    quality: q,
    needsReCache: false
  };
}

/**
 * Revoke blob URL для uid (предотвращение утечек памяти).
 */
export function revokeTrackBlob(uid) {
  _revoke(uid);
}

function _revoke(uid) {
  const old = _activeBlobs.get(uid);
  if (old) {
    try { URL.revokeObjectURL(old); } catch {}
    _activeBlobs.delete(uid);
  }
}

/**
 * Revoke all active blobs (cleanup при уничтожении плеера).
 */
export function revokeAll() {
  for (const [uid, url] of _activeBlobs) {
    try { URL.revokeObjectURL(url); } catch {}
  }
  _activeBlobs.clear();
}
