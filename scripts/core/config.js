// scripts/core/config.js
// Конфигурация приложения
export const APP_CONFIG = {
  // Версия приложения
  APP_VERSION: '8.0.3',
  BUILD_DATE: '2025-11-08',
  // ✅ ПРОМОКОД ДЛЯ ВХОДА
  PROMOCODE: 'VITRINA2025',
  // Порядок отображения иконок альбомов
  ICON_ALBUMS_ORDER: [
    { key: '__favorites__', title: '⭐⭐⭐ИЗБРАННОЕ⭐⭐⭐', icon: 'img/icon_album/icon-album-00.png' },
    { key: 'mezhdu-zlom-i-dobrom', title: 'Между Злом и Добром', icon: 'img/icon_album/icon-album-01.png' },
    { key: 'golos-dushi', title: 'Голос Души', icon: 'img/icon_album/icon-album-02.png' },
    { key: 'krevetochka', title: 'КРЕВЕцTOCHKA', icon: 'img/icon_album/icon-album+00.png' },
    { key: '__reliz__', title: 'НОВОСТИ', icon: 'img/icon_album/icon-album-news.png' }
  ],
  // Ключи для специальных альбомов
  SPECIAL_FAVORITES_KEY: '__favorites__',
  SPECIAL_RELIZ_KEY: '__reliz__',
  // Ссылки
  SUPPORT_URL: 'https://example.com/support',
  SUPPORT_EMAIL: 'support@vitrina-razbita.ru',
  GITHUB_URL: 'https://github.com/apel-s-in/vi3na1bita-music',
  // Настройки плеера
  PLAYER_SETTINGS: {
    defaultVolume: 1.0,
    crossfade: false,
    preload: true
  },
  // Настройки кэширования
  CACHE_VERSION: 'v1.0.0',
  CACHE_AUDIO: false, // Кэшировать ли аудио файлы
  // Аналитика (опционально)
  ANALYTICS_ENABLED: false,
  ANALYTICS_ID: null,
  // Настройки галереи
  CENTRAL_GALLERY_BASE: './albums/gallery/',
  // Публикация альбомов
  PUBLISHED_ALBUM_KEYS: new Set(['golos-dushi', 'mezhdu-zlom-i-dobrom', 'krevetochka'])
};

// Экспорт в глобальную область для совместимости
if (typeof window !== 'undefined') {
  window.APP_CONFIG = APP_CONFIG;
  // Глобальные константы
  window.SPECIAL_FAVORITES_KEY = APP_CONFIG.SPECIAL_FAVORITES_KEY;
  window.SPECIAL_RELIZ_KEY = APP_CONFIG.SPECIAL_RELIZ_KEY;
  window.ICON_ALBUMS_ORDER = APP_CONFIG.ICON_ALBUMS_ORDER;
}
