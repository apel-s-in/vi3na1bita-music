// scripts/ui/favorites-view.js
// FavoritesView: модель + рендер + делегирование кликов для окна «Избранное».
// Объединяет бывший favorites.js и favorites-view.js.
// Не управляет воспроизведением напрямую (инвариант).

const STAR_ON = 'img/star.png';
const STAR_OFF = 'img/star2.png';
const LOGO = 'img/logo.png';
const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';

const esc = (s) => {
  const fn = window.Utils?.escapeHtml;
  return typeof fn === 'function' ? fn(String(s ?? '')) : String(s ?? '');
};

const trim = (v) => window.Utils?.obj?.trim?.(v) ?? (String(v || '').trim() || null);

function getGlobalAlbumTitle(key) {
  if (!key || !window.albumsIndex) return null;
  const found = window.albumsIndex.find(a => a.key === key);
  return found ? found.title : null;
}

// --- Модель ---

let _model = [];

export async function buildFavoritesRefsModel() {
  const pc = window.playerCore;
  if (!pc?.getFavoritesState) return (_model = []);

  const st = pc.getFavoritesState();
  const rawItems = [...(st.active || []), ...(st.inactive || [])];

  _model = rawItems.map((item) => {
    const uid = trim(item.uid);
    const meta = window.TrackRegistry?.getTrackByUid(uid);
    const isActive = pc.isFavorite(uid);
    const albumKey = trim(meta?.sourceAlbum || item.sourceAlbum);

    if (!meta) {
      return { __uid: uid, title: 'Загрузка...', __active: false, isGhost: true };
    }

    let albumTitle = meta.album;
    if (!albumTitle || albumTitle === 'Альбом') {
      albumTitle = getGlobalAlbumTitle(albumKey) || 'Альбом';
    }

    return {
      ...meta,
      __uid: uid,
      __a: albumKey,
      __album: albumTitle,
      __active: isActive,
      __cover: meta.cover || LOGO,
      audio: isActive ? meta.src : null
    };
  });

  return _model;
}

export function getModel() { return _model; }

export function getActiveModel(m) {
  return (m || _model).filter(it => it && it.__active && !it.isGhost);
}

// --- Рендер ---

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
    const id = `fav_${a}_${u}`;

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

// --- Делегирование кликов ---

export function bindFavoritesList(container, handlers) {
  if (!container || container.__favBound) return;
  container.__favBound = true;

  const getModelFn = typeof handlers?.getModel === 'function' ? handlers.getModel : () => _model;
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

    const model = getModelFn();
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

// --- Автоинициализация подписки ---

let _bound = false;
function _initSubscription() {
  if (_bound) return;
  _bound = true;
  const bind = () => {
    if (window.playerCore?.onFavoritesChanged) {
      window.playerCore.onFavoritesChanged(() => {
        if (window.AlbumsManager?.getCurrentAlbum?.() === FAV) {
          buildFavoritesRefsModel().catch(console.error);
        }
      });
    } else {
      setTimeout(bind, 100);
    }
  };
  bind();
}
_initSubscription();

// Глобальный доступ для совместимости
window.FavoritesUI = {
  buildFavoritesRefsModel,
  getModel,
  getActiveModel,
};
window.buildFavoritesRefsModel = buildFavoritesRefsModel;
