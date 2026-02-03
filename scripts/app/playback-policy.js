// scripts/app/playback-policy.js
(function(W){
  'use strict';
  
  const LS_KEY = 'favoritesOnlyMode';
  const FAV_KEY = window.SPECIAL_FAVORITES_KEY || '__favorites__';

  const pc = () => W.playerCore;
  const ls = () => localStorage.getItem(LS_KEY) === '1';

  const Policy = {
    /**
     * Применяет политику воспроизведения (Favorites Only + Shuffle).
     * Вызывается при нажатии кнопки F или изменении лайков.
     */
    apply: () => {
      const core = pc();
      if (!core) return;

      const alb = W.AlbumsManager?.getPlayingAlbum();
      if (!alb) return;

      // 1. Определяем, нужно ли фильтровать список
      // В альбоме __favorites__ всегда фильтруем (inactive треки не играют).
      // В обычных альбомах фильтруем, если включен режим F (favoritesOnly).
      const isFavAlbum = alb === FAV_KEY;
      const needFilter = isFavAlbum || ls();

      // 2. Исходный список (полный альбом)
      const source = core.originalPlaylist || [];
      if (!source.length) return;

      let target = source;

      // 3. Фильтрация
      if (needFilter) {
        // Для __favorites__ берем только активные (есть в likedUids)
        // Для обычного альбома в режиме F - тоже только лайкнутые
        const liked = new Set(core.getLikedUidsForAlbum(alb));
        target = source.filter(t => t.uid && liked.has(t.uid));

        // Если в режиме F (в обычном альбоме) не осталось треков -> сброс
        if (!target.length && !isFavAlbum) {
          localStorage.setItem(LS_KEY, '0');
          W.NotificationSystem?.info('Отметьте трек ⭐');
          W.PlayerUI?.updateFavoritesBtn?.();
          return Policy.apply(); // Рестарт как OFF
        }
      }

      // 4. Обработка текущего трека (чтобы не сбросить позицию)
      const cur = core.getCurrentTrack();
      const curUid = cur?.uid;
      
      // Ищем, где текущий трек в новом списке
      let newIdx = target.findIndex(t => t.uid === curUid);
      const trackLost = newIdx === -1;

      // Если трек пропал (сняли лайк в режиме F), переходим к следующему доступному
      if (trackLost) {
        newIdx = Math.min(core.getIndex(), target.length - 1);
      }

      // 5. Применение в ядро
      // preserveOriginalPlaylist: true гарантирует, что мы не потеряем полный альбом при выключении F
      const shuffle = core.isShuffle();
      
      core.setPlaylist(target, Math.max(0, newIdx), {}, {
        preserveOriginalPlaylist: true,
        preserveShuffleMode: true,
        // Если трек тот же — сохраняем позицию, иначе (trackLost) — позиция 0 (новый трек)
        preservePosition: !trackLost
      });

      // 6. Пересборка Shuffle (ТЗ: "shuffle-порядок пересобирается по active")
      if (shuffle) {
        core.shufflePlaylist(); 
      }

      // 7. Обновление UI доступности (Next/Prev)
      W.PlayerUI?.updateAvailableTracksForPlayback?.();
      W.PlayerUI?.updatePlaylistFiltering?.();
    }
  };

  // Авто-подписка на изменения лайков для мгновенной перестройки очереди
  const bind = () => {
    if (pc()) {
      pc().onFavoritesChanged(() => {
        // Перестраиваем только если активен режим F или играем Избранное
        if (ls() || W.AlbumsManager?.getPlayingAlbum() === FAV_KEY) {
          Policy.apply();
        }
      });
    } else setTimeout(bind, 100);
  };
  bind();

  W.PlaybackPolicy = Policy;
})(window);
