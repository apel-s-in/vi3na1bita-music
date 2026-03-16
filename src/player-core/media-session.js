export function ensureMediaSession(h = {}) {
  const ms = navigator.mediaSession; if (!ms) return null;
  if (!ms.__bound) {
    ms.__bound = true; const safe = fn => d => { try { fn?.(d); } catch {} };
    for (const [k, fn] of Object.entries({ play: h.onPlay, pause: h.onPause, stop: h.onStop, previoustrack: h.onPrev, nexttrack: h.onNext, seekbackward: d => h.onSeekBy?.(-(Number(d?.seekOffset)||10)), seekforward: d => h.onSeekBy?.((Number(d?.seekOffset)||10)), seekto: d => Number.isFinite(d?.seekTime) && h.onSeekTo?.(d.seekTime) })) ms.setActionHandler(k, safe(fn));
  }
  return {
    updateMetadata: ({ title = 'Без названия', artist = '', album = '', artworkUrl: src, playing } = {}) => {
      try {
        ms.metadata = new MediaMetadata({ title, artist, album, artwork: (src = String(src||'').trim()) ? [96, 128, 192, 256, 384, 512].map(s => ({ src, sizes: `${s}x${s}`, type: 'image/png' })) : [] });
        ms.playbackState = playing ? 'playing' : 'paused';
      } catch {}
    },
    updatePositionState: () => {
      try { const st = h.getPositionState?.(); if (st && ms.setPositionState) ms.setPositionState({ duration: Number(st.duration)||0, playbackRate: Number(st.playbackRate)||1, position: Number(st.position)||0 }); } catch {}
    }
  };
}
