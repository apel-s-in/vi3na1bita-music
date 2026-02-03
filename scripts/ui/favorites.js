// scripts/ui/favorites.js
(function (W) {
  'use strict';

  const FAV = W.SPECIAL_FAVORITES_KEY || '__favorites__';
  const LOGO = 'img/logo.png';
  
  const U = W.Utils;
  const trim = (v) => U.obj.trim(v);

  /**
   * Строит модель для отображения списка Избранного.
   * Объединяет данные из FavoritesV2 (статус) и TrackRegistry (данные трека).
   */
  const buildFavoritesRefsModel = async () => {
    const pc = W.playerCore;
    // Используем PlayerCore как источник истины о состоянии (active/inactive)
    if (!pc?.getFavoritesState) return (W.favoritesRefsModel = []);

    const st = pc.getFavoritesState();
    // Объединяем активные и неактивные (неактивные нужны для UI восстановления)
    const rawItems = [...(st.active || []), ...(st.inactive || [])];

    W.favoritesRefsModel = rawItems.map((item) => {
      const uid = trim(item.uid);
      const meta = W.TrackRegistry?.getTrackByUid(uid); // Берём из реестра
      
      // Определяем, активен ли трек (лайкнут) прямо сейчас
      const isActive = pc.isFavorite(uid);

      if (!meta) {
        // Если данных нет в реестре (не загружен альбом), возвращаем заглушку
        return {
          __uid: uid,
          title: 'Загрузка...',
          __active: false,
          isGhost: true // Флаг для UI, что данные отсутствуют
        };
      }

      // Возвращаем объект, совместимый с favorites-view.js
      return {
        // Данные трека (проксируем из registry)
        ...meta, 
        
        // Специфичные поля для списка
        __uid: uid,
        __a: meta.sourceAlbum || item.sourceAlbum, // Album Key
        __album: meta.album, // Название альбома
        __active: isActive,
        __cover: meta.cover || LOGO,
        
        // Для плеера (хотя PlayerCore возьмет из реестра, тут для view)
        audio: isActive ? meta.src : null 
      };
    });
    
    return W.favoritesRefsModel;
  };

  const init = () => {
    if (W.__favoritesUIBound) return;
    W.__favoritesUIBound = true;
    
    // Реактивность: перестраиваем модель при изменении лайков
    const bind = () => {
      if (W.playerCore?.onFavoritesChanged) {
        W.playerCore.onFavoritesChanged(() => {
          // Обновляем модель только если мы визуально в Избранном
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
  
  // Alias
  W.buildFavoritesRefsModel = buildFavoritesRefsModel;
  
  init();
})(window);
