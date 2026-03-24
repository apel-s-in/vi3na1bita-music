// UID.001_(Playback safety invariant)_(не допустить обходного управления воспроизведением)_(Media Session может вызывать только безопасные handlers PlayerCore, но не владеть playback truth)
// UID.008_(No playback mutation by intel)_(не допустить второго центра управления плеером)_(intel/provider/ui слой не должен подменять Media Session handlers своей логикой)
// UID.012_(Quality dimension)_(не смешивать качество и системные media controls)_(Media Session управляет transport controls, а не quality/source logic)
// UID.050_(Session profile)_(оставить Media Session только источником transport actions)_(session intelligence может читать эффекты play/pause/seek, но не внедряться сюда)
// UID.079_(VK social/media actions)_(не смешивать внешние provider media actions и OS media controls)_(provider bridge не должен переписывать Media Session ownership)
// UID.094_(No-paralysis rule)_(даже при сбоях расширенных слоёв системные media controls должны работать)_(этот bridge остаётся тонким адаптером между ОС и PlayerCore)
export function ensureMediaSession(h = {}) {
  const ms = navigator.mediaSession; if (!ms) return null;
  let lastPosTs = 0;
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
    updatePositionState: ({ force = false } = {}) => {
      try {
        const now = Date.now();
        if (!force && now - lastPosTs < 900) return;
        const st = h.getPositionState?.();
        if (!st || !ms.setPositionState) return;
        ms.setPositionState({ duration: Number(st.duration)||0, playbackRate: Number(st.playbackRate)||1, position: Number(st.position)||0 });
        lastPosTs = now;
      } catch {}
    }
  };
}
