// scripts/app/player-controls.js (ESM)
// Контролы плеера: mute/volume/seek/playpause/shuffle/repeat/favorites-only.
// Все функции экспортируются в window.* для совместимости.

(function(){
  function updateVolumeUI(vol) {
    try {
      const fill = document.getElementById('volume-fill');
      const slider = document.getElementById('volume-slider');
      if (fill) fill.style.width = `${Math.round(Math.max(0, Math.min(1, vol)) * 100)}%`;
      if (slider) slider.setAttribute('aria-valuenow', String(Math.round(vol * 100)));
    } catch {}
  }

  function onVolumeSliderChange(e) {
    const value = (e && e.target ? e.target.value : 100) / 100;
    if (window.playerCore && typeof window.playerCore.setVolume === 'function') {
      window.playerCore.setVolume(value);
    }
    updateVolumeUI(value);
    try { localStorage.setItem('playerVolume', String(value)); } catch {}
  }
  function toggleMute() {
    if (!window.playerCore) return;
    const saved = parseFloat(localStorage.getItem('playerVolume') || '1');
    const cur = (window.playerCore.getVolume && window.playerCore.getVolume()) || 1;
    if (cur > 0) {
      localStorage.setItem('playerVolume', String(cur));
      window.playerCore.setVolume(0);
      updateVolumeUI(0);
    } else {
      const vol = Number.isFinite(saved) && saved > 0 ? saved : 1;
      window.playerCore.setVolume(vol);
      updateVolumeUI(vol);
    }
  }

  function seekToPosition(e) {
    if (!window.playerCore) return;
    const el = e.currentTarget;
    if (!el || !el.getBoundingClientRect) return;
    const rect = el.getBoundingClientRect();
    const clientX = e.clientX ?? (e.touches && e.touches[0] && e.touches[0].clientX);
    if (typeof clientX !== 'number') return;
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const dur = window.playerCore.getDuration ? (window.playerCore.getDuration() || 0) : 0;
    if (dur > 0) window.playerCore.seek(dur * percent);
  }

  function initializePlayerControls() {
    const progressBar = document.getElementById('player-progress-bar');
    if (progressBar) {
      progressBar.addEventListener('click', seekToPosition);
      const startDrag = (e)=>{
        let isDragging = true;
        const moveHandler = (e2) => {
          if (!isDragging) return;
          const rect = progressBar.getBoundingClientRect();
          const clientX = e2.touches ? e2.touches[0].clientX : e2.clientX;
          const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          document.getElementById('player-progress-fill').style.width = `${percent*100}%`;
        };
        const endHandler = (e3) => {
          const rect = progressBar.getBoundingClientRect();
          const clientX = e3.changedTouches ? e3.changedTouches[0].clientX : e3.clientX;
          const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          const dur = (window.playerCore && window.playerCore.getDuration) ? (window.playerCore.getDuration() || 0) : 0;
          if (dur > 0 && window.playerCore && window.playerCore.seek) window.playerCore.seek(dur * percent);
          isDragging = false;
          document.removeEventListener('mousemove', moveHandler);
          document.removeEventListener('mouseup', endHandler);
          document.removeEventListener('touchmove', moveHandler);
          document.removeEventListener('touchend', endHandler);
        };
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', endHandler);
        document.addEventListener('touchmove', moveHandler, { passive: false });
        document.addEventListener('touchend', endHandler);
        e.preventDefault();
      };
      progressBar.addEventListener('mousedown', startDrag);
      progressBar.addEventListener('touchstart', startDrag, { passive: false });
    }

    const volumeSlider = document.getElementById('volume-slider');
    if (volumeSlider) {
      volumeSlider.addEventListener('input', onVolumeSliderChange);
      const savedVolume = parseFloat(localStorage.getItem('playerVolume') || '1');
      const volume = Number.isFinite(savedVolume) ? savedVolume : 1;
      volumeSlider.value = String(Math.round(volume * 100));
      updateVolumeUI(volume);
    }
  }

  function togglePlayPause() {
    if (!window.playerCore) return;
    if (window.playerCore.isPlaying && window.playerCore.isPlaying()) {
      window.playerCore.pause();
    } else {
      const idx = (typeof window.playingTrack === 'number' && window.playingTrack >= 0) ? window.playingTrack : 0;
      window.playerCore.play(idx);
    }
  }
  function updatePlayPauseIcon() {
    const icon = document.getElementById('play-pause-icon');
    if (!icon) return;
    const playing = !!(window.playerCore && typeof window.playerCore.isPlaying === 'function' && window.playerCore.isPlaying());
    icon.innerHTML = playing ? '<path d="M6 6h4v12H6zM14 6h4v12h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
  }
  function stopPlayback() {
    if (!window.playerCore) return;
    window.playerCore.stop();
    updatePlayPauseIcon();
  }
  function previousTrack() {
    if (!window.playerCore) return;
    if (localStorage.getItem('repeatMode') === '1') {
      window.playerCore.seek(0);
      window.playerCore.play();
      return;
    }
    window.playerCore.prev && window.playerCore.prev();
  }
  function nextTrack() {
    if (!window.playerCore) return;
    if (localStorage.getItem('repeatMode') === '1') {
      window.playerCore.seek(0);
      window.playerCore.play();
      return;
    }
    window.playerCore.next && window.playerCore.next();
  }

  function toggleRepeat() {
    const cur = localStorage.getItem('repeatMode') === '1';
    const next = !cur;
    localStorage.setItem('repeatMode', next ? '1' : '0');
    try { window.playerCore && window.playerCore.setRepeat && window.playerCore.setRepeat(next); } catch {}
    const btn = document.getElementById('repeat-btn');
    if (btn) btn.classList.toggle('repeat-active', next);
  }

  function toggleShuffle() {
    const cur = localStorage.getItem('shuffleMode') === '1';
    const next = !cur;
    localStorage.setItem('shuffleMode', next ? '1' : '0');
    const btn = document.getElementById('shuffle-btn');
    if (btn) btn.classList.toggle('active', next);
    try { window.NotificationSystem && window.NotificationSystem.info(next ? '🔀 Случайный порядок' : 'Последовательно'); } catch {}
    try { window.playerCore && window.playerCore.setShuffle && window.playerCore.setShuffle(next); } catch {}
    try { window.updateNextUpLabel && window.updateNextUpLabel(); } catch {}
  }

  function toggleFavoritesOnly() {
    // Перенаправляем на уже существующую реализацию, если она есть
    if (typeof window.__toggleFavoritesOnly_impl === 'function') {
      return window.__toggleFavoritesOnly_impl();
    }
    // Fallback: просто сохранить флаг
    const cur = localStorage.getItem('favoritesOnlyMode') === '1';
    const next = !cur;
    localStorage.setItem('favoritesOnlyMode', next ? '1' : '0');
    const btn = document.getElementById('favorites-btn');
    if (btn) btn.classList.toggle('favorites-active', next);
    const icon = document.getElementById('favorites-btn-icon');
    if (icon) icon.src = next ? 'img/star.png' : 'img/star2.png';
    try { window.playerCore && window.playerCore.setFavoritesOnly && window.playerCore.setFavoritesOnly(next, []); } catch {}
    try { window.updateNextUpLabel && window.updateNextUpLabel(); } catch {}
  }

  // Экспорт
  window.updateVolumeUI = updateVolumeUI;
  window.onVolumeSliderChange = onVolumeSliderChange;
  window.toggleMute = toggleMute;
  window.seekToPosition = seekToPosition;
  window.initializePlayerControls = initializePlayerControls;
  window.togglePlayPause = togglePlayPause;
  window.updatePlayPauseIcon = updatePlayPauseIcon;
  window.stopPlayback = stopPlayback;
  window.previousTrack = previousTrack;
  window.nextTrack = nextTrack;
  window.toggleRepeat = toggleRepeat;
  window.toggleShuffle = toggleShuffle;
  window.toggleFavoritesOnly = toggleFavoritesOnly;
})();
