/**
 * FAVORITES MANAGER V2 (CLEAN)
 * Хранилище: localStorage['__favorites_v2__']
 * Структура: JSON Array of Objects [{ uid, addedAt, albumKey }, ...]
 * Runtime: Map<uid, Object> для быстрого доступа O(1)
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
    this.ensureMigrated(); // Загрузка данных
    this.initialized = true;
  }

  // Метод переименован в ensureMigrated для совместимости с PlayerCore, 
  // но по факту он просто грузит данные.
  ensureMigrated() {
    if (this._map.size > 0) return; // Уже загружено

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

  readLikedSet() {
    this.ensureMigrated();
    return new Set(this._map.keys());
  }

  readRefsByUid() {
    this.ensureMigrated();
    return Object.fromEntries(this._map);
  }

  has(uid) {
    this.ensureMigrated();
    return this._map.has(String(uid).trim());
  }

  toggle(uid, meta = {}) {
    this.ensureMigrated();
    if (!uid) return { liked: false };
    
    const key = String(uid).trim();
    const exists = this._map.has(key);
    const source = meta.source || 'album'; // 'album' (hard delete) или 'favorites' (soft delete)

    let isLiked = false;

    if (exists) {
      if (source === 'favorites') {
        // Soft delete: оставляем, но помечаем как неактивный
        const item = this._map.get(key);
        this._map.set(key, { ...item, inactiveAt: Date.now() });
        isLiked = false; 
      } else {
        // Hard delete: удаляем полностью
        this._map.delete(key);
        isLiked = false;
      }
    } else {
      // Добавляем или восстанавливаем
      this._map.set(key, {
        uid: key,
        addedAt: Date.now(),
        albumKey: meta.albumKey || null,
        inactiveAt: null // Сбрасываем флаг неактивности
      });
      isLiked = true;
    }

    this._save();
    return { liked: isLiked };
  }

  removeRef(uid) {
    this.ensureMigrated();
    const key = String(uid).trim();
    if (this._map.has(key)) {
      this._map.delete(key);
      this._save();
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
}

// Singleton export as default object matching expected interface
const instance = new FavoritesManagerV2();
instance.init();

export const FavoritesV2 = instance;
export default instance;
