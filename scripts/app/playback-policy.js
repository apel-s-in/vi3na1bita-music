(function(W){
  'use strict';
  
  const LS_KEY = 'favoritesOnlyMode';
  const FAV_KEY = window.SPECIAL_FAVORITES_KEY || '__favorites__';

  const pc = () => W.playerCore;
  const ls = () => localStorage.getItem(LS_KEY) === '1';

  const Policy = {
    apply: () => {
      const core = pc();
      if (!core) return;

      const alb = W.AlbumsManager?.getPlayingAlbum();
      if (!alb) return;

      const isFavAlbum = alb === FAV_KEY;
      const needFilter = isFavAlbum || ls();

      const source = core.originalPlaylist || [];
      if (!source.length) return;

      let target = source;

      if (needFilter) {
        if (isFavAlbum) {
           target = source.filter(t => t.uid && core.isFavorite(t.uid));
        } else {
           const likedUids = new Set(core.getLikedUidsForAlbum(alb));
           target = source.filter(t => t.uid && likedUids.has(t.uid));
        }

        // Если отфильтрованный список пуст
        if (!target.length && !isFavAlbum) {
          W.NotificationSystem?.info('Нет избранных треков. Режим не применен.');
          return; 
        }
      }

      const cur = core.getCurrentTrack();
      const curUid = cur?.uid;
      
      let newIdx = target.findIndex(t => t.uid === curUid);
      const trackLost = newIdx === -1;

      if (trackLost) {
        const origIdx = source.findIndex(t => t.uid === curUid);
        if (origIdx >= 0) {
            for(let i = origIdx + 1; i < source.length; i++) {
                const nextUid = source[i].uid;
                newIdx = target.findIndex(t => t.uid === nextUid);
                if (newIdx !== -1) break;
            }
        }
        if (newIdx === -1) newIdx = 0;
      }

      const shuffle = core.isShuffle();
      
      core.setPlaylist(target, Math.max(0, newIdx), {}, {
        preserveOriginalPlaylist: true,
        preserveShuffleMode: true,
        preservePosition: !trackLost
      });

      if (shuffle) core.shufflePlaylist(); 

      W.PlayerUI?.updateAvailableTracksForPlayback?.();
      W.PlayerUI?.updatePlaylistFiltering?.();
    }
  };

  const bind = () => {
    if (pc()) {
      pc().onFavoritesChanged(() => {
        if (ls() || W.AlbumsManager?.getPlayingAlbum() === FAV_KEY) {
          Policy.apply();
        }
      });
    } else setTimeout(bind, 100);
  };
  bind();

  W.PlaybackPolicy = Policy;
})(window);
