// scripts/app/playback-cache-bootstrap.js
// Интеграция Playback Cache окна PREV/CUR/NEXT с PlayerCore.
// Без вмешательства в воспроизведение: только планирование загрузок через очередь.

import { PlaybackCacheManager } from '../offline/playback-cache.js';
import { getTrackByUid } from './track-registry.js';

function getPQ() {
  try {
    const q = String(localStorage.getItem('qualityMode:v1') || 'hi').toLowerCase();
    return (q === 'lo') ? 'lo' : 'hi';
  } catch { return 'hi'; }
}

function getFavoritesInactiveSet() {
  try {
    const model = Array.isArray(window.favoritesRefsModel) ? window.favoritesRefsModel : [];
    const inactive = new Set();
    model.forEach(it => {
      if (it && !it.__active) {
        const uid = String(it.__uid || '').trim();
        if (uid) inactive.add(uid);
      }
    });
    return inactive;
  } catch {
    return new Set();
  }
}

export function attachPlaybackCache() {
  const pc = window.playerCore;
  if (!pc) {
    setTimeout(attachPlaybackCache, 200);
    return;
  }

  let lastIndex = typeof pc.getIndex === 'function' ? pc.getIndex() : -1;
  let lastLen = 0;
  let direction = 'forward';

  const getPlaylistCtx = () => {
    const list = (typeof pc.getPlaylistSnapshot === 'function') ? (pc.getPlaylistSnapshot() || []) : [];
    const cur = pc.getCurrentTrack?.() || null;
    const curUid = cur?.uid ? String(cur.uid).trim() : null;
    lastLen = Array.isArray(list) ? list.length : 0;
    
    const playingAlbum = window.AlbumsManager?.getPlayingAlbum?.() || null;
    const favoritesInactive = (playingAlbum === window.SPECIAL_FAVORITES_KEY)
      ? getFavoritesInactiveSet()
      : new Set();

    return {
      list,
      curUid,
      favoritesInactive,
      direction
    };
  };

  const mgr = window.OfflineUI?.offlineManager;
  const queue = mgr?.queue || null;

  const pcm = new PlaybackCacheManager({
    queue,
    getPlaylistCtx
  });

  const trackProvider = (uid) => getTrackByUid(uid);

  async function planWindow() {
    const pq = getPQ();
    try { 
      await pcm.ensureWindowFullyCached(pq, trackProvider); 
    } catch (e) {
      console.warn('[PlaybackCache] planWindow error:', e);
    }
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

    direction = 'forward';
    lastIndex = newIndex;
  }

  if (typeof pc.on === 'function') {
    pc.on({
      onTrackChange: () => {
        const idx = typeof pc.getIndex === 'function' ? pc.getIndex() : -1;
        updateDirectionByIndex(idx);
        planWindow();
      }
    });
  }

  const btnNext = document.getElementById('next-btn');
  const btnPrev = document.getElementById('prev-btn');
  btnNext?.addEventListener('click', () => { direction = 'forward'; setTimeout(planWindow, 0); });
  btnPrev?.addEventListener('click', () => { direction = 'backward'; setTimeout(planWindow, 0); });

  setTimeout(() => {
    lastIndex = typeof pc.getIndex === 'function' ? pc.getIndex() : -1;
    planWindow();
  }, 100);
}
