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
    { key: '__reliz__', title: 'Новости', icon: 'img/icon_album/icon-album-news.png' },
    { key: 'vr_01', title: 'Альбом 1', icon: 'img/icon_album/icon-album-01.png' },
    { key: 'vr_02', title: 'Альбом 2', icon: 'img/icon_album/icon-album-02.png' },
    { key: 'vr_03', title: 'Альбом 3', icon: 'img/icon_album/icon-album-03.png' },
    { key: 'vr_04', title: 'Альбом 4', icon: 'img/icon_album/icon-album-04.png' },
    { key: 'vr_05', title: 'Альбом 5', icon: 'img/icon_album/icon-album-05.png' },
    { key: 'vr_06', title: 'Альбом 6', icon: 'img/icon_album/icon-album-06.png' },
    { key: 'vr_07', title: 'Альбом 7', icon: 'img/icon_album/icon-album-07.png' },
    { key: 'vr_08', title: 'Альбом 8', icon: 'img/icon_album/icon-album-08.png' }
  ],
  
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
