import { $ } from '../utils/app-utils.js';
import { renderFavoritesList, renderFavoritesEmpty, bindFavoritesList } from '../../ui/favorites-view.js';
import { buildFavoritesModel } from '../../ui/favorites.js';
import { loadAndRenderNewsInline } from '../../ui/news-inline.js';

const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__';
const LOGO = 'img/logo.png';

// --- Favorites Logic ---

export async function loadFavoritesAlbum(ctx) {
  ctx.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');

  // Гарантируем готовность реестра треков (UID lookup)
  try { await window.ensureTrackRegistryReadyForFavorites?.(); } catch {}

  const coverWrap = $('cover-wrap');
  if (coverWrap) coverWrap.style.display = 'none';

  const container = $('track-list');
  if (!container) return;

  // Функция получения модели данных
  const getModel = () => {
    try { return buildFavoritesModel() || []; } catch { return []; }
  };

  // Функция перерисовки
  const rebuild = async () => {
    const model = getModel();
    if (!model.length) renderFavoritesEmpty(container);
    else renderFavoritesList(container, model);
  };

  // Биндинг событий (один раз)
  if (!ctx._favoritesViewBound) {
    ctx._favoritesViewBound = true;

    bindFavoritesList(container, {
      getModel,

      // Клик по звезде ВНУТРИ избранного -> source='favorites' (Soft Delete / Inactive)
      onStarClick: async ({ uid, albumKey }) => {
        window.playerCore?.toggleFavorite?.(uid, { source: 'favorites', albumKey });
      },

      // Клик по активному треку -> Воспроизведение
      onActiveRowClick: async ({ uid }) => {
        const model = getModel();
        // Фильтруем только активные для плейлиста
        const activeList = model.filter((it) => it && it.__active && it.audio);
        const idx = activeList.findIndex((it) => String(it?.__uid || '').trim() === String(uid || '').trim());
        
        if (idx >= 0) await ensureFavoritesPlayback(ctx, activeList, idx);
      },

      // Клик по неактивному (серому) треку -> Модалка восстановления/удаления
      onInactiveRowClick: ({ uid, title }) => {
        window.playerCore?.showInactiveFavoriteModal?.({
          uid,
          title,
          onDeleted: async () => {
            // После удаления обновляем UI и доступность треков
            await rebuild();
            window.PlayerUI?.updateAvailableTracksForPlayback?.();
          },
        });
      },
    });

    // Реакция на изменения (из любой части приложения)
    const pc = window.playerCore;
    if (pc?.onFavoritesChanged) {
      pc.onFavoritesChanged(async () => {
        // Обновляем список, только если мы визуально находимся в Избранном
        if (ctx.getCurrentAlbum() === FAV) {
          await rebuild();
          window.PlayerUI?.updateAvailableTracksForPlayback?.();
        }
      });
    }
  }

  await rebuild();
}

// Логика запуска воспроизведения из Избранного
export async function ensureFavoritesPlayback(ctx, activeList, activeIndex) {
  // Anti-double-play guard
  const now = Date.now();
  if (ctx._favPlayGuard && (now - (ctx._favPlayGuard.ts || 0)) < 300) return;
  ctx._favPlayGuard = { ts: now };

  if (!activeList?.length) return void window.NotificationSystem?.warning('Нет доступных треков');

  const clicked = activeList[activeIndex] || activeList[0];

  // Формируем плейлист для ядра (PlayerCore)
  const tracks = activeList.map((it) => ({
    uid: typeof it.uid === 'string' ? it.uid.trim() : null,
    src: it.audio, // Resolved URL (Local or Network)
    // Важно: передаем оригинальные source ссылки для Resolver'а в PlayerCore
    sources: it.sources || null, 
    audio: it.sources?.audio?.hi || it.audio,
    audio_low: it.sources?.audio?.lo,
    
    title: it.title,
    artist: 'Витрина Разбита',
    album: FAV,
    cover: LOGO,
    lyrics: it.lyrics || null,
    fulltext: it.fulltext || null,
    sourceAlbum: it.sourceAlbum || null,
    hasLyrics: it.hasLyrics,
  })).filter((t) => !!t.uid && !!t.src);

  if (!tracks.length) return void window.NotificationSystem?.warning('Нет доступных треков');

  // Загружаем в плеер
  window.playerCore.setPlaylist(
    tracks,
    activeIndex,
    { artist: 'Витрина Разбита', album: 'Избранное', cover: LOGO },
    { preservePosition: false }
  );

  window.playerCore.play(activeIndex);

  // Обновляем состояние менеджера
  ctx.setPlayingAlbum(FAV);
  
  // Подсветка
  const cu = String(clicked?.uid || '').trim();
  const ca = String(clicked?.sourceAlbum || '').trim();
  ctx.highlightCurrentTrack(-1, { uid: cu, albumKey: ca });

  // UI
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
