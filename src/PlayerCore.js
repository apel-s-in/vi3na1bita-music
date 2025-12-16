// src/PlayerCore.js
// Ядро плеера на базе Howler.js

(function PlayerCoreModule() {
  'use strict';

  class PlayerCore {
    constructor() {
      this.playlist = [];
      this.currentIndex = -1;
      this.sound = null;
      this.isReady = false;

      this.repeatMode = false;
      this.shuffleMode = false;
      this.originalPlaylist = [];

      this.tickInterval = null;
      this.tickRate = 100; // мс

      this.callbacks = {
        onTrackChange: [],
        onPlay: [],
        onPause: [],
        onStop: [],
        onEnd: [],
        onTick: [],
        onError: [],
        // Пользовательские события
        onSleepTriggered: []
      };

      this.metadata = {
        artist: 'Витрина Разбита',
        album: '',
        cover: ''
      };

      // Таймер сна
      this.sleepTimerTarget = 0;   // timestamp (ms) когда нужно остановить воспроизведение
      this.sleepTimerId = null;    // id setTimeout для таймера сна
    }

    initialize() {
      console.log('🎵 PlayerCore initializing...');
      this.isReady = true;
      console.log('✅ PlayerCore ready');
    }

    // ========== УПРАВЛЕНИЕ ПЛЕЙЛИСТОМ ==========

    setPlaylist(tracks, startIndex = 0, metadata = {}) {
      // ✅ БАЗОВОЕ ПРАВИЛО: setPlaylist НЕ останавливает воспроизведение.
      const wasPlaying = this.isPlaying();
      const prev = this.getCurrentTrack();
      const prevUid = prev?.uid || null;
      const prevPos = this.getPosition();

      this.playlist = (Array.isArray(tracks) ? tracks : []).map(t => ({
        src: t.src,
        title: t.title || 'Без названия',
        artist: t.artist || 'Витрина Разбита',
        album: t.album || '',
        cover: t.cover || '',
        lyrics: t.lyrics || null,
        fulltext: t.fulltext || null,
        uid: (typeof t.uid === 'string' && t.uid.trim()) ? t.uid.trim() : null
      }));

      this.originalPlaylist = [...this.playlist];
      this.metadata = { ...this.metadata, ...metadata };

      if (this.shuffleMode) {
        this.shufflePlaylist();
      }

      // Сохраняем текущий трек по uid, иначе — startIndex
      let nextIndex = -1;
      if (prevUid) {
        nextIndex = this.playlist.findIndex(t => t.uid && t.uid === prevUid);
      }
      if (nextIndex === -1) {
        nextIndex = Math.max(0, Math.min(startIndex, this.playlist.length - 1));
      }
      this.currentIndex = nextIndex;

      console.log(`✅ Playlist set: ${this.playlist.length} tracks`);

      // Если играло — продолжаем играть без onStop (тихая смена Howl делается через load)
      if (wasPlaying && this.playlist.length > 0) {
        this.load(this.currentIndex, { autoPlay: true, resumePosition: prevPos });
      } else {
        const cur = this.getCurrentTrack();
        if (cur) {
          this.trigger('onTrackChange', cur, this.currentIndex);
          this.updateMediaSession();
        }
      }
    }

    getPlaylistSnapshot() {
      return [...this.playlist];
    }

    // ========== ВОСПРОИЗВЕДЕНИЕ ==========

    play(index = null) {
      if (index !== null && index >= 0 && index < this.playlist.length) {
        this.load(index);
      }
      
      if (!this.sound) {
        console.warn('⚠️ No sound loaded');
        return;
      }
      
      // Howler вызовет onplay → там мы запускаем тик и триггерим onPlay.
      this.sound.play();
      this.updateMediaSession();
    }

    pause() {
      if (!this.sound) return;
      
      this.sound.pause();
      this.stopTick();
      this.trigger('onPause', this.getCurrentTrack(), this.currentIndex);
    }

    stop() {
      // ✅ Единственная “жёсткая остановка”, разрешённая правилами (кнопка Stop).
      if (this.sound) {
        try { this.sound.stop(); } catch {}
        try { this.sound.unload(); } catch {}
        this.sound = null;
      }

      this.stopTick();
      this.trigger('onStop', this.getCurrentTrack(), this.currentIndex);
    }

    _silentUnloadCurrentSound() {
      // ✅ Техническая смена трека/плейлиста: НЕ триггерим onStop.
      if (this.sound) {
        try { this.sound.stop(); } catch {}
        try { this.sound.unload(); } catch {}
        this.sound = null;
      }
      this.stopTick();
    }

    load(index, options = {}) {
      if (index < 0 || index >= this.playlist.length) return;

      const { autoPlay = false, resumePosition = null } = options || {};

      // ✅ НЕЛЬЗЯ stop(): это нарушит базовое правило.
      this._silentUnloadCurrentSound();

      this.currentIndex = index;

      const track = this.playlist[index];

      this.sound = new Howl({
        src: [track.src],
        html5: true,
        preload: true,
        volume: this.getVolume() / 100,
        onplay: () => {
          this.startTick();
          this.trigger('onPlay', track, index);
        },
        onpause: () => {
          this.stopTick();
          this.trigger('onPause', track, index);
        },
        onend: () => {
          this.stopTick();
          this.trigger('onEnd', track, index);
          this.handleTrackEnd();
        },
        onload: () => {
          if (typeof resumePosition === 'number' && Number.isFinite(resumePosition) && resumePosition > 0) {
            try { this.seek(resumePosition); } catch {}
          }
          if (autoPlay) {
            try { this.play(); } catch {}
          }
        },
        onloaderror: (id, error) => {
          console.error('❌ Load error:', error);
          this.trigger('onError', { type: 'load', error, track, index });
        },
        onplayerror: (id, error) => {
          console.error('❌ Play error:', error);
          this.trigger('onError', { type: 'play', error, track, index });
        }
      });

      this.trigger('onTrackChange', track, index);
      this.updateMediaSession();
    }

    handleTrackEnd() {
      if (this.repeatMode) {
        this.play(this.currentIndex);
      } else {
        this.next();
      }
    }

    next() {
      if (this.playlist.length === 0) return;
  
      // ✅ Учитываем режим "только избранные"
      const availableIndices = window.availableFavoriteIndices;
  
      if (Array.isArray(availableIndices) && availableIndices.length > 0) {
        // Режим "только избранные" активен
        const currentPos = availableIndices.indexOf(this.currentIndex);
    
        if (currentPos === -1) {
          // Текущий трек не в списке избранных — переходим к первому избранному
          this.play(availableIndices[0]);
          return;
        }
    
        let nextPos = currentPos + 1;
    
        if (nextPos >= availableIndices.length) {
          nextPos = 0; // Зацикливаемся
        }
    
        this.play(availableIndices[nextPos]);
      } else {
        // Обычный режим — следующий трек по порядку
        let nextIndex = this.currentIndex + 1;
    
        if (nextIndex >= this.playlist.length) {
          nextIndex = 0;
        }
    
        this.play(nextIndex);
      }
    }

    prev() {
      if (this.playlist.length === 0) return;
  
      // Если играем больше 3 секунд, перематываем на начало
      if (this.getPosition() > 3) {
        this.seek(0);
        return;
      }
  
      // ✅ Учитываем режим "только избранные"
      const availableIndices = window.availableFavoriteIndices;
  
      if (Array.isArray(availableIndices) && availableIndices.length > 0) {
        // Режим "только избранные" активен
        const currentPos = availableIndices.indexOf(this.currentIndex);
    
        if (currentPos === -1) {
          // Текущий трек не в списке избранных — переходим к последнему избранному
          this.play(availableIndices[availableIndices.length - 1]);
          return;
        }
    
        let prevPos = currentPos - 1;
    
        if (prevPos < 0) {
          prevPos = availableIndices.length - 1; // Зацикливаемся
        }
    
        this.play(availableIndices[prevPos]);
      } else {
        // Обычный режим — предыдущий трек по порядку
        let prevIndex = this.currentIndex - 1;
    
        if (prevIndex < 0) {
          prevIndex = this.playlist.length - 1;
        }
    
        this.play(prevIndex);
      }
    }

    // ========== ПЕРЕМОТКА И ПОЗИЦИЯ ==========

    seek(seconds) {
      if (!this.sound) return;
      this.sound.seek(seconds);
    }

    getPosition() {
      if (!this.sound) return 0;
      return this.sound.seek() || 0;
    }

    getDuration() {
      if (!this.sound) return 0;
      return this.sound.duration() || 0;
    }

    // ========== ГРОМКОСТЬ ==========

    setVolume(percent) {
      const volume = Math.max(0, Math.min(100, percent)) / 100;
      
      if (this.sound) {
        this.sound.volume(volume);
      }
      
      Howler.volume(volume);
      localStorage.setItem('playerVolume', Math.round(percent));
    }

    getVolume() {
      const saved = localStorage.getItem('playerVolume');
      return saved !== null ? parseInt(saved, 10) : 100;
    }

    setMuted(muted) {
      if (this.sound) {
        this.sound.mute(muted);
      } else {
        Howler.mute(muted);
      }
    }

    // ========== РЕЖИМЫ ВОСПРОИЗВЕДЕНИЯ ==========

    toggleRepeat() {
      this.repeatMode = !this.repeatMode;
      console.log(`🔁 Repeat: ${this.repeatMode}`);
    }

    isRepeat() {
      return this.repeatMode;
    }

    toggleShuffle() {
      this.shuffleMode = !this.shuffleMode;
      
      if (this.shuffleMode) {
        this.shufflePlaylist();
      } else {
        this.playlist = [...this.originalPlaylist];
      }
      
      console.log(`🔀 Shuffle: ${this.shuffleMode}`);
    }

    isShuffle() {
      return this.shuffleMode;
    }

    shufflePlaylist() {
      const currentTrack = this.playlist[this.currentIndex];
      
      const shuffled = [...this.playlist];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      
      this.playlist = shuffled;
      
      if (currentTrack) {
        this.currentIndex = this.playlist.findIndex(t => t.src === currentTrack.src);
      }
    }

    // ========== КАЧЕСТВО ЗВУКА ==========

    setQuality(quality) {
      // Заглушка для будущей реализации
      console.log(`🎵 Quality set to: ${quality}`);
    }

    // ========== ПОЛУЧЕНИЕ ДАННЫХ ==========

    getCurrentTrack() {
      if (this.currentIndex < 0 || this.currentIndex >= this.playlist.length) {
        return null;
      }
      return this.playlist[this.currentIndex];
    }

    getIndex() {
      return this.currentIndex;
    }

    getNextIndex() {
      if (this.playlist.length === 0) return -1;
      
      let nextIndex = this.currentIndex + 1;
      if (nextIndex >= this.playlist.length) {
        nextIndex = 0;
      }
      
      return nextIndex;
    }

    isPlaying() {
      return this.sound ? this.sound.playing() : false;
    }

    // ========== СОБЫТИЯ ==========

    on(events) {
      Object.keys(events).forEach(event => {
        if (this.callbacks[event]) {
          this.callbacks[event].push(events[event]);
        }
      });
    }

    trigger(event, ...args) {
      if (this.callbacks[event]) {
        this.callbacks[event].forEach(callback => {
          try {
            callback(...args);
          } catch (error) {
            console.error(`Error in ${event} callback:`, error);
          }
        });
      }
    }

    // ========== ТИК (ОБНОВЛЕНИЕ ПРОГРЕССА) ==========

    startTick() {
      this.stopTick();
      
      this.tickInterval = setInterval(() => {
        const position = this.getPosition();
        const duration = this.getDuration();
        this.trigger('onTick', position, duration);
      }, this.tickRate);
    }

    stopTick() {
      if (this.tickInterval) {
        clearInterval(this.tickInterval);
        this.tickInterval = null;
      }
    }

    // ========== ТАЙМЕР СНА ==========

    /**
     * Устанавливает таймер сна на указанное количество миллисекунд.
     * По срабатыванию НЕ останавливает плеер жёстко, а:
     *  - генерирует событие onSleepTriggered,
     *  - приложение (SleepTimerModule) решает, что делать (по ТЗ: именно таймер может инициировать стоп/паузу).
     */
    setSleepTimer(ms) {
      const delay = Number(ms) || 0;
      if (delay <= 0) {
        this.clearSleepTimer();
        return;
      }

      const now = Date.now();
      this.sleepTimerTarget = now + delay;

      if (this.sleepTimerId) {
        clearTimeout(this.sleepTimerId);
        this.sleepTimerId = null;
      }

      this.sleepTimerId = setTimeout(() => {
        this.sleepTimerId = null;
        const target = this.sleepTimerTarget;
        this.sleepTimerTarget = 0;

        // Генерируем событие — UI/модули решают, что делать (стоп/пауза и т.п.)
        this.trigger('onSleepTriggered', { targetAt: target });

        // По базовому правилу: именно таймер сна имеет право инициировать остановку,
        // но делаем это мягко: если кто-то в onSleepTriggered уже остановил плеер,
        // вторично не трогаем.
        if (this.isPlaying()) {
          try {
            this.pause();
          } catch (e) {
            console.warn('Sleep timer pause failed:', e);
          }
        }
      }, delay);
    }

    /**
     * Сбрасывает таймер сна.
     */
    clearSleepTimer() {
      if (this.sleepTimerId) {
        clearTimeout(this.sleepTimerId);
        this.sleepTimerId = null;
      }
      this.sleepTimerTarget = 0;
    }

    /**
     * Возвращает absolute timestamp (ms) срабатывания таймера сна, либо 0, если таймер не установлен.
     */
    getSleepTimerTarget() {
      return this.sleepTimerTarget || 0;
    }

    updateMediaSession() {
      if (!('mediaSession' in navigator)) return;
      
      const track = this.getCurrentTrack();
      if (!track) return;
      
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist || this.metadata.artist,
        album: track.album || this.metadata.album,
        artwork: track.cover ? [
          { src: track.cover, sizes: '512x512', type: 'image/jpeg' }
        ] : []
      });
      
      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('stop', () => this.stop());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
      
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const skipTime = details.seekOffset || 10;
        this.seek(Math.max(0, this.getPosition() - skipTime));
      });
      
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const skipTime = details.seekOffset || 10;
        this.seek(Math.min(this.getDuration(), this.getPosition() + skipTime));
      });
      
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.fastSeek && 'fastSeek' in this.sound) {
          this.sound.fastSeek(details.seekTime);
        } else {
          this.seek(details.seekTime);
        }
      });
    }

    // ========== УТИЛИТЫ ==========

    getAudioElement() {
      // Howler использует Web Audio API, но может предоставить HTML5 audio
      if (this.sound && this.sound._sounds && this.sound._sounds[0]) {
        return this.sound._sounds[0]._node;
      }
      return null;
    }

    destroy() {
      this.stop();
      this.playlist = [];
      this.originalPlaylist = [];
      this.currentIndex = -1;
      this.callbacks = {
        onTrackChange: [],
        onPlay: [],
        onPause: [],
        onStop: [],
        onEnd: [],
        onTick: [],
        onError: []
      };
      console.log('🗑️ PlayerCore destroyed');
    }
  }

  // Создаём глобальный экземпляр
  window.playerCore = new PlayerCore();

  // Автоинициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.playerCore.initialize();
    });
  } else {
    window.playerCore.initialize();
  }

  console.log('✅ PlayerCore module loaded');

})();
