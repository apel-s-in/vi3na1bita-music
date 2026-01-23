// scripts/app/albums/specials.js
// Спец-альбомы: __favorites__ и __reliz__ (news)
// Важно: никаких автоплеев из onFavoritesChanged, только UI refresh.

import { $, toStr } from '../utils/app-utils.js';
import { renderFavoritesList, renderFavoritesEmpty, bindFavoritesList } from '../../ui/favorites-view.js';
import { buildFavoritesModel } from '../../ui/favorites.js';
import { loadAndRenderNewsInline } from '../../ui/news-inline.js';

const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__';
const LOGO = 'img/logo.png';

export async function loadFavoritesAlbum(ctx) {
  ctx.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');

  // ✅ Жёсткое правило проекта
  try { await window.ensureTrackRegistryReadyForFavorites?.(); } catch {}

  const coverWrap = $('cover-wrap');
  if (coverWrap) coverWrap.style.display = 'none';

  const container = $('track-list');
  if (!container) return;

  const getModel = () => {
    try {
      const m = buildFavoritesModel();
      return Array.isArray(m) ? m : [];
    } catch {
      return [];
    }
  };

  const rebuild = async () => {
    const model = getModel();
    if (!model.length) renderFavoritesEmpty(container);
    else renderFavoritesList(container, model);
  };

  if (!ctx._favoritesViewBound) {
    ctx._favoritesViewBound = true;

    bindFavoritesList(container, {
      getModel,

      onStarClick: async ({ uid, albumKey }) => {
        try { await window.ensureTrackRegistryReadyForFavorites?.(); } catch {}
        window.playerCore?.toggleFavorite?.(uid, { fromAlbum: false, albumKey });
      },

      onActiveRowClick: async ({ uid }) => {
        const model = getModel();
        const active = model.filter((it) => it && it.__active && it.audio);

        const activeIndex = active.findIndex((it) => String(it?.uid || '').trim() === String(uid || '').trim());
        if (activeIndex >= 0) await ctx.ensureFavoritesPlayback(activeIndex);
      },

      onInactiveRowClick: ({ uid, title }) => {
        window.playerCore?.showInactiveFavoriteModal?.({
          uid,
          title,
          onDeleted: async () => window.PlayerUI?.updateAvailableTracksForPlayback?.(),
        });
      },
    });

    const pc = window.playerCore;
    if (pc?.onFavoritesChanged) {
      pc.onFavoritesChanged(async () => {
        if (ctx.currentAlbum !== FAV) return;
        await rebuild();
        window.PlayerUI?.updateAvailableTracksForPlayback?.();
        // ⚠️ ВАЖНО: никаких play/stop здесь.
      });
    }
  }

  await rebuild();
}

export async function ensureFavoritesPlayback(ctx, activeIndex) {
  // ✅ На случай гонок: гарантируем TrackRegistry ДО сборки модели (urls/metadata)
  try { await window.ensureTrackRegistryReadyForFavorites?.(); } catch {}

  // Anti-double-play guard
  const now = Date.now();
  if (ctx._favPlayGuard && (now - (ctx._favPlayGuard.ts || 0)) < 250) return;
  if (ctx._favPlayGuard) ctx._favPlayGuard.ts = now;

  let model = null;
  try { model = buildFavoritesModel(); } catch {}
  const list = Array.isArray(model) ? model : [];
  if (!list.length) return void window.NotificationSystem?.warning('Нет избранных треков');

  const active = list.filter((it) => it && it.__active && it.audio);
  if (!active.length) return void window.NotificationSystem?.warning('Нет доступных треков');

  const startIndex = Number.isFinite(activeIndex) && activeIndex >= 0 ? activeIndex : 0;
  const clicked = active[startIndex] || active[0];

  const tracks = active.map((it) => ({
    src: it.audio,
    sources: it.sources || null,
    title: it.title,
    artist: 'Витрина Разбита',
    album: FAV,
    cover: LOGO,
    lyrics: it.lyrics || null,
    fulltext: it.fulltext || null,
    uid: typeof it.uid === 'string' && it.uid.trim() ? it.uid.trim() : null,
    sourceAlbum: it.sourceAlbum || null,
    hasLyrics: it.hasLyrics,
  })).filter((t) => !!t.uid && !!t.src);

  if (!tracks.length) return void window.NotificationSystem?.warning('Нет доступных треков');

  window.playerCore.setPlaylist(
    tracks,
    startIndex,
    { artist: 'Витрина Разбита', album: 'Избранное', cover: LOGO },
    { preservePosition: false }
  );

  window.playerCore.play(startIndex);

  ctx.setPlayingAlbum(FAV);

  const cu = toStr(clicked?.uid).trim();
  const ca = toStr(clicked?.sourceAlbum).trim();
  ctx.highlightCurrentTrack(-1, { uid: cu, albumKey: ca });

  window.PlayerUI?.ensurePlayerBlock?.(startIndex, { userInitiated: true });
  window.PlayerUI?.updateAvailableTracksForPlayback?.();
}

export async function loadNewsAlbum(ctx) {
  ctx.renderAlbumTitle('📰 НОВОСТИ 📰', 'news');
  await ctx.loadGallery(NEWS);

  const coverWrap = $('cover-wrap');
  if (coverWrap) coverWrap.style.display = '';

  const container = $('track-list');
  if (!container) return;

  await loadAndRenderNewsInline(container);
}
