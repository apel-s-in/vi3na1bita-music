// scripts/core/config.js
// Конфигурация приложения

export const APP_CONFIG = {
  // Версия приложения
  APP_VERSION: '1.0.0',
  
  // ✅ ПРОМОКОД ДЛЯ ВХОДА
  PROMOCODE: 'VITRINA2025',
  
  // Порядок отображения иконок альбомов
  ICON_ALBUMS_ORDER: [
    { key: '__favorites__', title: 'Избранное', icon: 'img/icon_album/icon-album-00.png' },
    { key: 'mezhdu-zlom-i-dobrom', title: 'Между Злом и Добром', icon: 'img/icon_album/icon-album-01.png' },
    { key: 'golos-dushi', title: 'Голос Души', icon: 'img/icon_album/icon-album-02.png' },
    { key: 'krevetochka', title: 'КРЕВЕцTOCHKA', icon: 'img/icon_album/icon-album+00.png' },
    { key: '__reliz__', title: 'Новости', icon: 'img/icon_album/icon-album-news.png' }
  ],
  
  // Соответствие альбомов галереям
  ALBUM_TO_GALLERY_MAP: {
    'mezhdu-zlom-i-dobrom': '01',
    'golos-dushi': '02',
    'krevetochka': '00',
    '__reliz__': 'news'
  },
  
  // Ссылки
  SUPPORT_URL: 'https://example.com/support',
  SUPPORT_EMAIL: 'support@vitrina-razbita.ru',
  GITHUB_URL: 'https://github.com/yourusername/vitrina-razbita',
  
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
  ANALYTICS_ID: null
};

// Экспорт в глобальную область для совместимости
if (typeof window !== 'undefined') {
  window.APP_CONFIG = APP_CONFIG;
}
