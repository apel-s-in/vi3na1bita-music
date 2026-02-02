// src/player-core/media-session.js
// MediaSession: handlers ставим один раз, metadata/position обновляем по мере надобности.

export function ensureMediaSession(handlers) {
  if (!('mediaSession' in navigator)) return null;

  const ms = navigator.mediaSession;

  // guard: ставим handlers 1 раз
  if (!ms.__vitrinaHandlersBound) {
    ms.__vitrinaHandlersBound = true;

    const h = handlers || {};

    const safe = (fn) => () => { try { fn && fn(); } catch {} };

    ms.setActionHandler('play', safe(h.onPlay));
    ms.setActionHandler('pause', safe(h.onPause));
    ms.setActionHandler('stop', safe(h.onStop));
    ms.setActionHandler('previoustrack', safe(h.onPrev));
    ms.setActionHandler('nexttrack', safe(h.onNext));

    ms.setActionHandler('seekbackward', (details) => {
      const off = Number(details?.seekOffset || 10);
      try { h.onSeekBy && h.onSeekBy(-off); } catch {}
    });

    ms.setActionHandler('seekforward', (details) => {
      const off = Number(details?.seekOffset || 10);
      try { h.onSeekBy && h.onSeekBy(off); } catch {}
    });

    ms.setActionHandler('seekto', (details) => {
      const t = Number(details?.seekTime);
      if (!Number.isFinite(t)) return;
      try { h.onSeekTo && h.onSeekTo(t); } catch {}
    });
  }

  const buildArtwork = (artworkUrl) => {
    const src = String(artworkUrl || '').trim();
    if (!src) return [];
    return [
      { src, sizes: '96x96', type: 'image/png' },
      { src, sizes: '128x128', type: 'image/png' },
      { src, sizes: '192x192', type: 'image/png' },
      { src, sizes: '256x256', type: 'image/png' },
      { src, sizes: '384x384', type: 'image/png' },
      { src, sizes: '512x512', type: 'image/png' },
    ];
  };

  function updateMetadata({ title, artist, album, artworkUrl, playing } = {}) {
    try {
      ms.metadata = new MediaMetadata({
        title: String(title || 'Без названия'),
        artist: String(artist || ''),
        album: String(album || ''),
        artwork: buildArtwork(artworkUrl),
      });
    } catch {}

    try { ms.playbackState = playing ? 'playing' : 'paused'; } catch {}
  }

  function updatePositionState() {
    try {
      if (typeof ms.setPositionState !== 'function') return;
      const st = handlers?.getPositionState ? handlers.getPositionState() : null;
      if (!st) return;

      ms.setPositionState({
        duration: Number(st.duration || 0) || 0,
        playbackRate: Number(st.playbackRate || 1.0) || 1.0,
        position: Number(st.position || 0) || 0,
      });
    } catch {}
  }

  return { updateMetadata, updatePositionState };
}
