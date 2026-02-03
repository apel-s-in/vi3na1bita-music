import { $ } from '../utils/app-utils.js';
import { renderFavoritesList, renderFavoritesEmpty, bindFavoritesList } from '../../ui/favorites-view.js';
import { loadAndRenderNewsInline } from '../../ui/news-inline.js';

const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__';
const LOGO = 'img/logo.png';

// --- Favorites Logic ---

export async function loadFavoritesAlbum(ctx) {
  ctx.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');

  // 1. Пытаемся подгрузить реестр треков (важно для offline/favorites, если альбом не открывали)
  if (window.OfflineUI && window.OfflineUI.preloadAllAlbumsTrackIndex) {
     // Эта функция парсит все config.json и наполняет реестр
     // Мы не ждем await, если это долго, но надеемся что кэш быстрый
     await window.OfflineUI.preloadAllAlbumsTrackIndex(); 
  }

  const coverWrap = $('cover-wrap');
  if (coverWrap) coverWrap.style.display = 'none';

  const container = $('track-list');
  if (!container) return;

  // 2. Функция обновления данных
  const refreshData = async () => {
     try { await window.FavoritesUI?.buildFavoritesRefsModel(); } catch {}
  };

  // 3. Геттер модели (исправлено имя функции!)
  const getUiModel = () => window.FavoritesUI?.getModel() || [];

  // 4. Функция перерисовки
  const rebuild = async () => {
    await refreshData();
    const model = getUiModel();
    if (!model.length) renderFavoritesEmpty(container);
    else renderFavoritesList(container, model);
  };

  // 5. Биндинг событий (один раз)
  if (!ctx._favoritesViewBound) {
    ctx._favoritesViewBound = true;

    bindFavoritesList(container, {
      getModel: getUiModel, // Передаем корректную функцию

      // Клик по звезде -> Soft Delete
      onStarClick: async ({ uid, albumKey }) => {
        window.playerCore?.toggleFavorite?.(uid, { source: 'favorites', albumKey });
      },

      // Клик по треку -> Play
      onActiveRowClick: async ({ uid }) => {
        const model = getUiModel();
        // Фильтруем список: только активные и не "призраки"
        const activeList = model.filter((it) => it && it.__active && !it.isGhost);
        
        // Ищем индекс кликнутого в АКТИВНОМ списке
        const idx = activeList.findIndex((it) => String(it?.__uid || '').trim() === String(uid || '').trim());
        
        if (idx >= 0) await ensureFavoritesPlayback(ctx, activeList, idx);
      },

      // Клик по серому треку -> Модалка
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

    // Авто-обновление при изменениях извне (плеер, мини-плеер)
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

/**
 * Запуск воспроизведения
 * Теперь используем объекты из TrackRegistry, минимально их модифицируя.
 */
export async function ensureFavoritesPlayback(ctx, activeList, activeIndex) {
  // Защита от дребезга
  const now = Date.now();
  if (ctx._favPlayGuard && (now - (ctx._favPlayGuard.ts || 0)) < 300) return;
  ctx._favPlayGuard = { ts: now };

  if (!activeList?.length) return void window.NotificationSystem?.warning('Нет доступных треков');

  // Формируем плейлист для ядра
  // activeList уже содержит данные из registry, но нам нужно гарантировать поля для плеера
  const tracks = activeList.map((it) => ({
    ...it, // Берем все поля (uid, src, lyrics, sources и т.д.)
    
    // Переопределяем контекст альбома для плеера
    album: FAV, // Чтобы плеер знал, что играет "Избранное"
    cover: LOGO,
    
    // Сохраняем ссылку на исходный альбом (важно для переходов)
    sourceAlbum: it.sourceAlbum || it.__a 
  }));

  if (!tracks.length) return void window.NotificationSystem?.warning('Нет доступных треков');

  // Загружаем в плеер
  window.playerCore.setPlaylist(
    tracks,
    activeIndex,
    { artist: 'Витрина Разбита', album: 'Избранное', cover: LOGO },
    { preservePosition: false }
  );

  window.playerCore.play(activeIndex);

  ctx.setPlayingAlbum(FAV);
  
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
