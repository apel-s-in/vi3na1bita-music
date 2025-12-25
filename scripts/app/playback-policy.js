// scripts/app/playback-policy.js
(function PlaybackPolicyModule() {
  'use strict';
  const w = window;

  function apply({ reason = 'unknown' } = {}) {
    if (!w.playerCore || !w.FavoritesManager || !w.albumsIndex) return;

    const favoritesOnly = localStorage.getItem('favoritesOnlyMode') === '1';
    const isShuffle = w.playerCore.isShuffle?.() || false;
    const original = w.playerCore.getOriginalPlaylistSnapshot?.() || [];

    // Если не в режиме «избранные» — ничего не делаем
    if (!favoritesOnly) {
      if (original.length > 0) {
        w.playerCore.setPlaylist(original, [], false);
      }
      return;
    }

    // === Режим: только избранные ===
    // 1. Собираем активные избранные треки из всех альбомов
    const playlist = [];
    for (const albumId of Object.keys(w.FavoritesManager.getAll())) {
      const albumData = w.FavoritesManager.get(albumId);
      for (const uid of Object.keys(albumData || {})) {
        const fav = albumData[uid];
        if (fav.status === 'active') {
          // Ищем исходный трек в albumsIndex
          const srcAlbum = w.albumsIndex.find(a => a.id === albumId);
          if (srcAlbum && srcAlbum.tracks) {
            const track = srcAlbum.tracks.find(t => String(t.uid) === String(uid));
            if (track) {
              // Копируем трек и помечаем источник
              const clone = { ...track, sourceAlbum: albumId, isFavorite: true };
              playlist.push(clone);
            }
          }
        }
      }
    }

    // 2. Если плейлист пуст — останавливаем воспроизведение
    if (playlist.length === 0) {
      w.playerCore.stop();
      return;
    }

    // 3. Настраиваем shuffle
    const history = isShuffle ? (w.playerCore.getShuffleHistory?.() || []) : [];

    // 4. Устанавливаем новый плейлист
    w.playerCore.setPlaylist(playlist, history, true);
  }

  w.PlaybackPolicy = { apply };
})();
