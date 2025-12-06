// scripts/player/PlayerCore.js
// Ядро воспроизведения на Howler.js

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
  }

  setPlaylist(tracks, startIndex = 0, meta = {}) {
    this.stop();
    this.playlist = Array.isArray(tracks) ? tracks : [];
    this.index = Math.max(0, Math.min(this.playlist.length - 1, startIndex || 0));
    this._albumArtist = meta.artist || '';
    this._albumTitle = meta.album || '';
    this._albumCover = meta.cover || '';
    this._syncShuffle(true);
  }

  loadPlaylist(tracks, startIndex = 0, meta = {}) {
    this.setPlaylist(tracks, startIndex, meta);
  }

  on(eventName, callback) {
    if (!this.events[eventName]) this.events[eventName] = [];
    this.events[eventName].push(callback);
  }

  _fire(eventName, data) {
    if (!this.events[eventName]) return;
    this.events[eventName].forEach(cb => {
      try { cb(data); } catch (e) { console.error('Event callback error:', e); }
    });
  }

  play(index) {
    if (typeof index === 'number') this.index = Math.max(0, Math.min(this.playlist.length - 1, index));
    if (!this.playlist.length) return;

    const track = this.getCurrentTrack();
    if (!track || !track.url) return;

    this.stop();

    this.howl = new Howl({
      src: [track.url],
      html5: true,
      onplay: () => {
        this._isPaused = false;
        this._fire('play', { track, index: this.index });
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
        if (this.repeat) {
          this.play();
        } else {
          this.next();
        }
      },
      onloaderror: (id, err) => {
        console.error('Load error:', err);
        this._fire('error', { error: err });
      }
    });

    this.howl.play();
  }

  pause() {
    if (this.howl && !this._isPaused) this.howl.pause();
  }

  stop() {
    if (this.howl) {
      try {
        this.howl.stop();
        this.howl.unload();
      } catch (e) {}
      this.howl = null;
    }
    this._isPaused = true;
  }

  next() {
    const nextIndex = this._getNextIndex();
    if (nextIndex >= 0) {
      this.index = nextIndex;
      this.play();
    }
  }

  previous() {
    const prevIndex = this._getPrevIndex();
    if (prevIndex >= 0) {
      this.index = prevIndex;
      this.play();
    }
  }

  _getNextIndex() {
    if (!this.playlist.length) return -1;
    return (this.index + 1) % this.playlist.length;
  }

  _getPrevIndex() {
    if (!this.playlist.length) return -1;
    return (this.index - 1 + this.playlist.length) % this.playlist.length;
  }

  seek(seconds) {
    if (!this.howl) return 0;
    if (typeof seconds === 'number') {
      this.howl.seek(Math.max(0, seconds));
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
  }

  getVolume() {
    if (this.howl) return this.howl.volume();
    if (typeof Howler !== 'undefined') return Howler.volume();
    return 1;
  }

  toggleMute() {
    if (!this.howl) return;
    this.howl.mute(!this.howl._muted);
  }

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

  setRepeat(value) {
    this.repeat = !!value;
  }

  setShuffle(value) {
    this.shuffle = !!value;
    if (this.shuffle) {
      this._createShuffledPlaylist();
    }
  }

  _createShuffledPlaylist() {
    const indices = this.playlist.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    this.shuffled = indices;
  }

  _syncShuffle(force) {
    if (this.shuffle) {
      this._createShuffledPlaylist();
    }
  }

  playTrack(index) {
    this.play(index);
  }
}
