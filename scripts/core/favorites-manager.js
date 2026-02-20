// scripts/core/favorites-manager.js
// Optimized v2.0
const KEY = '__favorites_v2__';

export class FavoritesManager {
  constructor() {
    this._map = new Map();
    this._subs = new Set();
    this.init();
  }

  init() {
    try { 
      JSON.parse(localStorage.getItem(KEY) || '[]').forEach(i => i?.uid && this._map.set(String(i.uid).trim(), i)); 
    } catch {}
  }

  isLiked(uid) {
    const i = this._map.get(String(uid || '').trim());
    return !!(i && !i.inactiveAt);
  }

  getSnapshot() { 
    return Array.from(this._map.values()); 
  }

  readLikedSet() { 
    return new Set([...this._map.values()].filter(i => !i.inactiveAt).map(i => i.uid)); 
  }

  toggle(uid, { source = 'album', albumKey } = {}) {
    const u = String(uid || '').trim(); 
    if (!u) return false;
    
    const i = this._map.get(u), act = i && !i.inactiveAt;
    let isL = false;

    if (act) {
      source === 'favorites' ? this._map.set(u, { ...i, inactiveAt: Date.now() }) : this._map.delete(u);
    } else {
      this._map.set(u, { uid: u, addedAt: i?.addedAt || Date.now(), albumKey: albumKey || i?.albumKey || null, sourceAlbum: albumKey || i?.albumKey || i?.sourceAlbum || null, inactiveAt: null });
      isL = true;
    }
    
    this._save(); 
    this._notify(u, isL); 
    return isL;
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
    try { localStorage.setItem(KEY, JSON.stringify(Array.from(this._map.values()))); } catch {} 
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
