// scripts/core/player-core.js
// Single-source PlayerCore (Howler) + FavoritesStore(app_favorites_v2)
// Инвариант: STOP только по stop(), sleep timer, и спец-случай избранного.

import { TrackRegistry } from './track-registry.js';
import { FavoritesStore } from './favorites-store.js';
import { shuffleArray } from './utils.js';

const LS = {
  VOL: 'playerVolume',
};

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const s = (v) => String(v ?? '').trim();
const uidOf = (t) => s(t?.uid) || null;

function dispatch(name, detail) {
  try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
}

export const PlayerCore = {
  sound: null,

  playlist: [],
  originalPlaylist: [],
  currentIndex: -1,

  isShuffleOn: false,
  repeatMode: false, // false | 'all' | 'one'
  shuffleHistory: [],

  // favorites-only mode (F) applies to PLAYING playlist (not UI list)
  favoritesOnlyMode: false,

  volume: 100,
  muted: false,

  _tickId: null,
  _tickMs: 250,

  _cbs: {
    onTrackChange: [],
    onPlay: [],
    onPause: [],
    onStop: [],
    onEnd: [],
    onTick: [],
  },

  initialize() {
    FavoritesStore.init();

    const v = Number(localStorage.getItem(LS.VOL));
    this.volume = Number.isFinite(v) ? clamp(v, 0, 100) : 100;

    this._bindFavoritesStorageEvents();
  },

  // ---------- events ----------
  on(map) {
    Object.keys(map || {}).forEach((k) => {
      if (Array.isArray(this._cbs[k])) this._cbs[k].push(map[k]);
    });
  },

  _emit(evt, ...args) {
    (this._cbs[evt] || []).forEach((fn) => { try { fn(...args); } catch {} });
  },

  _bindFavoritesStorageEvents() {
    // FavoritesStore emits CustomEvent('favorites:updated') on save()
    window.addEventListener('favorites:updated', () => {
      const cur = this.getCurrentTrack();
      if (cur) {
        dispatch('player:favorites-changed', { uid: cur.uid });
      }
    });
  },

  // ---------- favorites ----------
  isFavorite(uid) {
    return FavoritesStore.isLiked(uid);
  },

  /**
   * opts:
   * - fromAlbum: boolean
   * - albumKey: string (optional)
   */
  toggleFavorite(uid, opts = {}) {
    const u = s(uid);
    if (!u) return { ok: false, reason: 'noUid' };

    const inFavoritesView = (s(window.AlbumsManager?.getCurrentAlbum?.()) === '__favorites__');
    const fromAlbum = inFavoritesView ? false : !!opts.fromAlbum;

    const wasLiked = FavoritesStore.isLiked(u);

    if (wasLiked) {
      if (fromAlbum) FavoritesStore.unlikeInAlbum(u);
      else FavoritesStore.unlikeInFavorites(u);
    } else {
      FavoritesStore.like(u);
    }

    const liked = FavoritesStore.isLiked(u);

    dispatch('player:favorites-changed', {
      uid: u,
      liked,
      fromAlbum,
      albumKey: s(opts.albumKey) || null
    });

    // Спец-правило: unlike текущего трека в favorites view:
    // - если он единственный active => STOP (единственный разрешённый сценарий)
    // - иначе => next()
    if (inFavoritesView && wasLiked && !liked) {
      this._handleUnlikeCurrentInFavoritesView(u);
    }

    return { ok: true, uid: u, liked };
  },

  _handleUnlikeCurrentInFavoritesView(uid) {
    const playingAlbum = s(window.AlbumsManager?.getPlayingAlbum?.());
    if (playingAlbum !== '__favorites__') return;

    const cur = this.getCurrentTrack();
    if (!cur || uidOf(cur) !== uid) return;

    const playable = FavoritesStore.getPlayableUIDs();
    if (playable.length === 0) {
      this.stop(); // разрешённый STOP
      return;
    }

    // иначе переключаемся
    this.next();
  },

  // ---------- playlist ----------
  setPlaylist(uidsOrTracks, startIndexOrUid = 0) {
    const tracks = Array.isArray(uidsOrTracks)
      ? (typeof uidsOrTracks[0] === 'string'
        ? uidsOrTracks.map((uid) => TrackRegistry.getTrack(uid)).filter(Boolean)
        : uidsOrTracks)
      : [];

    this.originalPlaylist = tracks.slice();

    // normalize playlist items
    this._rebuildAvailablePlaylist();

    if (typeof startIndexOrUid === 'string') {
      const idx = this.playlist.findIndex((t) => uidOf(t) === s(startIndexOrUid));
      this.currentIndex = idx >= 0 ? idx : 0;
    } else {
      const idx = Number(startIndexOrUid);
      this.currentIndex = Number.isFinite(idx) ? clamp(idx, 0, Math.max(0, this.playlist.length - 1)) : 0;
    }
  },

  getPlaylistSnapshot() {
    return this.playlist.slice();
  },

  getCurrentTrack() {
    if (this.currentIndex < 0 || this.currentIndex >= this.playlist.length) return null;
    return this.playlist[this.currentIndex] || null;
  },

  getIndex() {
    return this.currentIndex;
  },

  // ---------- favorites-only (F) ----------
  /**
   * ВАЖНО: F нельзя включить, если нет ни одного ⭐ в originalPlaylist.
   * В избранном-album F не трогаем (там и так active-only).
   */
  toggleFavoritesOnly() {
    const playingAlbum = s(window.AlbumsManager?.getPlayingAlbum?.());
    if (playingAlbum === '__favorites__') return false;

    const next = !this.favoritesOnlyMode;

    if (next) {
      const hasAny = this.originalPlaylist.some((t) => {
        const uid = uidOf(t);
        return uid && FavoritesStore.isLiked(uid);
      });

      if (!hasAny) {
        window.NotificationSystem?.info?.('Отметьте понравившийся трек ⭐');
        this.favoritesOnlyMode = false;
        this._rebuildAvailablePlaylist();
        return false;
      }
    }

    this.favoritesOnlyMode = next;
    this._rebuildAvailablePlaylist({ keepCurrent: true });

    return this.favoritesOnlyMode;
  },

  _rebuildAvailablePlaylist(opts = {}) {
    const keepCurrent = !!opts.keepCurrent;
    const curUid = keepCurrent ? uidOf(this.getCurrentTrack()) : null;

    let list = this.originalPlaylist.slice();

    // Favorites-only applies only to regular albums
    if (this.favoritesOnlyMode) {
      list = list.filter((t) => {
        const uid = uidOf(t);
        return uid && FavoritesStore.isLiked(uid);
      });
    }

    // Shuffle
    if (this.isShuffleOn) {
      if (curUid) {
        const cur = list.find((t) => uidOf(t) === curUid) || null;
        const others = list.filter((t) => uidOf(t) !== curUid);
        this.playlist = (cur ? [cur] : []).concat(shuffleArray(others));
      } else {
        this.playlist = shuffleArray(list);
      }
    } else {
      this.playlist = list;
    }

    if (curUid) {
      const idx = this.playlist.findIndex((t) => uidOf(t) === curUid);
      if (idx >= 0) this.currentIndex = idx;
    } else if (this.currentIndex >= this.playlist.length) {
      this.currentIndex = this.playlist.length ? 0 : -1;
    }
  },

  // ---------- transport ----------
  async play(indexOrUid = null) {
    let idx = this.currentIndex;

    if (typeof indexOrUid === 'string') {
      const find = this.playlist.findIndex((t) => uidOf(t) === s(indexOrUid));
      if (find >= 0) idx = find;
    } else if (Number.isFinite(indexOrUid)) {
      idx = clamp(Number(indexOrUid), 0, Math.max(0, this.playlist.length - 1));
    }

    if (idx < 0 || idx >= this.playlist.length) return;

    const track = this.playlist[idx];
    const src = track?.audio || track?.urlHi || track?.src || track?.fileHi || track?.file || track?.fileLo;
    if (!src) return;

    // switch track
    if (this.sound) {
      try { this.sound.unload(); } catch {}
      this.sound = null;
    }

    this.currentIndex = idx;

    this.sound = new Howl({
      src: [src],
      html5: true,
      volume: this.volume / 100,
      onplay: () => {
        this._emit('onPlay', track, idx);
        dispatch('player:state', { isPlaying: true });
        this._startTick();
      },
      onpause: () => {
        this._emit('onPause', track, idx);
        dispatch('player:state', { isPlaying: false });
        this._stopTick();
      },
      onend: () => {
        this._emit('onEnd', track, idx);
        this._stopTick();
        this._handleEnd();
      }
    });

    this._emit('onTrackChange', track, idx);
    dispatch('player:track-change', { uid: uidOf(track), index: idx });

    try { this.sound.play(); } catch {}
  },

  pause() {
    if (!this.sound) return;
    try { this.sound.pause(); } catch {}
  },

  stop() {
    // ЯВНЫЙ STOP — единственный истинный stop, кроме sleep и спец-правила избранного
    if (this.sound) {
      try { this.sound.stop(); } catch {}
      try { this.sound.unload(); } catch {}
      this.sound = null;
    }
    this._stopTick();
    this._emit('onStop', this.getCurrentTrack(), this.currentIndex);
    dispatch('player:state', { isPlaying: false });
  },

  next() {
    const len = this.playlist.length;
    if (!len) return;

    if (this.isShuffleOn) this._pushShuffleHistory();

    const nextIdx = (this.currentIndex + 1) % len;
    this.play(nextIdx);
  },

  prev() {
    const len = this.playlist.length;
    if (!len) return;

    // restart if played >3s
    if (this.getPosition() > 3) {
      this.seek(0);
      return;
    }

    if (this.isShuffleOn) {
      const back = this._popShuffleHistory();
      if (Number.isFinite(back) && back >= 0) return void this.play(back);
    }

    const prevIdx = (this.currentIndex - 1 + len) % len;
    this.play(prevIdx);
  },

  _handleEnd() {
    if (this.repeatMode === 'one') {
      this.play(this.currentIndex);
      return;
    }
    if (this.repeatMode === 'all') {
      this.next();
      return;
    }
    // ВАЖНО: НЕ останавливаемся “тихо”. По инварианту нельзя “само выключилось”.
    // Поэтому делаем циклично как next().
    this.next();
  },

  // ---------- shuffle/repeat ----------
  toggleShuffle() {
    this.isShuffleOn = !this.isShuffleOn;
    this.shuffleHistory = [];
    this._rebuildAvailablePlaylist({ keepCurrent: true });
    return this.isShuffleOn;
  },

  toggleRepeat() {
    // false -> all -> one -> false
    if (!this.repeatMode) this.repeatMode = 'all';
    else if (this.repeatMode === 'all') this.repeatMode = 'one';
    else this.repeatMode = false;
    return this.repeatMode;
  },

  _pushShuffleHistory() {
    const uid = uidOf(this.getCurrentTrack());
    if (!uid) return;
    const last = this.shuffleHistory.length ? this.shuffleHistory[this.shuffleHistory.length - 1] : null;
    if (last === uid) return;
    this.shuffleHistory.push(uid);
    if (this.shuffleHistory.length > 200) this.shuffleHistory.splice(0, this.shuffleHistory.length - 200);
  },

  _popShuffleHistory() {
    if (!this.shuffleHistory.length) return -1;
    // remove current
    this.shuffleHistory.pop();
    const prevUid = this.shuffleHistory.length ? this.shuffleHistory[this.shuffleHistory.length - 1] : null;
    if (!prevUid) return -1;
    const idx = this.playlist.findIndex((t) => uidOf(t) === prevUid);
    return idx >= 0 ? idx : -1;
  },

  // ---------- seek/time ----------
  seek(secondsOrPct) {
    if (!this.sound) return;

    const dur = this.getDuration();
    const v = Number(secondsOrPct);

    if (!Number.isFinite(v)) return;

    // if passed 0..1 treat as pct
    const sec = (v >= 0 && v <= 1 && dur > 0) ? (dur * v) : v;
    try { this.sound.seek(clamp(sec, 0, dur || sec)); } catch {}
  },

  getPosition() {
    try { return this.sound ? (Number(this.sound.seek()) || 0) : 0; } catch { return 0; }
  },

  getDuration() {
    try { return this.sound ? (Number(this.sound.duration()) || 0) : 0; } catch { return 0; }
  },

  // ---------- volume/mute ----------
  setVolume(v) {
    const n = clamp(Number(v) || 0, 0, 100);
    this.volume = n;
    try { localStorage.setItem(LS.VOL, String(n)); } catch {}
    try { Howler.volume(n / 100); } catch {}
    try { this.sound?.volume?.(n / 100); } catch {}
  },

  getVolume() {
    return this.volume;
  },

  setMuted(on) {
    this.muted = !!on;
    try { Howler.mute(this.muted); } catch {}
  },

  // ---------- tick ----------
  _startTick() {
    this._stopTick();
    this._tickId = setInterval(() => {
      const ct = this.getPosition();
      const dur = this.getDuration();
      this._emit('onTick', ct, dur);
      dispatch('player:timeupdate', { ct, dur });
    }, this._tickMs);
  },

  _stopTick() {
    if (!this._tickId) return;
    clearInterval(this._tickId);
    this._tickId = null;
  }
};

window.playerCore = PlayerCore;
