/**
 * playback-cache-bootstrap.js — Инициализация Playback Cache.
 *
 * Подключается к PlayerCore для автоматического:
 *  - кэширования соседних треков (NEXT/PREV) при воспроизведении
 *
 * Подсчёт full listen реализован в stats-tracker.js → PlayerCore.
 * Здесь НЕ дублируем эту логику.
 *
 * ТЗ: Приложение П.10
 */

import { getOfflineManager } from '../offline/offline-manager.js';
import { getTrackByUid } from './track-registry.js';

let _initialized = false;

/**
 * initPlaybackCache() — подключение к PlayerCore.
 * Вызвать после инициализации PlayerCore и OfflineManager.
 */
export function initPlaybackCache() {
  if (_initialized) return;
  _initialized = true;

  /* ─── Перехват события смены трека → prefetch соседей ─── */
  window.addEventListener('player:trackChanged', (e) => {
    const { uid } = e.detail || {};
    if (uid) _prefetchNeighbors(uid);
  });

  /* ─── Online → возобновить загрузки ─── */
  window.addEventListener('online', () => {
    getOfflineManager().resumeDownloads();
  });

  console.log('[PlaybackCache] Initialized');
}

/* ═══════ Prefetch neighbors (ТЗ П.10: P1) ═══════ */

async function _prefetchNeighbors(currentUid) {
  const mgr = getOfflineManager();
  const mode = mgr.getMode();

  /* В R0 (чистый стриминг) НЕ предзагружаем соседей */
  if (mode === 'R0') return;

  const playerCore = window.playerCore;
  if (!playerCore) return;

  const playlist = playerCore.getPlaylistSnapshot?.() || [];
  const currentIdx = playlist.findIndex(t => (t.uid || t.id) === currentUid);
  if (currentIdx < 0) return;

  const quality = mgr.getCacheQuality();
  const neighbors = [];

  if (currentIdx + 1 < playlist.length) neighbors.push(playlist[currentIdx + 1]);
  if (currentIdx - 1 >= 0) neighbors.push(playlist[currentIdx - 1]);

  for (const track of neighbors) {
    const uid = track.uid || track.id;
    if (!uid) continue;

    const state = await mgr.getTrackOfflineState(uid);
    if (state.status === 'pinned' || state.status === 'cloud') continue;

    /* Используем TrackRegistry для получения URL (Якорь 2) */
    const meta = getTrackByUid(uid);
    const url = _resolveUrl(meta || track, quality);
    if (!url) continue;

    if (await mgr.hasSpace()) {
      mgr.enqueueAudioDownload(uid, {
        priority: 8,
        kind: 'playbackCache'
      });
    }
  }
}

/**
 * Получить URL трека, используя TrackRegistry как основной источник.
 */
function _resolveUrl(trackOrMeta, quality) {
  if (!trackOrMeta) return null;
  if (quality === 'lo') {
    return trackOrMeta.audio_low || trackOrMeta.audio || trackOrMeta.src || null;
  }
  return trackOrMeta.audio || trackOrMeta.src || null;
}

export default { initPlaybackCache };
