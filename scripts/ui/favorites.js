// scripts/ui/favorites.js
// UI «Избранного», гармонизированный с likedTracks:v2.
// Централизует ВСЮ механику UI «Избранного» и вспомогательные операции фильтрации.
// Добавлено: "пустой стейт" при пустом favoritesRefsModel и защита от двойных кликов по звезде (≈180 мс).
(function FavoritesUIModule() {
  const w = window;

  // Безопасные прокси к глобальным функциям/данным
  const hasFn = (name) => typeof w[name] === 'function';
  const call = (name, ...args) => (hasFn(name) ? w[name](...args) : undefined);
  const get = (name, dflt) => (name in w ? w[name] : dflt);

  // likedTracks:v2 helpers
  function getLikedMapSafe() {
    try {
      if (hasFn('getLikedMap')) return w.getLikedMap();
      const raw = localStorage.getItem('likedTracks:v2');
      const map = raw ? JSON.parse(raw) : {};
      return (map && typeof map === 'object') ? map : {};
    } catch { return {}; }
  }
  function setLikedMapSafe(map) {
    try { localStorage.setItem('likedTracks:v2', JSON.stringify(map || {})); } catch {}
  }
  function getLikedForAlbumSafe(albumKey) {
    try {
      if (hasFn('getLikedForAlbum')) return w.getLikedForAlbum(albumKey);
      const map = getLikedMapSafe();
      const arr = map && typeof map === 'object' ? map[albumKey] : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  // Декоратор от двойных кликов: защита 180 мс
  let __lastStarClickTs = 0;
  function guardStarClick() {
    const now = Date.now();
    if (now - __lastStarClickTs < 180) return true;
    __lastStarClickTs = now;
    return false;
  }

  // Обновление класса .current в списке «Избранного»
  function updateFavoritesCurrentRow(idx) {
    try {
      const rows = document.querySelectorAll('#track-list .track');
      rows.forEach(r => r.classList.remove('current'));
      const row = rows[idx];
      if (row) row.classList.add('current');
    } catch {}
  }

  // Обновление .is-favorite в «Избранном»
  function updateFavoriteClassesFavorites() {
    try {
      const model = w.favoritesRefsModel;
      if (!Array.isArray(model)) return;
      document.querySelectorAll('#track-list .track').forEach(tr => tr.classList.remove('is-favorite'));
      model.forEach((item) => {
        if (item && item.__active) {
          const el = document.getElementById(`fav_${item.__a}_${item.__t}`);
          if (el) el.classList.add('is-favorite');
        }
      });
    } catch {}
  }

  // Обновление .is-favorite в альбомном представлении
  function updateFavoriteClasses() {
    try {
      const liked = hasFn('getLiked') ? w.getLiked() : [];
      document.querySelectorAll('#track-list .track').forEach(tr => tr.classList.remove('is-favorite'));
      liked.forEach(idx => {
        const el = document.getElementById(`trk${idx}`);
        if (el) el.classList.add('is-favorite');
      });
    } catch {}
  }

  // Изменить лайк (запись в likedTracks:v2)
  function toggleLikeForAlbum(albumKey, idx, makeLiked) {
    const map = getLikedMapSafe();
    const arr = Array.isArray(map[albumKey]) ? map[albumKey] : [];
    const has = arr.includes(idx);
    let next = arr.slice();
    if (makeLiked && !has) next.push(idx);
    if (!makeLiked && has) next = next.filter(x => x !== idx);
    map[albumKey] = Array.from(new Set(next));
    setLikedMapSafe(map);
  }

  // UI‑обновление одной строки «Избранного»
  function updateFavRow(ref, active) {
    const row = document.getElementById(`fav_${ref.a}_${ref.t}`); if (!row) return;
    row.classList.toggle('inactive', !active);
    const star = row.querySelector('.like-star');
    if (star) {
      star.src = active ? 'img/star.png' : 'img/star2.png';
      star.title = active ? 'Снять из избранного' : 'Вернуть в избранное';
    }
  }

  // Модалка: трек неактивен в «Избранном»
  function showFavInactivePrompt(ref) {
    const modal = document.createElement('div');
    modal.className = 'modal-bg active';
    modal.innerHTML = `
      <div class="modal-feedback" style="max-width: 380px;">
        <button class="bigclose" onclick="this.closest('.modal-bg').remove()" title="Закрыть">
          <svg viewBox="0 0 48 48"><line x1="12" y1="12" x2="36" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><line x1="36" y1="12" x2="12" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg>
        </button>
        <div style="font-weight:700; margin-bottom:10px;">Трек неактивен</div>
        <div style="opacity:.8; margin-bottom:14px;">
          Чтобы снова слушать трек в «ИЗБРАННОМ», добавьте его в избранное в исходном альбоме.
          Также можно удалить ссылку из этого списка.
        </div>
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <button class="offline-btn online" style="min-width:140px;" id="fav-add-btn">Добавить в ⭐</button>
          <button class="offline-btn" style="min-width:140px;" id="fav-del-btn">Удалить</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const onAdd = () => {
      toggleLikeForAlbum(ref.a, ref.t, true);
      updateFavRow(ref, true);
      call('updateFavoritesRefsModelActiveFlag', ref.a, ref.t, true);
      modal.remove();
      w.NotificationSystem && w.NotificationSystem.success('Добавлено в избранное');
    };
    const onDel = () => { modal.remove(); showFavDeleteConfirm(ref); };

    modal.querySelector('#fav-add-btn').onclick = onAdd;
    modal.querySelector('#fav-del-btn').onclick = onDel;
  }

  // Модалка: подтверждение удаления ссылки из «Избранного»
  function showFavDeleteConfirm(ref) {
    const modal = document.createElement('div');
    modal.className = 'modal-bg active';
    modal.innerHTML = `
      <div class="modal-feedback" style="max-width: 390px;">
        <button class="bigclose" onclick="this.closest('.modal-bg').remove()" title="Закрыть">
          <svg viewBox="0 0 48 48"><line x1="12" y1="12" x2="36" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><line x1="36" y1="12" x2="12" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg>
        </button>
        <div style="font-weight:700; margin-bottom:10px;">Удалить из «ИЗБРАННОГО»?</div>
        <div style="opacity:.8; margin-bottom:12px;">
          Трек исчезнет из списка «ИЗБРАННОЕ», но останется доступным в исходном альбоме.
        </div>
        <div style="display:flex; gap:10px; justify-content:center;">
          <button class="offline-btn" style="min-width:120px;" id="fav-del-cancel">Отмена</button>
          <button class="offline-btn online" style="min-width:120px;" id="fav-del-apply">Удалить</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const onCancel = () => modal.remove();
    const onApply = () => {
      try {
        const refs = call('readFavoritesRefs') || [];
        const next = refs.filter(x => !(x.a === ref.a && x.t === ref.t));
        call('writeFavoritesRefs', next);
      } catch {}
      document.getElementById(`fav_${ref.a}_${ref.t}`)?.remove();

      try {
        if (Array.isArray(w.favoritesRefsModel)) {
          w.favoritesRefsModel = w.favoritesRefsModel.filter(x => !(x.__a === ref.a && x.__t === ref.t));
          const rows = document.querySelectorAll('#track-list .track');
          rows.forEach((row, i) => {
            const tnum = row.querySelector('.tnum');
            if (tnum) tnum.textContent = `${String(i + 1).padStart(2, '0')}.`;
          });
        }
      } catch {}

      modal.remove();
      w.NotificationSystem && w.NotificationSystem.success('Удалено из «ИЗБРАННОГО»');
    };

    modal.querySelector('#fav-del-cancel').onclick = onCancel;
    modal.querySelector('#fav-del-apply').onclick = onApply;
  }

  // Пустой стейт (UX) для favoritesRefsModel
  function renderEmptyState(list) {
    const el = document.createElement('div');
    el.style.cssText = 'text-align:center; opacity:.85; margin:12px 6px; padding:10px; border:1px dashed rgba(255,255,255,.18); border-radius:8px; background:rgba(255,255,255,.04)';
    el.innerHTML = `
      <div style="font-weight:800; margin-bottom:6px;">В «ИЗБРАННОМ» пока пусто</div>
      <div style="font-size:.95em;">
        Откройте любой альбом и отметьте понравившиеся песни звездой ⭐ — они появятся здесь.
      </div>`;
    list.appendChild(el);
  }

  // Главная функция: построение и показ представления «Избранное»
  async function openFavoritesView() {
    call('applyRelizUiMode', false);
    w.viewMode = 'favorites';
    call('clearRelizView');
    call('setActiveAlbumIcon', w.SPECIAL_FAVORITES_KEY);
    call('setAlbumHeaderTitle', w.SPECIAL_FAVORITES_KEY);

    // Сбрасываем карту соответствия (будет создана при старте воспроизведения)
    w.favPlayableMap = null;

    // Гарантируем загрузку списка альбомов (для сборки избранного)
    if ((!Array.isArray(w.albumsIndex) || w.albumsIndex.length === 0) && hasFn('loadAlbumsIndex')) {
      try { await call('loadAlbumsIndex'); } catch {}
    }

    try { w.migrateFavoritesKeys && w.migrateFavoritesKeys(); } catch {}

    // Перенос плеера
    try {
      const lp = document.getElementById('lyricsplayerblock');
      const holder = document.getElementById('now-playing');
      if (lp && holder && !holder.contains(lp)) { holder.innerHTML = ''; holder.appendChild(lp); }
    } catch {}

    call('applyMiniModeUI');

    // Скрываем галерею
    const cw = document.getElementById('cover-wrap'); if (cw) cw.style.display = 'none';

    // Жёстко сбрасываем предыдущее состояние фильтра «⭐»
    try {
      w.favoritesFilterActive = false;
      const listEl = document.getElementById('track-list');
      const filterBtn = document.getElementById('filter-favorites-btn');
      if (listEl) listEl.classList.remove('filtered');
      if (filterBtn) {
        filterBtn.classList.remove('filtered');
        filterBtn.textContent = 'Скрыть не отмеченные ⭐ песни';
      }
    } catch {}
    
    // Сбор модели «Избранного»
    if (hasFn('buildFavoritesRefsModel')) {
      await call('buildFavoritesRefsModel');
    }

    // Рисуем список
    const list = document.getElementById('track-list');
    if (!list) return;
    list.style.display = '';
    list.innerHTML = '<div style="text-align:center; opacity:.8; margin:6px 0 8px 0;">ИЗБРАННЫЕ ПЕСНИ</div>';

    const model = Array.isArray(w.favoritesRefsModel) ? w.favoritesRefsModel : [];
    if (!model.length) {
      renderEmptyState(list);
      call('applyMiniModeUI');
      list.classList.remove('filtered');
      return;
    }

    model.forEach((item, idx) => {
      const n = String(idx + 1).padStart(2, '0');
      const row = document.createElement('div');
      row.className = 'track' + (item.__active ? '' : ' inactive');
      row.id = `fav_${item.__a}_${item.__t}`;
      row.innerHTML = `
        <span class="tnum">${n}.</span>
        <span class="track-title" title="${item.title} — ${item.__album}">
          ${item.title} <span style="opacity:.6;font-size:.9em;">— ${item.__album}</span>
        </span>
        <img src="${item.__active ? 'img/star.png' : 'img/star2.png'}" class="like-star" alt="звезда"
             title="${item.__active ? 'Снять из избранного' : 'Вернуть в избранное'}">
      `;

      // Клик по строке — играем, если активен; иначе подсказка
      row.addEventListener('click', async () => {
        const canPlay = !!item.__active && !!item.audio;
        if (canPlay) {
          if (hasFn('ensureFavoritesPlayback')) {
            await call('ensureFavoritesPlayback', idx);
          }
        } else {
          showFavInactivePrompt({ a: item.__a, t: item.__t, title: item.title, album: item.__album });
        }
      });

      // Клик по звезде — смена статуса (с защитой от двойного клика)
      row.querySelector('.like-star').addEventListener('click', (e) => {
        e.stopPropagation();
        if (guardStarClick()) return;

        const wasActive = getLikedForAlbumSafe(item.__a).includes(item.__t);
        toggleLikeForAlbum(item.__a, item.__t, !wasActive);
        updateFavRow({ a: item.__a, t: item.__t }, !wasActive);
        call('updateFavoritesRefsModelActiveFlag', item.__a, item.__t, !wasActive);

        // Если сейчас играем «Избранное» — поддержим последовательность и UI
        if (w.playingAlbumKey === w.SPECIAL_FAVORITES_KEY && Array.isArray(w.playingTracks)) {
          // Пересборка локальной карты индексов для «играбельного» плейлиста
          try {
            const playable = (w.favoritesRefsModel || []).map((it, i) => ({ it, i }))
              .filter(x => x.it && x.it.__active && x.it.audio);
            w.favPlayableMap = playable.map(x => x.i);
          } catch {}
          if (wasActive) {
            call('createPlayingShuffledPlaylist');
            call('nextTrack');
            w.NotificationSystem && w.NotificationSystem.info('Трек снят из избранного');
          } else {
            call('createPlayingShuffledPlaylist');
            call('updateNextUpLabel');
            w.NotificationSystem && w.NotificationSystem.success('Трек возвращён в избранное');
          }
        } else {
          if (wasActive) w.NotificationSystem && w.NotificationSystem.info('Трек снят из избранного');
          else w.NotificationSystem && w.NotificationSystem.success('Трек возвращён в избранное');
        }

        // Синхронизация с PlayerCore: в режиме «ИЗБРАННОЕ» — НЕТ доп. фильтра в ядре
        if (w.__useNewPlayerCore && w.playerCore && typeof w.playerCore.setFavoritesOnly === 'function') {
          try {
            if (w.playingAlbumKey === w.SPECIAL_FAVORITES_KEY) {
              w.playerCore.setFavoritesOnly(false, []); // плейлист уже отфильтрован
            } else {
              const likedIdx = getLikedForAlbumSafe(w.playingAlbumKey);
              w.playerCore.setFavoritesOnly(!!w.favoritesOnlyMode, likedIdx);
              if (w.favoritesOnlyMode && was && typeof w.isBrowsingSameAsPlaying === 'function' && w.isBrowsingSameAsPlaying()) {
                setTimeout(() => { try { call('nextTrack'); } catch {} }, 0);
              }
            }
          } catch {}
        }
      });

      list.appendChild(row);
    });

    // Если сейчас играет «Избранное» — подсветим текущую и подставим плеер под строку
    if (w.playingAlbumKey === w.SPECIAL_FAVORITES_KEY && typeof w.playingTrack === 'number' && w.playingTrack >= 0) {
      updateFavoritesCurrentRow(w.playingTrack);
      const listTracks = Array.from(document.querySelectorAll('#track-list .track'));
      const rowUnder = listTracks[w.playingTrack];
      const lp = document.getElementById('lyricsplayerblock');
      if (rowUnder && lp && rowUnder.parentNode) {
        if (rowUnder.nextSibling) rowUnder.parentNode.insertBefore(lp, rowUnder.nextSibling);
        else rowUnder.parentNode.appendChild(lp);
      }
    }

    call('applyMiniModeUI');
    list.classList.remove('filtered');
  }

  // Переключение «Скрыть не отмеченные ⭐ песни»
  function toggleFavoritesFilter() {
    const btn = document.getElementById('filter-favorites-btn');
    const list = document.getElementById('track-list');
    if (!btn || !list) return;

    let favoritesFilterActive = get('favoritesFilterActive', false);
    const viewMode = get('viewMode', 'album');

    if (viewMode === 'favorites') {
      favoritesFilterActive = !favoritesFilterActive;
      w.favoritesFilterActive = favoritesFilterActive;

      if (favoritesFilterActive) {
        const anyActive = (w.favoritesRefsModel || []).some(x => x.__active);
        if (!anyActive) {
          w.favoritesFilterActive = false;
          w.NotificationSystem && w.NotificationSystem.warning('Нет активных треков со ⭐!');
          return;
        }
        btn.textContent = 'ПОКАЗАТЬ ВСЕ ПЕСНИ';
        btn.classList.add('filtered');
        list.classList.add('filtered');
        updateFavoriteClassesFavorites();
      } else {
        btn.textContent = 'Скрыть не отмеченные ⭐ песни';
        btn.classList.remove('filtered');
        list.classList.remove('filtered');
      }
      return;
    }

    // Обычный альбом
    const liked = hasFn('getLiked') ? w.getLiked() : [];
    favoritesFilterActive = !favoritesFilterActive;
    w.favoritesFilterActive = favoritesFilterActive;

    if (favoritesFilterActive) {
      if (!liked.length) {
        w.NotificationSystem && w.NotificationSystem.warning('Нет избранных треков!');
        w.favoritesFilterActive = false;
        return;
      }
      btn.textContent = 'ПОКАЗАТЬ ВСЕ ПЕСНИ';
      btn.classList.add('filtered');
      list.classList.add('filtered');
      updateFavoriteClasses();
    } else {
      btn.textContent = 'Скрыть не отмеченные ⭐ песни';
      btn.classList.remove('filtered');
      list.classList.remove('filtered');
    }
  }

  // ИНИЦИАЛИЗАЦИЯ ВОСПРОИЗВЕДЕНИЯ ДЛЯ «ИЗБРАННОГО»
  async function ensureFavoritesPlayback(index) {
    // Перестроим модель при необходимости
    if (!Array.isArray(w.favoritesRefsModel) || w.favoritesRefsModel.length === 0) {
      await (w.FavoritesData?.buildFavoritesRefsModel?.() ?? Promise.resolve([]));
    }

    // Строим «играбельный» подсписок (только активные с audio)
    const playable = (w.favoritesRefsModel || []).map((it, i) => ({ it, i }))
      .filter(x => x.it && x.it.__active && x.it.audio);
    if (!playable.length) {
      w.NotificationSystem && w.NotificationSystem.warning('Нет активных треков со ⭐');
      return;
    }
    w.favPlayableMap = playable.map(x => x.i);

    // Контекст воспроизведения — строго «Избранное»
    w.playingAlbumKey = w.SPECIAL_FAVORITES_KEY;
    w.playingTracks = playable.map(x => ({
      title: x.it.title,
      audio: x.it.audio,
      lyrics: x.it.lyrics,
      fulltext: x.it.fulltext || null
    }));
    w.playingArtist = 'Витрина Разбита';
    w.playingAlbumName = 'Избранное';
    w.playingCover = (playable[0]?.it?.__cover) || 'img/logo.png';

    // Найти индекс в «узком» плейлисте
    const original = Number(index);
    let idxFiltered = playable.findIndex(x => x.i === original);
    if (idxFiltered < 0) idxFiltered = 0;

    if (typeof w.updateAvailableTracks === 'function') w.updateAvailableTracks();

    if (typeof w.playFromPlaybackAlbum === 'function') {
      await w.playFromPlaybackAlbum(idxFiltered, true);
    }
  }

  // Переключение лайка у текущего играемого трека
  function toggleLikePlaying() {
    if (!w.playingTracks || w.playingTrack < 0) return;

    let albumForLike = w.playingAlbumKey;
    let indexForLike = w.playingTrack;

    if (w.playingAlbumKey === w.SPECIAL_FAVORITES_KEY) {
      const ref = w.favoritesRefsModel?.[w.favPlayableMap?.[w.playingTrack] ?? w.playingTrack];
      if (!ref) return;
      albumForLike = ref.__a;
      indexForLike = ref.__t;
    }

    // Читаем/пишем likedTracks:v2
    const map = (typeof w.getLikedMap === 'function') ? w.getLikedMap() : (() => {
      try { return JSON.parse(localStorage.getItem('likedTracks:v2') || '{}') || {}; } catch { return {}; }
    })();
    const arr = Array.isArray(map[albumForLike]) ? map[albumForLike] : [];
    const was = arr.includes(indexForLike);
    const next = was ? arr.filter(x => x !== indexForLike) : [...arr, indexForLike];
    map[albumForLike] = Array.from(new Set(next));
    try { localStorage.setItem('likedTracks:v2', JSON.stringify(map)); } catch {}

    try { w.updateMiniNowHeader && w.updateMiniNowHeader(); } catch {}

    if (w.playingAlbumKey === w.SPECIAL_FAVORITES_KEY) {
      // Синхронизируем модель и строку «Избранного»
      w.FavoritesData?.updateFavoritesRefsModelActiveFlag?.(albumForLike, indexForLike, !was);
      const favRow = document.getElementById(`fav_${albumForLike}_${indexForLike}`);
      if (favRow) {
        favRow.classList.toggle('inactive', was);
        const s = favRow.querySelector('.like-star');
        if (s) {
          s.src = was ? 'img/star2.png' : 'img/star.png';
          s.title = was ? 'Вернуть в избранное' : 'Снять из избранного';
        }
      }
      // Перестраиваем карту проигрываемых
      try {
        const playable = (w.favoritesRefsModel || []).map((it, i) => ({ it, i }))
          .filter(x => x.it && x.it.__active && x.it.audio);
        w.favPlayableMap = playable.map(x => x.i);
      } catch {}

      try { w.createPlayingShuffledPlaylist && w.createPlayingShuffledPlaylist(); } catch {}
      try { w.updateNextUpLabel && w.updateNextUpLabel(); } catch {}

      // Сняли у текущего — перейти к следующему
      if (was) { try { w.nextTrack && w.nextTrack(); } catch {} }
    } else {
      // Если открыт список «Избранного» — подсветим строку там
      const favRow = document.getElementById(`fav_${albumForLike}_${indexForLike}`);
      if (favRow) {
        favRow.classList.toggle('inactive', was);
        const s = favRow.querySelector('.like-star');
        if (s) {
          s.src = was ? 'img/star2.png' : 'img/star.png';
          s.title = was ? 'Вернуть в избранное' : 'Снять из избранного';
        }
      }
      if (w.favoritesOnlyMode && w.shuffleMode) {
        try { w.createPlayingShuffledPlaylist && w.createPlayingShuffledPlaylist(); } catch {}
      }
      try { w.updateNextUpLabel && w.updateNextUpLabel(); } catch {}
    }

    // Синхронизация с PlayerCore
    if (w.__useNewPlayerCore && w.playerCore && typeof w.playerCore.setFavoritesOnly === 'function') {
      try {
        if (w.playingAlbumKey === w.SPECIAL_FAVORITES_KEY) {
          // В «ИЗБРАННОМ» — плейлист уже отфильтрован, не включаем доп. фильтр
          w.playerCore.setFavoritesOnly(false, []);
        } else {
          const likedIdx = (typeof w.getLikedForAlbum === 'function') ? w.getLikedForAlbum(w.playingAlbumKey) : [];
          w.playerCore.setFavoritesOnly(!!w.favoritesOnlyMode, likedIdx);
          // Если включён режим «только ⭐» и текущий трек сняли со ⭐ — перейти к следующему
          if (w.favoritesOnlyMode && was && typeof w.isBrowsingSameAsPlaying === 'function' && w.isBrowsingSameAsPlaying()) {
            setTimeout(() => { try { w.nextTrack && w.nextTrack(); } catch {} }, 0);
          }
        }
      } catch {}
    }
  }

  // Публичный API
  const FavoritesUI = {
    openFavoritesView,
    updateFavoritesCurrentRow,
    updateFavoriteClassesFavorites,
    updateFavRow,
    toggleLikeForAlbum,
    showFavInactivePrompt,
    showFavDeleteConfirm,
    updateFavoriteClasses,
    toggleFavoritesFilter,
    ensureFavoritesPlayback,
    toggleLikePlaying
  };

  // Экспорт
  w.FavoritesUI = FavoritesUI;

  // Глобальные привязки (для onclick и вызовов из index.html)
  w.openFavoritesView = FavoritesUI.openFavoritesView;
  w.updateFavoritesCurrentRow = FavoritesUI.updateFavoritesCurrentRow;
  w.updateFavoriteClassesFavorites = FavoritesUI.updateFavoriteClassesFavorites;
  w.updateFavRow = FavoritesUI.updateFavRow;
  w.toggleLikeForAlbum = FavoritesUI.toggleLikeForAlbum;
  w.showFavInactivePrompt = FavoritesUI.showFavInactivePrompt;
  w.showFavDeleteConfirm = FavoritesUI.showFavDeleteConfirm;
  w.updateFavoriteClasses = FavoritesUI.updateFavoriteClasses;
  w.toggleFavoritesFilter = FavoritesUI.toggleFavoritesFilter;
  w.ensureFavoritesPlayback = FavoritesUI.ensureFavoritesPlayback;
  w.toggleLikePlaying = FavoritesUI.toggleLikePlaying;

})();
