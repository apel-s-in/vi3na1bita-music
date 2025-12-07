// scripts/ui/favorites-storage.js
// Операции с localStorage для лайков.
// ВАЖНО: это thin‑обёртка над FavoritesManager для обратной совместимости.
// Основной API для лайков — window.FavoritesManager.

/* global window */

(function FavoritesStorageCompat() {
  'use strict';

  // Берём ключ либо из favorites-const.js, либо fallback.
  const __LIKED_KEY = (typeof window.LIKED_STORAGE_KEY_V2 === 'string')
    ? window.LIKED_STORAGE_KEY_V2
    : 'likedTracks:v2';

  /**
   * Вспомогательный чистый геттер: напрямую читает likedTracks:v2 из localStorage.
   * Используется только как fallback, когда FavoritesManager ещё не инициализирован.
   */
  function rawGetLikedMap() {
    try {
      const raw = localStorage.getItem(__LIKED_KEY);
      const map = raw ? JSON.parse(raw) : {};
      return (map && typeof map === 'object') ? map : {};
    } catch {
      return {};
    }
  }

  function rawGetLikedForAlbum(albumKey) {
    try {
      const map = rawGetLikedMap();
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

  function rawToggleLikeForAlbum(albumKey, idx, makeLiked) {
    const index = parseInt(idx, 10);
    if (!Number.isFinite(index)) return;

    const map = rawGetLikedMap();
    const arrRaw = Array.isArray(map[albumKey]) ? map[albumKey] : [];
    const arr = Array.from(
      new Set(
        arrRaw
          .map(n => parseInt(n, 10))
          .filter(Number.isFinite)
      )
    );
    const has = arr.includes(index);

    let next = arr.slice();
    const shouldLike = makeLiked !== undefined ? !!makeLiked : !has;
    if (shouldLike && !has) next.push(index);
    if (!shouldLike && has) next = next.filter(x => x !== index);

    map[albumKey] = next;
    try {
      localStorage.setItem(__LIKED_KEY, JSON.stringify(map));
    } catch {
      // ignore storage errors
    }
  }

  /**
   * Публичный совместимый API.
   * Если FavoritesManager уже есть — делегируем в него.
   * Иначе используем raw*‑функции выше.
   */

  function getLikedMap() {
    if (window.FavoritesManager && typeof window.FavoritesManager.getLikedMap === 'function') {
      return window.FavoritesManager.getLikedMap();
    }
    return rawGetLikedMap();
  }

  function getLikedForAlbum(albumKey) {
    if (window.FavoritesManager && typeof window.FavoritesManager.getLikedForAlbum === 'function') {
      return window.FavoritesManager.getLikedForAlbum(albumKey);
    }
    return rawGetLikedForAlbum(albumKey);
  }

  function toggleLikeForAlbum(albumKey, idx, makeLiked) {
    if (window.FavoritesManager && typeof window.FavoritesManager.toggleLike === 'function') {
      window.FavoritesManager.toggleLike(albumKey, idx, makeLiked);
      return;
    }
    rawToggleLikeForAlbum(albumKey, idx, makeLiked);
  }

  // Back‑compat: оставляем глобальные имена, которые уже вызывает index.html и старый код.
  Object.assign(window, {
    getLikedMap,
    getLikedForAlbum,
    toggleLikeForAlbum,
  });
})();
