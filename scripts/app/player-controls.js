// scripts/app/player-controls.js
// Управление плеером: кнопки, прогресс, громкость, визуализация

(function initPlayerControls() {
  'use strict';

  const PlayerControls = {
    // DOM элементы
    progressBar: null,
    progressFill: null,
    currentTimeEl: null,
    durationEl: null,
    playPauseBtn: null,
    prevBtn: null,
    nextBtn: null,
    volumeSlider: null,
    volumeIcon: null,
    repeatBtn: null,
    shuffleBtn: null,
    nowPlayingContainer: null,

    // Состояние
    isDragging: false,
    updateInterval: null,

    init() {
      this.createPlayerUI();
      this.bindElements();
      this.attachEventListeners();
      this.startProgressUpdate();
      this.restoreSettings();

      console.log('✅ PlayerControls initialized');
    },

    createPlayerUI() {
      const container = document.getElementById('now-playing');
      if (!container) {
        console.error('❌ #now-playing container not found');
        return;
      }

      container.innerHTML = `
        <div class="player-controls">
          <!-- Прогресс -->
          <div class="progress-container">
            <div class="progress-bar" id="progress-bar">
              <div class="progress-fill" id="progress-fill"></div>
              <div class="progress-handle" id="progress-handle"></div>
            </div>
            <div class="time-display">
              <span id="current-time">0:00</span>
              <span id="duration">0:00</span>
            </div>
          </div>

          <!-- Кнопки управления -->
          <div class="control-buttons">
            <button id="repeat-btn" class="control-btn" title="Повтор" aria-label="Повтор">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 1l4 4-4 4"/>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <path d="M7 23l-4-4 4-4"/>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            </button>

            <button id="prev-btn" class="control-btn" title="Назад" aria-label="Предыдущий трек">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
              </svg>
            </button>

            <button id="play-pause-btn" class="control-btn play-pause-btn" title="Играть" aria-label="Воспроизведение">
              <svg class="play-icon" width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              <svg class="pause-icon" width="32" height="32" viewBox="0 0 24 24" fill="currentColor" style="display: none;">
                <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
              </svg>
            </button>

            <button id="next-btn" class="control-btn" title="Вперёд" aria-label="Следующий трек">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 18h2V6h-2zM6 18l8.5-6L6 6z"/>
              </svg>
            </button>

            <button id="shuffle-btn" class="control-btn" title="Перемешать" aria-label="Случайный порядок">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
              </svg>
            </button>
          </div>

          <!-- Громкость -->
          <div class="volume-container">
            <button id="volume-icon" class="control-btn volume-icon" title="Громкость" aria-label="Управление громкостью">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            </button>
            <input type="range" id="volume-slider" class="volume-slider" 
                   min="0" max="100" value="100" 
                   title="Громкость" aria-label="Уровень громкости">
          </div>

          <!-- Информация о треке -->
          <div class="track-info" id="track-info">
            <div class="track-title" id="track-title-display">—</div>
            <div class="track-album" id="track-album-display">—</div>
          </div>
        </div>
      `;
    },

    bindElements() {
      this.progressBar = document.getElementById('progress-bar');
      this.progressFill = document.getElementById('progress-fill');
      this.progressHandle = document.getElementById('progress-handle');
      this.currentTimeEl = document.getElementById('current-time');
      this.durationEl = document.getElementById('duration');
      
      this.playPauseBtn = document.getElementById('play-pause-btn');
      this.prevBtn = document.getElementById('prev-btn');
      this.nextBtn = document.getElementById('next-btn');
      this.repeatBtn = document.getElementById('repeat-btn');
      this.shuffleBtn = document.getElementById('shuffle-btn');
      
      this.volumeSlider = document.getElementById('volume-slider');
      this.volumeIcon = document.getElementById('volume-icon');
      
      this.trackTitleDisplay = document.getElementById('track-title-display');
      this.trackAlbumDisplay = document.getElementById('track-album-display');
      
      this.nowPlayingContainer = document.getElementById('now-playing');
    },

    attachEventListeners() {
      // Play/Pause
      this.playPauseBtn?.addEventListener('click', () => {
        if (!window.playerCore) return;
        
        if (window.playerCore.isPlaying()) {
          window.playerCore.pause();
        } else {
          window.playerCore.play();
        }
      });

      // Previous/Next
      this.prevBtn?.addEventListener('click', () => {
        window.playerCore?.previous();
      });

      this.nextBtn?.addEventListener('click', () => {
        window.playerCore?.next();
      });

      // Repeat
      this.repeatBtn?.addEventListener('click', () => {
        if (!window.playerCore) return;
        
        const newState = !window.playerCore.repeat;
        window.playerCore.setRepeat(newState);
        this.repeatBtn.classList.toggle('active', newState);
        
        localStorage.setItem('repeatMode', newState ? '1' : '0');
        window.NotificationSystem?.info(newState ? '🔁 Повтор включен' : '🔁 Повтор выключен');
      });

      // Shuffle
      this.shuffleBtn?.addEventListener('click', () => {
        if (!window.playerCore) return;
        
        const newState = !window.playerCore.shuffle;
        window.playerCore.setShuffle(newState);
        this.shuffleBtn.classList.toggle('active', newState);
        
        localStorage.setItem('shuffleMode', newState ? '1' : '0');
        window.NotificationSystem?.info(newState ? '🔀 Перемешивание включено' : '🔀 Перемешивание выключено');
      });

      // Volume
      this.volumeSlider?.addEventListener('input', (e) => {
        const volume = parseFloat(e.target.value) / 100;
        window.playerCore?.setVolume(volume);
        this.updateVolumeIcon(volume);
      });

      this.volumeIcon?.addEventListener('click', () => {
        window.playerCore?.toggleMute();
      });

      // Progress bar - Desktop
      this.progressBar?.addEventListener('mousedown', (e) => {
        this.isDragging = true;
        this.seekToPosition(e);
      });

      document.addEventListener('mousemove', (e) => {
        if (this.isDragging) {
          this.seekToPosition(e);
        }
      });

      document.addEventListener('mouseup', () => {
        this.isDragging = false;
      });

      // Progress bar - Mobile
      this.progressBar?.addEventListener('touchstart', (e) => {
        this.isDragging = true;
        this.seekToPosition(e.touches[0]);
      });

      document.addEventListener('touchmove', (e) => {
        if (this.isDragging) {
          this.seekToPosition(e.touches[0]);
        }
      });

      document.addEventListener('touchend', () => {
        this.isDragging = false;
      });

      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch(e.code) {
          case 'Space':
            e.preventDefault();
            this.playPauseBtn?.click();
            break;
          case 'ArrowLeft':
            e.preventDefault();
            this.prevBtn?.click();
            break;
          case 'ArrowRight':
            e.preventDefault();
            this.nextBtn?.click();
            break;
          case 'KeyR':
            e.preventDefault();
            this.repeatBtn?.click();
            break;
          case 'KeyS':
            e.preventDefault();
            this.shuffleBtn?.click();
            break;
          case 'KeyM':
            e.preventDefault();
            this.volumeIcon?.click();
            break;
        }
      });
    },

    seekToPosition(event) {
      if (!this.progressBar || !window.playerCore) return;

      const rect = this.progressBar.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      const duration = window.playerCore.getDuration();
      
      if (duration > 0) {
        const seekTime = duration * percentage;
        window.playerCore.seek(seekTime);
        this.updateProgress(seekTime, duration);
      }
    },

    startProgressUpdate() {
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
      }

      this.updateInterval = setInterval(() => {
        if (this.isDragging || !window.playerCore) return;

        const currentTime = window.playerCore.getCurrentPosition();
        const duration = window.playerCore.getDuration();

        if (duration > 0) {
          this.updateProgress(currentTime, duration);
        }
      }, 100);
    },

    updateProgress(currentTime, duration) {
      const percentage = (currentTime / duration) * 100;

      if (this.progressFill) {
        this.progressFill.style.width = `${percentage}%`;
      }

      if (this.progressHandle) {
        this.progressHandle.style.left = `${percentage}%`;
      }

      if (this.currentTimeEl) {
        this.currentTimeEl.textContent = this.formatTime(currentTime);
      }

      if (this.durationEl) {
        this.durationEl.textContent = this.formatTime(duration);
      }
    },

    formatTime(seconds) {
      if (!isFinite(seconds) || seconds < 0) return '0:00';
      
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    updateNowPlaying(data) {
      const track = data?.track;
      if (!track) return;

      // Обновить информацию о треке
      if (this.trackTitleDisplay) {
        this.trackTitleDisplay.textContent = track.title || '—';
      }

      if (this.trackAlbumDisplay) {
        this.trackAlbumDisplay.textContent = track.album || '—';
      }

      // Обновить кнопку Play/Pause
      this.updatePlayPauseButton(true);

      // Подсветить активный трек в списке
      this.highlightActiveTrack(data.index);

      console.log('🎵 Now playing:', track.title);
    },

    updatePlayPauseButton(isPlaying) {
      if (!this.playPauseBtn) return;

      const playIcon = this.playPauseBtn.querySelector('.play-icon');
      const pauseIcon = this.playPauseBtn.querySelector('.pause-icon');

      if (isPlaying) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
        this.playPauseBtn.title = 'Пауза';
      } else {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
        this.playPauseBtn.title = 'Играть';
      }
    },

    highlightActiveTrack(index) {
      // Снять подсветку со всех треков
      document.querySelectorAll('.track.active').forEach(el => {
        el.classList.remove('active');
      });

      // Подсветить активный трек
      const activeTrack = document.querySelector(`.track[data-index="${index}"]`);
      if (activeTrack) {
        activeTrack.classList.add('active');
        
        // Скроллим к треку (с небольшой задержкой для плавности)
        setTimeout(() => {
          activeTrack.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
        }, 100);
      }
    },

    updateVolumeIcon(volume) {
      if (!this.volumeIcon) return;

      const svg = this.volumeIcon.querySelector('svg path');
      if (!svg) return;

      if (volume === 0) {
        // Muted
        svg.setAttribute('d', 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z');
      } else if (volume < 0.5) {
        // Low volume
        svg.setAttribute('d', 'M7 9v6h4l5 5V4l-5 5H7z');
      } else {
        // Normal volume
        svg.setAttribute('d', 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z');
      }
    },

    restoreSettings() {
      try {
        // Восстановить громкость
        const savedVolume = parseFloat(localStorage.getItem('playerVolume') || '1');
        if (this.volumeSlider) {
          this.volumeSlider.value = savedVolume * 100;
          this.updateVolumeIcon(savedVolume);
        }

        // Восстановить режимы
        const repeatMode = localStorage.getItem('repeatMode') === '1';
        const shuffleMode = localStorage.getItem('shuffleMode') === '1';

        this.repeatBtn?.classList.toggle('active', repeatMode);
        this.shuffleBtn?.classList.toggle('active', shuffleMode);

      } catch (e) {
        console.error('Failed to restore settings:', e);
      }
    },

    destroy() {
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
      }
    }
  };

  // Инициализация при загрузке
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      PlayerControls.init();
    });
  } else {
    PlayerControls.init();
  }

  // Экспорт в глобальную область
  window.PlayerControls = PlayerControls;

  // Подписка на события плеера
  if (window.playerCore) {
    window.playerCore.on({
      play: () => PlayerControls.updatePlayPauseButton(true),
      pause: () => PlayerControls.updatePlayPauseButton(false),
      stop: () => {
        PlayerControls.updatePlayPauseButton(false);
        PlayerControls.updateProgress(0, 0);
      },
      trackChanged: (data) => PlayerControls.updateNowPlaying(data)
    });
  }

})();
