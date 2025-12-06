// scripts/player/PlayerCore.js
// Единственное ядро плеера на Howler.js - все остальные версии удалены

export class PlayerCore {
  constructor() {
    this.playlist = [];
    this.index = 0;
    this.howl = null;
    this.events = {};
    this.repeat = false;
    this.shuffle = false;
    this.shuffled = [];
    this._isPaused = true;
    this._albumArtist = '';
    this._albumTitle = '';
    this._albumCover = '';
    
    console.log('✅ PlayerCore initialized');
  }

  // ========== ПУБЛИЧНЫЙ API ==========
  
  setPlaylist(tracks, startIndex = 0, meta = {}) {
    this.stop();
    this.playlist = Array.isArray(tracks) ? tracks : [];
    this.index = Math.max(0, Math.min(this.playlist.length - 1, startIndex || 0));
    this._albumArtist = meta.artist || '';
    this._albumTitle = meta.album || '';
    this._albumCover = meta.cover || '';
    this._syncShuffle(true);
    
    console.log(`📀 Playlist set: ${this.playlist.length} tracks`);
  }

  loadPlaylist(tracks, startIndex = 0, meta = {}) {
    // Алиас для обратной совместимости
    this.setPlaylist(tracks, startIndex, meta);
  }

  on(eventName, callback) {
    if (typeof eventName === 'object') {
      // Поддержка on({ onPlay: fn, onPause: fn })
      Object.assign(this.events, eventName);
    } else if (typeof callback === 'function') {
      if (!this.events[eventName]) this.events[eventName] = [];
      this.events[eventName].push(callback);
    }
  }

  play(index) {
    if (typeof index === 'number') {
      this.index = Math.max(0, Math.min(this.playlist.length - 1, index));
    }
    
    if (!this.playlist.length) {
      console.warn('⚠️ Playlist is empty');
      return;
    }

    const track = this.getCurrentTrack();
    if (!track || !track.url) {
      console.error('❌ Invalid track:', track);
      return;
    }

    this.stop();

    console.log(`▶️ Playing: ${track.title} (${this.index})`);

    this.howl = new Howl({
      src: [track.url],
      html5: true,
      format: ['mp3'],
      
      onload: () => {
        console.log('✅ Track loaded');
      },
      
      onplay: () => {
        this._isPaused = false;
        this._fire('play', { track, index: this.index });
        this._fire('trackChanged', { track, index: this.index });
        this._updateMediaSession();
      },
      
      onpause: () => {
        this._isPaused = true;
        this._fire('pause', { track, index: this.index });
      },
      
      onstop: () => {
        this._isPaused = true;
        this._fire('stop', { track, index: this.index });
      },
      
      onend: () => {
        console.log('⏭️ Track ended');
        this._fire('end', { track, index: this.index });
        
        if (this.repeat) {
          this.play();
        } else {
          this.next();
        }
      },
      
      onloaderror: (id, err) => {
        console.error('❌ Load error:', err);
        this._fire('error', { error: err, track });
        // Пропускаем проблемный трек
        setTimeout(() => this.next(), 500);
      },
      
      onplayerror: (id, err) => {
        console.error('❌ Play error:', err);
        this._fire('error', { error: err, track });
      }
    });

    this.howl.play();
  }

  pause() {
    if (this.howl && !this._isPaused) {
      this.howl.pause();
      console.log('⏸️ Paused');
    }
  }

  stop() {
    if (this.howl) {
      try {
        this.howl.stop();
        this.howl.unload();
      } catch (e) {
        console.error('Stop error:', e);
      }
      this.howl = null;
    }
    this._isPaused = true;
  }

  next() {
    const nextIndex = this._getNextIndex();
    if (nextIndex >= 0) {
      this.index = nextIndex;
      this.play();
      console.log(`⏭️ Next track: ${nextIndex}`);
    } else {
      console.log('⏹️ End of playlist');
      this.stop();
    }
  }

  previous() {
    const prevIndex = this._getPrevIndex();
    if (prevIndex >= 0) {
      this.index = prevIndex;
      this.play();
      console.log(`⏮️ Previous track: ${prevIndex}`);
    }
  }

