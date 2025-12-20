// scripts/core/config.js — Конфигурация
(function() {
  'use strict';
  
  const APP_CONFIG = {
    APP_VERSION: '8.1.0',
    BUILD_DATE: '2025-12-21',
    PROMOCODE: 'VITRINA2025',
    
    ICON_ALBUMS_ORDER: [
      { key: '__favorites__', title: '⭐ ИЗБРАННОЕ ⭐', icon: 'img/icon_album/icon-album-00.png' },
      { key: 'odnazhdy-v-skazke', title: 'Однажды в Сказке', icon: 'img/icon_album/icon-album-03.png' },
      { key: 'golos-dushi', title: 'Голос Души', icon: 'img/icon_album/icon-album-02.png' },
      { key: 'mezhdu-zlom-i-dobrom', title: 'Между Злом и Добром', icon: 'img/icon_album/icon-album-01.png' },
      { key: 'krevetochka', title: 'КРЕВЕツTOCHKA', icon: 'img/icon_album/icon-album+00.png' },
      { key: '__reliz__', title: 'НОВОСТИ', icon: 'img/icon_album/icon-album-news.png' }
    ],
    
    GALLERY_MAP: {
      'krevetochka': '00',
      'mezhdu-zlom-i-dobrom': '01',
      'golos-dushi': '02',
      'odnazhdy-v-skazke': '03',
      '__reliz__': 'news'
    },
    GALLERY_BASE: './albums/gallery/',
    SUPPORT_EMAIL: 'support@vitrina-razbita.ru',
    GITHUB_URL: 'https://github.com/apel-s-in/vi3na1bita-music'
  };

  // Глобальный экспорт
  window.APP_CONFIG = APP_CONFIG;
  window.SPECIAL_FAVORITES_KEY = '__favorites__';
  window.SPECIAL_RELIZ_KEY = '__reliz__';
  
  console.log('✅ Config loaded');
})();
