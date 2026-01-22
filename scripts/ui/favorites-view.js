// scripts/ui/favorites-view.js
// FavoritesView: чистый рендер + делегирование кликов для окна «Избранное».
// Не управляет воспроизведением напрямую (инвариант).

const STAR_ON = 'img/star.png';
const STAR_OFF = 'img/star2.png';

const esc = (s) => {
  const fn = window.Utils?.escapeHtml;
  return typeof fn === 'function' ? fn(String(s ?? '')) : String(s ?? '');
};

function rowIdFromItem(it) {
  // back-compat: e2e ожидает формат fav_{albumKey}_{uid}
  const a = String(it?.__a || '').trim();
  const u = String(it?.__uid || '').trim();
  return `fav_${a}_${u}`;
}

export function renderFavoritesEmpty(container) {
  if (!container) return;
  container.innerHTML = `
    <div class="fav-empty">
      <h3>Избранные треки</h3>
      <p>Отметьте треки звёздочкой ⭐</p>
    </div>
  `;
}

export function renderFavoritesList(container, model) {
  if (!container) return;

  const list = Array.isArray(model) ? model : [];
  if (!list.length) return renderFavoritesEmpty(container);

  container.innerHTML = list.map((it, i) => {
    const a = String(it?.__a || '').trim();
    const u = String(it?.__uid || '').trim();
    const active = !!it?.__active;

    const albumTitle = String(it?.__album || 'Альбом');
    const trackTitle = String(it?.title || 'Трек');

    const id = rowIdFromItem(it);

    return `
      <div class="track${active ? '' : ' inactive'}"
           id="${esc(id)}"
           data-index="${i}"
           data-album="${esc(a)}"
           data-uid="${esc(u)}">
        <div class="tnum">${String(i + 1).padStart(2, '0')}.</div>
        <div class="track-title" title="${esc(trackTitle)} - ${esc(albumTitle)}">
          <span class="fav-track-name">${esc(trackTitle)}</span>
          <span class="fav-album-name"> — ${esc(albumTitle)}</span>
        </div>
        <img src="${active ? STAR_ON : STAR_OFF}"
             class="like-star"
             alt="звезда"
             data-album="${esc(a)}"
             data-uid="${esc(u)}">
      </div>
    `;
  }).join('');
}

/**
 * bindFavoritesList(container, handlers)
 * handlers:
 * - getModel(): any[]
 * - onStarClick({ uid, albumKey }): void
 * - onActiveRowClick({ uid, albumKey }): void
 * - onInactiveRowClick({ uid, title }): void
 */
export function bindFavoritesList(container, handlers) {
  if (!container || container.__favBound) return;
  container.__favBound = true;

  const getModel = typeof handlers?.getModel === 'function' ? handlers.getModel : () => [];
  const onStarClick = typeof handlers?.onStarClick === 'function' ? handlers.onStarClick : () => {};
  const onActiveRowClick = typeof handlers?.onActiveRowClick === 'function' ? handlers.onActiveRowClick : () => {};
  const onInactiveRowClick = typeof handlers?.onInactiveRowClick === 'function' ? handlers.onInactiveRowClick : () => {};

  container.addEventListener('click', (e) => {
    const target = e.target;
    const row = target?.closest?.('.track');
    if (!row || !container.contains(row)) return;

    const uid = String(row.dataset.uid || '').trim();
    const albumKey = String(row.dataset.album || '').trim();
    if (!uid || !albumKey) return;

    const model = getModel();
    const item = Array.isArray(model)
      ? model.find((it) => String(it?.__uid || '').trim() === uid && String(it?.__a || '').trim() === albumKey)
      : null;

    if (!item) return;

    if (target?.classList?.contains('like-star')) {
      e.preventDefault();
      e.stopPropagation();
      onStarClick({ uid, albumKey });
      return;
    }

    if (item.__active && item.audio) {
      onActiveRowClick({ uid, albumKey });
      return;
    }

    onInactiveRowClick({ uid, title: String(item?.title || 'Трек') });
  });
}
