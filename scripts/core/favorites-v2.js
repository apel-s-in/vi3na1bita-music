/**
 * FAVORITES MANAGER V2 (LOGIC FIX)
 * Хранилище: localStorage['__favorites_v2__']
 * Логика:
 * - readLikedSet: возвращает только АКТИВНЫЕ (для плеера/звездочек)
 * - getEntries: возвращает ВСЕ (активные + неактивные для списка)
 * - toggle: при source='favorites' делает soft delete (inactiveAt)
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
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => {
            if (item && item.uid) {
              this._map.set(String(item.uid).trim(), item);
            }
          });
        }
      }
    } catch (e) {
      console.error('FavoritesV2: Load failed', e);
    }
  }

  /**
   * Возвращает Set только с ID активных (лайкнутых) треков.
   * Неактивные (серые) сюда НЕ попадают.
   */
  readLikedSet() {
    this.ensureMigrated();
    const set = new Set();
    for (const [uid, item] of this._map) {
      if (!item.inactiveAt) {
        set.add(uid);
      }
    }
    return set;
  }

  /**
   * Возвращает полную карту данных (для построения списка UI).
   */
  readRefsByUid() {
    this.ensureMigrated();
    return Object.fromEntries(this._map);
  }

  /**
   * Возвращает список всех записей (активных и неактивных)
   */
  getEntries() {
    this.ensureMigrated();
    return Array.from(this._map.values()).sort((a, b) => b.addedAt - a.addedAt);
  }

  has(uid) {
    // Проверка "лайкнут ли трек" (активен ли)
    return this.readLikedSet().has(String(uid).trim());
  }

  toggle(uid, meta = {}) {
    this.ensureMigrated();
    if (!uid) return { liked: false };
    
    const key = String(uid).trim();
    const item = this._map.get(key);
    const isCurrentlyActive = item && !item.inactiveAt;
    
    const source = meta.source || 'album'; // 'album' (hard) или 'favorites' (soft)

    let isLiked = false;

    if (isCurrentlyActive) {
      // Снимаем лайк
      if (source === 'favorites') {
        // Soft delete: оставляем в базе, но ставим inactiveAt
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
        inactiveAt: null // Сбрасываем флаг неактивности (восстановление)
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
    } catch (e) {
      console.error('FavoritesV2: Save failed', e);
    }
  }

  onChange(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _notify() {
    this._listeners.forEach((cb) => { try { cb(); } catch (e) { console.error(e); } });
    if (window.playerCore?.triggerFavoritesUpdate) window.playerCore.triggerFavoritesUpdate();
  }
}

// Singleton
const instance = new FavoritesManagerV2();
instance.init();

export const FavoritesV2 = instance;
export default instance;
