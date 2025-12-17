// scripts/ui/favorites-const.js
// Единая точка правды для ключей/констант «Избранного».
// Важна обратная совместимость: прокинем в window, чтобы их видел inline-код index.html.

const SPECIAL_FAVORITES_KEY = '__favorites__';
const SPECIAL_RELIZ_KEY = '__reliz__';

// likedTracks:v2 больше не поддерживаем. Единственный ключ лайков: likedTrackUids:v1 (uid-based).

// Ключ хранилища ссылок «Избранного» (refs)
const FAVORITES_REFS_KEY = 'favoritesAlbumRefs:v1';

// Back-compat для существующего inline-кода:
Object.assign(window, {
  SPECIAL_FAVORITES_KEY,
  SPECIAL_RELIZ_KEY,
  FAVORITES_REFS_KEY,
});
