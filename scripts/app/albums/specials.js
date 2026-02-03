import { $ } from '../utils/app-utils.js';
import { renderFavoritesList, renderFavoritesEmpty, bindFavoritesList } from '../../ui/favorites-view.js';
import { loadAndRenderNewsInline } from '../../ui/news-inline.js';

const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__';
const LOGO = 'img/logo.png';

// --- Favorites Logic ---

export async function loadFavoritesAlbum(ctx) {
  ctx.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');

  // Предзагрузка реестра (важно для метаданных)
  if (window.OfflineUI?.preloadAllAlbumsTrackIndex) {
     await window.OfflineUI.preloadAllAlbumsTrackIndex(); 
  }

  const coverWrap = $('cover-wrap');
  if (coverWrap) coverWrap.style.display = 'none';

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

      // Клик по звезде -> Soft Delete (inactive)
      onStarClick: async ({ uid, albumKey }) => {
        // Явно указываем source: 'favorites', чтобы сработал Soft Delete
        window.playerCore?.toggleFavorite?.(uid, { source: 'favorites', albumKey });
      },

      // Клик по треку -> Play
      onActiveRowClick: async ({ uid }) => {
        const model = getUiModel();
        // Фильтруем только активные и существующие
        const activeList = model.filter((it) => it && it.__active && !it.isGhost);
        const idx = activeList.findIndex((it) => String(it?.__uid || '').trim() === String(uid || '').trim());
        
        if (idx >= 0) await ensureFavoritesPlayback(ctx, activeList, idx);
      },

      // Клик по серому -> Модалка
      onInactiveRowClick: ({ uid, title }) => {
        window.playerCore?.showInactiveFavoriteModal?.({
          uid,
          title,
          onDeleted: async () => {
            await rebuild();
            window.PlayerUI?.updateAvailableTracksForPlayback?.();
          },
        });
      },
    });

    const pc = window.playerCore;
    if (pc?.onFavoritesChanged) {
      pc.onFavoritesChanged(async () => {
        if (ctx.getCurrentAlbum() === FAV) {
          await rebuild();
          window.PlayerUI?.updateAvailableTracksForPlayback?.();
        }
      });
    }
  }

  await rebuild();
}

export async function ensureFavoritesPlayback(ctx, activeList, activeIndex) {
  const now = Date.now();
  if (ctx._favPlayGuard && (now - (ctx._favPlayGuard.ts || 0)) < 300) return;
  ctx._favPlayGuard = { ts: now };

  if (!activeList?.length) return void window.NotificationSystem?.warning('Нет доступных треков');

  // 1. СНАЧАЛА устанавливаем контекст (Fix Race Condition)
  ctx.setPlayingAlbum(FAV);

  // Формируем плейлист
  const tracks = activeList.map((it) => ({
    ...it, // Копируем все свойства из реестра (включая src, sources, lyrics)
    album: FAV, // Подменяем контекст альбома для плеера
    cover: LOGO,
    sourceAlbum: it.sourceAlbum || it.__a // Ссылка на родной альбом
  }));

  if (!tracks.length) return void window.NotificationSystem?.warning('Нет доступных треков');

  // 2. Загружаем и играем
  window.playerCore.setPlaylist(
    tracks,
    activeIndex,
    { artist: 'Витрина Разбита', album: 'Избранное', cover: LOGO },
    { preservePosition: false }
  );

  window.playerCore.play(activeIndex);
  
  // Подсветка
  const clicked = activeList[activeIndex];
  const cu = String(clicked?.uid || '').trim();
  const ca = String(clicked?.sourceAlbum || clicked?.__a || '').trim();
  ctx.highlightCurrentTrack(-1, { uid: cu, albumKey: ca });

  window.PlayerUI?.ensurePlayerBlock?.(activeIndex, { userInitiated: true });
  window.PlayerUI?.updateAvailableTracksForPlayback?.();
}

// --- News Logic ---
export async function loadNewsAlbum(ctx) {
  ctx.renderAlbumTitle('📰 НОВОСТИ 📰', 'news');
  await ctx.loadGallery(NEWS);
  const coverWrap = $('cover-wrap');
  if (coverWrap) coverWrap.style.display = '';
  const container = $('track-list');
  if (!container) return;
  await loadAndRenderNewsInline(container);
}
