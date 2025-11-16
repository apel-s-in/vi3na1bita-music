// scripts/app/player-controls.js
// Слой базовых контролов плеера (Play/Pause/Stop/Prev/Next/Seek/Volume/Mute).
// Контракт: приоритет PlayerCore, мягкий фолбэк на legacy <audio>.
// Важно: воспроизведение не прерывается никакими действиями, кроме Пауза/Стоп/Таймер сна.

(function PlayerControlsModule(){
  function pc() { return (window.__useNewPlayerCore && window.playerCore) ? window.playerCore : null; }
  function audioEl() {
    return (window.getCurrentAudio && window.getCurrentAudio()) || document.getElementById('audio') || null;
  }

  // Безопасная инициализация playerCore по требованию
  async function ensureCoreReadyOrFallback() {
    const forceNoLegacy = (window.__useNewPlayerCore && (localStorage.getItem('noLegacyAudio') === '1'));
    if (!window.__useNewPlayerCore) return true;
    if (pc()) return true;
    try {
      const ready = await (window.ensurePlayerCoreReady ? window.ensurePlayerCoreReady({ timeoutMs: 1800 }) : Promise.resolve(false));
      if (!ready && forceNoLegacy) {
        window.NotificationSystem && window.NotificationSystem.info('Инициализация плеера...');
        return false;
      }
      return ready;
    } catch { return false; }
  }

  function applyPostUiSync() {
    try { window.applyMiniModeUI && window.applyMiniModeUI(); } catch {}
    try { window.updateMiniNowHeader && window.updateMiniNowHeader(); } catch {}
    try { window.updateNextUpLabel && window.updateNextUpLabel(); } catch {}
    try { window.updatePlayPauseIcon && window.updatePlayPauseIcon(); } catch {}
  }

  // ====== Play/Pause/Prev/Next/Stop ======
  async function togglePlayPause() {
    const ready = await ensureCoreReadyOrFallback();

    // Приоритет — PlayerCore
    if (window.__useNewPlayerCore && pc()) {
      try { window.ensurePlayerCoreUiBindings && window.ensurePlayerCoreUiBindings(); } catch {}

      try {
        if (typeof pc().isPlaying === 'function' && pc().isPlaying()) {
          pc().pause();
          setTimeout(() => { try { window.updatePlayPauseIcon && window.updatePlayPauseIcon(); } catch {} }, 0);
          return;
        }
      } catch {}

      // Инициализация плейлиста при первом старте
      try {
        const hasLoaded = (typeof pc().getDuration === 'function') && ((pc().getDuration() || 0) > 0);
        if (!hasLoaded && typeof window.__buildPlayerCorePayload === 'function') {
          const payload = window.__buildPlayerCorePayload();
          if (payload) {
            pc().setPlaylist(payload.tracks, payload.index, payload.meta);
            try { pc().setShuffle(!!window.shuffleMode); } catch {}
            try { pc().setRepeat(!!window.repeatMode); } catch {}
            try {
              const likedIdx = (window.playingAlbumKey && window.playingAlbumKey !== window.SPECIAL_FAVORITES_KEY)
                ? (window.getLikedForAlbum ? window.getLikedForAlbum(window.playingAlbumKey) : [])
                : [];
              pc().setFavoritesOnly(!!window.favoritesOnlyMode, likedIdx);
            } catch {}
          }
        }
      } catch {}

      try { pc().play(); } catch {}
      setTimeout(() => { try { window.updatePlayPauseIcon && window.updatePlayPauseIcon(); } catch {} }, 0);
      return;
    }

    // Фолбэк — legacy <audio>
    if (!ready && window.__useNewPlayerCore) return;
    try {
      const a = audioEl();
      if (!a) return;
      if (a.paused) { a.play().catch(()=>{}); } else { a.pause(); }
    } catch {}
  }

  function previousTrack() {
    if (window.__useNewPlayerCore && pc()) {
      try { window.ensurePlayerCoreUiBindings && window.ensurePlayerCoreUiBindings(); } catch {}
      try {
        const hasLoaded = (typeof pc().getDuration === 'function') && ((pc().getDuration() || 0) > 0);
        if (!hasLoaded && typeof window.__buildPlayerCorePayload === 'function') {
          const payload = window.__buildPlayerCorePayload();
          if (payload) {
            pc().setPlaylist(payload.tracks, payload.index, payload.meta);
            try { pc().setShuffle(!!window.shuffleMode); } catch {}
            try { pc().setRepeat(!!window.repeatMode); } catch {}
            try { pc().setFavoritesOnly(!!window.favoritesOnlyMode, []); } catch {}
          }
        }
      } catch {}
      try {
        if (window.repeatMode) { pc().seek && pc().seek(0); pc().play && pc().play(); }
        else { pc().prev && pc().prev(); }
      } catch {}
      setTimeout(() => {
        try {
          const idx = (typeof pc().getIndex === 'function') ? pc().getIndex() : 0;
          window.__syncUiToPlayerCoreIndex && window.__syncUiToPlayerCoreIndex(idx);
        } catch {}
      }, 0);
      return;
    }

    // Фолбэк (legacy): рассчитать предыдущий индекс в контексте «игры»
    try {
      // Если ещё ничего не играет — запустим первый трек текущего альбома
      if (!Array.isArray(window.playingTracks) || window.playingTracks.length === 0) {
        if (typeof window.showTrack === 'function') window.showTrack(0, true);
        return;
      }
      const len = window.playingTracks.length;
      // База доступных с учётом режима «только ⭐»
      const available = (typeof window.getAvailableTracksForAlbum === 'function')
        ? window.getAvailableTracksForAlbum(window.playingAlbumKey, len)
        : Array.from({ length: len }, (_, i) => i);

      if (!available || available.length === 0) return;

      let target = -1;
      if (window.shuffleMode && Array.isArray(window.playingShuffledPlaylist) && window.playingShuffledPlaylist.length) {
        const arr = window.playingShuffledPlaylist.slice();
        const pos = arr.indexOf(window.playingTrack);
        const prevPos = (pos - 1 + arr.length) % arr.length;
        target = arr[prevPos];
      } else if (window.favoritesOnlyMode) {
        const pos = available.indexOf(window.playingTrack);
        target = available[(pos - 1 + available.length) % available.length];
      } else {
        target = (window.playingTrack - 1 + len) % len;
      }

      if (Number.isFinite(target) && target >= 0) {
        if (typeof window.playFromPlaybackAlbum === 'function') window.playFromPlaybackAlbum(target, true);
        else if (typeof window.showTrack === 'function') window.showTrack(target, true);
      }
    } catch {}
  }

  function nextTrack() {
    if (window.__useNewPlayerCore && pc()) {
      try { window.ensurePlayerCoreUiBindings && window.ensurePlayerCoreUiBindings(); } catch {}
      try {
        const hasLoaded = (typeof pc().getDuration === 'function') && ((pc().getDuration() || 0) > 0);
        if (!hasLoaded && typeof window.__buildPlayerCorePayload === 'function') {
          const payload = window.__buildPlayerCorePayload();
          if (payload) {
            pc().setPlaylist(payload.tracks, payload.index, payload.meta);
            try { pc().setShuffle(!!window.shuffleMode); } catch {}
            try { pc().setRepeat(!!window.repeatMode); } catch {}
            try { pc().setFavoritesOnly(!!window.favoritesOnlyMode, []); } catch {}
          }
        }
      } catch {}
      try {
        if (window.repeatMode) { pc().seek && pc().seek(0); pc().play && pc().play(); }
        else { pc().next && pc().next(); }
      } catch {}
      setTimeout(() => {
        try {
          const idx = (typeof pc().getIndex === 'function') ? pc().getIndex() : 0;
          window.__syncUiToPlayerCoreIndex && window.__syncUiToPlayerCoreIndex(idx);
        } catch {}
      }, 0);
      return;
    }

    // Фолбэк (legacy): используем текущую функцию вычисления следующего индекса
    try {
      if (typeof window.computeNextIndexPlayback === 'function') {
        const idx = window.computeNextIndexPlayback();
        if (Number.isFinite(idx) && idx >= 0) {
          if (typeof window.playFromPlaybackAlbum === 'function') window.playFromPlaybackAlbum(idx, true);
          else if (typeof window.showTrack === 'function') window.showTrack(idx, true);
        }
      }
    } catch {}
  }

  function stopPlayback() {
    if (window.__useNewPlayerCore && pc()) {
      try { pc().stop && pc().stop(); } catch {}
      // При стопе гарантированно отпускаем locks и обновляем Media Session/иконку
      try { window.updatePlayPauseIcon && window.updatePlayPauseIcon(); } catch {}
      try { window.updateMediaSessionPosition && window.updateMediaSessionPosition(); } catch {}
      try { window.setPlaybackLocks && window.setPlaybackLocks(false); } catch {}
      return;
    }
    try {
      const a = audioEl();
      if (a) { a.pause(); a.currentTime = 0; }
      applyPostUiSync();
      // Фолбэк: привести Media Session и локи в консистентное состояние
      try { window.updateMediaSessionPosition && window.updateMediaSessionPosition(); } catch {}
      try { window.setPlaybackLocks && window.setPlaybackLocks(false); } catch {}
    } catch {}
  }

  // ====== Seek/Volume/Mute ======
  function seekFromEvent(e) {
    try {
      const bar = e?.currentTarget || document.getElementById('player-progress-bar');
      if (!bar || typeof bar.getBoundingClientRect !== 'function') return;
      const rect = bar.getBoundingClientRect();
      const clientX = e?.clientX ?? (e?.touches && e.touches[0] && e.touches[0].clientX);
      if (typeof clientX !== 'number') return;
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

      if (window.__useNewPlayerCore && pc() && typeof pc().getDuration === 'function') {
        const dur = Number(pc().getDuration() || 0);
        if (dur > 0) { try { pc().seek(dur * percent); } catch {} }
        return;
      }
      const a = audioEl();
      if (a && isFinite(a.duration) && a.duration > 0) {
        a.currentTime = a.duration * percent;
      }
    } catch {}
  }

  function onVolumeInput(e) {
    const raw = e && e.target ? e.target.value : 100;
    const vol = Math.max(0, Math.min(1, Number(raw) / 100));

    if (window.__useNewPlayerCore && pc() && typeof pc().setVolume === 'function') {
      try { pc().setVolume(vol); } catch {}
    } else {
      try { const a = audioEl(); if (a) a.volume = vol; } catch {}
    }

    try { window.updateVolumeUI && window.updateVolumeUI(vol); } catch {}
    try { localStorage.setItem('playerVolume', String(vol)); } catch {}
  }

  function toggleMute() {
    // Новый плеер
    if (window.__useNewPlayerCore && pc()) {
      try {
        const cur = (typeof pc().getVolume === 'function') ? (pc().getVolume() || 0) : 1;
        if (cur > 0) {
          try { localStorage.setItem('playerVolume', String(cur)); } catch {}
          pc().setVolume(0);
          try { window.updateVolumeUI && window.updateVolumeUI(0); } catch {}
        } else {
          const saved = parseFloat(localStorage.getItem('playerVolume') || '1');
          const vol = Number.isFinite(saved) && saved > 0 ? saved : 1;
          pc().setVolume(vol);
          try { window.updateVolumeUI && window.updateVolumeUI(vol); } catch {}
        }
      } catch {}
      return;
    }

    // Старый плеер
    try {
      const a = audioEl();
      if (!a) return;
      if (a.volume > 0) {
        localStorage.setItem('playerVolume', String(a.volume));
        a.volume = 0;
        try { window.updateVolumeUI && window.updateVolumeUI(0); } catch {}
      } else {
        const saved = parseFloat(localStorage.getItem('playerVolume') || '1');
        const vol = Number.isFinite(saved) && saved > 0 ? saved : 1;
        a.volume = vol;
        try { window.updateVolumeUI && window.updateVolumeUI(vol); } catch {}
      }
    } catch {}
  }

  // Публичный API
  window.PlayerControls = {
    togglePlayPause,
    previousTrack,
    nextTrack,
    stopPlayback,
    seekFromEvent,
    onVolumeInput,
    toggleMute
  };
})();
