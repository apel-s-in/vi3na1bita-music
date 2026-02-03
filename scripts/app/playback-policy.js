(function(W){
  'use strict';
  
  const LS_KEY = 'favoritesOnlyMode';
  const FAV_KEY = window.SPECIAL_FAVORITES_KEY || '__favorites__';

  const pc = () => W.playerCore;
  const ls = () => localStorage.getItem(LS_KEY) === '1';

  const Policy = {
    /**
     * Применяет политику воспроизведения (Favorites Only + Shuffle).
     * Работает строго на сравнении UID.
     */
    apply: () => {
      const core = pc();
      if (!core) return;

      const alb = W.AlbumsManager?.getPlayingAlbum();
      if (!alb) return;

      // 1. Логика фильтрации
      const isFavAlbum = alb === FAV_KEY;
      const needFilter = isFavAlbum || ls();

      // 2. Исходный список (Snaphost оригинала)
      const source = core.originalPlaylist || [];
      if (!source.length) return;

      let target = source;

      // 3. Применение фильтра
      if (needFilter) {
        // Получаем UID-ы лайкнутых треков для этого альбома
        // Для спец. альбома __favorites__ лайки проверяются глобально, 
        // но здесь мы полагаемся на то, что в originalPlaylist уже лежат правильные треки,
        // и нам нужно отфильтровать только inactive.
        
        if (isFavAlbum) {
           // В альбоме "Избранное" оригинальный плейлист уже состоит из избранных, 
           // но некоторые могут стать inactive в процессе.
           // Проверяем актуальный статус лайка через ядро.
           target = source.filter(t => t.uid && core.isFavorite(t.uid));
        } else {
           // Обычный альбом + режим F
           const likedUids = new Set(core.getLikedUidsForAlbum(alb));
           target = source.filter(t => t.uid && likedUids.has(t.uid));
        }

        // Если пусто
        if (!target.length && !isFavAlbum) {
          localStorage.setItem(LS_KEY, '0');
          W.NotificationSystem?.info('Отметьте трек ⭐');
          W.PlayerUI?.updateFavoritesBtn?.();
          return Policy.apply(); // Рестарт без фильтра
        }
      }

      // 4. Сохранение текущего трека
      const cur = core.getCurrentTrack();
      const curUid = cur?.uid;
      
      let newIdx = target.findIndex(t => t.uid === curUid);
      const trackLost = newIdx === -1;

      // Если текущий трек выпал из списка (сняли лайк), ищем ближайший
      if (trackLost) {
        // Пытаемся найти трек, который был после текущего в оригинальном списке
        const origIdx = source.findIndex(t => t.uid === curUid);
        if (origIdx >= 0) {
            // Ищем первый доступный трек после выпавшего
            for(let i = origIdx + 1; i < source.length; i++) {
                const nextUid = source[i].uid;
                newIdx = target.findIndex(t => t.uid === nextUid);
                if (newIdx !== -1) break;
            }
        }
        // Если все еще -1, берем 0
        if (newIdx === -1) newIdx = 0;
      }

      // 5. Применение в ядро
      const shuffle = core.isShuffle();
      
      core.setPlaylist(target, Math.max(0, newIdx), {}, {
        preserveOriginalPlaylist: true,
        preserveShuffleMode: true,
        preservePosition: !trackLost
      });

      // 6. Shuffle если был включен
      if (shuffle) {
        core.shufflePlaylist(); 
      }

      // 7. Обновление UI
      W.PlayerUI?.updateAvailableTracksForPlayback?.();
      W.PlayerUI?.updatePlaylistFiltering?.();
    }
  };

  const bind = () => {
    if (pc()) {
      pc().onFavoritesChanged(() => {
        // Автоматическая перестройка очереди при лайке/дизлайке
        if (ls() || W.AlbumsManager?.getPlayingAlbum() === FAV_KEY) {
          Policy.apply();
        }
      });
    } else setTimeout(bind, 100);
  };
  bind();

  W.PlaybackPolicy = Policy;
})(window);
