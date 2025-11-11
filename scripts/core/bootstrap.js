// scripts/core/bootstrap.js (ESM)
// Клей между window.config ↔ PlayerCore и UI. Восстанавливает
// глобальные функции, которые раньше были инлайн в index.html.
//
// ВАЖНО: Ничего не останавливает плеер, кроме явных play/pause/stop/таймера сна.

(function () {
  // ------- Central gallery helper (нужен gallery.js) -------
  function centralIdForAlbumKey(albumKey) {
    try {
      const map = window.ALBUM_GALLERY_MAP || {};
      const allowed = window.CENTRAL_ALLOWED_IDS || new Set();
      const id = map[albumKey] || null;
      if (!id) return null;
      if (allowed && typeof allowed.has === 'function') return allowed.has(id) ? id : null;
      return id;
    } catch { return null; }
  }
  window.centralIdForAlbumKey = window.centralIdForAlbumKey || centralIdForAlbumKey;

  // ------- Модель «Избранного» (LS: likedTracks:v2) -------
  function readLikes() {
    try { return JSON.parse(localStorage.getItem('likedTracks:v2')) || {}; }
    catch { return {}; }
  }
  function writeLikes(map) {
    try { localStorage.setItem('likedTracks:v2', JSON.stringify(map || {})); } catch {}
  }

  function getLiked(albumKey = window.currentAlbumKey) {
    const map = readLikes();
    const arr = Array.isArray(map?.[albumKey]) ? map[albumKey] : [];
    return arr.slice().sort((a, b) => a - b);
  }
  function isLiked(index) {
    const list = getLiked();
    return list.includes(index);
  }
  function isLikedInPlayback(index) {
    const akey = window.playingAlbumKey || window.currentAlbumKey;
    const map = readLikes();
    const arr = Array.isArray(map?.[akey]) ? map[akey] : [];
    return arr.includes(index);
  }
  function toggleLike(idx, ev) {
    const akey = window.currentAlbumKey;
    if (!akey || !Number.isInteger(idx)) return;
    const map = readLikes();
    const arr = Array.isArray(map[akey]) ? map[akey] : [];
    const pos = arr.indexOf(idx);
    if (pos >= 0) arr.splice(pos, 1);
    else arr.push(idx);
    map[akey] = Array.from(new Set(arr)).sort((a, b) => a - b);
    writeLikes(map);
    updateFavoriteClasses();
    // визуальная анимация звезды
    if (ev && ev.target && ev.target.classList) {
      ev.target.classList.add('animating');
      setTimeout(() => ev.target.classList.remove('animating'), 300);
    }
    // Обновим кнопку «только избранные»
    try { window.updateNextUpLabel && window.updateNextUpLabel(); } catch {}
  }
  function toggleLikePlaying() {
    if (!Number.isInteger(window.playingTrack) || window.playingTrack < 0) return;
    const akey = window.playingAlbumKey || window.currentAlbumKey;
    if (!akey) return;
    const map = readLikes();
    const arr = Array.isArray(map[akey]) ? map[akey] : [];
    const pos = arr.indexOf(window.playingTrack);
    if (pos >= 0) arr.splice(pos, 1); else arr.push(window.playingTrack);
    map[akey] = Array.from(new Set(arr)).sort((a, b) => a - b);
    writeLikes(map);
    updateFavoriteClasses();
  }

  function updateFavoriteClasses() {
    try {
      const list = document.getElementById('track-list');
      if (!list) return;
      const liked = new Set(getLiked());
      list.querySelectorAll('.track').forEach(row => {
        const i = parseInt(row.getAttribute('data-index') || '-1', 10);
        if (Number.isInteger(i) && i >= 0) {
          row.classList.toggle('is-favorite', liked.has(i));
          const star = row.querySelector('.like-star');
          if (star && star.tagName === 'IMG') {
            const on = liked.has(i);
            star.src = on ? 'img/star.png' : 'img/star2.png';
            star.title = on ? 'Убрать из понравившихся' : 'Добавить в понравившиеся';
          }
        }
      });
      // Мини-шапка
      try { window.updateMiniNowHeader && window.updateMiniNowHeader(); } catch {}
    } catch {}
  }

  function toggleFavoritesFilter() {
    window.favoritesFilterActive = !window.favoritesFilterActive;
    const list = document.getElementById('track-list');
    const btn = document.getElementById('filter-favorites-btn');
    if (list) list.classList.toggle('filtered', !!window.favoritesFilterActive);
    if (btn) {
      btn.classList.toggle('filtered', !!window.favoritesFilterActive);
      btn.textContent = window.favoritesFilterActive
        ? 'Показать все песни'
        : 'Скрыть не отмеченные ⭐ песни';
    }
  }

  // ------- Утилиты UI -------
  function handleLogoClick() {
    const logo = document.getElementById('logo-bottom');
    if (!logo) return;
    logo.style.transition = 'transform .08s ease-out';
    logo.style.transform = 'scale(1.13)';
    setTimeout(() => { logo.style.transform = 'scale(1)'; logo.style.transition = 'transform .1s ease-out'; }, 120);
  }

  function openFeedbackModal() {
    document.getElementById('modal-feedback')?.classList.add('active');
  }
  function closeFeedbackModal() {
    document.getElementById('modal-feedback')?.classList.remove('active');
  }

  // Служебная чистка дублей блока плеера (на всякий случай)
  function dedupePlayerBlock() {
    try {
      const blocks = Array.from(document.querySelectorAll('#lyricsplayerblock'));
      if (blocks.length <= 1) return;
      // Оставим ближайший к текущему треку
      const keep = blocks.pop();
      blocks.forEach(b => b.remove());
      // Убедимся, что keep в правильном месте: после строки текущего трека
      const i = window.currentTrack;
      const row = Number.isInteger(i) && i >= 0 ? document.getElementById(`trk${i}`) : null;
      if (row && keep && keep.parentNode !== row.parentNode) {
        if (row.nextSibling) row.parentNode.insertBefore(keep, row.nextSibling);
        else row.parentNode.appendChild(keep);
      }
    } catch {}
  }

  // ------- PlayerCore ↔ config -------
  function getPlayerConfig() {
    const cfg = window.config || {};
    const tracks = Array.isArray(cfg.tracks) ? cfg.tracks : [];
    const artist = cfg.artist || 'Витрина Разбита';
    const album = cfg.albumName || (window.ICON_TITLE_MAP?.[window.currentAlbumKey] || 'Альбом');
    const cover = (function () {
      if (Array.isArray(window.coverGalleryArr) && window.coverGalleryArr.length) {
        const it = window.coverGalleryArr[0];
        return (it.formats?.full || it.src || 'img/logo.png');
      }
      return 'img/logo.png';
    })();
    const snapshot = tracks.map(t => ({
      title: t?.title || 'Трек',
      artist,
      album,
      cover,
      lyrics: t?.lyrics || '',
      src: t?.audio || t?.src || '',
      fulltext: t?.fulltext || ''
    }));
    return { artist, album, cover, tracks: snapshot };
  }

  function updatePlayerCorePlaylistFromConfig() {
    const pc = window.playerCore;
    if (!pc || !window.config) return;
    const pl = getPlayerConfig();
    const startIndex = Number.isInteger(window.currentTrack) && window.currentTrack >= 0 ? window.currentTrack : 0;
    pc.setPlaylist(pl.tracks, startIndex, { artist: pl.artist, album: pl.album, cover: pl.cover });

    // Применим режимы
    try { pc.setRepeat(localStorage.getItem('repeatMode') === '1'); } catch {}
    try { pc.setShuffle(localStorage.getItem('shuffleMode') === '1'); } catch {}
    try {
      const favOnly = localStorage.getItem('favoritesOnlyMode') === '1';
      const liked = getLiked(window.currentAlbumKey);
      pc.setFavoritesOnly(favOnly, liked);
    } catch {}

    // Подсветка «следующий»
    try { window.updateNextUpLabel && window.updateNextUpLabel(); } catch {}
  }

  function ensurePlayerCore() {
    if (!window.playerCore && typeof window.__initPlayerCoreBindings === 'function') {
      // bridge.js создаёт playerCore. Если не успел — подождём.
      try { window.__initPlayerCoreBindings(); } catch {}
    }
    return window.playerCore || null;
  }

  function pickAndPlayTrack(idx) {
    const pc = ensurePlayerCore();
    if (!pc) return;
    if (!Number.isInteger(idx) || idx < 0) return;

    window.currentTrack = idx;
    window.playingAlbumKey = window.currentAlbumKey || window.playingAlbumKey || null;

    updatePlayerCorePlaylistFromConfig();
    pc.play(idx);

    // Перерисуем UI (вставка блока плеера под строку)
    try { window.buildTrackList && window.buildTrackList(); } catch {}
    try { window.renderLyricsBlock && window.renderLyricsBlock(); } catch {}
    try { dedupePlayerBlock(); } catch {}
    try { window.applyMiniModeUI && window.applyMiniModeUI(); } catch {}
  }

  function showTrack(idx, play) {
    window.currentTrack = idx;
    try { window.buildTrackList && window.buildTrackList(); } catch {}
    try { dedupePlayerBlock(); } catch {}
    if (play) pickAndPlayTrack(idx);
  }

  function isBrowsingOtherAlbum() {
    const a = window.currentAlbumKey;
    const b = window.playingAlbumKey || a;
    return !!(a && b && a !== b);
  }

  function updateNextUpLabel() {
    try {
      const el = document.querySelector('.next-up .title');
      if (!el || !window.playerCore) return;
      const n = window.playerCore.getNextIndex?.();
      if (!Number.isInteger(n) || n < 0) { el.textContent = ''; return; }
      const pl = getPlayerConfig();
      const t = pl.tracks[n];
      el.textContent = t ? t.title : '';
    } catch {}
  }

  // Ассист функция для offline.js (загружает config другого альбома при необходимости)
  async function getAlbumConfigByKey(akey) {
    // Сначала попробуем через public API из albums.js (если появится)
    if (typeof window.__getAlbumConfigByKey === 'function') return window.__getAlbumConfigByKey(akey);

    // Fallback: найти в albums.json базу и забрать config.json
    try {
      if (!window.albumsIndex || !window.albumsIndex.length) {
        await (window.loadAlbumsIndex ? window.loadAlbumsIndex() : Promise.resolve());
      }
      const meta = (window.albumsIndex || []).find(a => a.key === akey);
      if (!meta) return null;
      const base = typeof window.normalizeBase === 'function' ? window.normalizeBase(meta.base) : meta.base;
      const r = await fetch((base.replace(/\/+$/, '') + '/config.json'), { cache: 'force-cache' });
      if (!r.ok) return null;
      const data = await r.json();
      (data.tracks || []).forEach((t) => {
        if (t.audio && !/^https?:\/\//i.test(t.audio)) t.audio = base + '/' + t.audio.replace(/^\/+/, '');
        if (t.lyrics && !/^https?:\/\//i.test(t.lyrics)) t.lyrics = base + '/' + t.lyrics.replace(/^\/+/, '');
        if (t.fulltext && !/^https?:\/\//i.test(t.fulltext)) t.fulltext = base + '/' + t.fulltext.replace(/^\/+/, '');
      });
      return data;
    } catch { return null; }
  }

  // ------- Экспорт в window.* -------
  window.getPlayerConfig = window.getPlayerConfig || getPlayerConfig;
  window.updatePlayerCorePlaylistFromConfig = window.updatePlayerCorePlaylistFromConfig || updatePlayerCorePlaylistFromConfig;
  window.pickAndPlayTrack = window.pickAndPlayTrack || pickAndPlayTrack;
  window.showTrack = window.showTrack || showTrack;

  window.getLiked = window.getLiked || getLiked;
  window.isLiked = window.isLiked || isLiked;
  window.isLikedInPlayback = window.isLikedInPlayback || isLikedInPlayback;
  window.toggleLike = window.toggleLike || toggleLike;
  window.toggleLikePlaying = window.toggleLikePlaying || toggleLikePlaying;
  window.updateFavoriteClasses = window.updateFavoriteClasses || updateFavoriteClasses;
  window.toggleFavoritesFilter = window.toggleFavoritesFilter || toggleFavoritesFilter;

  window.handleLogoClick = window.handleLogoClick || handleLogoClick;
  window.openFeedbackModal = window.openFeedbackModal || openFeedbackModal;
  window.closeFeedbackModal = window.closeFeedbackModal || closeFeedbackModal;

  window.dedupePlayerBlock = window.dedupePlayerBlock || dedupePlayerBlock;
  window.isBrowsingOtherAlbum = window.isBrowsingOtherAlbum || isBrowsingOtherAlbum;
  window.updateNextUpLabel = window.updateNextUpLabel || updateNextUpLabel;

  window.getAlbumConfigByKey = window.getAlbumConfigByKey || getAlbumConfigByKey;
})();
