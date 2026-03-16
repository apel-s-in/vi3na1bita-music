export const APP_CONFIG = {
  APP_VERSION: '8.1.14', BUILD_DATE: '2026-03-06', PROMOCODE: 'VITRINA2025',
  ICON_ALBUMS_ORDER: [
    { key: 'odnazhdy-v-skazke', title: 'Однажды в Сказке', icon: 'img/icon_album/icon-album-03.png' },
    { key: 'golos-dushi', title: 'Голос Души', icon: 'img/icon_album/icon-album-02.png' },
    { key: 'mezhdu-zlom-i-dobrom', title: 'Между Злом и Добром', icon: 'img/icon_album/icon-album-01.png' },
    { key: 'krevetochka', title: 'КРЕВЕцTOCHKA', icon: 'img/icon_album/icon-album+00.png' },
    { key: '__showcase__', title: 'Витрина Разбита', icon: 'img/logo.png' },
    { key: '__reliz__', title: 'НОВОСТИ', icon: 'img/icon_album/icon-album-news.png' },
    { key: '__favorites__', title: '⭐⭐⭐ИЗБРАННОЕ⭐⭐⭐', icon: 'img/Fav_logo.png' },
    { key: '__profile__', title: 'ЛИЧНЫЙ КАБИНЕТ', icon: 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E' }
  ],
  SPECIAL_FAVORITES_KEY: '__favorites__', SPECIAL_RELIZ_KEY: '__reliz__', SPECIAL_SHOWCASE_KEY: '__showcase__', SPECIAL_PROFILE_KEY: '__profile__',
  SUPPORT_URL: 'https://example.com/support', SUPPORT_EMAIL: 'support@vitrina-razbita.ru', GITHUB_URL: 'https://github.com/apel-s-in/vi3na1bita-music'
};
if (typeof window !== 'undefined') { window.APP_CONFIG = APP_CONFIG; window.SPECIAL_FAVORITES_KEY = APP_CONFIG.SPECIAL_FAVORITES_KEY; window.SPECIAL_RELIZ_KEY = APP_CONFIG.SPECIAL_RELIZ_KEY; window.SPECIAL_SHOWCASE_KEY = APP_CONFIG.SPECIAL_SHOWCASE_KEY; }
