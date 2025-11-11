// src/PlayerCore.js (ESM)
// Ядро воспроизведения на Howler.js для vi3na1bita-music.
// Управляет: плейлистом, play/pause/stop/prev/next, repeat/shuffle/favoritesOnly,
// громкостью/позициями, автопереходом, MediaSession и "тикером" времени.

export class PlayerCore {
  constructor(events = {}, options = {}) {
    this.playlist = [];
    this.index = 0;
    this.howl = null;
    this.events = { ...events };
    this.repeat = false;
    this.shuffle = false;
    this.favoritesOnly = false;
    this.favorites = [];
    this.shuffled = [];
    this._ticker = null;
    this._tickIntervalMs = Math.max(100, options.tickIntervalMs || 250);
    this._isPaused = true;
    this._albumArtist = '';
    this._albumTitle = '';
    this._albumCover = '';
    // Sleep timer
    this._sleepTimerId = null;
    this._sleepTargetTs = 0;

    this._installMediaSessionHandlersOnce();
  }

  setPlaylist(tracks, startIndex = 0, albumMeta = {}) {
    this.stop();
    this.playlist = Array.isArray(tracks) ? tracks.slice() : [];
    this.index = Math.max(0, Math.min(this.playlist.length - 1, startIndex || 0));
    this._albumArtist = albumMeta.artist || (tracks && tracks[0] && tracks[0].artist) || '';
    this._albumTitle  = albumMeta.album  || (tracks && tracks[0] && tracks[0].album)  || '';
    this._albumCover  = albumMeta.cover  || (tracks && tracks[0] && tracks[0].cover)  || '';
    this._syncShuffle();
    const t = this.getCurrentTrack();
    this._fire('onTrackChange', t, this.index);
  }

  on(events) { this.events = { ...this.events, ...events }; }
  setEvents(events) { this.events = { ...events }; }

  setRepeat(v) { this.repeat = !!v; }
  setShuffle(v) { this.shuffle = !!v; this._syncShuffle(); }
  setFavoritesOnly(v, favorites = []) {
    this.favoritesOnly = !!v;
    this.favorites = Array.isArray(favorites) ? favorites.slice() : [];
    this._syncShuffle();
  }

  play(index) {
    if (typeof index === 'number') this.index = this._clampIndex(index);
    if (!this.playlist.length) return;

    // Если Howl уже есть и играет тот же трек — просто возобновляем
    if (this.howl && this._isPaused && this.howl._src === (this.playlist[this.index]?.src || '')) {
      this.howl.play();
      return;
    }

    this._stopHowl();
    const tr = this.getCurrentTrack();
    if (!tr || !tr.src) return;

    this.howl = new Howl({
      src: [tr.src],
      html5: true,
      onend: () => {
        if (this.repeat) { this.play(); return; }
        this.next();
        this._fire('onEnd', tr, this.index);
      },
      onplay: () => {
        this._isPaused = false;
        this._fire('onPlay', tr, this.index);
        this._fire('onTrackChange', tr, this.index);
        this._updateMediaSessionMeta();
        this._startTicker();
      },
      onpause: () => { this._isPaused = true; this._fire('onPause', tr, this.index); this._stopTicker(); },
      onstop:  () => { this._isPaused = true; this._fire('onStop',  tr, this.index); this._stopTicker(); },
      onplayerror: (_, err) => {
        console.warn('Howler play error:', err);
        // Попытка разблокировать аудио контекст
        try { this.howl.once('unlock', () => { try { this.howl.play(); } catch {} }); } catch {}
      },
      onloaderror: (_, err) => {
        console.warn('Howler load error:', err);
        // Можно добавить логику для пропуска трека
      }
    });

    try {
      const saved = parseFloat(localStorage.getItem('playerVolume'));
      if (Number.isFinite(saved)) this.setVolume(saved);
    } catch {}
    this.howl.play();
  }

  pause() { if (this.howl && !this._isPaused) this.howl.pause(); }
  stop()  { this._stopHowl(); this._isPaused = true; this._fire('onStop', this.getCurrentTrack(), this.index); }

  next() {
    this._syncShuffle();
    const n = this._nextIndex();
    if (n < 0) { this.stop(); return; }
    this.index = n;
    this.play();
  }
  prev() {
    this._syncShuffle();
    const p = this._prevIndex();
    if (p < 0) { this.stop(); return; }
    this.index = p;
    this.play();
  }

  setVolume(v) {
    const vol = Math.max(0, Math.min(1, Number(v)));
    if (this.howl) this.howl.volume(vol);
    else if (typeof Howler !== 'undefined') Howler.volume(vol);
  }
  getVolume() {
    if (this.howl) return this.howl.volume();
    if (typeof Howler !== 'undefined') return Howler.volume();
    return 1;
  }

  seek(sec) {
    if (!this.howl) return;
    if (typeof sec === 'number') this.howl.seek(Math.max(0, sec));
    else return Number(this.howl.seek()) || 0;
  }
  getSeek() { return this.seek(); }
  getDuration() { return this.howl ? (this.howl.duration() || 0) : 0; }

  getNextIndex() {
    return this._nextIndex();
  }

