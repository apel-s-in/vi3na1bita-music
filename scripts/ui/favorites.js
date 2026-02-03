// scripts/ui/favorites.js
(function (W) {
  'use strict';

  const FAV = W.SPECIAL_FAVORITES_KEY || '__favorites__';
  const LOGO = 'img/logo.png';
  const U = W.Utils;
  const trim = (v) => U.obj.trim(v);

  const getGlobalAlbumTitle = (key) => {
    if (!key || !W.albumsIndex) return null;
    const found = W.albumsIndex.find(a => a.key === key);
    return found ? found.title : null;
  };

  const buildFavoritesRefsModel = async () => {
    const pc = W.playerCore;
    if (!pc?.getFavoritesState) return (W.favoritesRefsModel = []);

    const st = pc.getFavoritesState();
    // Объединяем списки, чтобы показать и серые треки
    const rawItems = [...(st.active || []), ...(st.inactive || [])];

    W.favoritesRefsModel = rawItems.map((item) => {
      const uid = trim(item.uid);
      const meta = W.TrackRegistry?.getTrackByUid(uid);
      const isActive = pc.isFavorite(uid);
      
      const albumKey = trim(meta?.sourceAlbum || item.sourceAlbum);

      if (!meta) {
        return { __uid: uid, title: 'Загрузка...', __active: false, isGhost: true };
      }

      // Исправление названия альбома
      let albumTitle = meta.album;
      if (!albumTitle || albumTitle === 'Альбом') {
         albumTitle = getGlobalAlbumTitle(albumKey) || 'Альбом';
      }

      return {
        ...meta, 
        __uid: uid,
        __a: albumKey,
        __album: albumTitle, 
        __active: isActive,
        __cover: meta.cover || LOGO,
        audio: isActive ? meta.src : null 
      };
    });
    
    // Сортировка: новые сверху (по addedAt, если есть в item, или просто сохраняем порядок от getFavoritesState)
    return W.favoritesRefsModel;
  };

  const init = () => {
    if (W.__favoritesUIBound) return;
    W.__favoritesUIBound = true;
    const bind = () => {
      if (W.playerCore?.onFavoritesChanged) {
        W.playerCore.onFavoritesChanged(() => {
          if (W.AlbumsManager?.getCurrentAlbum?.() === FAV) {
            buildFavoritesRefsModel().catch(console.error);
          }
        });
      } else { setTimeout(bind, 100); }
    };
    bind();
  };

  W.FavoritesUI = {
    buildFavoritesRefsModel,
    getModel: () => W.favoritesRefsModel || [],
    getActiveModel: (m) => (m || W.FavoritesUI.getModel()).filter(it => it && it.__active && !it.isGhost),
  };
  
  W.buildFavoritesRefsModel = buildFavoritesRefsModel;
  init();
})(window);
