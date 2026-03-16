const KEY = '__favorites_v2__';
export class FavoritesManager {
  constructor() { this._m = new Map(); this._s = new Set(); try { JSON.parse(localStorage.getItem(KEY) || '[]').forEach(i => i?.uid && this._m.set(String(i.uid).trim(), i)); } catch {} }
  isLiked(uid) { const i = this._m.get(String(uid || '').trim()); return !!(i && !i.inactiveAt); }
  getSnapshot() { return Array.from(this._m.values()); }
  readLikedSet() { return new Set([...this._m.values()].filter(i => !i.inactiveAt).map(i => i.uid)); }
  toggle(uid, { source: s = 'album', albumKey: aK } = {}) {
    const u = String(uid || '').trim(); if (!u) return false;
    const i = this._m.get(u), act = i && !i.inactiveAt; let L = false;
    if (act) s === 'favorites' ? this._m.set(u, { ...i, inactiveAt: Date.now() }) : this._m.delete(u);
    else { this._m.set(u, { uid: u, addedAt: i?.addedAt || Date.now(), albumKey: aK || i?.albumKey || null, sourceAlbum: aK || i?.albumKey || i?.sourceAlbum || null, inactiveAt: null }); L = true; }
    try { localStorage.setItem(KEY, JSON.stringify(Array.from(this._m.values()))); } catch {}
    this._s.forEach(cb => { try { cb({ uid: u, liked: L }); } catch {} }); return L;
  }
  remove(uid) { const u = String(uid).trim(); if (this._m.delete(u)) { try { localStorage.setItem(KEY, JSON.stringify(Array.from(this._m.values()))); } catch {} this._s.forEach(cb => { try { cb({ uid: u, liked: false }); } catch {} }); return true; } return false; }
  subscribe(cb) { this._s.add(cb); return () => this._s.delete(cb); }
}
export const Favorites = new FavoritesManager(); window.FavoritesManager = Favorites;
