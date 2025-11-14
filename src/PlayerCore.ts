// src/PlayerCore.ts
// Ядро Howler.js для vi3na1bita-music: плейлист, play/pause/stop/prev/next,
// repeat/shuffle/favoritesOnly, громкость/позиция, автопереход, MediaSession, тикер времени.

export type PlayerTrack = {
  src: string;
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
  lyrics?: string;
  fulltext?: string;
};

type PlayerCoreEvents = {
  onPlay?: (track: PlayerTrack | null, index: number) => void;
  onPause?: (track: PlayerTrack | null, index: number) => void;
  onStop?: (track: PlayerTrack | null, index: number) => void;
  onTrackChange?: (track: PlayerTrack | null, index: number) => void;
  onEnd?: (track: PlayerTrack | null, index: number) => void;
  onTick?: (positionSec: number, durationSec: number) => void;
  onSleepTriggered?: (track: PlayerTrack | null, index: number) => void;
};

type PlayerCoreOptions = {
  tickIntervalMs?: number;
  events?: PlayerCoreEvents;
};

declare const Howler: any; // глобальный из CDN
declare class Howl {
  constructor(opts: any);
  play(): void;
  pause(): void;
  stop(): void;
  unload(): void;
  seek(sec?: number): number;
  duration(): number;
  volume(v?: number): number;
}

export class PlayerCore {
  private playlist: PlayerTrack[] = [];
  private index = 0;
  private howl: Howl | null = null;
  private events: PlayerCoreEvents = {};
  private repeat = false;
  private shuffle = false;
  private favoritesOnly = false;
  private favorites: number[] = [];
  private shuffled: number[] = [];
  private _ticker: ReturnType<typeof setInterval> | null = null;
  private _tickIntervalMs: number;
  private _isPaused = true;
  private _albumArtist = '';
  private _albumTitle = '';
  private _albumCover = '';

  private _sleepTimerId: ReturnType<typeof setTimeout> | null = null;
  private _sleepTargetTs = 0;

  constructor(opts: PlayerCoreOptions = {}) {
    this._tickIntervalMs = Math.max(100, opts.tickIntervalMs || 250);
    if (opts.events) this.events = { ...opts.events };
    this._installMediaSessionHandlersOnce();
  }

  setPlaylist(tracks: PlayerTrack[], startIndex = 0, albumMeta?: { artist?: string; album?: string; cover?: string }) {
    this.stop();
    this.playlist = Array.isArray(tracks) ? tracks.slice() : [];
    this.index = Math.max(0, Math.min(this.playlist.length - 1, startIndex || 0));
    this._albumArtist = (albumMeta?.artist) || (tracks?.[0]?.artist) || '';
    this._albumTitle  = (albumMeta?.album)  || (tracks?.[0]?.album)  || '';
    this._albumCover  = (albumMeta?.cover)  || (tracks?.[0]?.cover)  || '';
    this._syncShuffle(true);
    this._fire('onTrackChange', this.getCurrentTrack(), this.index);
  }

  on(events: PlayerCoreEvents) { this.events = { ...this.events, ...events }; }
  setEvents(events: PlayerCoreEvents) { this.events = { ...events }; }

  setRepeat(v: boolean) { this.repeat = !!v; }
  setShuffle(v: boolean) { this.shuffle = !!v; this._syncShuffle(true); }
  setFavoritesOnly(v: boolean, favorites: number[] = []) {
    this.favoritesOnly = !!v;
    this.favorites = Array.isArray(favorites) ? favorites.slice() : [];
    this._syncShuffle(true);
  }

