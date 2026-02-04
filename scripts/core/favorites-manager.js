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
      if (raw) {
        JSON.parse(raw).forEach(i => {
          if (i && i.uid) this._map.set(String(i.uid).trim(), i);
        });
      }
    } catch (e) {
      console.error('FavManager init error', e);
    }
  }

  // Проверка: активен ли лайк (есть в базе и нет флага inactiveAt)
  isLiked(uid) {
    const u = String(uid || '').trim();
    if (!u) return false;
    const item = this._map.get(u);
    return item && !item.inactiveAt;
  }

  // Получить все записи (включая неактивные/серые)
  getSnapshot() {
    return Array.from(this._map.values());
  }

  // Основная логика переключения
  toggle(uid, { source = 'album', albumKey } = {}) {
    const u = String(uid || '').trim();
    if (!u) return false;

    const item = this._map.get(u);
    const isActive = item && !item.inactiveAt;
    
    let isNowLiked = false;

    if (isActive) {
      // Если трек был активен - снимаем лайк
      if (source === 'favorites') {
        // Soft Delete: оставляем в базе, но помечаем inactive (становится серым)
        this._map.set(u, { ...item, inactiveAt: Date.now() });
      } else {
        // Hard Delete: удаляем полностью (из альбома)
        this._map.delete(u);
      }
      isNowLiked = false;
    } else {
      // Если трека нет или он был inactive - ставим лайк
      this._map.set(u, {
        uid: u,
        addedAt: item?.addedAt || Date.now(),
        albumKey: albumKey || item?.albumKey || null,
        inactiveAt: null // Сбрасываем флаг неактивности
      });
      isNowLiked = true;
    }
    
    this._save();
    this._notify(u, isNowLiked);
    return isNowLiked;
  }

  // Полное удаление (через модалку "удалить из списка")
  remove(uid) {
    const u = String(uid).trim();
    if (this._map.delete(u)) {
      this._save();
      this._notify(u, false);
      return true;
    }
    return false;
  }

  // Восстановление (через модалку "вернуть")
  restore(uid) {
    return this.toggle(uid, { source: 'favorites' });
  }

  _save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(Array.from(this._map.values())));
    } catch {}
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
