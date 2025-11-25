// scripts/ui/favorites-storage.js
// Операции с localStorage для лайков.
// Чистая логика без DOM. Экспортируем и в ESM, и в window (для совместимости с index.html).

import { LIKED_STORAGE_KEY_V2 } from './favorites-const.js';

export function getLikedMap() {
  try {
    const raw = localStorage.getItem(LIKED_STORAGE_KEY_V2);
    const map = raw ? JSON.parse(raw) : {};
    return (map && typeof map === 'object') ? map : {};
  } catch {
    return {};
  }
}

export function getLikedForAlbum(albumKey) {
  try {
    const raw = localStorage.getItem(LIKED_STORAGE_KEY_V2);
    const map = raw ? JSON.parse(raw) : {};
    const arr = (map && typeof map === 'object') ? map[albumKey] : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function toggleLikeForAlbum(albumKey, idx, makeLiked) {
  const map = getLikedMap();
  const arr = Array.isArray(map[albumKey]) ? map[albumKey] : [];
  const has = arr.includes(idx);
  let next = arr.slice();
  if (makeLiked && !has) next.push(idx);
  if (!makeLiked && has) next = next.filter(x => x !== idx);
  map[albumKey] = Array.from(new Set(next));
  try { localStorage.setItem(LIKED_STORAGE_KEY_V2, JSON.stringify(map)); } catch {}
}

// Back-compat: оставляем глобальные имена, которые уже вызывает index.html
Object.assign(window, {
  getLikedMap,
  getLikedForAlbum,
  toggleLikeForAlbum,
});
