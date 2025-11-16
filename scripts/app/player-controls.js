// scripts/app/player-controls.js
// Слой базовых контролов плеера (Play/Pause/Stop/Prev/Next).
// Контракт: приоритет PlayerCore, мягкий фолбэк на legacy <audio>.
// Важно: воспроизведение не прерывается никакими действиями, кроме Пауза/Стоп/Таймер сна.

(function PlayerControlsModule(){
  function pc() { return (window.__useNewPlayerCore && window.playerCore) ? window.playerCore : null; }

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

  async function togglePlayPause() {
    const ready = await ensureCoreReadyOrFallback();

    // Приоритет — PlayerCore
    if (window.__useNewPlayerCore && pc()) {
      // Подписки событий → UI (однократно)
      try { window.ensurePlayerCoreUiBindings && window.ensurePlayerCoreUiBindings(); } catch {}

      // Если уже проигрывает — пауза
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

      // Старт/резюм
      try { pc().play(); } catch {}
      setTimeout(() => { try { window.updatePlayPauseIcon && window.updatePlayPauseIcon(); } catch {} }, 0);
      return;
    }

    // Фолбэк — legacy <audio> (если флаг нового ядра выключен либо ядро не готово)
    if (!ready && window.__useNewPlayerCore) return; // ждём, не ломаем звук
    try {
      const a = (window.getCurrentAudio && window.getCurrentAudio()) || document.getElementById('audio');
      if (!a) return;
      if (a.paused) { a.play().catch(()=>{}); } else { a.pause(); }
    } catch {}
  }

  function previousTrack() {
    if (window.__useNewPlayerCore && pc()) {
      try { window.ensurePlayerCoreUiBindings && window.ensurePlayerCoreUiBindings(); } catch {}
      // Гарантируем плейлист
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
      // Поведение Repeat: в начало текущего
      try {
        if (window.repeatMode) { pc().seek && pc().seek(0); pc().play && pc().play(); }
        else { pc().prev && pc().prev(); }
      } catch {}
      // Синхронизация UI по индексу ядра
      setTimeout(() => {
        try {
          const idx = (typeof pc().getIndex === 'function') ? pc().getIndex() : 0;
          window.__syncUiToPlayerCoreIndex && window.__syncUiToPlayerCoreIndex(idx);
        } catch {}
      }, 0);
      return;
    }

    // Фолбэк legacy
    if (typeof window.previousTrack === 'function') {
      // Вызовем оригинальную реализацию (но мы уже заменили её делегатом),
      // поэтому повторяем логику старой ветки в PlayerControls нежелательно.
      // Ничего не делаем — старый путь вызовется из исходной функции до миграции полной.
    }
  }

  function nextTrack() {
    if (window.__useNewPlayerCore && pc()) {
      try { window.ensurePlayerCoreUiBindings && window.ensurePlayerCoreUiBindings(); } catch {}
      // Гарантируем плейлист
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
      // Поведение Repeat: в начало текущего
      try {
        if (window.repeatMode) { pc().seek && pc().seek(0); pc().play && pc().play(); }
        else { pc().next && pc().next(); }
      } catch {}
      // Синхронизация UI по индексу ядра
      setTimeout(() => {
        try {
          const idx = (typeof pc().getIndex === 'function') ? pc().getIndex() : 0;
          window.__syncUiToPlayerCoreIndex && window.__syncUiToPlayerCoreIndex(idx);
        } catch {}
      }, 0);
      return;
    }

    // Фолбэк legacy — см. комментарий в previousTrack()
  }

  function stopPlayback() {
    if (window.__useNewPlayerCore && pc()) {
      try { pc().stop && pc().stop(); } catch {}
      try { window.updatePlayPauseIcon && window.updatePlayPauseIcon(); } catch {}
      return;
    }
    try {
      const a = (window.getCurrentAudio && window.getCurrentAudio()) || document.getElementById('audio');
      if (a) { a.pause(); a.currentTime = 0; }
      applyPostUiSync();
    } catch {}
  }

  // Публичный API
  window.PlayerControls = {
    togglePlayPause,
    previousTrack,
    nextTrack,
    stopPlayback
  };
})();

