// src/PlayerCore.js
import FavoritesV2 from "../scripts/core/favorites-v2.js";

const W = window;

function safeStr(x) {
  return String(x ?? "").trim();
}

export class PlayerCore {
  constructor({ howler }) {
    this.Howl = howler?.Howl;
    this._howl = null;
    this._loadToken = 0;

    this._playlist = [];
    this._playlistIndex = -1;
    this._currentUid = null;

    this._events = {
      trackChanged: new Set(),
      favoritesChanged: new Set(),
      playlistChanged: new Set(),
      stateChanged: new Set(),
    };

    // v2 migration once
    FavoritesV2.ensureMigrated();

    // Expose
    W.playerCore = this;
  }

  // Events
  onTrackChanged(fn) { this._events.trackChanged.add(fn); return () => this._events.trackChanged.delete(fn); }
  onFavoritesChanged(fn) { this._events.favoritesChanged.add(fn); return () => this._events.favoritesChanged.delete(fn); }
  onPlaylistChanged(fn) { this._events.playlistChanged.add(fn); return () => this._events.playlistChanged.delete(fn); }
  onStateChanged(fn) { this._events.stateChanged.add(fn); return () => this._events.stateChanged.delete(fn); }

  _emit(name, payload) {
    for (const fn of this._events[name] || []) {
      try { fn(payload); } catch (e) { console.error(`[PlayerCore] ${name} handler failed`, e); }
    }
  }
  // ---------------------------
  // Legacy event API (PlayerUI expects pc.on({...}))
  // ---------------------------
  on(handlers = {}) {
    // We don't return unsubscribe aggregate for simplicity (old code doesn't rely on it strictly).
    const h = handlers && typeof handlers === 'object' ? handlers : {};

    if (typeof h.onTrackChange === 'function') {
      this.onTrackChanged(() => {
        try { h.onTrackChange(this.getCurrentTrack(), this.getIndex()); } catch {}
      });
    }

    if (typeof h.onPlay === 'function') {
      this.onStateChanged((s) => { if (s?.playing === true) { try { h.onPlay(); } catch {} } });
    }
    if (typeof h.onPause === 'function') {
      this.onStateChanged((s) => { if (s?.playing === false && !s?.stopped) { try { h.onPause(); } catch {} } });
    }
    if (typeof h.onStop === 'function') {
      this.onStateChanged((s) => { if (s?.stopped) { try { h.onStop(); } catch {} } });
    }

    // onEnd в текущей архитектуре приходит через next({reason:'end'}) => можно не эмулировать точно,
    // но оставим хук когда reason=end
    if (typeof h.onEnd === 'function') {
      this.onTrackChanged((p) => {
        if (p?.meta?.reason === 'end') { try { h.onEnd(); } catch {} }
      });
    }

    if (typeof h.onTick === 'function') {
      // tick loop (cheap)
      if (!this.__tickTimer) {
        this.__tickTimer = setInterval(() => {
          try {
            const pos = this.getPosition?.() || 0;
            const dur = this.getDuration?.() || 0;
            this._emit('tick', { pos, dur });
          } catch {}
        }, 250);
      }

      this.onStateChanged(() => {}); // keep alive
      this._events.tick = this._events.tick || new Set();
      this._events.tick.add(({ pos, dur }) => { try { h.onTick(pos, dur); } catch {} });
    }
  }

  _emitLegacyTrackChange(track, index) {
    // Used by setPlaylist/play/next/prev when we must notify PlayerUI immediately
    try {
      // notify handler bound via pc.on({ onTrackChange })
      // our bridge calls onTrackChanged => which calls handler again; but that is acceptable.
      this._emit('trackChanged', { uid: safeStr(track?.uid) || null, meta: {} });
    } catch {}
  }

