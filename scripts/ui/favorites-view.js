// scripts/ui/favorites-view.js
// Favorites view renderer/binder for special album "__favorites__" inside #track-list
// Exports (back-compat for scripts/app/albums.js):
// - renderFavoritesList(container, model)
// - renderFavoritesEmpty(container)
// - bindFavoritesList(container, handlers)

import { buildFavoritesModel } from './favorites.js';

function esc(s) {
  const fn = window.Utils?.escapeHtml;
  const v = String(s ?? '');
  return (typeof fn === 'function')
    ? fn(v)
    : v.replace(/[<>&'"]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;' }[m]));
}

function safeStr(x) {
  return String(x ?? '').trim();
}

function rowIdFor(uid) {
  // Для совместимости с тестами/индикаторами: fav_{sourceAlbum}_{uid}
  // sourceAlbum для v2 можно брать из TrackRegistry meta (если есть).
  const meta = window.TrackRegistry?.getTrackByUid?.(uid) || null;
  const a = safeStr(meta?.sourceAlbum || meta?.album || meta?.albumKey || 'unknown');
  return `fav_${a}_${uid}`;
}

function renderRow(it) {
  const uid = safeStr(it?.uid);
  const title = esc(it?.title || '');
  const inactive = !!it?.__inactive;
  const star = inactive ? 'img/star2.png' : 'img/star.png';

  // IMPORTANT:
  // class "track" — как в обычном списке, чтобы существующие стили/подсветка работали.
  // class "inactive" — чтобы серить строку.
  return `
    <div class="track ${inactive ? 'inactive' : ''}"
         id="${esc(rowIdFor(uid))}"
         data-index="-1"
         data-uid="${esc(uid)}"
         data-album="${esc(safeStr(window.TrackRegistry?.getTrackByUid?.(uid)?.sourceAlbum || ''))}">
      <div class="tnum">★</div>
      <div class="track-title">${title}</div>
      <img src="${esc(star)}"
           class="like-star"
           alt="звезда"
           data-uid="${esc(uid)}">
    </div>
  `;
}

export function renderFavoritesEmpty(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="fav-empty">
      <h3>Избранное пусто</h3>
      <p>Поставьте ⭐ у трека в альбоме, чтобы он появился здесь.</p>
    </div>
  `;
}

export function renderFavoritesList(container, model) {
  if (!container) return;
  const list = Array.isArray(model) ? model : [];

  // ВАЖНО: model у нас v2: элементы имеют uid, title, __active/__inactive
  container.innerHTML = list.map(renderRow).join('');
}

/**
 * bindFavoritesList(container, handlers)
 * handlers:
 * - getModel(): returns current favorites model (array)
 * - onStarClick({ uid, albumKey })
 * - onActiveRowClick({ uid })
 * - onInactiveRowClick({ uid, title })
 */
export function bindFavoritesList(container, handlers = {}) {
  if (!container || container.__favoritesBound) return;
  container.__favoritesBound = true;

  const getModel = typeof handlers.getModel === 'function'
    ? handlers.getModel
    : () => buildFavoritesModel();

  container.addEventListener('click', async (e) => {
    const row = e.target?.closest?.('.track');
    if (!row || !container.contains(row)) return;

    const uid = safeStr(row.dataset.uid);
    if (!uid) return;

    const model = getModel();
    const item = Array.isArray(model) ? model.find((x) => safeStr(x?.uid) === uid) : null;
    const inactive = !!item?.__inactive;

    // ⭐ click
    if (e.target?.classList?.contains('like-star')) {
      e.preventDefault();
      e.stopPropagation();

      // albumKey нужен только для legacy синхронизации/подсветки.
      // Для UID-only v2 он необязателен, но albums.js передаёт.
      const meta = window.TrackRegistry?.getTrackByUid?.(uid) || null;
      const albumKey = safeStr(meta?.sourceAlbum || '');

      try {
        await handlers.onStarClick?.({ uid, albumKey });
      } catch {}

      return;
    }

    // Row click
    if (inactive) {
      e.preventDefault();
      e.stopPropagation();
      try {
        handlers.onInactiveRowClick?.({ uid, title: item?.title || '' });
      } catch {}
      return;
    }

    // active row => play
    try {
      await handlers.onActiveRowClick?.({ uid });
    } catch {}
  });
}
