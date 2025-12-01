// scripts/ui/mini.js
// Мини-режим плеера: закрепление блока сверху, мини-шапка, "Далее: ...",
// звезда в мини и переход к играющему альбому.
// Контракт с PlayerCore: getIndex/getNextIndex/getPlaylistSnapshot.

(function(){
  function pc() {
    return (window.__useNewPlayerCore && window.playerCore) ? window.playerCore : null;
  }

  function isMiniMode() {
    try {
      if (window.viewMode === 'favorites' && window.playingAlbumKey === window.SPECIAL_FAVORITES_KEY) return false;
      return typeof window.isBrowsingOtherAlbum === 'function' ? window.isBrowsingOtherAlbum() : false;
    } catch { return false; }
  }

  function ensurePinnedTop(lp) {
    if (!lp) return;
    try {
      const holder = document.getElementById('now-playing');
      if (holder && lp.parentNode !== holder) {
        holder.innerHTML = '';
        holder.appendChild(lp);
      }
    } catch {}
  }

  function ensureNextUpLabel() {
    // Разметка создаётся в renderLyricsBlock; здесь лишь обновление текста/видимости
    const el = document.getElementById('next-up');
    return !!el;
  }

  function computeCurrentIndex() {
    const core = pc();
    let idx = -1;

    if (core && typeof core.getIndex === 'function') {
      const v = Number(core.getIndex());
      if (Number.isFinite(v) && v >= 0) idx = v;
    } else if (typeof window.playingTrack === 'number' && window.playingTrack >= 0) {
      idx = window.playingTrack;
    } else if (typeof window.currentTrack === 'number' && window.currentTrack >= 0) {
      idx = window.currentTrack;
    }

    // В режиме ИЗБРАННОГО нужно отразить индекс обратно в модель favoritesRefsModel
    if (idx >= 0 && window.playingAlbumKey === window.SPECIAL_FAVORITES_KEY && Array.isArray(window.favPlayableMap)) {
      const modelIdx = window.favPlayableMap[idx];
      return Number.isFinite(modelIdx) && modelIdx >= 0 ? modelIdx : idx;
    }

    return idx;
  }

  function computeTitleForIndex(idx) {
    if (idx < 0) return '—';

    // В ИЗБРАННОМ idx уже модельный индекс (favoritesRefsModel)
    if (window.playingAlbumKey === window.SPECIAL_FAVORITES_KEY && Array.isArray(window.favoritesRefsModel)) {
      const it = window.favoritesRefsModel[idx];
      return it && it.title ? it.title : '—';
    }

    const core = pc();
    if (core && typeof core.getPlaylistSnapshot === 'function') {
      try {
        const snap = core.getPlaylistSnapshot();
        const t = Array.isArray(snap) ? snap[idx] : null;
        return (t && t.title) ? t.title : '—';
      } catch {}
    }
    try {
      const arr = Array.isArray(window.playingTracks) ? window.playingTracks : (window.config?.tracks || []);
      return (arr && arr[idx] && arr[idx].title) ? arr[idx].title : '—';
    } catch { return '—'; }
  }

  function updateMiniNowHeader() {
    const box = document.getElementById('mini-now');
    if (!box) return;

    const mini = isMiniMode();
    const idx = computeCurrentIndex();

    // Мини показываем только когда листаем другой альбом и есть валидный индекс
    if (!mini || idx < 0) {
      box.style.display = 'none';
      return;
    }

    box.style.display = 'flex';
    const numEl = document.getElementById('mini-now-num');
    const titleEl = document.getElementById('mini-now-title');
    if (numEl) numEl.textContent = `${String(idx + 1).padStart(2, '0')}.`;
    if (titleEl) titleEl.textContent = computeTitleForIndex(idx);

    try {
      const liked = (typeof window.isLikedInPlayback === 'function') ? window.isLikedInPlayback(idx) : false;
      const starEl = document.getElementById('mini-now-star');
      if (starEl) {
        starEl.src = liked ? 'img/star.png' : 'img/star2.png';
        starEl.title = liked ? 'Убрать из понравившихся' : 'Добавить в понравившиеся';
      }
    } catch {}
  }

  function updateNextUpLabel() {
    const box = document.getElementById('next-up');
    const lp = document.getElementById('lyricsplayerblock');
    if (!box || !lp) return;

    // Показываем в мини-режиме
    if (!isMiniMode()) {
      box.style.display = 'none';
      return;
    }

    const core = pc();
    if (core && typeof core.getNextIndex === 'function') {
      try {
        const nextIdx = Number(core.getNextIndex());
        if (!Number.isFinite(nextIdx) || nextIdx < 0) {
          box.style.display = 'none';
          return;
        }
        const snap = (typeof core.getPlaylistSnapshot === 'function') ? core.getPlaylistSnapshot() : null;
        const title = (Array.isArray(snap) && snap[nextIdx] && snap[nextIdx].title) ? snap[nextIdx].title : '—';
        const label = `${String(nextIdx + 1).padStart(2, '0')}. ${title}`;
        const titleEl = box.querySelector('.title');
        if (titleEl) { titleEl.textContent = label; titleEl.title = label; }
        box.style.display = '';
        return;
      } catch {
        // мягкий фолбэк ниже
      }
    }

    try {
      if (!Array.isArray(window.playingTracks) || !window.playingTracks.length) {
        box.style.display = 'none';
        return;
      }
      const cand = (typeof window.computeNextIndexPlayback === 'function') ? window.computeNextIndexPlayback() : -1;
      if (!Number.isFinite(cand) || cand < 0) {
        box.style.display = 'none';
        return;
      }
      const title = window.playingTracks[cand]?.title || '—';
      const label = `${String(cand + 1).padStart(2, '0')}. ${title}`;
      const titleEl = box.querySelector('.title');
      if (titleEl) { titleEl.textContent = label; titleEl.title = label; }
      box.style.display = '';
    } catch {
      box.style.display = 'none';
    }
  }

  function applyMiniModeUI() {
    const lp = document.getElementById('lyricsplayerblock');
    if (!lp) return;

    const mini = isMiniMode();
    if (mini) lp.classList.add('mini-mode'); else lp.classList.remove('mini-mode');

    // Закрепляем сверху при мини-режиме
    if (mini) ensurePinnedTop(lp);

    // Скрываем лирику и фон-анимацию в мини (с возвращением)
    try {
      if (mini) {
        if (!window.__wasMini) window.__wasMini = true;
        if (window.__savedLyricsModeForMini === null && window.lyricsViewMode !== 'hidden') window.__savedLyricsModeForMini = window.lyricsViewMode;
        if (window.lyricsViewMode !== 'hidden' && typeof window.applyLyricsViewMode === 'function') {
          window.lyricsViewMode = 'hidden';
          window.applyLyricsViewMode();
        }
        if (window.__savedAnimationForMini === null && window.animationEnabled === true) window.__savedAnimationForMini = true;
        if (window.animationEnabled === true && typeof window.applyAnimationState === 'function') window.applyAnimationState(false);
      } else {
        if (window.__wasMini) window.__wasMini = false;
        if (window.__savedLyricsModeForMini !== null && typeof window.applyLyricsViewMode === 'function') {
          window.lyricsViewMode = window.__savedLyricsModeForMini;
          window.__savedLyricsModeForMini = null;
          window.applyLyricsViewMode();
        }
        if (window.__savedAnimationForMini !== null && typeof window.applyAnimationState === 'function') {
          window.applyAnimationState(!!window.__savedAnimationForMini);
          window.__savedAnimationForMini = null;
        }
      }
    } catch {}

    // "Далее" показывает/обновляет данные; якорь уже создаётся в renderLyricsBlock
    ensureNextUpLabel();
    updateMiniNowHeader();
    updateNextUpLabel();
  }

  function toggleLikePlayingFromMini(e) {
    try { if (e && e.stopPropagation) e.stopPropagation(); } catch {}
    if (typeof window.toggleLikePlaying === 'function') {
      window.toggleLikePlaying();
    }
    updateMiniNowHeader();
    updateNextUpLabel();
  }

  async function openPlayingAlbumFromMini(e) {
    try {
      if (e && e.target && e.target.id === 'mini-now-star') return;
    } catch {}

    // Открыть "Избранное" и проскроллить к текущему
    if (window.playingAlbumKey === window.SPECIAL_FAVORITES_KEY) {
      if (typeof window.openFavoritesView === 'function') window.openFavoritesView();
      const idx = computeCurrentIndex();
      const cur = Array.isArray(window.favoritesRefsModel) ? window.favoritesRefsModel[idx] : null;
      if (cur) {
        setTimeout(() => document.getElementById(`fav_${cur.__a}_${cur.__t}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
      }
      return;
    }

    // Если уже в играющем альбоме — ничего не делаем
    if (!window.playingAlbumKey || window.currentAlbumKey === window.playingAlbumKey) return;

    // 1) Курсор до загрузки
    const idx = computeCurrentIndex();
    if (idx >= 0) window.currentTrack = idx;

    // 2) Переключить селект и загрузить альбом
    const sel = document.getElementById('album-select');
    if (sel) sel.value = window.playingAlbumKey;
    if (typeof window.loadAlbumByKey === 'function') {
      await window.loadAlbumByKey(window.playingAlbumKey);
    }

    // 3) Перенести блок плеера под строку и проскроллить
    setTimeout(() => {
      try {
        const row = document.getElementById(`trk${computeCurrentIndex()}`);
        const lp = document.getElementById('lyricsplayerblock');
        if (row && lp) {
          if (row.nextSibling) row.parentNode.insertBefore(lp, row.nextSibling);
          else row.parentNode.appendChild(lp);
        }
        if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {}
    }, 200);
  }

  // Публичный API
  const MiniUI = {
    applyMiniModeUI,
    updateMiniNowHeader,
    updateNextUpLabel,
    toggleLikePlayingFromMini,
    openPlayingAlbumFromMini
  };

  // Экспорт в глобальную область
  window.MiniUI = MiniUI;

})();
