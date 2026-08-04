export function ensureMediaSession(h = {}) {
  const ms = navigator.mediaSession;
  if (!ms) return null;
  let l = 0;

  if (!ms.__bound) {
    ms.__bound = true;
    const sf = fn => d => { try { fn?.(d); } catch {} };
    for (const [k, fn] of Object.entries({
      play: h.onPlay, pause: h.onPause, stop: h.onStop,
      previoustrack: h.onPrev, nexttrack: h.onNext,
      seekbackward: d => h.onSeekBy?.(-(Number(d?.seekOffset) || 10)),
      seekforward:  d => h.onSeekBy?.(Number(d?.seekOffset) || 10),
      seekto: d => Number.isFinite(d?.seekTime) && h.onSeekTo?.(d.seekTime)
    })) ms.setActionHandler(k, sf(fn));
  }

  return {
    updateMetadata({ title = 'Без названия', artist = '', album = '', artworkUrl: src, playing } = {}) {
      try {
        const artSrc = String(src || '').trim();
        // Всегда обновляем при смене трека или состояния воспроизведения
        const artwork = artSrc
          ? [96, 128, 192, 256, 384, 512].map(s => ({
              src: artSrc, sizes: `${s}x${s}`,
              type: artSrc.endsWith('.png') ? 'image/png' : 'image/jpeg'
            }))
          : [];
        ms.metadata = new MediaMetadata({ title, artist, album, artwork });
        ms.playbackState = playing ? 'playing' : 'paused';
      } catch {}
    },
    updatePositionState({ force = false } = {}) {
      try {
        const n = Date.now();
        if (!force && n - l < 900) return;
        const st = h.getPositionState?.();
        if (!st || !ms.setPositionState) return;
        ms.setPositionState({
          duration: Number(st.duration) || 0,
          playbackRate: Number(st.playbackRate) || 1,
          position: Number(st.position) || 0
        });
        l = n;
      } catch {}
    }
  };
}