  playTrack(index) {
    this.play(index);
  }

  seek(seconds) {
    if (!this.howl) return 0;
    
    if (typeof seconds === 'number') {
      this.howl.seek(Math.max(0, seconds));
      console.log(`⏩ Seek to: ${seconds}s`);
    }
    
    return this.howl.seek() || 0;
  }

  setVolume(volume) {
    const vol = Math.max(0, Math.min(1, Number(volume)));
    
    if (this.howl) {
      this.howl.volume(vol);
    }
    
    if (typeof Howler !== 'undefined') {
      Howler.volume(vol);
    }
    
    // Сохраняем в localStorage
    try {
      localStorage.setItem('playerVolume', vol.toString());
    } catch (e) {}
  }

  getVolume() {
    if (this.howl) return this.howl.volume();
    if (typeof Howler !== 'undefined') return Howler.volume();
    return 1;
  }

  toggleMute() {
    if (!this.howl) return;
    const isMuted = this.howl._muted;
    this.howl.mute(!isMuted);
    console.log(isMuted ? '🔊 Unmuted' : '🔇 Muted');
  }

  setRepeat(value) {
    this.repeat = !!value;
    console.log(`🔁 Repeat: ${this.repeat}`);
  }

  setShuffle(value) {
    this.shuffle = !!value;
    if (this.shuffle) {
      this._createShuffledPlaylist();
    }
    console.log(`🔀 Shuffle: ${this.shuffle}`);
  }

  // ========== ГЕТТЕРЫ ==========
  
  isPlaying() {
    return !!this.howl && !this._isPaused;
  }

  getCurrentTrack() {
    return this.playlist[this.index] || null;
  }

  getCurrentTrackIndex() {
    return this.index;
  }

  getCurrentPosition() {
    return this.seek();
  }

  getDuration() {
    return this.howl ? (this.howl.duration() || 0) : 0;
  }

  getNextTrack() {
    const nextIndex = this._getNextIndex();
    return nextIndex >= 0 ? this.playlist[nextIndex] : null;
  }

  // ========== ВНУТРЕННИЕ МЕТОДЫ ==========
  
  _fire(eventName, data) {
    if (!this.events[eventName]) return;
    
    const handlers = Array.isArray(this.events[eventName]) 
      ? this.events[eventName] 
      : [this.events[eventName]];
    
    handlers.forEach(callback => {
      try {
        callback(data);
      } catch (e) {
        console.error(`Event callback error (${eventName}):`, e);
      }
    });
  }

  _getNextIndex() {
    if (!this.playlist.length) return -1;
    
    if (this.shuffle && this.shuffled.length) {
      const currentPos = this.shuffled.indexOf(this.index);
      const nextPos = (currentPos + 1) % this.shuffled.length;
      return this.shuffled[nextPos];
    }
    
    return (this.index + 1) % this.playlist.length;
  }

  _getPrevIndex() {
    if (!this.playlist.length) return -1;
    
    if (this.shuffle && this.shuffled.length) {
      const currentPos = this.shuffled.indexOf(this.index);
      const prevPos = (currentPos - 1 + this.shuffled.length) % this.shuffled.length;
      return this.shuffled[prevPos];
    }
    
    return (this.index - 1 + this.playlist.length) % this.playlist.length;
  }

  _createShuffledPlaylist() {
    const indices = this.playlist.map((_, i) => i);
    
    // Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    
    this.shuffled = indices;
    console.log('🔀 Shuffled playlist created');
  }

  _syncShuffle(force = false) {
    if (this.shuffle) {
      this._createShuffledPlaylist();
    }
  }

  _updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    
    const track = this.getCurrentTrack();
    if (!track) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Неизвестный трек',
        artist: track.artist || this._albumArtist || 'Витрина Разбита',
        album: track.album || this._albumTitle || 'Альбом',
        artwork: [
          {
            src: track.cover || this._albumCover || 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      });

      console.log('🎵 Media Session updated');
    } catch (e) {
      console.error('MediaSession error:', e);
    }
  }
}
