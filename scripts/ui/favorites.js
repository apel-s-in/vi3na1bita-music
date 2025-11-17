
// scripts/ui/favorites.js
// UI «Избранного», гармонизированный с likedTracks:v2.
// Модуль мягко переопределяет глобальные функции UI «Избранного»,
// сохраняя текущую бизнес‑логику, данные и формат хранилища.
// Ничего не ломает в PlayerCore/mini/notify/offline и пр.

(function FavoritesUIModule() {
  const w = window;

  // Утилиты-доступ к глобальным функциям/переменным с безопасными фолбэками
  const hasFn = (name) => typeof w[name] === 'function';
  const call = (name, ...args) => (hasFn(name) ? w[name](...args) : undefined);

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

  // --- Публичные функции UI «Избранного» ---

  // Обновление класса .current в списке «Избранного»
  function updateFavoritesCurrentRow(idx) {
    try {
      const rows = document.querySelectorAll('#track-list .track');
      rows.forEach(r => r.classList.remove('current'));
      const row = rows[idx];
      if (row) row.classList.add('current');
    } catch {}
  }

  // Обновление класса .is-favorite в «Избранном» (для режима фильтра)
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

  // UI‑обновление одной строки «Избранного» по ссылке ref
  function updateFavRow(ref, active) {
    const row = document.getElementById(`fav_${ref.a}_${ref.t}`); if (!row) return;
    row.classList.toggle('inactive', !active);
    const star = row.querySelector('.like-star');
    if (star) {
      star.src = active ? 'img/star.png' : 'img/star2.png';
      star.title = active ? 'Снять из избранного' : 'Вернуть в избранное';
    }
  }

  // Изменить лайк для конкретного альбома/индекса (в likedTracks:v2)
  function toggleLikeForAlbum(albumKey, idx, makeLiked) {
    // Стараемся не зависеть от констант в index.html: работаем напрямую с ключом 'likedTracks:v2'
    const map = getLikedMapSafe();
    const arr = Array.isArray(map[albumKey]) ? map[albumKey] : [];
    const has = arr.includes(idx);
    let next = arr.slice();
    if (makeLiked && !has) next.push(idx);
    if (!makeLiked && has) next = next.filter(x => x !== idx);
    map[albumKey] = Array.from(new Set(next));
    setLikedMapSafe(map);
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
          Если хотите снова слушать трек в «ИЗБРАННОМ» — добавьте его в избранное.
          Либо удалите из этого списка.
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
      // Синхронизуем модель
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
          Если вы удалите трек, он исчезнет из списка «ИЗБРАННОЕ», но вы всегда сможете найти его в исходном альбоме.
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

      // Синхронизируем in-memory модель
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

  // Главная функция: построение и показ представления «Избранное»
  async function openFavoritesView() {
    // Переключение режима/заголовков/иконок
    call('applyRelizUiMode', false);
    w.viewMode = 'favorites';
    call('clearRelizView');
    call('setActiveAlbumIcon', w.SPECIAL_FAVORITES_KEY);
    call('setAlbumHeaderTitle', w.SPECIAL_FAVORITES_KEY);

    // Перенос блока плеера наверх (как было)
    try {
      const lp = document.getElementById('lyricsplayerblock');
      const holder = document.getElementById('now-playing');
      if (lp && holder && !holder.contains(lp)) { holder.innerHTML = ''; holder.appendChild(lp); }
    } catch {}

    call('applyMiniModeUI');

    // Галерею скрываем
    const cw = document.getElementById('cover-wrap'); if (cw) cw.style.display = 'none';

    // Сбор модели «Избранного»
    if (hasFn('buildFavoritesRefsModel')) {
      await call('buildFavoritesRefsModel');
    }

    // Рисуем список
    const list = document.getElementById('track-list');
    if (!list) return;
    list.style.display = '';
    list.innerHTML = '<div style="text-align:center; opacity:.8; margin:6px 0 8px 0;">ИЗБРАННЫЕ ПЕСНИ</div>';

    const model = w.favoritesRefsModel || [];
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

      // Клик по строке — играем, если активен; иначе показываем подсказку
      row.addEventListener('click', async () => {
        if (item.__active) {
          if (hasFn('ensureFavoritesPlayback')) {
            await call('ensureFavoritesPlayback', idx);
          }
        } else {
          showFavInactivePrompt({ a: item.__a, t: item.__t, title: item.title, album: item.__album });
        }
      });

      // Клик по звезде — смена статуса
      row.querySelector('.like-star').addEventListener('click', (e) => {
        e.stopPropagation();
        const wasActive = getLikedForAlbumSafe(item.__a).includes(item.__t);
        toggleLikeForAlbum(item.__a, item.__t, !wasActive);
        updateFavRow({ a: item.__a, t: item.__t }, !wasActive);
        call('updateFavoritesRefsModelActiveFlag', item.__a, item.__t, !wasActive);

        // Поведение при активном плеере из «Избранного»
        if (w.playingAlbumKey === w.SPECIAL_FAVORITES_KEY && Array.isArray(w.playingTracks)) {
          if (wasActive) {
            // Если сняли звезду именно у текущего играющего — перейти дальше
            if (w.favoritesRefsModel && w.favoritesRefsModel[w.playingTrack] &&
                w.favoritesRefsModel[w.playingTrack].__a === item.__a &&
                w.favoritesRefsModel[w.playingTrack].__t === item.__t) {
              call('createPlayingShuffledPlaylist');
              call('nextTrack');
            } else {
              call('createPlayingShuffledPlaylist');
              call('updateNextUpLabel');
            }
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

        // Синхронизация с PlayerCore (если активно)
        if (w.__useNewPlayerCore && w.playerCore && typeof w.playerCore.setFavoritesOnly === 'function') {
          try {
            if (w.playingAlbumKey === w.SPECIAL_FAVORITES_KEY) {
              const activeIdx = [];
              (w.favoritesRefsModel || []).forEach((x, i) => { if (x && x.__active) activeIdx.push(i); });
              w.playerCore.setFavoritesOnly(true, activeIdx);
            } else {
              const likedIdx = getLikedForAlbumSafe(w.playingAlbumKey);
              w.playerCore.setFavoritesOnly(!!w.favoritesOnlyMode, likedIdx);
              if (w.favoritesOnlyMode && wasActive && typeof w.isBrowsingSameAsPlaying === 'function' && w.isBrowsingSameAsPlaying()) {
                setTimeout(() => { try { call('nextTrack'); } catch {} }, 0);
              }
            }
          } catch {}
        }
      });

      list.appendChild(row);
    });

    // Если играет «Избранное» — подсветим текущую и подставим блок плеера под неё
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

  // --- Публичный API модуля ---
  const FavoritesUI = {
    openFavoritesView,
    updateFavoritesCurrentRow,
    updateFavoriteClassesFavorites,
    updateFavRow,
    toggleLikeForAlbum,
    showFavInactivePrompt,
    showFavDeleteConfirm
  };

  // Экспортируем как window.FavoritesUI
  w.FavoritesUI = FavoritesUI;

  // Переопределяем глобальные функции UI «Избранного» на модульные реализации,
  // чтобы существующие вызовы продолжили работать без правок index.html.
  w.openFavoritesView = FavoritesUI.openFavoritesView;
  w.updateFavoritesCurrentRow = FavoritesUI.updateFavoritesCurrentRow;
  w.updateFavoriteClassesFavorites = FavoritesUI.updateFavoriteClassesFavorites;
  w.updateFavRow = FavoritesUI.updateFavRow;
  w.toggleLikeForAlbum = FavoritesUI.toggleLikeForAlbum;
  w.showFavInactivePrompt = FavoritesUI.showFavInactivePrompt;
  w.showFavDeleteConfirm = FavoritesUI.showFavDeleteConfirm;

})();
