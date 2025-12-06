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
    // Нормализуем к числам и убираем дубликаты
    return Array.from(new Set((Array.isArray(arr) ? arr : [])
      .map(n => parseInt(n, 10))
      .filter(Number.isFinite)));
  } catch {
    return [];
  }
}

function toggleLikeForAlbum(albumKey, idx, makeLiked) {
  const index = parseInt(idx, 10);
  if (!Number.isFinite(index)) return;
  const map = getLikedMap();
  const arrRaw = Array.isArray(map[albumKey]) ? map[albumKey] : [];
  const arr = Array.from(new Set(arrRaw
    .map(n => parseInt(n, 10))
    .filter(Number.isFinite)));
  const has = arr.includes(index);

  let next = arr.slice();
  if (makeLiked && !has) next.push(index);
  if (!makeLiked && has) next = next.filter(x => x !== index);

  map[albumKey] = next;
  try { localStorage.setItem(__LIKED_KEY, JSON.stringify(map)); } catch {}
}

// Back-compat: оставляем глобальные имена, которые уже вызывает index.html
Object.assign(window, {
  getLikedMap,
  getLikedForAlbum,
  toggleLikeForAlbum,
});
