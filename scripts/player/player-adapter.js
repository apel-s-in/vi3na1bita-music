// scripts/app/player-controls.js
// ⭐ ИСПРАВЛЕНО: только управление, БЕЗ создания UI

(function initPlayerControls() {
  'use strict';

  const PlayerControls = {
    progressBar: null,
    progressFill: null,
    progressHandle: null,
    currentTimeEl: null,
    durationEl: null,
    playPauseBtn: null,
    prevBtn: null,
    nextBtn: null,
    volumeSlider: null,
    volumeIcon: null,
    repeatBtn: null,
    shuffleBtn: null,
    trackTitleDisplay: null,
    trackAlbumDisplay: null,

    isDragging: false,
    updateInterval: null,

    init() {
      console.log('🎮 PlayerControls: waiting for UI...');
      
      // ⭐ Ждём, пока albums.js создаст UI
      this.waitForUI();
    },

    waitForUI() {
      const checkUI = () => {
        const container = document.getElementById('now-playing');
        const playBtn = document.getElementById('play-pause-btn');

        if (container && playBtn) {
          console.log('✅ PlayerControls: UI ready, binding...');
          this.bindElements();
          this.attachEventListeners();
          this.startProgressUpdate();
          this.restoreSettings();
          this.subscribeToPlayerEvents();
        } else {
          // Повторить через 100мс
          setTimeout(checkUI, 100);
        }
      };

      checkUI();
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

      // Progress bar
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

      // Touch
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

      // Keyboard
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
        }
      });
    },

    subscribeToPlayerEvents() {
      if (!window.playerCore) {
        setTimeout(() => this.subscribeToPlayerEvents(), 100);
        return;
      }

      window.playerCore.on({
        play: () => this.updatePlayPauseButton(true),
        pause: () => this.updatePlayPauseButton(false),
        stop: () => {
          this.updatePlayPauseButton(false);
          this.updateProgress(0, 0);
        },
        trackChanged: (data) => this.updateNowPlaying(data)
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

      if (this.trackTitleDisplay) {
        this.trackTitleDisplay.textContent = track.title || '—';
      }

      if (this.trackAlbumDisplay) {
        this.trackAlbumDisplay.textContent = track.album || '—';
      }

      this.updatePlayPauseButton(true);
      this.highlightActiveTrack(data.index);
    },

    updatePlayPauseButton(isPlaying) {
      if (!this.playPauseBtn) return;

      const playIcon = this.playPauseBtn.querySelector('.play-icon');
      const pauseIcon = this.playPauseBtn.querySelector('.pause-icon');

      if (isPlaying) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
      } else {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
      }
    },

    highlightActiveTrack(index) {
      document.querySelectorAll('.track.active').forEach(el => {
        el.classList.remove('active');
      });

      const activeTrack = document.querySelector(`.track[data-index="${index}"]`);
      if (activeTrack) {
        activeTrack.classList.add('active');
        
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
        svg.setAttribute('d', 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z');
      } else if (volume < 0.5) {
        svg.setAttribute('d', 'M7 9v6h4l5 5V4l-5 5H7z');
      } else {
        svg.setAttribute('d', 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z');
      }
    },

    restoreSettings() {
      try {
        const savedVolume = parseFloat(localStorage.getItem('playerVolume') || '1');
        if (this.volumeSlider) {
          this.volumeSlider.value = savedVolume * 100;
          this.updateVolumeIcon(savedVolume);
        }

        const repeatMode = localStorage.getItem('repeatMode') === '1';
        const shuffleMode = localStorage.getItem('shuffleMode') === '1';

        this.repeatBtn?.classList.toggle('active', repeatMode);
        this.shuffleBtn?.classList.toggle('active', shuffleMode);

      } catch (e) {
        console.error('Failed to restore settings:', e);
      }
    }
  };

  // Инициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      PlayerControls.init();
    });
  } else {
    PlayerControls.init();
  }

  window.PlayerControls = PlayerControls;

})();
