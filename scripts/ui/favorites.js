// scripts/ui/favorites.js (ESM)
// Представление «Избранное»: агрегирует отмеченные треки всех альбомов в один плейлист.
// Сохраняет базовое правило плеера: НИЧТО, кроме Play/Pause/Stop/таймера сна, не останавливает воспроизведение.

(function () {
  // Модель ссылок: индекс в «Избранном» → { __a: albumKey, __t: trackIndex, ...копия полей }
  let favoritesRefsModel = [];
  let __overridesInstalled = false;
  let __orig_isLiked = null;
  let __orig_toggleLike = null;

  function readLikesMap() {
    try { return JSON.parse(localStorage.getItem('likedTracks:v2')) || {}; } catch { return {}; }
  }
  function writeLikesMap(map) {
    try { localStorage.setItem('likedTracks:v2', JSON.stringify(map || {})); } catch {}
  }

  // Проверка лайка по агрегированному индексу
  function isLikedFavoritesIndex(idx) {
    const ref = favoritesRefsModel[idx];
    if (!ref) return false;
    const map = readLikesMap();
    const arr = Array.isArray(map?.[ref.__a]) ? map[ref.__a] : [];
    return arr.includes(ref.__t);
  }

  // Обновить класс звёздочек в текущем #track-list для favorites view
  function updateFavoriteClassesInFavorites() {
    try {
      const list = document.getElementById('track-list');
      if (!list) return;
      list.querySelectorAll('.track').forEach(row => {
        const i = parseInt(row.getAttribute('data-index') || '-1', 10);
        const on = isLikedFavoritesIndex(i);
        row.classList.toggle('is-favorite', on);
        const star = row.querySelector('.like-star');
        if (star && star.tagName === 'IMG') {
          star.src = on ? 'img/star.png' : 'img/star2.png';
          star.title = on ? 'Убрать из понравившихся' : 'Добавить в понравившиеся';
        }
      });
    } catch {}
  }

  function applyFavoritesOverrides(enable) {
    if (enable && !__overridesInstalled) {
      __orig_isLiked = window.isLiked || null;
      __orig_toggleLike = window.toggleLike || null;

      // В режиме «Избранное» isLiked(i) смотрит в favoritesRefsModel → likesMap
      window.isLiked = function (i) {
        if (window.viewMode === 'favorites') return isLikedFavoritesIndex(i);
        return __orig_isLiked ? __orig_isLiked(i) : false;
      };

      // В режиме «Избранное» toggleLike(i) переключает лайк исходного (album,track),
      // затем пересобирает список «Избранного» (чтобы элемент исчез при снятии звезды).
      window.toggleLike = function (i, ev) {
        if (window.viewMode !== 'favorites') {
          if (typeof __orig_toggleLike === 'function') return __orig_toggleLike(i, ev);
          return;
        }
        const ref = favoritesRefsModel[i];
        if (!ref) return;
        const map = readLikesMap();
        const arr = Array.isArray(map[ref.__a]) ? map[ref.__a] : [];
        const pos = arr.indexOf(ref.__t);
        if (pos >= 0) arr.splice(pos, 1);
        else arr.push(ref.__t);
        map[ref.__a] = Array.from(new Set(arr)).sort((a, b) => a - b);
        writeLikesMap(map);

        // Лёгкая анимация звезды
        if (ev && ev.target && ev.target.classList) {
          ev.target.classList.add('animating');
          setTimeout(() => ev.target.classList.remove('animating'), 300);
        }

        // Пересобираем «Избранное»
        openFavoritesView({ keepPlaying: true });
      };

      __overridesInstalled = true;
    } else if (!enable && __overridesInstalled) {
      if (__orig_isLiked) window.isLiked = __orig_isLiked;
      if (__orig_toggleLike) window.toggleLike = __orig_toggleLike;
      __orig_isLiked = null;
      __orig_toggleLike = null;
      __overridesInstalled = false;
    }
  }

  async function buildFavoritesModel() {
    const likesMap = readLikesMap();
    const albumKeys = Object.keys(likesMap).filter(k => Array.isArray(likesMap[k]) && likesMap[k].length > 0);
    if (!albumKeys.length) return [];

    // Гарантируем индекс альбомов: сохраним порядок
    if (!window.albumsIndex || !window.albumsIndex.length) {
      await (window.loadAlbumsIndex ? window.loadAlbumsIndex() : Promise.resolve());
    }
    const order = (window.albumsIndex || []).map(a => a.key);
    albumKeys.sort((a, b) => order.indexOf(a) - order.indexOf(b));

    const result = [];
    for (const akey of albumKeys) {
      const cfg = await (window.__getAlbumConfigByKey ? window.__getAlbumConfigByKey(akey) : (window.getAlbumConfigByKey ? window.getAlbumConfigByKey(akey) : Promise.resolve(null)));
      if (!cfg || !Array.isArray(cfg.tracks)) continue;
      const liked = (likesMap[akey] || []).slice().sort((a, b) => a - b);
      for (const ti of liked) {
        const t = cfg.tracks[ti];
        if (!t || !t.audio) continue;
        result.push({
          __a: akey,
          __t: ti,
          title: t.title || `Трек #${ti + 1}`,
          artist: cfg.artist || 'Витрина Разбита',
          album: cfg.albumName || (window.ICON_TITLE_MAP?.[akey] || 'Альбом'),
          cover: (Array.isArray(window.coverGalleryArr) && window.coverGalleryArr[0] && (window.coverGalleryArr[0].formats?.full || window.coverGalleryArr[0].src)) || 'img/logo.png',
          audio: t.audio,
          lyrics: t.lyrics || '',
          fulltext: t.fulltext || ''
        });
      }
    }
    return result;
  }

  function favoritesToConfig(model) {
    // Pseudo-config с плоским списком треков
    return {
      albumName: 'Избранное',
      artist: 'Витрина Разбита',
      socials: [],
      tracks: model.map(m => ({
        title: m.title,
        audio: m.audio,
        lyrics: m.lyrics,
        fulltext: m.fulltext
      }))
    };
  }

  async function openFavoritesView(opts = {}) {
    window.viewMode = 'favorites';
    window.currentAlbumKey = window.SPECIAL_FAVORITES_KEY;
    if (typeof window.applyRelizUiMode === 'function') window.applyRelizUiMode(false);

    // Иконка/заголовок
    try { window.setActiveAlbumIcon && window.setActiveAlbumIcon(window.SPECIAL_FAVORITES_KEY); } catch {}
    try { window.setAlbumHeaderTitle && window.setAlbumHeaderTitle(window.SPECIAL_FAVORITES_KEY); } catch {}

    // Показ треклиста и галереи (оставим обложку видимой)
    const list = document.getElementById('track-list');
    const cw = document.getElementById('cover-wrap');
    if (list) list.style.display = '';
    if (cw) cw.style.display = '';

    // Гарантируем быстрый «логотип» на обложке, если нужно
    try {
      const slot = document.getElementById('cover-slot');
      if (slot && !slot.firstChild) {
        const img = new Image();
        img.src = 'img/logo.png';
        img.alt = 'Избранное';
        slot.appendChild(img);
      }
    } catch {}

    // Построение модели «Избранное»
    favoritesRefsModel = await buildFavoritesModel();

    // Экспорт модели для offline.js
    window.favoritesRefsModel = favoritesRefsModel.map(x => ({ ...x, __active: true }));

    if (!favoritesRefsModel.length) {
      if (list) {
        list.innerHTML = '<div style="text-align:center; opacity:.85; margin:10px 0;">В избранном пусто. Отметьте треки ⭐ в альбомах.</div>';
      }
      applyFavoritesOverrides(true);
      // Обновим мини-режим
      try { window.applyMiniModeUI && window.applyMiniModeUI(); } catch {}
      return;
    }

    // Pseudo-config → window.config, не трогая playingAlbumKey
    const favCfg = favoritesToConfig(favoritesRefsModel);
    window.config = favCfg;

    // Рендерим список и плеерный блок
    try { window.buildTrackList && window.buildTrackList(); } catch {}
    try { window.applyMiniModeUI && window.applyMiniModeUI(); } catch {}
    try { window.updateNextUpLabel && window.updateNextUpLabel(); } catch {}

    // Включаем overrides поведения звёзд (работают поверх tracks.js)
    applyFavoritesOverrides(true);

    // Обновим подсветку звёзд
    updateFavoriteClassesInFavorites();
  }

  function exitFavoritesView() {
    applyFavoritesOverrides(false);
    // Очистить модель (не обязательно, но избегаем устаревших ссылок)
    favoritesRefsModel = [];
    window.favoritesRefsModel = [];
  }

  // Экспорт
  window.openFavoritesView = window.openFavoritesView || openFavoritesView;
  window.exitFavoritesView = window.exitFavoritesView || exitFavoritesView;
})();
