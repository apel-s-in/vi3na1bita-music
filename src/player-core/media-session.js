// src/player-core/media-session.js
// Optimized MediaSession bindings

export function ensureMediaSession(handlers = {}) {
  const ms = navigator.mediaSession;
  if (!ms) return null;

  if (!ms.__bound) {
    ms.__bound = true;
    const safe = fn => details => { try { fn?.(details); } catch {} };
    
    const acts = {
      play: handlers.onPlay, pause: handlers.onPause, stop: handlers.onStop,
      previoustrack: handlers.onPrev, nexttrack: handlers.onNext,
      seekbackward: d => handlers.onSeekBy?.(-(Number(d?.seekOffset) || 10)),
      seekforward: d => handlers.onSeekBy?.((Number(d?.seekOffset) || 10)),
      seekto: d => Number.isFinite(d?.seekTime) && handlers.onSeekTo?.(d.seekTime)
    };
    
    for (const [k, fn] of Object.entries(acts)) ms.setActionHandler(k, safe(fn));
  }

  return {
    updateMetadata: ({ title = 'Без названия', artist = '', album = '', artworkUrl, playing } = {}) => {
      try {
        const src = String(artworkUrl || '').trim();
        const artwork = src ? [96, 128, 192, 256, 384, 512].map(s => ({ src, sizes: `${s}x${s}`, type: 'image/png' })) : [];
        ms.metadata = new MediaMetadata({ title, artist, album, artwork });
        ms.playbackState = playing ? 'playing' : 'paused';
      } catch {}
    },
    updatePositionState: () => {
      try {
        const st = handlers.getPositionState?.();
        if (st && ms.setPositionState) ms.setPositionState({ duration: Number(st.duration) || 0, playbackRate: Number(st.playbackRate) || 1, position: Number(st.position) || 0 });
      } catch {}
    }
  };
}
