// scripts/ui/favorites-storage.js
// Операции с localStorage для лайков.
// ВАЖНО: это thin‑обёртка над FavoritesManager для обратной совместимости.
// Основной API для лайков — window.FavoritesManager.

/* global window */

(function FavoritesStorageCompat() {
  'use strict';

  // ✅ Основной источник правды: likedTrackUids:v1 (uid-модель)
  const __LIKED_UID_KEY = 'likedTrackUids:v1';

  // Legacy (numbers): оставляем только для совместимости чтения, но не как источник истины.
  const __LIKED_KEY_V2 = (typeof window.LIKED_STORAGE_KEY_V2 === 'string')
    ? window.LIKED_STORAGE_KEY_V2
    : 'likedTracks:v2';

  /**
   * Вспомогательный чистый геттер: напрямую читает likedTracks:v2 из localStorage.
   * Используется только как fallback, когда FavoritesManager ещё не инициализирован.
   */
  function rawGetLikedUidMap() {
    try {
      const raw = localStorage.getItem(__LIKED_UID_KEY);
      const map = raw ? JSON.parse(raw) : {};
      return (map && typeof map === 'object') ? map : {};
    } catch {
      return {};
    }
  }

  function rawGetLikedUidsForAlbum(albumKey) {
    try {
      const map = rawGetLikedUidMap();
      const arr = (map && typeof map === 'object') ? map[albumKey] : [];
      return Array.from(
        new Set(
          (Array.isArray(arr) ? arr : [])
            .map(x => String(x || '').trim())
            .filter(Boolean)
        )
      );
    } catch {
      return [];
    }
  }

  // Legacy helpers (numbers) удалены: likedTracks:v2 остаётся только для миграции в FavoritesManager.
  // Здесь intentionally нет v2 API, чтобы не поддерживать сломанную/опасную ветку.

  /**
   * Публичный совместимый API.
   * Если FavoritesManager уже есть — делегируем в него.
   * Иначе используем raw*‑функции выше.
   */

  function getLikedMap() {
    // ✅ Возвращаем uid-map (likedTrackUids:v1)
    if (window.FavoritesManager && typeof window.FavoritesManager.getLikedUidMap === 'function') {
      return window.FavoritesManager.getLikedUidMap();
    }
    return rawGetLikedUidMap();
  }

  function getLikedForAlbum(albumKey) {
    // ✅ Возвращаем uid[] (строки)
    if (window.FavoritesManager && typeof window.FavoritesManager.getLikedUidsForAlbum === 'function') {
      return window.FavoritesManager.getLikedUidsForAlbum(albumKey);
    }
    return rawGetLikedUidsForAlbum(albumKey);
  }

  // Legacy API (v2) намеренно не экспортируем. План: удалить likedTracks:v2 через 1–2 релиза.

  function toggleLikeForAlbum(albumKey, idx, makeLiked) {
    // ✅ Legacy API: больше не поддерживает числовые индексы как источник правды.
    // Оставляем только чтобы старый код не падал.
    // Если передали uid строкой — работаем, иначе игнорируем.
    if (window.FavoritesManager && typeof window.FavoritesManager.toggleLike === 'function') {
      const uid = String(idx || '').trim();
      if (uid) {
        window.FavoritesManager.toggleLike(albumKey, uid, makeLiked);
      } else {
        console.warn('toggleLikeForAlbum called with non-uid argument; ignored');
      }
      return;
    }

    console.warn('FavoritesManager not ready; toggleLikeForAlbum ignored');
  }

  // Back‑compat: оставляем глобальные имена, которые уже вызывает index.html и старый код.
  Object.assign(window, {
    // Основной (uid)
    getLikedMap,
    getLikedForAlbum,

    // Старое имя toggleLikeForAlbum оставляем (оно теперь uid-aware)
    toggleLikeForAlbum,
  });
})();
