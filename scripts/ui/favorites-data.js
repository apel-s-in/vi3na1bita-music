// scripts/ui/favorites-data.js
(function FavoritesDataModule() {
  'use strict';
  const w = window;

  function showInactiveFavoritesModal() {
    const favoritesManager = w.FavoritesManager;
    if (!favoritesManager) return;

    const allInactive = [];
    for (const albumId of Object.keys(favoritesManager.getAll())) {
      const albumData = favoritesManager.get(albumId);
      for (const uid of Object.keys(albumData || {})) {
        const fav = albumData[uid];
        if (fav.status === 'inactive') {
          // Ищем трек в albumsIndex
          const srcAlbum = w.albumsIndex?.find(a => a.id === albumId);
          const track = srcAlbum?.tracks?.find(t => String(t.uid) === String(uid));
          if (track) {
            allInactive.push({
              albumId,
              uid,
              title: track.title,
              albumTitle: srcAlgum?.title || albumId
            });
          }
        }
      }
    }

    if (allInactive.length === 0) {
      w.NotificationSystem?.info('Нет удалённых треков');
      return;
    }

    const itemsHtml = allInactive.map((item, i) => `
      <div class="inactive-item" data-index="${i}">
        <div class="inactive-title">${w.Utils.escapeHtml(item.title)}</div>
        <div class="inactive-album">${w.Utils.escapeHtml(item.albumTitle)}</div>
        <div>
          <button class="inactive-btn restore" data-action="restore" data-index="${i}">Вернуть</button>
          <button class="inactive-btn delete" data-action="delete" data-index="${i}">Удалить</button>
        </div>
      </div>
    `).join('');

    const modalHtml = `
      <div class="modal-content favorites-modal">
        <h3>Удалённые из «Избранного»</h3>
        <div class="inactive-list">${itemsHtml}</div>
        <button class="bigclose">Закрыть</button>
      </div>
    `;

    const modal = w.Utils.createModal(modalHtml, null);

    modal.addEventListener('click', (e) => {
      const btn = e.target.closest('.inactive-btn');
      if (!btn) return;
      const action = btn.dataset.action;
      const index = parseInt(btn.dataset.index, 10);
      const item = allInactive[index];
      if (!item) return;

      if (action === 'restore') {
        favoritesManager.updateStatus(item.albumId, item.uid, 'active');
        w.NotificationSystem?.success('Трек возвращён в избранное');
      } else if (action === 'delete') {
        favoritesManager.updateStatus(item.albumId, item.uid, 'removed');
        w.NotificationSystem?.success('Трек полностью удалён');
      }

      // Перезагружаем модалку
      modal.remove();
      setTimeout(showInactiveFavoritesModal, 300);
    });
  }

  w.FavoritesData = {
    showInactiveFavoritesModal
  };
})();