  play(index?: number) {
    if (typeof index === 'number') this.index = this._clampIndex(index);
    if (!this.playlist.length) return;

    this._stopHowl();
    const tr = this.getCurrentTrack();
    if (!tr) return;

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
      onstop:  () => { this._isPaused = true; this._fire('onStop',  tr, this.index); this._stopTicker(); }
    });

    try {
      const saved = parseFloat(localStorage.getItem('playerVolume') || '');
      if (Number.isFinite(saved)) this.setVolume(saved);
    } catch {}
    this.howl.play();
  }

  pause() { if (this.howl && !this._isPaused) this.howl.pause(); }
  stop()  { this._stopHowl(); this._isPaused = true; this._fire('onStop', this.getCurrentTrack(), this.index); }

  next() { const n = this._nextIndex(); if (n < 0) return; this.index = n; this.play(); }
  prev() { const p = this._prevIndex(); if (p < 0) return; this.index = p; this.play(); }

  setVolume(v: number) {
    const vol = Math.max(0, Math.min(1, Number(v)));
    if (this.howl) this.howl.volume(vol);
    else if (typeof Howler !== 'undefined') Howler.volume(vol);
  }
  getVolume(): number {
    if (this.howl) return this.howl.volume();
    if (typeof Howler !== 'undefined') return Howler.volume();
    return 1;
  }

  seek(sec?: number): number | void {
    if (!this.howl) return;
    if (typeof sec === 'number') this.howl.seek(Math.max(0, sec));
    else return Number(this.howl.seek()) || 0;
  }
  getSeek(): number { return (this.seek() as number) || 0; }
  getDuration(): number { return this.howl ? (this.howl.duration() || 0) : 0; }

  // Публичный «следующий» индекс по текущей логике shuffle/favoritesOnly
  getNextIndex(): number {
    return this._nextIndex();
  }

  // Снимок плейлиста для UI (заголовки и пр.)
  getPlaylistSnapshot(): Array<{ title: string; artist: string; album: string; cover: string; lyrics: string; src: string; fulltext: string; }> {
    return (this.playlist || []).map(t => ({
      title: t?.title || '',
      artist: t?.artist || this._albumArtist || '',
      album: t?.album || this._albumTitle || '',
      cover: t?.cover || this._albumCover || '',
      lyrics: t?.lyrics || '',
      src: t?.src || '',
      fulltext: (t as any)?.fulltext || ''
    }));
  }

  isPlaying() { return !!this.howl && !this._isPaused; }
  getIndex() { return this.index; }
  getCurrentTrack(): PlayerTrack | null {
    if (!this.playlist.length) return null;
    return this.playlist[this.index] || null;
  }

  destroy() {
    this.stop(); this._stopTicker(); this.playlist = []; this.events = {};
  }

  // ===== INTERNAL =====
  private _clampIndex(i: number) { return Math.max(0, Math.min(this.playlist.length - 1, i)); }
  private _fire<K extends keyof PlayerCoreEvents>(name: K, ...args: any[]) { try { const fn = this.events && this.events[name]; if (typeof fn === 'function') (fn as any)(...args); } catch {} }
  private _stopHowl() { if (this.howl) { try { this.howl.stop(); this.howl.unload(); } catch {} this.howl = null; } }

  private _filteredIndices(): number[] {
    if (!this.playlist.length) return [];
    if (this.favoritesOnly && this.favorites.length) {
      return this.favorites.filter(i => Number.isInteger(i) && i >= 0 && i < this.playlist.length);
    }
    return this.playlist.map((_, i) => i);
  }
  private _syncShuffle(force: boolean = false) {
    if (!this.shuffle) { this.shuffled = []; return; }
    const base = this._filteredIndices();

    if (!force &&
        Array.isArray(this.shuffled) &&
        this.shuffled.length === base.length &&
        this.shuffled.includes(this.index)) {
      return;
    }

    const arr = base.slice();
    for (let j = arr.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [arr[j], arr[k]] = [arr[k], arr[j]];
    }
    const i = arr.indexOf(this.index);
    if (i > 0) { arr.splice(i, 1); arr.unshift(this.index); }
    this.shuffled = arr;
  }

  private _displayList(): number[] {
    const base = this._filteredIndices();
    if (this.shuffle && this.shuffled.length) return this.shuffled.slice();
    return base;
  }
  private _nextIndex(): number {
    const arr = this._displayList(); if (!arr.length) return -1;
    const pos = arr.indexOf(this.index);
    const nextIdx = (pos + 1) % arr.length;
    return arr[nextIdx];
  }
  private _prevIndex(): number {
    const arr = this._displayList(); if (!arr.length) return -1;
    const pos = arr.indexOf(this.index);
    const prevIdx = (pos - 1 + arr.length) % arr.length;
    return arr[prevIdx];
  }

  private _startTicker() {
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
  private _stopTicker() { if (this._ticker) { clearInterval(this._ticker); this._ticker = null; } }

  // ===== Sleep timer API =====
  setSleepTimer(ms: number) {
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
  getSleepTimerTarget(): number {
    return this._sleepTargetTs || 0;
  }

  private _updateMediaSessionMeta() {
    if (!('mediaSession' in navigator)) return;
    const t = this.getCurrentTrack();
    try {
      (navigator as any).mediaSession.metadata = new (window as any).MediaMetadata({
        title: t?.title || '',
        artist: t?.artist || this._albumArtist || '',
        album: t?.album || this._albumTitle || '',
        artwork: (t?.cover || this._albumCover) ? [
          { src: t?.cover || this._albumCover, sizes: '512x512', type: 'image/png' }
        ] : []
      });
      (navigator as any).mediaSession.playbackState = this.isPlaying() ? 'playing' : 'paused';
      const self = this;
      (navigator as any).mediaSession.setActionHandler('play',         () => self.play());
      (navigator as any).mediaSession.setActionHandler('pause',        () => self.pause());
      (navigator as any).mediaSession.setActionHandler('previoustrack',() => self.prev());
      (navigator as any).mediaSession.setActionHandler('nexttrack',    () => self.next());
      (navigator as any).mediaSession.setActionHandler('seekbackward', (d: any) => self.seek((self.getSeek() || 0) - (d.seekOffset || 10)));
      (navigator as any).mediaSession.setActionHandler('seekforward',  (d: any) => self.seek((self.getSeek() || 0) + (d.seekOffset || 10)));
      (navigator as any).mediaSession.setActionHandler('seekto',       (d: any) => { if (typeof d.seekTime === 'number') self.seek(d.seekTime); });
      (navigator as any).mediaSession.setActionHandler('stop',         () => self.stop());
    } catch {}
  }

  private _installMediaSessionHandlersOnce() {
    // Хэндлеры действий задаются вместе с метаданными при onplay/track-change.
  }
}
