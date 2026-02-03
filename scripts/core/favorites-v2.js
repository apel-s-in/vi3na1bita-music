/**
 * FAVORITES MANAGER V2 (LOGIC RESTORED)
 * Хранилище: localStorage['__favorites_v2__']
 * Логика:
 * - source='favorites': Soft Delete (ставит inactiveAt). Трек становится серым.
 * - source='album': Hard Delete (удаляет полностью).
 */

const STORAGE_KEY = '__favorites_v2__';

export class FavoritesManagerV2 {
  constructor() {
    this._map = new Map();
    this._listeners = new Set();
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    this.ensureMigrated();
    this.initialized = true;
  }

  ensureMigrated() {
    if (this._map.size > 0) return; 
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        JSON.parse(raw).forEach((item) => {
          if (item && item.uid) {
            this._map.set(String(item.uid).trim(), item);
          }
        });
      }
    } catch (e) {
      console.error('FavoritesV2: Load failed', e);
    }
  }

  // Возвращает только АКТИВНЫЕ (для ⭐ в альбомах)
  readLikedSet() {
    this.ensureMigrated();
    const set = new Set();
    for (const [uid, item] of this._map) {
      if (!item.inactiveAt) set.add(uid);
    }
    return set;
  }

  // Возвращает ВСЕ (для списка Избранного, чтобы показать серые)
  readRefsByUid() {
    this.ensureMigrated();
    return Object.fromEntries(this._map);
  }

  has(uid) {
    return this.readLikedSet().has(String(uid).trim());
  }

  toggle(uid, meta = {}) {
    this.ensureMigrated();
    if (!uid) return { liked: false };
    
    const key = String(uid).trim();
    const item = this._map.get(key);
    const isCurrentlyActive = item && !item.inactiveAt;
    
    const source = meta.source || 'album'; 

    let isLiked = false;

    if (isCurrentlyActive) {
      // Снимаем лайк
      if (source === 'favorites') {
        // Soft delete: оставляем в базе, но ставим inactiveAt (СЕРЫЙ ТРЕК)
        this._map.set(key, { ...item, inactiveAt: Date.now() });
      } else {
        // Hard delete: удаляем полностью (из альбома)
        this._map.delete(key);
      }
      isLiked = false;
    } else {
      // Ставим лайк (или восстанавливаем)
      this._map.set(key, {
        uid: key,
        addedAt: item?.addedAt || Date.now(),
        albumKey: meta.albumKey || item?.albumKey || null,
        inactiveAt: null // Сбрасываем флаг неактивности
      });
      isLiked = true;
    }

    this._save();
    this._notify();
    return { liked: isLiked };
  }

  removeRef(uid) {
    this.ensureMigrated();
    const key = String(uid).trim();
    if (this._map.has(key)) {
      this._map.delete(key);
      this._save();
      this._notify();
      return true;
    }
    return false;
  }

  _save() {
    try {
      const arr = Array.from(this._map.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch {}
  }

  onChange(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _notify() {
    this._listeners.forEach((cb) => { try { cb(); } catch {} });
    if (window.playerCore?.triggerFavoritesUpdate) window.playerCore.triggerFavoritesUpdate();
  }
}

const instance = new FavoritesManagerV2();
instance.init();

export const FavoritesV2 = instance;
export default instance;
