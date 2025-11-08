// src/PlayerCore.ts
// Ядро работы с треками, повтором, избранным, фоновым режимом и автопереходом для vi3na1bita-music
// Полная замена старой логики audio-контроля. СКРЫВАЕТ от UI любые детали Howler.
// Прерывание только по pause/stop/timer.

export type PlayerTrack = {
  src: string;
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
  lyrics?: string;
};

type PlayerCoreEvents = {
  onPlay?: (track: PlayerTrack, index: number) => void;
  onPause?: (track: PlayerTrack, index: number) => void;
  onStop?: (track: PlayerTrack, index: number) => void;
  onTrackChange?: (track: PlayerTrack, index: number) => void;
  onEnd?: (track: PlayerTrack, index: number) => void;
  // можно расширить onFavorite, onRepeat и т.п.
};

export class PlayerCore {
  private playlist: PlayerTrack[] = [];
  private index: number = 0;
  private howl: Howl | null = null;
  private events: PlayerCoreEvents = {};
  private repeat: boolean = false;
  private shuffle: boolean = false;
  private favoritesOnly: boolean = false;
  private favorites: number[] = [];
  private shuffled: number[] = [];
  private _isDestroyed = false;
  private isPaused = false;

  constructor(events: PlayerCoreEvents = {}) {
    this.events = events;
  }

  setPlaylist(tracks: PlayerTrack[], startIndex = 0) {
    this.stop();
    this.playlist = tracks.slice();
    this.index = Math.max(0, Math.min(tracks.length - 1, startIndex));
    this.syncShuffle();
    this._fire('onTrackChange', this.getCurrentTrack(), this.index);
  }

  setRepeat(repeat: boolean) {
    this.repeat = !!repeat;
  }

  setShuffle(shuffle: boolean) {
    this.shuffle = !!shuffle;
    this.syncShuffle();
  }

  setFavoritesOnly(favOnly: boolean, favList: number[] = []) {
    this.favoritesOnly = !!favOnly;
    this.favorites = Array.isArray(favList) ? favList.slice() : [];
    this.syncShuffle();
  }

  play(index?: number) {
    if (typeof index === 'number') {
      this.index = this.getValidIndex(index);
    }
    if (!this.playlist.length) return;

    this.stopHowl();

    const track = this.getCurrentTrack();
    if (!track) return;

    this.howl = new Howl({
      src: [track.src],
      html5: true,
      onend: () => {
        // ЗАПРЕЩЕНО останавливать музыку КРОМЕ: ручная пауза/стоп/таймер
        if (this.repeat) {
          this.play();
          return;
        }
        if (this.hasAutoNext()) {
          this.next();
        } else {
          // ничего не делаем — стоим на месте (ручная остановка)
        }
        this._fire('onEnd', track, this.index);
      },
      onplay: () => {
        this.isPaused = false;
        this._fire('onPlay', track, this.index);
        this._fire('onTrackChange', track, this.index);
        this.updateMediaSession();
      },
      onpause: () => {
        this.isPaused = true;
        this._fire('onPause', track, this.index);
      },
      onstop: () => {
        this.isPaused = true;
        this._fire('onStop', track, this.index);
      }
    });

    this.howl.play();
  }

  pause() {
    if (this.howl && !this.isPaused) {
      this.howl.pause();
      // isPaused обновит onpause
    }
  }

  stop() {
    this.stopHowl();
    this.isPaused = true;
    this._fire('onStop', this.getCurrentTrack(), this.index);
  }

  next() {
    this.syncShuffle();
    const nextIdx = this.getNextIndex();
    if (nextIdx < 0) return;
    this.index = nextIdx;
    this.play();
  }

  prev() {
    this.syncShuffle();
    const prevIdx = this.getPrevIndex();
    if (prevIdx < 0) return;
    this.index = prevIdx;
    this.play();
  }

  destroy() {
    this.stopHowl();
    this._isDestroyed = true;
    this.playlist = [];
    this.events = {};
  }

