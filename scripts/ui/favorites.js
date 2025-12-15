// scripts/ui/favorites.js
// Управление избранными треками (хранилище лайков).
// ВАЖНО: модель "Избранного" строится в scripts/ui/favorites-data.js (buildFavoritesRefsModel).
// Этот модуль НЕ должен пытаться читать AlbumsManager.getAlbumConfigByKey(), т.к. там не raw config.json.

class FavoritesManager {
  constructor() {
    this.storageKey = 'likedTracks:v2';
  }

  async initialize() {
    // Ничего тяжёлого не делаем: только гарантируем корректный JSON
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        localStorage.setItem(this.storageKey, JSON.stringify({}));
      } else {
        const j = JSON.parse(raw);
        if (!j || typeof j !== 'object') {
          localStorage.setItem(this.storageKey, JSON.stringify({}));
        }
      }
      console.log('✅ FavoritesManager initialized');
    } catch (e) {
      console.warn('FavoritesManager.initialize failed:', e);
    }
  }

  getLikedMap() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const map = raw ? JSON.parse(raw) : {};
      return (map && typeof map === 'object') ? map : {};
    } catch {
      return {};
    }
  }

  getLikedForAlbum(albumKey) {
    try {
      const map = this.getLikedMap();
      const arr = (map && typeof map === 'object') ? map[albumKey] : [];
      return Array.from(
        new Set(
          (Array.isArray(arr) ? arr : [])
            .map(n => parseInt(n, 10))
            .filter(Number.isFinite)
        )
      );
    } catch {
      return [];
    }
  }

  isFavorite(albumKey, trackIndex) {
    return this.getLikedForAlbum(albumKey).includes(parseInt(trackIndex, 10));
  }

  toggleLike(albumKey, trackIndex, makeLiked = null) {
    const index = parseInt(trackIndex, 10);
    if (!Number.isFinite(index)) return false;

    const map = this.getLikedMap();
    const arrRaw = Array.isArray(map[albumKey]) ? map[albumKey] : [];
    const arr = Array.from(
      new Set(arrRaw.map(n => parseInt(n, 10)).filter(Number.isFinite))
    );

    const has = arr.includes(index);
    const shouldLike = makeLiked !== null ? !!makeLiked : !has;

    let next = arr.slice();
    if (shouldLike && !has) next.push(index);
    if (!shouldLike && has) next = next.filter(x => x !== index);

    map[albumKey] = Array.from(new Set(next));

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(map));
    } catch {
      return false;
    }

    // Синхронизируем refs (чтобы Избранное пополнялось), но НЕ удаляем refs на unlike
    // (в старой логике refs нужны и для неактивных строк)
    try {
      if (typeof window.ensureFavoritesRefsWithLikes === 'function') {
        window.ensureFavoritesRefsWithLikes();
      }
    } catch {}

    // Синхронизируем флаг активности в уже построенной модели (если она есть)
    try {
      if (typeof window.updateFavoritesRefsModelActiveFlag === 'function') {
        window.updateFavoritesRefsModelActiveFlag(albumKey, index, shouldLike);
      }
    } catch {}

    return true;
  }
}

window.FavoritesManager = new FavoritesManager();