  // Favorites v2
  isFavorite(uid) {
    const u = safeStr(uid);
    if (!u) return false;
    const set = FavoritesV2.readLikedSet();
    return set.has(u);
  }
  getLikedUidsForAlbum(albumKey) {
    const a = safeStr(albumKey);
    if (!a) return [];
    try {
      const raw = localStorage.getItem('likedTrackUids:v1');
      const map = raw ? JSON.parse(raw) : {};
      const arr = Array.isArray(map?.[a]) ? map[a] : [];
      return arr.map(safeStr).filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * source:
   *  - album: unlike removes from favorites list completely
   *  - favorites: unlike keeps inactive row
   */
  toggleFavorite(uid, opts = {}) {
    const u = safeStr(uid);
    if (!u) return { liked: false };

    const albumKey = safeStr(opts?.albumKey || '') || null;

    // source inference
    let source = opts?.source;
    if (!source) source = opts?.fromAlbum ? 'album' : 'favorites';

    // страховка: если мы в окне избранного — source всегда favorites
    try {
      const curAlbum = W.AlbumsManager?.getCurrentAlbum?.();
      if (safeStr(curAlbum) === safeStr(W.SPECIAL_FAVORITES_KEY)) source = 'favorites';
    } catch {}

    // --- v1 sync (likedTrackUids:v1) ---
    // Required for PlaybackPolicy + e2e
    const isRegularAlbumKey = (k) => k && !String(k).startsWith('__');
    const readLikedMapV1 = () => {
      try {
        const raw = localStorage.getItem('likedTrackUids:v1');
        const j = raw ? JSON.parse(raw) : {};
        return (j && typeof j === 'object') ? j : {};
      } catch { return {}; }
    };
    const writeLikedMapV1 = (map) => {
      try { localStorage.setItem('likedTrackUids:v1', JSON.stringify(map || {})); } catch {}
    };

    // Determine previous liked via v2
    const prevLiked = this.isFavorite(u);
    const nextLiked = !prevLiked;

    // If we know albumKey and it is regular, update v1 map
    if (isRegularAlbumKey(albumKey)) {
      const map = readLikedMapV1();
      const arr = Array.isArray(map[albumKey]) ? map[albumKey].map(safeStr).filter(Boolean) : [];
      const set = new Set(arr);

      if (nextLiked) set.add(u);
      else set.delete(u);

      const nextArr = Array.from(set);
      if (nextArr.length) map[albumKey] = nextArr;
      else delete map[albumKey];

      writeLikedMapV1(map);
    }

    // --- v2 toggle (refs + liked) ---
    const result = FavoritesV2.toggle(u, { source });

    // Если сняли лайк с текущего трека в favorites-playing, делаем корректный переход/stop
    this._handleUnlikeCurrentInFavoritesPlayback(u);

    // Emit with albumKey for existing UI sync
    this._emit('favoritesChanged', { uid: u, albumKey: albumKey || '', liked: result.liked });

    return { liked: result.liked };
  }

  removeFavoriteRef(uid) {
    const u = safeStr(uid);
    if (!u) return false;
    const ok = FavoritesV2.removeRef(u);
    if (ok) this._emit("favoritesChanged", { uid: u, refRemoved: true });
    return ok;
  }

  getFavoritesV2Snapshot() {
    const liked = FavoritesV2.readLikedSet();
    const refs = FavoritesV2.readRefsByUid();
    return { liked, refs };
  }

  _handleUnlikeCurrentInFavoritesPlayback(unlikedUid) {
    try {
      const playingAlbum = W.AlbumsManager?.getPlayingAlbum?.();
      if (safeStr(playingAlbum) !== safeStr(W.SPECIAL_FAVORITES_KEY)) return;

      const curUid = safeStr(this._currentUid);
      const u = safeStr(unlikedUid);
      if (!curUid || curUid !== u) return;

      // If still liked - nothing to do
      if (this.isFavorite(u)) return;

      const liked = FavoritesV2.readLikedSet();
      if (liked.size === 0) {
        // единственный разрешённый STOP от избранного
        this.stop({ reason: "favorites-empty" });
        return;
      }

      // ВАЖНО: НЕ дергаем UI ensureFavoritesPlayback() и НЕ запускаем playFirstActiveFavorite().
      // Просто переходим next в текущем playlist (а UI пусть пересоберет список при необходимости).
      this.next({ reason: "favorite-unliked" });
    } catch (e) {
      console.warn("[PlayerCore] _handleUnlikeCurrentInFavoritesPlayback failed", e);
    }
  }

  // Playlist
  // Back-compat: UI ожидает массив
  getPlaylistSnapshot() {
    return Array.isArray(this._playlist) ? this._playlist.slice() : [];
  }

  /**
   * Back-compat signature:
   * setPlaylist(items, startIndex, meta, options)
   */
  setPlaylist(items, startIndex = 0, meta = {}, options = {}) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    this._playlist = list;

    const idx = Number.isFinite(startIndex) ? Math.max(0, Math.min(list.length - 1, startIndex)) : 0;
    this._playlistIndex = list.length ? idx : -1;

    const cur = (this._playlistIndex >= 0) ? this._playlist[this._playlistIndex] : null;
    this._currentUid = safeStr(cur?.uid) || null;

    // meta/originalPlaylist back-compat used by PlaybackPolicy
    // preserveOriginalPlaylist: keep originalPlaylist if provided by caller logic
    const preserveOrig = !!options?.preserveOriginalPlaylist;
    if (!preserveOrig) {
      this.originalPlaylist = list.slice();
    }

    // Emit legacy events for PlayerUI which uses pc.on({ onTrackChange })
    try {
      this._emitLegacyTrackChange(cur, this._playlistIndex);
    } catch {}

    // Keep newer events too (if somebody uses onTrackChanged)
    this._emit('playlistChanged', { meta });
    this._emit('trackChanged', { uid: this._currentUid, meta });
  }
    this._currentUid = safeStr(this._playlist[idx]?.uid) || null;

    this._emit("playlistChanged", { meta, snapshot: this.getPlaylistSnapshot() });
    this._emit("trackChanged", { uid: this._currentUid, meta });
  }

