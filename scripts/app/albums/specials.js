import { $ } from '../utils/app-utils.js';
import { renderFavoritesList, renderFavoritesEmpty, bindFavoritesList } from '../../ui/favorites-view.js';
import { loadAndRenderNewsInline } from '../../ui/news-inline.js';

const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__';
const FAV_COVER = 'img/Fav_logo.png';

// --- Favorites Logic ---

export async function loadFavoritesAlbum(ctx) {
  ctx.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');

  // FIX: Используем глобально доступный метод или проверяем наличие
  if (window.preloadAllAlbumsTrackIndex) {
     await window.preloadAllAlbumsTrackIndex(); 
  }

  $('cover-wrap').style.display = 'none';
  const container = $('track-list');
  if (!container) return;

  const refreshData = async () => { try { await window.FavoritesUI?.buildFavoritesRefsModel(); } catch {} };
  const getUiModel = () => window.FavoritesUI?.getModel() || [];

  const rebuild = async () => {
    await refreshData();
    const model = getUiModel();
    if (!model.length) renderFavoritesEmpty(container);
    else renderFavoritesList(container, model);
  };

  if (!ctx._favoritesViewBound) {
    ctx._favoritesViewBound = true;

    bindFavoritesList(container, {
      getModel: getUiModel,

      onStarClick: async ({ uid, albumKey }) => {
        if (ctx.getCurrentAlbum() !== FAV) return;
        // FIX: явно указываем source='favorites'
        window.playerCore?.toggleFavorite?.(uid, { source: 'favorites', albumKey });
      },

      onActiveRowClick: async ({ uid }) => {
        if (ctx.getCurrentAlbum() !== FAV) return;

        const model = getUiModel();
        // Фильтруем только активные для воспроизведения
        const activeList = model.filter((it) => it && it.__active && !it.isGhost);
        
        // FIX: Ищем по __uid, так как модель Favorites UI использует это поле
        const idx = activeList.findIndex((it) => String(it?.__uid || '').trim() === String(uid || '').trim());
        
        if (idx >= 0) await ensureFavoritesPlayback(ctx, activeList, idx);
      },

      onInactiveRowClick: ({ uid, title }) => {
        if (ctx.getCurrentAlbum() !== FAV) return;
        
        // ВАЖНО: Никакого воспроизведения, только модалка
        window.playerCore?.showInactiveFavoriteModal?.({
          uid, title,
          onDeleted: async () => {
            await rebuild();
            window.PlayerUI?.updateAvailableTracksForPlayback?.();
          },
        });
      },
    });

    window.playerCore?.onFavoritesChanged(async () => {
      if (ctx.getCurrentAlbum() === FAV) {
        await rebuild();
        window.PlayerUI?.updateAvailableTracksForPlayback?.();
      }
    });
  }

  await rebuild();
}

export async function ensureFavoritesPlayback(ctx, activeList, activeIndex) {
  if (!activeList?.length) return window.NotificationSystem?.warning('Нет доступных треков');

  ctx.setPlayingAlbum(FAV);

  // FIX: Не делаем spread ...it, чтобы не засорять объект трека UI-мусором (__active, __uid и т.д.)
  // Собираем чистый объект для плеера.
  const tracks = activeList.map((it) => {
      const srcAlbum = it.sourceAlbum || it.__a;
      return {
        uid: it.__uid, // ensure uid is passed
        title: it.title,
        artist: it.artist || 'Витрина Разбита',
        album: 'Избранное', // В плеере пишем "Избранное"
        cover: FAV_COVER,   // Обложка избранного
        src: it.audio || it.src, // Audio url
        audio: it.audio || it.src,
        audio_low: it.audio_low,
        sources: it.sources,
        lyrics: it.lyrics,
        fulltext: it.fulltext,
        sourceAlbum: srcAlbum
      };
  });

  window.playerCore.setPlaylist(
    tracks,
    activeIndex,
    { artist: 'Витрина Разбита', album: 'Избранное', cover: FAV_COVER },
    { preservePosition: false }
  );

  window.playerCore.play(activeIndex);
  
  const clicked = activeList[activeIndex];
  // FIX: Используем __uid
  ctx.highlightCurrentTrack(-1, { 
      uid: String(clicked?.__uid).trim(), 
      albumKey: String(clicked?.sourceAlbum || clicked?.__a).trim() 
  });

  window.PlayerUI?.ensurePlayerBlock?.(activeIndex, { userInitiated: true });
  window.PlayerUI?.updateAvailableTracksForPlayback?.();
}

// --- News Logic ---
export async function loadNewsAlbum(ctx) {
  ctx.renderAlbumTitle('📰 НОВОСТИ 📰', 'news');
  
  // FIX: Используем window.GalleryManager напрямую
  if (window.GalleryManager?.loadGallery) {
      await window.GalleryManager.loadGallery(NEWS);
  }
  
  $('cover-wrap').style.display = '';
  const container = $('track-list');
  if (container) await loadAndRenderNewsInline(container);
}
