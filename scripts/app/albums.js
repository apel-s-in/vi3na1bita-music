// scripts/app/albums.js — Менеджер альбомов
(function() {
  'use strict';

  const $ = id => document.getElementById(id);
  const escHtml = s => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };

  const state = {
    currentAlbum: null,
    albumConfig: null,
    tracks: []
  };

  // ==================== РЕНДЕРИНГ ИКОНОК АЛЬБОМОВ ====================
  function renderAlbumIcons() {
    const container = $('album-icons');
    if (!container) return;

    const albums = window.APP_CONFIG?.ICON_ALBUMS_ORDER || [];
    container.innerHTML = albums.map(a => `
      <div class="album-icon-item" data-key="${escHtml(a.key)}" title="${escHtml(a.title)}">
        <img src="${escHtml(a.icon)}" alt="${escHtml(a.title)}" loading="lazy" draggable="false">
        <div class="album-icon-title">${escHtml(a.title)}</div>
      </div>
    `).join('');

    container.addEventListener('click', e => {
      const item = e.target.closest('.album-icon-item');
      if (item?.dataset.key) loadAlbum(item.dataset.key);
    });
  }

  // ==================== ЗАГРУЗКА АЛЬБОМА ====================
  async function loadAlbum(key) {
    if (!key) return;

    // Специальные альбомы
    if (key === '__favorites__') {
      await loadFavoritesAlbum();
      return;
    }

    if (key === '__reliz__') {
      await loadRelizAlbum();
      return;
    }

    // Обычный альбом
    const meta = (window.albumsIndex || []).find(a => a.key === key);
    if (!meta?.base) {
      window.NotificationSystem?.error?.('Альбом не найден');
      return;
    }

    try {
      const base = meta.base.endsWith('/') ? meta.base : `${meta.base}/`;
      const r = await fetch(`${base}config.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      
      const cfg = await r.json();
      state.currentAlbum = key;
      state.albumConfig = cfg;
      state.tracks = (cfg.tracks || []).map((t, i) => ({
        ...t,
        index: i,
        albumKey: key,
        audio: t.audio ? new URL(t.audio, base).toString() : null,
        lyrics: t.lyrics ? new URL(t.lyrics, base).toString() : null,
        fulltext: t.fulltext ? new URL(t.fulltext, base).toString() : null,
        cover: cfg.cover ? new URL(cfg.cover, base).toString() : 'img/logo.png',
        artist: t.artist || cfg.artist || 'Витрина Разбита',
        album: cfg.albumName || cfg.title || key
      }));

      renderTrackList();
      window.GalleryManager?.loadGallery?.(key);
      updateAlbumHeader(cfg);
      
      // Обновляем плейлист в плеере
      window.playerCore?.setPlaylist?.(state.tracks);
      
      console.log(`✅ Album loaded: ${key}, ${state.tracks.length} tracks`);
    } catch (e) {
      console.error('Album load error:', e);
      window.NotificationSystem?.error?.('Ошибка загрузки альбома');
    }
  }

  // ==================== ИЗБРАННОЕ ====================
  async function loadFavoritesAlbum() {
    state.currentAlbum = '__favorites__';
    state.albumConfig = { albumName: '⭐ ИЗБРАННОЕ ⭐', artist: 'Витрина Разбита' };

    try {
      const model = await window.buildFavoritesRefsModel?.() || [];
      state.tracks = model.filter(t => t.__active).map((t, i) => ({
        ...t,
        index: i,
        albumKey: t.__a,
        cover: t.__cover || 'img/logo.png',
        artist: t.__artist,
        album: t.__album
      }));

      renderFavoritesTrackList();
      window.GalleryManager?.clear?.();
      updateAlbumHeader(state.albumConfig);
      window.playerCore?.setPlaylist?.(state.tracks);
    } catch (e) {
      console.error('Favorites load error:', e);
      state.tracks = [];
      renderFavoritesTrackList();
    }
  }

  // ==================== РЕЛИЗЫ/НОВОСТИ ====================
  async function loadRelizAlbum() {
    state.currentAlbum = '__reliz__';
    state.albumConfig = { albumName: 'НОВОСТИ', artist: '' };
    state.tracks = [];

    try {
      const r = await fetch('./albums/news/news.json', { cache: 'no-cache' });
      if (r.ok) {
        const data = await r.json();
        renderNewsContent(data);
      } else {
        renderNewsContent({ items: [] });
      }
    } catch {
      renderNewsContent({ items: [] });
    }

    window.GalleryManager?.loadGallery?.('__reliz__');
    updateAlbumHeader(state.albumConfig);
  }

  // ==================== РЕНДЕРИНГ ====================
  function renderTrackList() {
    const container = $('track-list');
    if (!container) return;

    if (!state.tracks.length) {
      container.innerHTML = '<div class="empty-message">Нет треков</div>';
      return;
    }

    container.innerHTML = state.tracks.map((t, i) => {
      const isFav = window.FavoritesManager?.isFavorite?.(t.albumKey, t.uid);
      return `
        <div class="track-item" data-index="${i}" data-uid="${escHtml(t.uid)}">
          <div class="track-num">${i + 1}</div>
          <div class="track-info">
            <div class="track-title">${escHtml(t.title)}</div>
            <div class="track-artist">${escHtml(t.artist)}</div>
          </div>
          <button class="track-fav-btn ${isFav ? 'active' : ''}" data-uid="${escHtml(t.uid)}">${isFav ? '⭐' : '☆'}</button>
        </div>
      `;
    }).join('');

    bindTrackListEvents(container);
  }

  function renderFavoritesTrackList() {
    const container = $('track-list');
    if (!container) return;

    if (!state.tracks.length) {
      container.innerHTML = '<div class="empty-message">Избранное пусто.<br>Добавьте треки, нажав ☆</div>';
      return;
    }

    container.innerHTML = state.tracks.map((t, i) => `
      <div class="track-item" data-index="${i}" data-uid="${escHtml(t.uid)}" data-album="${escHtml(t.albumKey)}" id="fav_${escHtml(t.albumKey)}_${escHtml(t.uid)}">
        <div class="track-num">${i + 1}</div>
        <div class="track-info">
          <div class="track-title">${escHtml(t.title)}</div>
          <div class="track-artist">${escHtml(t.__album || t.artist)}</div>
        </div>
        <button class="track-fav-btn active" data-uid="${escHtml(t.uid)}" data-album="${escHtml(t.albumKey)}">⭐</button>
      </div>
    `).join('');

    bindFavoritesEvents(container);
  }

  function renderNewsContent(data) {
    const container = $('track-list');
    if (!container) return;

    const items = data?.items || [];
    if (!items.length) {
      container.innerHTML = '<div class="empty-message">Нет новостей</div>';
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="news-item">
        <div class="news-date">${escHtml(item.date || '')}</div>
        <div class="news-title">${escHtml(item.title || '')}</div>
        <div class="news-text">${escHtml(item.text || '')}</div>
      </div>
    `).join('');
  }

  function updateAlbumHeader(cfg) {
    const title = $('album-title');
    const artist = $('album-artist');
    if (title) title.textContent = cfg?.albumName || cfg?.title || '';
    if (artist) artist.textContent = cfg?.artist || '';
  }

  // ==================== СОБЫТИЯ ====================
  function bindTrackListEvents(container) {
    container.addEventListener('click', e => {
      // Клик по кнопке избранного
      const favBtn = e.target.closest('.track-fav-btn');
      if (favBtn) {
        e.stopPropagation();
        const uid = favBtn.dataset.uid;
        if (uid && state.currentAlbum) {
          window.FavoritesManager?.toggleLike?.(state.currentAlbum, uid);
          const isFav = window.FavoritesManager?.isFavorite?.(state.currentAlbum, uid);
          favBtn.textContent = isFav ? '⭐' : '☆';
          favBtn.classList.toggle('active', isFav);
        }
        return;
      }

      // Клик по треку
      const item = e.target.closest('.track-item');
      if (item) {
        const idx = parseInt(item.dataset.index);
        if (!isNaN(idx) && state.tracks[idx]) {
          window.playerCore?.playTrack?.(idx);
        }
      }
    });
  }

  function bindFavoritesEvents(container) {
    container.addEventListener('click', e => {
      const favBtn = e.target.closest('.track-fav-btn');
      if (favBtn) {
        e.stopPropagation();
        const uid = favBtn.dataset.uid;
        const albumKey = favBtn.dataset.album;
        const item = favBtn.closest('.track-item');
        const title = item?.querySelector('.track-title')?.textContent || 'Трек';

        window.FavoritesData?.showFavoritesDeleteConfirm?.({
          albumKey, uid, title,
          onDeleted: () => loadFavoritesAlbum()
        });
        return;
      }

      const item = e.target.closest('.track-item');
      if (item) {
        const idx = parseInt(item.dataset.index);
        if (!isNaN(idx) && state.tracks[idx]) {
          window.playerCore?.playTrack?.(idx);
        }
      }
    });
  }

  // ==================== ОБНОВЛЕНИЕ ИЗБРАННОГО ====================
  function onFavoritesChanged(e) {
    if (state.currentAlbum === '__favorites__') {
      loadFavoritesAlbum();
    } else {
      // Обновляем кнопки в текущем списке
      const { albumKey, uid, liked } = e.detail || {};
      if (albumKey === state.currentAlbum) {
        const btn = document.querySelector(`.track-fav-btn[data-uid="${uid}"]`);
        if (btn) {
          btn.textContent = liked ? '⭐' : '☆';
          btn.classList.toggle('active', liked);
        }
      }
    }
  }

  // ==================== ИНИЦИАЛИЗАЦИЯ ====================
  function initialize() {
    renderAlbumIcons();

    window.addEventListener('favorites:changed', onFavoritesChanged);

    // Загружаем первый альбом
    const firstAlbum = window.APP_CONFIG?.ICON_ALBUMS_ORDER?.[0]?.key;
    if (firstAlbum) {
      setTimeout(() => loadAlbum(firstAlbum), 100);
    }

    console.log('✅ AlbumsManager initialized');
  }

  // ==================== ЭКСПОРТ ====================
  window.AlbumsManager = {
    initialize,
    loadAlbum,
    getCurrentAlbum: () => state.currentAlbum,
    getTracks: () => state.tracks,
    getConfig: () => state.albumConfig
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