  isPlaying() {
    return !!this.howl && !this.isPaused;
  }

  getCurrentTrack() {
    const arr = this.filteredPlaylist();
    if (arr.length === 0) return null;
    const idx = this.getDisplayIndex();
    return arr[idx] || null;
  }

  getCurrentIndex() {
    return this.index;
  }

  on(events: PlayerCoreEvents) {
    this.events = { ...this.events, ...events };
  }

  setEvents(events: PlayerCoreEvents) {
    this.events = { ...events };
  }

  // ===== ВНУТРЕННИЕ ======

  /** Возвращает массив треков по mode (shuffle/favoritesOnly) — только для автонекст и prev/next */
  private filteredPlaylist(): PlayerTrack[] {
    let arr = this.playlist;
    if (this.favoritesOnly && this.favorites && this.favorites.length > 0) {
      arr = this.favorites.map(i => this.playlist[i]).filter(Boolean);
    }
    if (this.shuffle && this.shuffled && this.shuffled.length) {
      arr = this.shuffled.map(i => arr[i]).filter(Boolean);
    }
    return arr;
  }

  private getDisplayIndex(): number {
    // Для простоты: в режиме favoritesOnly/shuffle показываем индекс относительно отфильтрованного массива
    if (this.favoritesOnly && this.favorites && this.favorites.length > 0) {
      return Math.max(0, this.favorites.indexOf(this.index));
    } else if (this.shuffle && this.shuffled && this.shuffled.length) {
      return Math.max(0, this.shuffled.indexOf(this.index));
    } else {
      return Math.max(0, this.index);
    }
  }

  private syncShuffle() {
    if (this.shuffle) {
      const arr = this.favoritesOnly && this.favorites.length
        ? this.favorites.slice()
        : this.playlist.map((_, idx) => idx);
      this.shuffled = this.shuffleArray(arr);
      // Начинаем с текущего трека, если есть
      if (this.index && arr.includes(this.index)) {
        // Переставим current индекс на первое место
        const i = this.shuffled.indexOf(this.index);
        if (i > 0) {
          this.shuffled.splice(i, 1);
          this.shuffled.unshift(this.index);
        }
      }
    } else {
      this.shuffled = [];
    }
  }

  private getNextIndex(): number {
    const arr = this.filteredPlaylist();
    if (!arr.length) return -1;
    const curIdx = this.getDisplayIndex();
    return (curIdx + 1) % arr.length;
  }

  private getPrevIndex(): number {
    const arr = this.filteredPlaylist();
    if (!arr.length) return -1;
    const curIdx = this.getDisplayIndex();
    return ((curIdx - 1 + arr.length) % arr.length);
  }

  private getValidIndex(idx: number): number {
    return Math.max(0, Math.min(this.playlist.length - 1, idx));
  }

  /** Проверка — разрешён ли автопереход (нельзя отменить кнопкой/энерго‑режимом/фоновой сменой вкладки) */
  private hasAutoNext(): boolean {
    // В "молния"/energy saver/music в фоне автопереход всегда разрешён
    return true;
  }

  private stopHowl() {
    if (this.howl) {
      this.howl.stop();
      this.howl.unload();
      this.howl = null;
    }
  }

  private _fire<K extends keyof PlayerCoreEvents>(ev: K, ...args: any[]) {
    if (typeof this.events[ev] === "function") {
      // @ts-ignore
      this.events[ev](...args);
    }
  }

  private shuffleArray(arr: number[]): number[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Обновление MediaSession метаданных (lockscreen/гарнитура/smartwatch).
      Вызывать после play/track change, параметры брать из getCurrentTrack()
  */
  private updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const t = this.getCurrentTrack();
    if (!t) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: t.title,
        artist: t.artist || '',
        album: t.album || '',
        artwork: t.cover ? [
          { src: t.cover, sizes: '512x512', type: 'image/png' }
        ] : []
      });
    } catch {}
    // Handlers — добавлять только 1 раз снаружи или через конструктор!
  }
}
