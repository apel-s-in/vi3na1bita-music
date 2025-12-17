// scripts/ui/favorites.js
// Управление избранными треками по UID (единственный источник правды).
// Storage: likedTrackUids:v1 => { [albumKey]: string[] }

class FavoritesManager {
  constructor() {
    this.storageKey = 'likedTrackUids:v1';
  }

  async initialize() {
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

      console.log('✅ FavoritesManager initialized (uid-based)');
    } catch (e) {
      console.warn('FavoritesManager.initialize failed:', e);
    }
  }

  _emitChange(payload) {
    // ✅ Realtime sync: все места UI слушают событие и обновляют звёзды/списки/очередь.
    try {
      window.dispatchEvent(new CustomEvent('favorites:changed', { detail: payload }));
    } catch {}
  }

  getLikedUidMap() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const map = raw ? JSON.parse(raw) : {};
      return (map && typeof map === 'object') ? map : {};
    } catch {
      return {};
    }
  }

  getLikedUidsForAlbum(albumKey) {
    try {
      const map = this.getLikedUidMap();
      const arr = (map && typeof map === 'object') ? map[albumKey] : [];
      if (!Array.isArray(arr)) return [];
      return Array.from(new Set(arr.map(x => String(x || '').trim()).filter(Boolean)));
    } catch {
      return [];
    }
  }

  isFavorite(albumKey, trackUid) {
    const a = String(albumKey || '').trim();
    const uid = String(trackUid || '').trim();
    if (!a || !uid) return false;
    return this.getLikedUidsForAlbum(a).includes(uid);
  }

  toggleLike(albumKey, trackUid, makeLiked = null) {
    const a = String(albumKey || '').trim();
    const uid = String(trackUid || '').trim();
    if (!a || !uid) return false;

    const map = this.getLikedUidMap();
    const prevArr = Array.isArray(map[a]) ? map[a] : [];
    const arr = Array.from(new Set(prevArr.map(x => String(x || '').trim()).filter(Boolean)));

    const has = arr.includes(uid);
    const shouldLike = (makeLiked !== null) ? !!makeLiked : !has;

    let next = arr.slice();
    if (shouldLike && !has) next.push(uid);
    if (!shouldLike && has) next = next.filter(x => x !== uid);

    map[a] = Array.from(new Set(next));

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(map));
    } catch {
      return false;
    }

    // Realtime событие
    this._emitChange({ albumKey: a, uid, liked: shouldLike });

    return true;
  }

  // likedTracks:v2 миграция удалена: проект полностью на uid-ветке.
}

window.FavoritesManager = new FavoritesManager();
