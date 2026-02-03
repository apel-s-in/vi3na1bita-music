import { $ } from '../utils/app-utils.js';
import { renderFavoritesList, renderFavoritesEmpty, bindFavoritesList } from '../../ui/favorites-view.js';
import { loadAndRenderNewsInline } from '../../ui/news-inline.js';

const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__';
const FAV_COVER = 'img/Fav_logo.png'; // ✅ Исправлено: Своя иконка для Избранного

// --- Favorites Logic ---

export async function loadFavoritesAlbum(ctx) {
  ctx.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');

  if (window.OfflineUI?.preloadAllAlbumsTrackIndex) {
     await window.OfflineUI.preloadAllAlbumsTrackIndex(); 
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
        // Soft delete в контексте Favorites View
        window.playerCore?.toggleFavorite?.(uid, { source: 'favorites', albumKey });
      },

      onActiveRowClick: async ({ uid }) => {
        const model = getUiModel();
        // Играем только активные (зеленые)
        const activeList = model.filter((it) => it && it.__active && !it.isGhost);
        const idx = activeList.findIndex((it) => String(it?.__uid || '').trim() === String(uid || '').trim());
        
        if (idx >= 0) await ensureFavoritesPlayback(ctx, activeList, idx);
      },

      onInactiveRowClick: ({ uid, title }) => {
        window.playerCore?.showInactiveFavoriteModal?.({
          uid, title,
          onDeleted: async () => {
            await rebuild();
            window.PlayerUI?.updateAvailableTracksForPlayback?.();
          },
        });
      },
    });

    // Реакция на изменение лайков (удаление/возврат) -> перерисовка списка
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

  // 1. ✅ ЖЕСТКАЯ ИЗОЛЯЦИЯ: Устанавливаем контекст "Избранное"
  // Это гарантирует, что isBrowsingOtherAlbum вернет false, и плеер встанет ПОД трек.
  ctx.setPlayingAlbum(FAV);

  // 2. Формируем изолированный плейлист
  // Подменяем album на "Избранное" и cover на Fav_logo.png
  const tracks = activeList.map((it) => ({
    ...it, 
    album: 'Избранное', // Визуальное название альбома в плеере
    cover: FAV_COVER,   // ✅ Иконка Избранного
    sourceAlbum: it.sourceAlbum || it.__a // Сохраняем ссылку на реальный альбом для логики
  }));

  // 3. Загружаем в ядро
  window.playerCore.setPlaylist(
    tracks,
    activeIndex,
    { artist: 'Витрина Разбита', album: 'Избранное', cover: FAV_COVER },
    { preservePosition: false }
  );

  window.playerCore.play(activeIndex);
  
  // Подсветка и скролл
  const clicked = activeList[activeIndex];
  ctx.highlightCurrentTrack(-1, { uid: String(clicked?.uid).trim(), albumKey: String(clicked?.sourceAlbum).trim() });

  window.PlayerUI?.ensurePlayerBlock?.(activeIndex, { userInitiated: true });
  window.PlayerUI?.updateAvailableTracksForPlayback?.();
}

// --- News Logic ---
export async function loadNewsAlbum(ctx) {
  ctx.renderAlbumTitle('📰 НОВОСТИ 📰', 'news');
  await ctx.loadGallery(NEWS);
  $('cover-wrap').style.display = '';
  const container = $('track-list');
  if (container) await loadAndRenderNewsInline(container);
}
