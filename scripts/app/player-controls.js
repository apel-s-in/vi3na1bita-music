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
    let raw = e && e.target ? e.target.value : 100;
    let value = Number.isFinite(+raw) ? (+raw) / 100 : 1;
    value = Math.max(0, Math.min(1, value));
    if (window.playerCore && typeof window.playerCore.setVolume === 'function') {
      window.playerCore.setVolume(value);
    }
    updateVolumeUI(value);
    try { localStorage.setItem('playerVolume', String(value)); } catch {}
  }
  function toggleMute() {
    if (!window.playerCore) return;
    const btn = document.getElementById('mute-btn');
    const saved = parseFloat(localStorage.getItem('playerVolume') || '1');
    const cur = (window.playerCore.getVolume && window.playerCore.getVolume()) || 1;
    if (cur > 0) {
      try { localStorage.setItem('playerVolume', String(cur)); } catch {}
      window.playerCore.setVolume(0);
      updateVolumeUI(0);
      if (btn) btn.classList.add('active');
    } else {
      const vol = Number.isFinite(saved) && saved > 0 ? saved : 1;
      window.playerCore.setVolume(vol);
      updateVolumeUI(vol);
      if (btn) btn.classList.remove('active');
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
      const fill = document.getElementById('player-progress-fill');
      if (fill) {
        fill.addEventListener('click', (e) => {
          e.stopPropagation();
          seekToPosition({ currentTarget: progressBar, clientX: e.clientX });
        });
      }

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
      volumeSlider.addEventListener('change', onVolumeSliderChange);
      const savedVolume = parseFloat(localStorage.getItem('playerVolume') || '1');
      const volume = Number.isFinite(savedVolume) ? savedVolume : 1;
      volumeSlider.value = String(Math.round(volume * 100));
      updateVolumeUI(volume);
      const muteBtn = document.getElementById('mute-btn');
      if (muteBtn) muteBtn.classList.toggle('active', volume === 0);
    }
  }

  function togglePlayPause() {
    if (!window.playerCore) return;
    const pc = window.playerCore;
    if (pc.isPlaying && pc.isPlaying()) {
      pc.pause();
      return;
    }
    // Возобновление: если уже есть трек/позиция — без индекса, иначе стартуем с выбранного
    const canResume = typeof pc.getDuration === 'function' && typeof pc.getSeek === 'function' && (pc.getDuration() || 0) > 0;
    if (canResume) {
      pc.play(); // резюмирует
    } else {
      const idx = (typeof window.playingTrack === 'number' && window.playingTrack >= 0) ? window.playingTrack : 0;
      pc.play(idx);
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
  // Анимация лирики и «бит»
  function syncLyricsAnimationUI() {
    const wnd = document.getElementById('lyrics-window');
    const btn = document.getElementById('animation-btn');
    if (wnd) wnd.classList.toggle('animation-active', !!window.animationEnabled);
    // «фон» активируется в шаблоне через .lyrics-animated-bg.active; просто добавим класс к контейнеру для совместимости
    if (wnd) {
      const bg = wnd.querySelector('.lyrics-animated-bg');
      if (bg) bg.classList.toggle('active', !!window.animationEnabled);
    }
    if (btn) btn.classList.toggle('animation-active', !!window.animationEnabled);
  }
  function toggleAnimation() {
    window.animationEnabled = !window.animationEnabled;
    try { localStorage.setItem('lyricsAnimation', window.animationEnabled ? '1' : '0'); } catch {}
    syncLyricsAnimationUI();
    if (window.NotificationSystem) window.NotificationSystem.info(window.animationEnabled ? '🌈 Анимация лирики: ВКЛ' : '🌈 Анимация лирики: ВЫКЛ');
  }
  function restoreAnimationFlag() {
    try { window.animationEnabled = localStorage.getItem('lyricsAnimation') !== '0'; } catch { window.animationEnabled = true; }
    syncLyricsAnimationUI();
  }

  // «Бит» (пульсация логотипа) — минимальная заглушка: только состояние и подсветка кнопки
  function syncBitUI() {
    const btn = document.getElementById('bit-btn');
    if (btn) btn.classList.toggle('bit-active', !!window.bitEnabled);
  }
  function toggleBit() {
    window.bitEnabled = !window.bitEnabled;
    try { localStorage.setItem('bitEnabled', window.bitEnabled ? '1' : '0'); } catch {}
    syncBitUI();
    if (window.NotificationSystem) window.NotificationSystem.info(window.bitEnabled ? '💓 Пульсация: ВКЛ' : '💓 Пульсация: ВЫКЛ');
  }
  function restoreBitFlag() {
    try { window.bitEnabled = localStorage.getItem('bitEnabled') === '1'; } catch { window.bitEnabled = false; }
    syncBitUI();
  }

  // Автовосстановление флагов при первом старте контролов
  (function bootstrapVisualFlagsOnce(){
    if (window.__visualFlagsRestored) return;
    window.__visualFlagsRestored = true;
    restoreAnimationFlag();
    restoreBitFlag();
  })();

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
  window.toggleAnimation = toggleAnimation;
  window.toggleBit = toggleBit;
})();
