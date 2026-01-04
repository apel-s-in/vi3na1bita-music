// scripts/app/playback-cache-bootstrap.js
// Интеграция Playback Cache окна PREV/CUR/NEXT с PlayerCore.
// Без вмешательства в воспроизведение: только планирование загрузок через очередь.

import { PlaybackCacheManager } from '../offline/playback-cache.js';
import { OfflineUI } from './offline-ui-bootstrap.js';
import { getTrackByUid } from './track-registry.js';

function getPQ() {
  try {
    const q = String(localStorage.getItem('qualityMode:v1') || 'hi').toLowerCase();
    return (q === 'lo') ? 'lo' : 'hi';
  } catch { return 'hi'; }
}

export function attachPlaybackCache() {
  const pc = window.playerCore;
  if (!pc) return;

  let lastIndex = typeof pc.getIndex === 'function' ? pc.getIndex() : -1;
  let lastLen = 0;
  let direction = 'forward';

  const getPlaylistCtx = () => {
    const list = (typeof pc.getPlaylistSnapshot === 'function') ? (pc.getPlaylistSnapshot() || []) : [];
    const cur = pc.getCurrentTrack?.() || null;
    const curUid = cur?.uid ? String(cur.uid) : null;
    lastLen = Array.isArray(list) ? list.length : 0;
    return {
      list,
      curUid,
      favoritesInactive: new Set(), // v1.0: без исключений; позже подключим реальный inactive из __favorites__
      direction
    };
  };

  const resolver = async (track, pq) => {
    // Делегируем OfflineManager-у выбор источника (локально≥PQ / сеть=PQ / локально<PQ)
    return OfflineUI.offlineManager.resolveForPlayback(track, pq);
  };

  const downloader = async (uid, quality) => {
    // PlaybackCache — авто-задача: userInitiated=false (без confirm)
    return OfflineUI.offlineManager.cacheTrackAudio(uid, quality, { userInitiated: false });
  };

  const queue = OfflineUI.offlineManager.queue;
  const pcm = new PlaybackCacheManager({
    queue,
    resolver,
    downloader,
    getPlaylistCtx
  });

  const trackProvider = (uid) => getTrackByUid(uid);

  async function planWindow() {
    const pq = getPQ();
    try { await pcm.ensureWindowFullyCached(pq, trackProvider); } catch {}
  }

  function updateDirectionByIndex(newIndex) {
    const len = lastLen || ((pc.getPlaylistSnapshot?.() || []).length);
    if (!len || newIndex < 0 || lastIndex < 0) {
      direction = 'forward';
      lastIndex = newIndex;
      return;
    }

    const prev = (lastIndex - 1 + len) % len;
    const next = (lastIndex + 1) % len;

    if (newIndex === prev) {
      direction = 'backward';
      lastIndex = newIndex;
      return;
    }

    if (newIndex === next) {
      direction = 'forward';
      lastIndex = newIndex;
      return;
    }

    // “ручной выбор трека” / jump => по ТЗ 7.8 direction = forward
    direction = 'forward';
    lastIndex = newIndex;
  }

  // Подписка на события PlayerCore
  if (typeof pc.on === 'function') {
    pc.on({
      onTrackChange: () => {
        const idx = typeof pc.getIndex === 'function' ? pc.getIndex() : -1;
        updateDirectionByIndex(idx);
        planWindow();
      }
    });
  }

  // Фоллбек на кнопки управления (если события не прилетают)
  const btnNext = document.getElementById('next-btn');
  const btnPrev = document.getElementById('prev-btn');
  btnNext?.addEventListener('click', () => { direction = 'forward'; setTimeout(planWindow, 0); });
  btnPrev?.addEventListener('click', () => { direction = 'backward'; setTimeout(planWindow, 0); });

  // Первичная инициализация (на текущем треке)
  setTimeout(() => {
    lastIndex = typeof pc.getIndex === 'function' ? pc.getIndex() : -1;
    planWindow();
  }, 0);
}
