// scripts/core/favorites-manager.js
const KEY = '__favorites_v2__';

export class FavoritesManager {
  constructor() {
    this._map = new Map();
    this._subs = new Set();
    this.init();
  }

  init() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        JSON.parse(raw).forEach(i => {
          if (i && i.uid) this._map.set(String(i.uid).trim(), i);
        });
      }
    } catch (e) {
      console.error('Favorites init error:', e);
    }
  }

  isLiked(uid) {
    const u = String(uid || '').trim();
    if (!u) return false;
    const item = this._map.get(u);
    return item && !item.inactiveAt;
  }

  getSnapshot() {
    return Array.from(this._map.values());
  }

  // Возвращает Set активных UID (для совместимости)
  readLikedSet() {
    const set = new Set();
    for (const [uid, item] of this._map) {
      if (!item.inactiveAt) set.add(uid);
    }
    return set;
  }

  toggle(uid, { source = 'album', albumKey } = {}) {
    const u = String(uid || '').trim();
    if (!u) return false;

    const item = this._map.get(u);
    const isActive = item && !item.inactiveAt;
    
    let isNowLiked = false;

    if (isActive) {
      if (source === 'favorites') {
        // Soft Delete (серый трек)
        this._map.set(u, { ...item, inactiveAt: Date.now() });
      } else {
        // Hard Delete
        this._map.delete(u);
      }
      isNowLiked = false;
    } else {
      // Restore / Add
      this._map.set(u, {
        uid: u,
        addedAt: item?.addedAt || Date.now(),
        albumKey: albumKey || item?.albumKey || null,
        inactiveAt: null
      });
      isNowLiked = true;
    }
    
    this._save();
    this._notify(u, isNowLiked);
    return isNowLiked;
  }

  remove(uid) {
    const u = String(uid).trim();
    if (this._map.delete(u)) {
      this._save();
      this._notify(u, false);
      return true;
    }
    return false;
  }

  _save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(Array.from(this._map.values())));
    } catch {}
  }
  
  subscribe(cb) {
    this._subs.add(cb);
    return () => this._subs.delete(cb);
  }

  _notify(uid, liked) {
    this._subs.forEach(cb => { try { cb({ uid, liked }); } catch {} });
  }
}

export const Favorites = new FavoritesManager();
window.FavoritesManager = Favorites;
