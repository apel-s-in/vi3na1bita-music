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

  // Favorites v2
  isFavorite(uid) {
    const u = safeStr(uid);
    if (!u) return false;
    const set = FavoritesV2.readLikedSet();
    return set.has(u);
  }

  /**
   * source:
   *  - album: unlike removes from favorites list completely
   *  - favorites: unlike keeps inactive row
   */
  toggleFavorite(uid, opts = {}) {
    const u = safeStr(uid);
    if (!u) return { liked: false };

    // detect actual source safely (TZ страховка)
    let source = opts?.source;
    if (!source) {
      const fromAlbum = !!opts?.fromAlbum;
      source = fromAlbum ? "album" : "favorites";
    }

    // страховка: если мы в окне избранного — source всегда favorites
    try {
      const curAlbum = W.AlbumsManager?.getCurrentAlbum?.();
      if (safeStr(curAlbum) === safeStr(W.SPECIAL_FAVORITES_KEY)) source = "favorites";
    } catch {}

    const result = FavoritesV2.toggle(u, { source });

    // Если сняли лайк с текущего трека в favorites-playing, делаем корректный переход/stop
    this._handleUnlikeCurrentInFavoritesPlayback(u);

    this._emit("favoritesChanged", { uid: u, liked: result.liked });
    return result;
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
  getPlaylistSnapshot() {
    return { items: this._playlist.slice(), index: this._playlistIndex, currentUid: this._currentUid };
  }

  setPlaylist(items, startUid = null, meta = {}) {
    this._playlist = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!this._playlist.length) {
      this._playlistIndex = -1;
      this._currentUid = null;
      this._emit("playlistChanged", { meta, snapshot: this.getPlaylistSnapshot() });
      this._emit("trackChanged", { uid: null, meta });
      return;
    }

    let idx = 0;
    if (startUid) {
      const u = safeStr(startUid);
      const found = this._playlist.findIndex((t) => safeStr(t?.uid) === u);
      if (found >= 0) idx = found;
    }
    this._playlistIndex = idx;
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

  // Playback
  async play(uid = null, meta = {}) {
    if (uid) {
      const u = safeStr(uid);
      const idx = this._playlist.findIndex((t) => safeStr(t?.uid) === u);
      if (idx >= 0) {
        this._playlistIndex = idx;
        this._currentUid = u;
        this._emit("trackChanged", { uid: u, meta });
      }
    }

    const track = this.getCurrentTrack();
    if (!track) return;

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

