import { favoriteStatus, normalizeFavoriteItem, normalizeFavoriteList } from '../analytics/favorite-state-contract.js';
const KEY = '__favorites_v2__';
const uidOf = value => String(value || '').trim();
export class FavoritesManager {
  constructor() {
    this._m = new Map();
    this._s = new Set();
    try {
      const rows = JSON.parse(localStorage.getItem(KEY) || '[]');
      normalizeFavoriteList(rows).forEach(item => this._m.set(item.uid, item));
    } catch {}
  }
  isLiked(uid) {
    const item = this._m.get(uidOf(uid));
    return !!item && favoriteStatus(item) === 'active';
  }
  getSnapshot() {
    return [...this._m.values()];
  }
  getItem(uid) {
    return this._m.get(uidOf(uid)) || null;
  }
  replaceSnapshot(rows, { reason = 'snapshot_replace' } = {}) {
    this._m = new Map(normalizeFavoriteList(rows).map(item => [item.uid, item]));
    this._save();
    try {
      window.dispatchEvent(new CustomEvent('favorites:snapshot-applied', { detail: { reason, count: this._m.size } }));
    } catch {}
    return this.getSnapshot();
  }
  readLikedSet() {
    return new Set([...this._m.values()].filter(item => favoriteStatus(item) === 'active').map(item => item.uid));
  }
  _save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.getSnapshot()));
    } catch {}
  }
  _emit(detail) {
    this._s.forEach(callback => {
      try {
        callback(detail);
      } catch {}
    });
  }
  toggle(uid, { source = 'album', albumKey } = {}) {
    const cleanUid = uidOf(uid);
    if (!cleanUid) return false;
    const old = this._m.get(cleanUid);
    const active = favoriteStatus(old) === 'active';
    const at = Date.now();
    const liked = !active;
    const next = active
      ? normalizeFavoriteItem({ ...old, uid: cleanUid, status: source === 'favorites' ? 'inactive' : 'deleted', updatedAt: at, inactiveAt: source === 'favorites' ? at : 0, deletedAt: source === 'favorites' ? 0 : at })
      : normalizeFavoriteItem({ ...old, uid: cleanUid, status: 'active', addedAt: old?.addedAt || at, updatedAt: at, sourceAlbum: albumKey || old?.sourceAlbum || old?.albumKey || null, albumKey: albumKey || old?.albumKey || old?.sourceAlbum || null, inactiveAt: 0, deletedAt: 0 });
    this._m.set(cleanUid, next);
    this._save();
    try {
      window.eventLogger?.log?.('FAVORITE_CHANGED', cleanUid, { liked, source, albumKey: albumKey || old?.albumKey || old?.sourceAlbum || null, inactive: !liked && source === 'favorites', deleted: !liked && source !== 'favorites' });
      window.dispatchEvent(new CustomEvent('backup:domain-dirty', { detail: { domain: 'favorites' } }));
    } catch {}
    this._emit({ uid: cleanUid, liked });
    return liked;
  }
  remove(uid) {
    const cleanUid = uidOf(uid);
    const old = this._m.get(cleanUid);
    if (!cleanUid || !old) return false;
    const at = Date.now();
    this._m.set(cleanUid, normalizeFavoriteItem({ ...old, uid: cleanUid, status: 'deleted', inactiveAt: 0, deletedAt: at, updatedAt: at }));
    this._save();
    this._emit({ uid: cleanUid, liked: false, removed: true });
    try {
      window.dispatchEvent(new CustomEvent('backup:domain-dirty', { detail: { domain: 'favorites' } }));
    } catch {}
    return true;
  }
  purge(uid) {
    const cleanUid = uidOf(uid);
    if (!cleanUid || !this._m.delete(cleanUid)) {
      return false;
    }
    this._save();
    this._emit({ uid: cleanUid, liked: false, purged: true });
    try {
      window.dispatchEvent(new CustomEvent('backup:domain-dirty', { detail: { domain: 'favorites' } }));
    } catch {}
    return true;
  }
  subscribe(callback) {
    this._s.add(callback);
    return () => this._s.delete(callback);
  }
}
export const Favorites = new FavoritesManager();
window.FavoritesManager = Favorites;
