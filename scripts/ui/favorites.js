// scripts/ui/favorites.js (ESM)
// Логика работы с избранными треками и соответствующим UI.

(function(){
  const FAVORITES_KEY = 'favorites';
  let favorites = new Map(); // { 'albumKey/trackIndex': { akey, tidx, title, ... } }

  function getFavorites() {
    try {
      const data = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '{}');
      favorites = new Map(Object.entries(data));
    } catch {
      favorites = new Map();
    }
    return favorites;
  }

  function saveFavorites() {
    try {
      const data = Object.fromEntries(favorites.entries());
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save favorites:', e);
    }
  }

  function getFavoriteKey(albumKey, trackIndex) {
    return `${albumKey}/${trackIndex}`;
  }

  function isFavorite(albumKey, trackIndex) {
    return favorites.has(getFavoriteKey(albumKey, trackIndex));
  }

  function toggleFavorite(albumKey, trackIndex) {
    const key = getFavoriteKey(albumKey, trackIndex);
    const trackEl = document.querySelector(`.track[data-idx="${trackIndex}"]`);
    const starEl = trackEl ? trackEl.querySelector('.like-star') : null;

    if (favorites.has(key)) {
      favorites.delete(key);
      if (starEl) starEl.src = 'img/star-outline.svg';
    } else {
      const akey = albumKey || window.currentAlbumKey;
      const cfg = (window.config?.tracks) ? window.config : null;
      const trackData = (cfg && cfg.tracks && cfg.tracks[trackIndex]) ? { ...cfg.tracks[trackIndex] } : {};
      trackData.akey = akey;
      trackData.tidx = trackIndex;
      favorites.set(key, trackData);
      if (starEl) starEl.src = 'img/star.svg';
    }
    saveFavorites();

    if (starEl) {
      starEl.classList.add('animating');
      setTimeout(() => starEl.classList.remove('animating'), 300);
    }

    // Если мы в режиме "только избранные" и убрали последний трек из текущего альбома, могут быть проблемы.
    // Обновим плейлист в ядре.
    if (localStorage.getItem('favoritesOnlyMode') === '1') {
      window.playerCore && window.playerCore.updateFavoritesList && window.playerCore.updateFavoritesList(Array.from(favorites.keys()));
    }
    // Обновим UI если мы в представлении избранного
    if (window.viewMode === 'favorites') {
      buildFavoritesView();
    }
  }

  async function buildFavoritesView() {
    const listEl = document.getElementById('track-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const allFavs = Array.from(favorites.values());
    if (allFavs.length === 0) {
      listEl.innerHTML = `<div style="text-align:center; padding: 20px; opacity: 0.7;">Вы пока не добавили ни одной песни в избранное. Нажмите на ⭐ рядом с названием трека.</div>`;
      return;
    }

    // Группируем по альбомам
    const grouped = allFavs.reduce((acc, fav) => {
      if (!acc[fav.akey]) {
        const albumMeta = window.albumByKey ? window.albumByKey(fav.akey) : null;
        acc[fav.akey] = {
          title: albumMeta ? albumMeta.title : 'Неизвестный альбом',
          tracks: []
        };
      }
      acc[fav.akey].tracks.push(fav);
      return acc;
    }, {});

    let html = '';
    for (const akey in grouped) {
      html += `<div class="fav-album-header">${grouped[akey].title}</div>`;
      html += grouped[akey].tracks.map(track => {
        return `
          <div class="track is-favorite" data-album-key="${track.akey}" data-track-idx="${track.tidx}" data-action="play-favorite"
            data-fav-album="${track.akey}" data-fav-track="${track.tidx}">
            <span class="tnum">${track.tidx + 1}.</span>
            <span class="track-title">${track.title || 'Без названия'}</span>
            <img class="like-star" src="img/star.svg" alt="В избранном" data-action="toggle-favorite-from-fav-view">
          </div>`;
      }).join('');
    }
    listEl.innerHTML = html;
  }

  function openFavoritesView() {
    window.viewMode = 'favorites';
    if (typeof window.applyRelizUiMode === 'function') window.applyRelizUiMode(false);
    if (typeof window.clearRelizView === 'function') window.clearRelizView();

    const list = document.getElementById('track-list');
    const cw = document.getElementById('cover-wrap');
    if (list) list.style.display = '';
    if (cw) cw.style.display = 'none';

    buildFavoritesView();

    // Переключаем плеер в режим "только избранное" принудительно
    if (localStorage.getItem('favoritesOnlyMode') !== '1') {
      if(typeof window.__toggleFavoritesOnly_impl === 'function') window.__toggleFavoritesOnly_impl(true);
    } else {
        // Если уже включен, просто обновим список
        window.playerCore?.updateFavoritesList(Array.from(getFavorites().keys()));
    }
  }

  function exitFavoritesView() {
    if (window.viewMode !== 'favorites') return;
    window.viewMode = 'album';
    // Можно восстановить предыдущий альбом или перейти к дефолтному
    if(typeof window.loadAlbumByKey === 'function') {
        window.loadAlbumByKey(window.currentAlbumKey || document.getElementById('album-select')?.value);
    }
  }

  // Реализация переключателя "только избранное"
  function __toggleFavoritesOnly_impl(forceState) {
    const currentState = localStorage.getItem('favoritesOnlyMode') === '1';
    const newState = forceState !== undefined ? !!forceState : !currentState;

    localStorage.setItem('favoritesOnlyMode', newState ? '1' : '0');

    const btn = document.getElementById('favorites-btn');
    if (btn) btn.classList.toggle('favorites-active', newState);
    const icon = document.getElementById('favorites-btn-icon');
    if (icon) icon.src = newState ? 'img/star.png' : 'img/star2.png';

    const filterBtn = document.getElementById('filter-favorites-btn');
    const trackListEl = document.getElementById('track-list');

    if (trackListEl) {
        trackListEl.classList.toggle('filtered', newState);
        if(newState) {
            const hasVisible = !!trackListEl.querySelector('.track.is-favorite');
            if(!hasVisible) {
               filterBtn.textContent = 'Нет отмеченных ⭐ песен';
            } else {
               filterBtn.textContent = 'Показать все песни';
            }
        } else {
            filterBtn.textContent = 'Скрыть не отмеченные ⭐ песни';
        }
    }
    filterBtn.classList.toggle('filtered', newState);


    if (window.playerCore && typeof window.playerCore.setFavoritesOnly === 'function') {
      window.playerCore.setFavoritesOnly(newState, Array.from(getFavorites().keys()));
    }

    if (window.NotificationSystem) {
      window.NotificationSystem.info(newState ? '⭐ Только избранное' : 'Все треки');
    }

    if(typeof window.updateNextUpLabel === 'function') window.updateNextUpLabel();
  }


  // Init
  getFavorites();

  // Export
  window.FAVORITES_KEY = FAVORITES_KEY;
  window.getFavorites = getFavorites;
  window.saveFavorites = saveFavorites;
  window.isFavorite = isFavorite;
  window.toggleFavorite = toggleFavorite;
  window.buildFavoritesView = buildFavoritesView;
  window.openFavoritesView = openFavoritesView;
  window.exitFavoritesView = exitFavoritesView;
  window.__toggleFavoritesOnly_impl = __toggleFavoritesOnly_impl;
})();
