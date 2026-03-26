// UID.001_(Playback safety invariant)_(не допустить побочных stop/reset сценариев)_(FavoritesManager хранит truth о лайках, но не управляет playback напрямую) UID.002_(UID-first core)_(оставить избранное строго uid-based)_(никаких filename/title/index ключей, только uid) UID.017_(Launch source stats)_(подготовить future аналитику источников лайка/анлайка)_(в будущем действия favorites могут логироваться как source-aware events) UID.051_(Collection state)_(связать избранное с collectible-слоем)_(favorite badge и completion будут выводиться поверх этого truth-слоя) UID.052_(Track badges and completion)_(дать stable source для favorite-badge)_(listener collection/intel не должны дублировать favorite truth) UID.062_(Recommendation memory and feedback)_(использовать избранное как сильный preference signal)_(listener/recs слой должен читать snapshot отсюда, не хранить дубликат truth) UID.094_(No-paralysis rule)_(оставить избранное независимым от intel-слоя)_(если intel/recs/providers отключены, favorites работают как раньше)
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
