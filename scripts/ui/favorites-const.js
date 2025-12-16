// scripts/ui/favorites-const.js
// Единая точка правды для ключей/констант «Избранного».
// Важна обратная совместимость: прокинем в window, чтобы их видел inline-код index.html.

const SPECIAL_FAVORITES_KEY = '__favorites__';
const SPECIAL_RELIZ_KEY = '__reliz__';

// Legacy ключ хранилища лайков (V2, numbers). Основной ключ — likedTrackUids:v1 (uid-based).
const LIKED_STORAGE_KEY_V2 = 'likedTracks:v2';

// Ключ хранилища ссылок «Избранного» (refs)
const FAVORITES_REFS_KEY = 'favoritesAlbumRefs:v1';

// Back-compat для существующего inline-кода:
Object.assign(window, {
  SPECIAL_FAVORITES_KEY,
  SPECIAL_RELIZ_KEY,
  LIKED_STORAGE_KEY_V2,
  FAVORITES_REFS_KEY,
});
