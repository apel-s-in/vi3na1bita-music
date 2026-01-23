// scripts/app/albums/specials.js
// Спец-альбомы: __favorites__ и новости + ensureFavoritesPlayback.
// Никаких автоплеев на события favoritesChanged.

import { buildFavoritesModel } from '../../ui/favorites.js';

export async function loadFavoritesAlbum(ctx) {
  // ctx ожидается как AlbumsManager (this) из albums.js
  ctx.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');

  // ✅ Жёсткое правило: TrackRegistry должен быть готов ДО активного использования Favorites
  try { await window.ensureTrackRegistryReadyForFavorites?.(); } catch {}

  // Собираем v2 модель (UID-only) через TrackRegistry
  const model = buildFavoritesModel();

  // Рендер списка (используем текущую реализацию albums.js через ctx)
  ctx.renderFavoritesAlbum(model);

  // Подписка на изменения избранного: только перерисовка + обновление доступных треков/policy
  if (!ctx._favUnsub && window.playerCore?.onFavoritesChanged) {
    ctx._favUnsub = window.playerCore.onFavoritesChanged(() => {
      try { ctx.refreshFavoritesAlbum?.(); } catch {}
      try { window.PlayerUI?.updateAvailableTracksForPlayback?.(); } catch {}
      try { window.PlaybackPolicy?.apply?.({ reason: 'favoritesChanged' }); } catch {}
    });
  }
}

export function ensureFavoritesPlayback(ctx, model, { uid, action } = {}) {
  // action: 'play' | 'openInactiveModal'
  // ВАЖНО: это вызывается от user-action (клик в избранном), play здесь допустим.
  if (!model || !Array.isArray(model)) return;

  const pc = window.playerCore;
  if (!pc) return;

  const active = model.filter((x) => x && x.__active);
  const inactive = model.filter((x) => x && x.__inactive);

  const u = String(uid || '').trim();
  const clicked = model.find((x) => String(x?.uid || '').trim() === u) || null;

  if (!clicked) return;

  if (clicked.__inactive) {
    // клики по inactive — только модалка
    pc.showInactiveFavoriteModal?.({ uid: clicked.uid, title: clicked.title });
    return;
  }

  if (action === 'play') {
    // Играем только из __active
    const playlist = active.map((x) => ({
      uid: x.uid,
      title: x.title,
      file: x.audio || x.audio_low || null,
      fileHi: x.audio || null,
      fileLo: x.audio_low || null,
      sources: x.sources || null,
      sizeHi: x.size || null,
      sizeLo: x.size_low || null,
      lyrics: x.lyrics || null,
      fulltext: x.fulltext || null,
      sourceAlbum: x.sourceAlbum || null,
    }));

    const idx = Math.max(0, playlist.findIndex((t) => String(t?.uid || '').trim() === u));

    pc.setPlaylist(playlist, idx, { albumKey: window.SPECIAL_FAVORITES_KEY }, { preserveOriginalPlaylist: false });
    pc.play();
  }
}

export async function loadNewsAlbum(ctx) {
  ctx.renderAlbumTitle('НОВОСТИ', 'news');
  await window.NewsInline?.render?.();
}