  getCurrentTrack() {
    if (this._playlistIndex < 0) return null;
    return this._playlist[this._playlistIndex] || null;
  }

  getCurrentUid() {
    return this._currentUid;
  }
  // ---------------------------
  // Back-compat getters used by PlayerUI/PlaybackCache/PlaybackPolicy
  // ---------------------------
  getIndex() {
    return Number.isFinite(this._playlistIndex) ? this._playlistIndex : -1;
  }

  getNextIndex() {
    if (!this._playlist.length || this._playlistIndex < 0) return -1;
    return (this._playlistIndex + 1) % this._playlist.length;
  }

  isPlaying() {
    try { return !!this._howl?.playing?.(); } catch { return false; }
  }

  getPosition() {
    try { return Number(this._howl?.seek?.() || 0) || 0; } catch { return 0; }
  }

  getDuration() {
    try { return Number(this._howl?.duration?.() || 0) || 0; } catch { return 0; }
  }

  seek(sec) {
    const s = Number(sec);
    if (!Number.isFinite(s) || s < 0) return;
    try { this._howl?.seek?.(s); } catch {}
  }

  setVolume(v) {
    const n = Math.max(0, Math.min(100, Number(v) || 0));
    try { this._howl?.volume?.(n / 100); } catch {}
    try { localStorage.setItem('playerVolume', String(n)); } catch {}
  }

  getVolume() {
    try {
      const v = this._howl?.volume?.();
      if (typeof v === 'number') return Math.round(v * 100);
    } catch {}
    const raw = localStorage.getItem('playerVolume');
    const n = parseInt(String(raw || '100'), 10);
    return Number.isFinite(n) ? n : 100;
  }

  setMuted(on) {
    try { this._howl?.mute?.(!!on); } catch {}
  }

