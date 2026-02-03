// scripts/ui/favorites.js
(function (W) {
  'use strict';

  const FAV = W.SPECIAL_FAVORITES_KEY || '__favorites__';
  const LOGO = 'img/logo.png';
  
  const U = W.Utils;
  const trim = (v) => U.obj.trim(v);

  // Хелпер для поиска красивого названия альбома в глобальном индексе
  const getGlobalAlbumTitle = (key) => {
    if (!key || !W.albumsIndex) return null;
    const found = W.albumsIndex.find(a => a.key === key);
    return found ? found.title : null;
  };

  const buildFavoritesRefsModel = async () => {
    const pc = W.playerCore;
    if (!pc?.getFavoritesState) return (W.favoritesRefsModel = []);

    const st = pc.getFavoritesState();
    // Берем и активные (лайкнутые), и неактивные (удаленные, но еще в списке)
    const rawItems = [...(st.active || []), ...(st.inactive || [])];

    W.favoritesRefsModel = rawItems.map((item) => {
      const uid = trim(item.uid);
      const meta = W.TrackRegistry?.getTrackByUid(uid);
      const isActive = pc.isFavorite(uid);
      
      // Ключ альбома берем откуда только можно (реестр -> избранное)
      const albumKey = trim(meta?.sourceAlbum || item.sourceAlbum);

      if (!meta) {
        return {
          __uid: uid,
          title: 'Загрузка...',
          __active: false,
          isGhost: true
        };
      }

      // --- ЛОГИКА НАЗВАНИЯ АЛЬБОМА ---
      // 1. Берем из метаданных трека
      let albumTitle = meta.album;
      
      // 2. Если там заглушка "Альбом", пробуем найти в глобальном индексе (albums.json)
      if (!albumTitle || albumTitle === 'Альбом') {
         const globalTitle = getGlobalAlbumTitle(albumKey);
         if (globalTitle) albumTitle = globalTitle;
         else albumTitle = 'Альбом';
      }
      // -------------------------------

      return {
        ...meta, 
        
        __uid: uid,
        __a: albumKey,
        __album: albumTitle, // Используем вычисленное красивое имя
        __active: isActive,
        __cover: meta.cover || LOGO,
        
        audio: isActive ? meta.src : null 
      };
    });
    
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
      } else {
        setTimeout(bind, 100);
      }
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