  getPlaylistSnapshot() {
    return (this.playlist || []).map(t => ({
      title: t?.title || '',
      artist: t?.artist || this._albumArtist || '',
      album: t?.album || this._albumTitle || '',
      cover: t?.cover || this._albumCover || '',
      lyrics: t?.lyrics || '',
      src: t?.src || '',
      fulltext: t?.fulltext || ''
    }));
  }

  isPlaying() { return !!this.howl && !this._isPaused; }
  getIndex() { return this.index; }
  getCurrentTrack() {
    if (!this.playlist.length) return null;
    return this.playlist[this.index] || null;
  }

  destroy() {
    this.stop();
    this._stopTicker();
    this.playlist = [];
    this.events = {};
  }

  _clampIndex(i) { return Math.max(0, Math.min(this.playlist.length - 1, i)); }
  _fire(name, ...args) { try { const fn = this.events && this.events[name]; if (typeof fn === 'function') fn(...args); } catch {} }

  _stopHowl() {
    if (this.howl) { try { this.howl.stop(); this.howl.unload(); } catch {} this.howl = null; }
  }

  _filteredIndices() {
    if (!this.playlist.length) return [];
    if (this.favoritesOnly && this.favorites.length) {
      return this.favorites.filter(i => Number.isInteger(i) && i >= 0 && i < this.playlist.length);
    }
    return this.playlist.map((_, i) => i);
  }
  _syncShuffle() {
    if (!this.shuffle) { this.shuffled = []; return; }
    const base = this._filteredIndices();
    const arr = base.slice();
    for (let j = arr.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [arr[j], arr[k]] = [arr[k], arr[j]];
    }
    const i = arr.indexOf(this.index);
    if (i > 0) { arr.splice(i, 1); arr.unshift(this.index); }
    this.shuffled = arr;
  }
  _displayList() {
    const base = this._filteredIndices();
    if (this.shuffle && this.shuffled.length) return this.shuffled.slice();
    return base;
  }
  _nextIndex() {
    const arr = this._displayList();
    if (!arr.length) return -1;
    const pos = arr.indexOf(this.index);
    const nextIdx = (pos + 1) % arr.length;
    return arr[nextIdx];
  }
  _prevIndex() {
    const arr = this._displayList();
    if (!arr.length) return -1;
    const pos = arr.indexOf(this.index);
    const prevIdx = (pos - 1 + arr.length) % arr.length;
    return arr[prevIdx];
  }

  _startTicker() {
    if (this._ticker) return;
    this._ticker = setInterval(() => {
      try {
        if (!this.isPlaying()) return;
        const pos = this.getSeek() || 0;
        const dur = this.getDuration() || 0;
        const fn = this.events && this.events.onTick;
        if (typeof fn === 'function') fn(pos, dur);
      } catch {}
    }, this._tickIntervalMs);
  }
  _stopTicker() {
    if (this._ticker) { clearInterval(this._ticker); this._ticker = null; }
  }

  setSleepTimer(ms) {
    try { this.clearSleepTimer(); } catch {}
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return;
    this._sleepTargetTs = Date.now() + n;
    this._sleepTimerId = setTimeout(() => {
      this._sleepTimerId = null;
      this._sleepTargetTs = 0;
      try {
        if (this.howl && !this._isPaused) this.howl.pause();
      } catch {}
      this._fire('onSleepTriggered', this.getCurrentTrack(), this.index);
    }, n);
  }
  clearSleepTimer() {
    if (this._sleepTimerId) {
      try { clearTimeout(this._sleepTimerId); } catch {}
      this._sleepTimerId = null;
    }
    this._sleepTargetTs = 0;
  }
  getSleepTimerTarget() {
    return this._sleepTargetTs || 0;
  }

  _updateMediaSessionMeta() {
    if (!('mediaSession' in navigator)) return;
    const t = this.getCurrentTrack();
    if (!t) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: t.title || '',
        artist: t.artist || this._albumArtist || '',
        album: t.album || this._albumTitle || '',
        artwork: (t.cover || this._albumCover) ? [
          { src: t.cover || this._albumCover, sizes: '512x512', type: 'image/png' }
        ] : []
      });
    } catch {}
    try { navigator.mediaSession.playbackState = this.isPlaying() ? 'playing' : 'paused'; } catch {}
  }

  _installMediaSessionHandlersOnce() {
    if (!('mediaSession' in navigator) || window.__msInstalled) return;
    try {
      const self = this;
      navigator.mediaSession.setActionHandler('play', () => self.play());
      navigator.mediaSession.setActionHandler('pause', () => self.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => self.prev());
      navigator.mediaSession.setActionHandler('nexttrack', () => self.next());
      navigator.mediaSession.setActionHandler('seekbackward', (d) => self.seek((self.getSeek() || 0) - (d.seekOffset || 10)));
      navigator.mediaSession.setActionHandler('seekforward', (d) => self.seek((self.getSeek() || 0) + (d.seekOffset || 10)));
      navigator.mediaSession.setActionHandler('seekto', (d) => { if (typeof d.seekTime === 'number') self.seek(d.seekTime); });
      navigator.mediaSession.setActionHandler('stop', () => self.stop());
      window.__msInstalled = true;
    } catch {}
  }
}
