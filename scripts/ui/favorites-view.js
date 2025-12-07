// scripts/ui/favorites-view.js
// Функционал для представления "Избранное"

(function FavoritesViewModule() {
  'use strict';

  const w = window;

  async function openFavoritesView() {
    // Делегируем в AlbumsManager
    if (w.AlbumsManager) {
      await w.AlbumsManager.loadAlbum('__favorites__');
    }
  }

  // Экспорт
  w.openFavoritesView = openFavoritesView;

  console.log('✅ Favorites view module loaded');
})();
