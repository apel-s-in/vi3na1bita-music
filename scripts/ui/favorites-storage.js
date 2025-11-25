// scripts/ui/favorites-storage.js
// Операции с localStorage для лайков.
// Чистая логика без DOM. Работает как обычный скрипт, кладёт функции в window.

// Берём ключ либо из favorites-const.js, либо fallback.
const __LIKED_KEY = (typeof window.LIKED_STORAGE_KEY_V2 === 'string')
  ? window.LIKED_STORAGE_KEY_V2
  : 'likedTracks:v2';

function getLikedMap() {
  try {
    const raw = localStorage.getItem(__LIKED_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return (map && typeof map === 'object') ? map : {};
  } catch {
    return {};
  }
}

function getLikedForAlbum(albumKey) {
  try {
    const raw = localStorage.getItem(__LIKED_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const arr = (map && typeof map === 'object') ? map[albumKey] : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function toggleLikeForAlbum(albumKey, idx, makeLiked) {
  const map = getLikedMap();
  const arr = Array.isArray(map[albumKey]) ? map[albumKey] : [];
  const has = arr.includes(idx);
  let next = arr.slice();
  if (makeLiked && !has) next.push(idx);
  if (!makeLiked && has) next = next.filter(x => x !== idx);
  map[albumKey] = Array.from(new Set(next));
  try { localStorage.setItem(__LIKED_KEY, JSON.stringify(map)); } catch {}
}

// Back-compat: оставляем глобальные имена, которые уже вызывает index.html
Object.assign(window, {
  getLikedMap,
  getLikedForAlbum,
  toggleLikeForAlbum,
});