  // Playback
  async play(sel = null, meta = {}) {
    // Back-compat:
    // - play(index:number)
    // - play(uid:string)
    if (typeof sel === 'number' && Number.isFinite(sel)) {
      const idx = Math.max(0, Math.min(this._playlist.length - 1, sel));
      if (this._playlist.length) {
        this._playlistIndex = idx;
        const t = this._playlist[idx] || null;
        this._currentUid = safeStr(t?.uid) || null;
      }
    } else if (sel) {
      const u = safeStr(sel);
      const idx = this._playlist.findIndex((t) => safeStr(t?.uid) === u);
      if (idx >= 0) {
        this._playlistIndex = idx;
        this._currentUid = u;
      }
    }

    const track = this.getCurrentTrack();
    if (!track) return;

    // Notify UI
    this._emit('trackChanged', { uid: this._currentUid, meta });

    await this._loadAndPlay(track, meta);
  }

  async _loadAndPlay(track, meta = {}) {
    const token = ++this._loadToken;

    // hard-stop old howl
    if (this._howl) {
      try { this._howl.stop(); } catch {}
      try { this._howl.unload(); } catch {}
      this._howl = null;
    }

    const src = track?.audio || track?.src;
    if (!src || !this.Howl) return;

    const howl = new this.Howl({
      src: [src],
      html5: true,
      preload: true,
    });

    this._howl = howl;

    howl.once("end", () => {
      if (token !== this._loadToken) return;
      this.next({ reason: "end" });
    });

    howl.once("loaderror", (_, err) => {
      if (token !== this._loadToken) return;
      console.error("[PlayerCore] loaderror", err);
      this._emit("stateChanged", { error: "loaderror", meta });
    });

    howl.once("playerror", (_, err) => {
      if (token !== this._loadToken) return;
      console.error("[PlayerCore] playerror", err);
      try {
        howl.once("unlock", () => {
          if (token !== this._loadToken) return;
          howl.play();
        });
      } catch {}
    });

    if (token !== this._loadToken) return;
    howl.play();
    this._emit("stateChanged", { playing: true, uid: safeStr(track.uid), meta });
  }

  pause(meta = {}) {
    if (!this._howl) return;
    try { this._howl.pause(); } catch {}
    this._emit("stateChanged", { playing: false, meta });
  }

  stop(meta = {}) {
    if (this._howl) {
      try { this._howl.stop(); } catch {}
    }
    this._emit("stateChanged", { playing: false, stopped: true, meta });
  }

  next(meta = {}) {
    if (!this._playlist.length) return;
    const n = this._playlist.length;
    if (this._playlistIndex < 0) this._playlistIndex = 0;
    else this._playlistIndex = (this._playlistIndex + 1) % n;

    this._currentUid = safeStr(this._playlist[this._playlistIndex]?.uid) || null;
    this._emit("trackChanged", { uid: this._currentUid, meta });
    this.play(this._currentUid, meta);
  }

  prev(meta = {}) {
    if (!this._playlist.length) return;
    const n = this._playlist.length;
    if (this._playlistIndex < 0) this._playlistIndex = 0;
    else this._playlistIndex = (this._playlistIndex - 1 + n) % n;

    this._currentUid = safeStr(this._playlist[this._playlistIndex]?.uid) || null;
    this._emit("trackChanged", { uid: this._currentUid, meta });
    this.play(this._currentUid, meta);
  }
}

// Авто-инициализация экземпляра (как было в старой архитектуре):
// UI/AlbumsManager/PlaybackPolicy ожидают window.playerCore сразу после загрузки /src/PlayerCore.js
try {
  if (!window.playerCore) {
    // howler adapter: in this project Howl is global (CDN)
    const howler = { Howl: window.Howl };
    window.playerCore = new PlayerCore({ howler });
  }
} catch (e) {
  console.error('❌ PlayerCore init failed:', e);
}

export default PlayerCore;

