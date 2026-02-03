/**
 * FAVORITES MANAGER V2 (PURE)
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
      // В случае сбоя начинаем с пустого списка, не ломая приложение
      this._map.clear();
    }

    this.initialized = true;
    console.log(`FavoritesV2: Loaded ${this._map.size} tracks.`);
  }

  /**
   * Проверка наличия в избранном
   * @param {string} uid 
   */
  has(uid) {
    if (!uid) return false;
    return this._map.has(String(uid).trim());
  }

  /**
   * Добавить / Удалить
   * @param {string} uid 
   * @param {object} meta - дополнительные данные (albumKey, title и т.д. для кеша)
   */
  toggle(uid, meta = {}) {
    if (!uid) return false;
    const key = String(uid).trim();
    const exists = this._map.has(key);

    if (exists) {
      this._map.delete(key);
    } else {
      this._map.set(key, {
        uid: key,
        addedAt: Date.now(),
        albumKey: meta.albumKey || null
      });
    }

    this._save();
    this._notify();
    
    return !exists; // Возвращает true, если лайкнули, false если убрали
  }

  getEntries() {
    // Сортировка: Новые сверху (по addedAt desc)
    return Array.from(this._map.values()).sort((a, b) => b.addedAt - a.addedAt);
  }

  _save() {
    try {
      const arr = Array.from(this._map.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch (e) {
      console.error('FavoritesV2: Save failed', e);
    }
  }

  // --- Event Bus для реактивности ---

  onChange(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  _notify() {
    this._listeners.forEach((cb) => {
      try { cb(); } catch (e) { console.error(e); }
    });
    
    // Уведомляем глобальное ядро плеера, если нужно обновить иконки
    if (window.playerCore && typeof window.playerCore.triggerFavoritesUpdate === 'function') {
      window.playerCore.triggerFavoritesUpdate();
    }
  }
}

// Singleton
window.FavoritesManager = new FavoritesManagerV2();
window.FavoritesManager.init();
