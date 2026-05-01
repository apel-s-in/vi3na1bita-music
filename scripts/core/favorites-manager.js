// UID.001_(Playback safety invariant)_(не допустить побочных stop/reset сценариев)_(FavoritesManager хранит truth о лайках, но не управляет playback напрямую)
// UID.002_(UID-first core)_(избранное строго uid-based)_(никаких filename/title/index ключей)
// UID.003_(Event log truth)_(favorite tombstones для merge/restore)_(удаление сохраняет историю, но не участвует в playback)
// UID.099_(Multi-device sync model)_(удаления избранного merge-safe)_(deletedAt не даёт старому backup воскресить трек)

const KEY = '__favorites_v2__';
const sUid = v => String(v || '').trim();

export class FavoritesManager {
  constructor() {
    this._m = new Map(); this._s = new Set();
    try { JSON.parse(localStorage.getItem(KEY) || '[]').forEach(i => i?.uid && this._m.set(sUid(i.uid), i)); } catch {}
  }
  isLiked(uid) { const i = this._m.get(sUid(uid)); return !!(i && !i.inactiveAt && !i.deletedAt); }
  getSnapshot() { return Array.from(this._m.values()); }
  readLikedSet() { return new Set([...this._m.values()].filter(i => !i.inactiveAt && !i.deletedAt).map(i => i.uid)); }
  _save() { try { localStorage.setItem(KEY, JSON.stringify(Array.from(this._m.values()))); } catch {} }
  _emit(d) { this._s.forEach(cb => { try { cb(d); } catch {} }); }
  toggle(uid, { source: s = 'album', albumKey: aK } = {}) {
    const u = sUid(uid); if (!u) return false;
    const i = this._m.get(u), act = i && !i.inactiveAt && !i.deletedAt, now = Date.now(); let L = false;
    if (act) {
      s === 'favorites'
        ? this._m.set(u, { ...i, uid: u, inactiveAt: now, deletedAt: 0, updatedAt: now })
        : this._m.set(u, { ...i, uid: u, inactiveAt: 0, deletedAt: now, updatedAt: now });
    } else {
      this._m.set(u, { uid: u, addedAt: i?.addedAt || now, updatedAt: now, albumKey: aK || i?.albumKey || null, sourceAlbum: aK || i?.albumKey || i?.sourceAlbum || null, inactiveAt: 0, deletedAt: 0 });
      L = true;
    }
    this._save();
    try { window.eventLogger?.log?.('FAVORITE_CHANGED', u, { liked: L, source: s, albumKey: aK || i?.albumKey || i?.sourceAlbum || null, inactive: !!(!L && s === 'favorites'), deleted: !!(!L && s !== 'favorites') }); } catch {}
    try { window.dispatchEvent(new CustomEvent('backup:domain-dirty',{detail:{domain:'favorites'}})); } catch {}
    this._emit({ uid: u, liked: L });
    return L;
  }
  remove(uid) {
    const u = sUid(uid), i = this._m.get(u); if (!u || !i) return false;
    const now = Date.now();
    this._m.set(u, { ...i, uid: u, inactiveAt: 0, deletedAt: now, updatedAt: now });
    this._save(); this._emit({ uid: u, liked: false, removed: true });
    try { window.dispatchEvent(new CustomEvent('backup:domain-dirty',{detail:{domain:'favorites'}})); } catch {}
    return true;
  }
  purge(uid) {
    const u = sUid(uid); if (!u || !this._m.delete(u)) return false;
    this._save(); this._emit({ uid: u, liked: false, purged: true });
    try { window.dispatchEvent(new CustomEvent('backup:domain-dirty',{detail:{domain:'favorites'}})); } catch {}
    return true;
  }
  subscribe(cb) { this._s.add(cb); return () => this._s.delete(cb); }
}
export const Favorites = new FavoritesManager(); window.FavoritesManager = Favorites;
