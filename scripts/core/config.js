// UID.005_(Soft-disable intel layer)_(не парализовать приложение при rollout)_(вынести базовые intel flags в APP_CONFIG) UID.019_(Compact TrackProfile index)_(дать стабильный путь до semantic data)_(хранить profile index/profile dir в config) UID.069_(Internal user identity)_(подготовить мульти-provider контур)_(держать future identity/sync flags централизованно) UID.092_(Incremental rollout order)_(делать staged внедрение через один конфиг)_(intel boot должен управляться отсюда)
export const APP_CONFIG = {
  APP_VERSION: '8.5.6',
  BUILD_DATE: '2026-05-09',
  PROMOCODE: 'VITRINA2025',
  ICON_ALBUMS_ORDER: [
    { key: 'ne-vse-ravno', title: 'Не всё равно', icon: 'img/icon_album/icon-album-04.png', row: 'albums' },
    { key: 'odnazhdy-v-skazke', title: 'Однажды в Сказке', icon: 'img/icon_album/icon-album-03.png', row: 'albums' },
    { key: 'golos-dushi', title: 'Голос Души', icon: 'img/icon_album/icon-album-02.png', row: 'albums' },
    { key: 'mezhdu-zlom-i-dobrom', title: 'Между Злом и Добром', icon: 'img/icon_album/icon-album-01.png', row: 'albums' },
    { key: 'krevetochka', title: 'КРЕВЕцTOCHKA', icon: 'img/icon_album/icon-album+00.png', row: 'albums' },
    { key: '__games__', title: 'ЗАЛ ВИТРИНЫ', icon: 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%230f1624%22%2F%3E%3Ccircle%20cx%3D%2232%22%20cy%3D%2232%22%20r%3D%2228%22%20fill%3D%22%2318273d%22%20stroke%3D%22%234daaff%22%20stroke-width%3D%222%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2240%22%20font-size%3D%2228%22%20text-anchor%3D%22middle%22%3E%F0%9F%8E%AE%3C%2Ftext%3E%3C%2Fsvg%3E', row: 'nav' },
    { key: '__showcase__', title: 'Витрина Разбита', icon: 'img/logo.png', row: 'nav' },
    { key: '__favorites__', title: '⭐⭐⭐ИЗБРАННОЕ⭐⭐⭐', icon: 'img/Fav_logo.png', row: 'nav' },
    { key: '__reliz__', title: 'НОВОСТИ', icon: 'img/icon_album/icon-album-news.png', row: 'nav' },
    { key: '__profile__', title: 'ЛИЧНЫЙ КАБИНЕТ', icon: 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12%2012c2.21%200%204-1.79%204-4s-1.79-4-4-4-4%201.79-4%204%201.79%204%204%204zm0%202c-2.67%200-8%201.34-8%204v2h16v-2c0-2.66-5.33-4-8-4z%22%2F%3E%3C%2Fsvg%3E', row: 'nav' }
  ],
  SPECIAL_FAVORITES_KEY: '__favorites__',
  SPECIAL_RELIZ_KEY: '__reliz__',
  SPECIAL_SHOWCASE_KEY: '__showcase__',
  SPECIAL_PROFILE_KEY: '__profile__',
  SPECIAL_GAMES_KEY: '__games__',
  SUPPORT_URL: 'https://vk.com/apelsinov',
  SUPPORT_EMAIL: 'apel-s-in@ya.ru',
  GITHUB_URL: 'https://github.com/apel-s-in/vi3na1bita-music',
  INTEL_LAYER_ENABLED: true,
  INTEL_LAYER_BOOT_MODE: 'soft',
  INTEL_LAYER_PROFILE_INDEX_URL: './data/track-profiles-index.json',
  INTEL_LAYER_PROFILE_DIR: './data/track-profiles/',
  INTEL_LAYER_STORAGE_DISABLE_KEY: 'intel:disable',
  INTEL_LAYER_STORAGE_DEV_KEY: 'intel:dev'
};
if (typeof window !== 'undefined') {
  window.APP_CONFIG = APP_CONFIG;
  window.SPECIAL_FAVORITES_KEY = APP_CONFIG.SPECIAL_FAVORITES_KEY;
  window.SPECIAL_RELIZ_KEY = APP_CONFIG.SPECIAL_RELIZ_KEY;
  window.SPECIAL_SHOWCASE_KEY = APP_CONFIG.SPECIAL_SHOWCASE_KEY;
  window.SPECIAL_GAMES_KEY = APP_CONFIG.SPECIAL_GAMES_KEY;
}
