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
      if (raw) JSON.parse(raw).forEach(i => i?.uid && this._map.set(String(i.uid).trim(), i));
    } catch {}
  }

  // API
  isLiked(uid) { 
    const i = this._map.get(String(uid).trim());
    return i && !i.inactiveAt; 
  }

  getSnapshot() { return Array.from(this._map.values()); }

  toggle(uid, { source = 'album', albumKey } = {}) {
    const u = String(uid).trim(); if(!u) return false;
    const item = this._map.get(u);
    const active = item && !item.inactiveAt;
    
    let liked = false;
    if (active) {
      if (source === 'favorites') this._map.set(u, { ...item, inactiveAt: Date.now() }); // Soft
      else this._map.delete(u); // Hard
    } else {
      this._map.set(u, { uid: u, addedAt: item?.addedAt || Date.now(), albumKey: albumKey || item?.albumKey, inactiveAt: null });
      liked = true;
    }
    
    this._save();
    this._notify(u, liked);
    return liked;
  }

  remove(uid) {
    const u = String(uid).trim();
    if(this._map.delete(u)) { this._save(); this._notify(u, false); return true; }
    return false;
  }

  // Helpers
  _save() { localStorage.setItem(KEY, JSON.stringify(Array.from(this._map.values()))); }
  
  subscribe(cb) { this._subs.add(cb); return () => this._subs.delete(cb); }
  _notify(uid, liked) { this._subs.forEach(cb => cb({ uid, liked })); }
}

export const Favorites = new FavoritesManager();
window.FavoritesManager = Favorites; 
