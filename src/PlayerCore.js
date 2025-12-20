// src/PlayerCore.js — Ядро плеера
(function() {
  'use strict';

  class PlayerCore {
    constructor() {
      this.playlist = [];
      this.currentIndex = -1;
      this.howl = null;
      this.volume = 1;
      this.repeatMode = 'none'; // none, all, one
      this.shuffleOn = false;
      this.shuffleOrder = [];
      this.sleepTimer = null;
      this.sleepTarget = 0;
      this.listeners = {};
      this.progressInterval = null;
    }

    // ==================== СОБЫТИЯ ====================
    on(handlers) {
      Object.entries(handlers).forEach(([k, fn]) => {
        if (typeof fn === 'function') this.listeners[k] = fn;
      });
    }

    emit(event, ...args) {
      this.listeners[event]?.(...args);
    }

    // ==================== ПЛЕЙЛИСТ ====================
    setPlaylist(tracks) {
      this.playlist = tracks || [];
      this.shuffleOrder = [];
      if (this.shuffleOn) this.generateShuffleOrder();
    }

    generateShuffleOrder() {
      this.shuffleOrder = this.playlist.map((_, i) => i);
      for (let i = this.shuffleOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.shuffleOrder[i], this.shuffleOrder[j]] = [this.shuffleOrder[j], this.shuffleOrder[i]];
      }
    }

    getActualIndex(logicalIndex) {
      if (!this.shuffleOn || !this.shuffleOrder.length) return logicalIndex;
      return this.shuffleOrder[logicalIndex] ?? logicalIndex;
    }

    // ==================== ВОСПРОИЗВЕДЕНИЕ ====================
    playTrack(index) {
      if (index < 0 || index >= this.playlist.length) return;

      const actualIdx = this.getActualIndex(index);
      const track = this.playlist[actualIdx];
      if (!track?.audio) {
        this.emit('onError', 'Аудио недоступно');
        return;
      }

      this.stop();
      this.currentIndex = index;

      this.howl = new Howl({
        src: [track.audio],
        html5: true,
        volume: this.volume,
        onplay: () => {
          this.emit('onPlay');
          this.startProgressUpdate();
        },
        onpause: () => this.emit('onPause'),
        onstop: () => this.emit('onStop'),
        onend: () => this.onTrackEnd(),
        onloaderror: (_, err) => this.emit('onError', err),
        onplayerror: (_, err) => {
          this.emit('onError', err);
          // Попытка возобновить на iOS
          this.howl?.once('unlock', () => this.howl?.play());
        }
      });

      this.howl.play();
      this.emit('onTrackChange', { ...track, index: actualIdx });
    }

    play(track) {
      if (track) {
        const idx = this.playlist.findIndex(t => t.uid === track.uid);
        if (idx >= 0) this.playTrack(idx);
      } else if (this.howl) {
        this.howl.play();
      } else if (this.playlist.length) {
        this.playTrack(0);
      }
    }

    pause() {
      this.howl?.pause();
    }

    togglePlay() {
      if (!this.howl) {
        if (this.playlist.length) this.playTrack(0);
        return;
      }
      this.howl.playing() ? this.pause() : this.howl.play();
    }

    stop() {
      this.stopProgressUpdate();
      if (this.howl) {
        this.howl.stop();
        this.howl.unload();
        this.howl = null;
      }
      this.emit('onStop');
    }

    // ==================== НАВИГАЦИЯ ====================
    next() {
      if (!this.playlist.length) return;
      let nextIdx = this.currentIndex + 1;
      if (nextIdx >= this.playlist.length) {
        nextIdx = this.repeatMode === 'all' ? 0 : -1;
      }
      if (nextIdx >= 0) this.playTrack(nextIdx);
    }

    prev() {
      if (!this.playlist.length) return;
      // Если прошло больше 3 сек — к началу трека
      if (this.getPosition() > 3) {
        this.seek(0);
        return;
      }
      let prevIdx = this.currentIndex - 1;
      if (prevIdx < 0) prevIdx = this.repeatMode === 'all' ? this.playlist.length - 1 : 0;
      this.playTrack(prevIdx);
    }

    onTrackEnd() {
      if (this.repeatMode === 'one') {
        this.seek(0);
        this.howl?.play();
      } else {
        this.next();
      }
    }

    // ==================== SEEK & VOLUME ====================
    seek(pos) {
      if (!this.howl) return;
      const dur = this.howl.duration() || 0;
      const clamped = Math.max(0, Math.min(dur, pos));
      this.howl.seek(clamped);
      this.emit('onProgress', clamped, dur);
    }

    getPosition() {
      return this.howl?.seek() || 0;
    }

    getDuration() {
      return this.howl?.duration() || 0;
    }

    setVolume(vol) {
      this.volume = Math.max(0, Math.min(1, vol));
      this.howl?.volume(this.volume);
      this.emit('onVolumeChange', this.volume);
    }

    getVolume() {
      return this.volume;
    }

    // ==================== РЕЖИМЫ ====================
    setRepeatMode(mode) {
      this.repeatMode = ['none', 'all', 'one'].includes(mode) ? mode : 'none';
    }

    getRepeatMode() {
      return this.repeatMode;
    }

    setShuffle(on) {
      this.shuffleOn = !!on;
      if (this.shuffleOn) this.generateShuffleOrder();
    }

    isShuffleOn() {
      return this.shuffleOn;
    }

    // ==================== SLEEP TIMER ====================
    setSleepTimer(ms) {
      this.clearSleepTimer();
      if (ms <= 0) return;
      this.sleepTarget = Date.now() + ms;
      this.sleepTimer = setTimeout(() => {
        this.pause();
        this.emit('onSleepTriggered');
        this.sleepTarget = 0;
      }, ms);
    }

    clearSleepTimer() {
      if (this.sleepTimer) {
        clearTimeout(this.sleepTimer);
        this.sleepTimer = null;
      }
      this.sleepTarget = 0;
    }

    getSleepTimerTarget() {
      return this.sleepTarget;
    }

    // ==================== PROGRESS UPDATE ====================
    startProgressUpdate() {
      this.stopProgressUpdate();
      this.progressInterval = setInterval(() => {
        if (this.howl?.playing()) {
          this.emit('onProgress', this.getPosition(), this.getDuration());
        }
      }, 250);
    }

    stopProgressUpdate() {
      if (this.progressInterval) {
        clearInterval(this.progressInterval);
        this.progressInterval = null;
      }
    }

    // ==================== GETTERS ====================
    getCurrentTrack() {
      if (this.currentIndex < 0) return null;
      const actualIdx = this.getActualIndex(this.currentIndex);
      return this.playlist[actualIdx] || null;
    }

    isPlaying() {
      return this.howl?.playing() || false;
    }

    // ==================== DESTROY ====================
    destroy() {
      this.stop();
      this.clearSleepTimer();
      this.playlist = [];
      this.listeners = {};
    }
  }

  // Создаём глобальный экземпляр
  window.playerCore = new PlayerCore();
  window.PlayerCore = PlayerCore;

  console.log('✅ PlayerCore initialized');
})();
