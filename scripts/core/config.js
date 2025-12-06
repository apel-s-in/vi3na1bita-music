// scripts/core/config.js
// Централизованная конфигурация приложения

export const APP_CONFIG = {
  VERSION: '8.1.0',
  BUILD_DATE: '2025-12-06',
  PROMO_CODE: 'VITRINA2025',
  
  ALBUMS_FALLBACK: [
    {
      key: 'mezhdu-zlom-i-dobrom',
      title: 'Между Злом и Добром (2025)',
      base: 'https://apel-s-in.github.io/vi3na1bita-mezhdu-zlom-i-dobrom/'
    },
    {
      key: 'golos-dushi',
      title: 'Голос Души',
      base: 'https://apel-s-in.github.io/vi3na1bita-golos-dushi/'
    },
    {
      key: 'krevetochka',
      title: 'КРЕВЕцTOCHKA',
      base: 'https://apel-s-in.github.io/krevetochka/'
    }
  ],
  
  CENTRAL_GALLERY_BASE: './albums/gallery/',
  ALBUM_GALLERY_MAP: {
    'krevetochka': '00',
    'mezhdu-zlom-i-dobrom': '01',
    'golos-dushi': '02',
    '__reliz__': 'news'
  },
  
  ICON_ALBUMS_ORDER: [
    { key: '__favorites__', title: '⭐⭐⭐ИЗБРАННОЕ⭐⭐⭐', icon: 'img/icon_album/icon-album-00.png' },
    { key: 'golos-dushi', title: 'Голос Души', icon: 'img/icon_album/icon-album-02.png' },
    { key: 'mezhdu-zlom-i-dobrom', title: 'Между Злом и Добром', icon: 'img/icon_album/icon-album-01.png' },
    { key: 'krevetochka', title: 'КРЕВЕцTOCHKA', icon: 'img/icon_album/icon-album+00.png' },
    { key: '__reliz__', title: 'НОВОСТИ', icon: 'img/icon_album/icon-album-news.png' }
  ]
};

// Экспорт в window для обратной совместимости
if (typeof window !== 'undefined') {
  window.APP_CONFIG = APP_CONFIG;
  window.VERSION = APP_CONFIG.VERSION;
  window.ALBUMS_FALLBACK = APP_CONFIG.ALBUMS_FALLBACK;
  window.CENTRAL_GALLERY_BASE = APP_CONFIG.CENTRAL_GALLERY_BASE;
  window.ALBUM_GALLERY_MAP = APP_CONFIG.ALBUM_GALLERY_MAP;
  window.ICON_ALBUMS_ORDER = APP_CONFIG.ICON_ALBUMS_ORDER;
}
