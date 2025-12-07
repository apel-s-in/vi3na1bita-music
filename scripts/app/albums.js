// scripts/app/albums.js
// Управление альбомами на новой платформе PlayerCore

import { APP_CONFIG } from '../core/config.js';

class AlbumsManager {
  constructor() {
    this.currentAlbum = null;
    this.playingAlbum = null;
    this.albumsData = new Map();
    this.isLoading = false;
    this.galleryIndex = 0;
    this.galleryItems = [];
  }

  async initialize() {
    // albumsIndex заполняется в scripts/core/bootstrap.js и может прийти чуть позже,
    // чем Application/AlbumsManager. Дождёмся его появления.
    const maxWaitMs = 2000;
    const stepMs = 50;
    let waited = 0;

    while ((!window.albumsIndex || window.albumsIndex.length === 0) && waited < maxWaitMs) {
      await new Promise(r => setTimeout(r, stepMs));
      waited += stepMs;
    }

    if (!Array.isArray(window.albumsIndex) || window.albumsIndex.length === 0) {
      console.error('❌ No albums found (albumsIndex is empty after wait)');
      return;
    }

    console.log(`✅ Albums available: ${window.albumsIndex.length}`);

    this.renderAlbumIcons();
    this.setupGalleryNavigation();
    
    const lastAlbum = localStorage.getItem('currentAlbum');
    const albumToLoad = lastAlbum || window.albumsIndex[0].key;
    
    await this.loadAlbum(albumToLoad);
  }

  renderAlbumIcons() {
    const container = document.getElementById('album-icons');
    if (!container) return;

    container.innerHTML = '';

    APP_CONFIG.ICON_ALBUMS_ORDER.forEach(({ key, title, icon }) => {
      if (!key.startsWith('__')) {
        const exists = window.albumsIndex.some(a => a.key === key);
        if (!exists) return;
      }

      const iconEl = document.createElement('div');
      iconEl.className = 'album-icon';
      iconEl.dataset.album = key;
      iconEl.dataset.akey = key;
      iconEl.title = title;
      iconEl.innerHTML = `<img src="${icon}" alt="${title}" draggable="false">`;

      iconEl.addEventListener('click', () => this.loadAlbum(key));
      container.appendChild(iconEl);
    });
  }

  async loadAlbum(albumKey) {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      this.clearUI();

      if (albumKey === '__favorites__') {
        await this.loadFavoritesAlbum();
      } else if (albumKey === '__reliz__') {
        await this.loadNewsAlbum();
      } else {
        await this.loadRegularAlbum(albumKey);
      }

      this.updateActiveIcon(albumKey);
      this.currentAlbum = albumKey;
      localStorage.setItem('currentAlbum', albumKey);

      console.log(`✅ Album loaded: ${albumKey}`);

    } catch (error) {
      console.error('❌ Failed to load album:', error);
      window.NotificationSystem?.error('Ошибка загрузки альбома');
    } finally {
      this.isLoading = false;
    }
  }

  async loadRegularAlbum(albumKey) {
    const albumInfo = window.albumsIndex.find(a => a.key === albumKey);
    if (!albumInfo) {
      throw new Error(`Album ${albumKey} not found`);
    }

    let albumData = this.albumsData.get(albumKey);

    if (!albumData) {
      const base = albumInfo.base.endsWith('/') ? albumInfo.base : `${albumInfo.base}/`;
      const response = await fetch(`${base}config.json`, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`Failed to load config.json for ${albumKey}: HTTP ${response.status}`);
      }

      const raw = await response.json();
      const data = raw || {};

      const tracks = Array.isArray(data.tracks) ? data.tracks : [];
      const normTracks = tracks.map((t, idx) => ({
        num: t.num ?? (idx + 1),
        title: t.title || `Трек ${idx + 1}`,
        file: t.audio ? new URL(t.audio, base).toString() : null,
        lyrics: t.lyrics ? new URL(t.lyrics, base).toString() : null,
        fulltext: t.fulltext ? new URL(t.fulltext, base).toString() : null
      }));

      const coverPath = data.cover || 'cover.jpg';

      albumData = {
        title: data.albumName || albumInfo.title,
        artist: data.artist || 'Витрина Разбита',
        cover: coverPath,
        social_links: Array.isArray(data.social_links) ? data.social_links : [],
        tracks: normTracks
      };

      this.albumsData.set(albumKey, albumData);
    }

    await this.loadGallery(albumKey);

    this.renderAlbumTitle(albumData.title || albumInfo.title);
    this.renderCover(albumInfo, albumData);
    this.renderSocials(albumData.social_links);
    this.renderTrackList(albumData.tracks, albumInfo);

    // Обновляем мини-режим
    if (window.PlayerUI) {
      window.PlayerUI.updateMiniHeader?.();
      window.PlayerUI.updateNextUpLabel?.();
    }

    // Готовим плейлист для этого альбома (но применяем его только если сейчас ничего не играет)
    const tracksForCore = albumData.tracks
      .filter(t => !!t.file)
      .map((t) => ({
        src: t.file,
        title: t.title,
        artist: albumData.artist || 'Витрина Разбита',
        album: albumData.title || albumInfo.title,
        cover: new URL(albumData.cover || 'cover.jpg', albumInfo.base).toString(),
        lyrics: t.lyrics || null,
        fulltext: t.fulltext || null
      }));

    if (window.playerCore && tracksForCore.length > 0) {
      const hasCurrentTrack = typeof window.playerCore.getCurrentTrack === 'function'
        ? !!window.playerCore.getCurrentTrack()
        : false;

      // Если сейчас ничего не играет — можем подготовить плейлист этого альбома.
      // Если уже что‑то играет (другой альбом или избранное) — не трогаем плейлист, чтобы не сбивать мини‑плеер.
      if (!hasCurrentTrack) {
        window.playerCore.setPlaylist(tracksForCore, 0, {
          artist: albumData.artist || 'Витрина Разбита',
          album: albumData.title || albumInfo.title,
          cover: new URL(albumData.cover || 'cover.jpg', albumInfo.base).toString()
        });

        // Плеер будет играть из этого альбома, когда пользователь выберет трек
        this.playingAlbum = albumKey;
      }
    }

    const coverWrap = document.getElementById('cover-wrap');
    if (coverWrap) coverWrap.style.display = '';
  }

  async loadGallery(albumKey) {
    let centralId = null;
    
    if (albumKey === 'mezhdu-zlom-i-dobrom') centralId = '01';
    else if (albumKey === 'golos-dushi') centralId = '02';
    else if (albumKey === 'krevetochka') centralId = '00';

    if (!centralId) {
      this.galleryItems = [];
      return;
    }

    try {
      const response = await fetch(`./albums/gallery/${centralId}/index.json`, {
        cache: 'force-cache'
      });
      
      if (response.ok) {
        const data = await response.json();
        this.galleryItems = Array.isArray(data.items) ? data.items : [];
        this.galleryIndex = 0;
        
        this.updateGalleryNavigation();
        this.renderGalleryCover();
      }
    } catch (error) {
      console.warn('Failed to load gallery:', error);
      this.galleryItems = [];
    }
  }

  setupGalleryNavigation() {
    const leftBtn = document.getElementById('cover-gallery-arrow-left');
    const rightBtn = document.getElementById('cover-gallery-arrow-right');

    leftBtn?.addEventListener('click', () => {
      if (this.galleryItems.length <= 1) return;
      this.galleryIndex = (this.galleryIndex - 1 + this.galleryItems.length) % this.galleryItems.length;
      this.renderGalleryCover();
    });

    rightBtn?.addEventListener('click', () => {
      if (this.galleryItems.length <= 1) return;
      this.galleryIndex = (this.galleryIndex + 1) % this.galleryItems.length;
      this.renderGalleryCover();
    });
  }

  updateGalleryNavigation() {
    const coverWrap = document.getElementById('cover-wrap');
    if (!coverWrap) return;

    if (this.galleryItems.length > 1) {
      coverWrap.classList.add('gallery-nav-ready');
    } else {
      coverWrap.classList.remove('gallery-nav-ready');
    }
  }

  renderGalleryCover() {
    if (!this.galleryItems.length) return;

    const item = this.galleryItems[this.galleryIndex];
    const coverSlot = document.getElementById('cover-slot');
    if (!coverSlot) return;

    if (item.type === 'html' && item.src) {
      coverSlot.innerHTML = `<iframe src="${item.src}" frameborder="0" loading="lazy"></iframe>`;
    } else if (item.formats) {
      const src = item.formats.webp || item.formats.full || item.src;
      coverSlot.innerHTML = `<img src="${src}" alt="Обложка" draggable="false" loading="lazy">`;
    } else if (item.src) {
      coverSlot.innerHTML = `<img src="${item.src}" alt="Обложка" draggable="false" loading="lazy">`;
    }
  }

  async loadFavoritesAlbum() {
    this.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');
    
    const coverWrap = document.getElementById('cover-wrap');
    if (coverWrap) coverWrap.style.display = 'none';

    if (window.buildFavoritesRefsModel) {
      await window.buildFavoritesRefsModel();
    }

    const model = window.favoritesRefsModel || [];
    const container = document.getElementById('track-list');
    
    if (!container) return;

    if (model.length === 0) {
      container.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #8ab8fd;">
          <h3>Избранные треки</h3>
          <p>Отметьте треки звёздочкой ⭐</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';

    model.forEach((item, index) => {
      const trackEl = document.createElement('div');
      trackEl.className = 'track' + (item.__active ? '' : ' inactive');
      trackEl.id = `fav_${item.__a}_${item.__t}`;
      trackEl.dataset.index = index;
      trackEl.dataset.album = item.__a;
      trackEl.dataset.originalTrack = item.__t;

      const num = String(index + 1).padStart(2, '0');
      
      trackEl.innerHTML = `
        <div class="tnum">${num}</div>
        <div class="track-title" title="${item.title} — ${item.__album}">
          ${item.title} <span style="opacity:.6;font-size:.9em;">— ${item.__album}</span>
        </div>
        <img src="${item.__active ? 'img/star.png' : 'img/star2.png'}" 
             class="like-star" 
             alt="звезда"
             data-album="${item.__a}" 
             data-num="${item.__t}">
      `;

      trackEl.addEventListener('click', async (e) => {
        if (e.target.classList.contains('like-star')) return;
        
        if (item.__active && item.audio) {
          await this.ensureFavoritesPlayback(index);
        } else {
          window.NotificationSystem?.warning('Трек недоступен. Добавьте его в избранное из альбома.');
        }
      });

      const star = trackEl.querySelector('.like-star');
      star?.addEventListener('click', (e) => {
        e.stopPropagation();
        
        const wasActive = item.__active;
        window.toggleLikeForAlbum?.(item.__a, item.__t, !wasActive);
        
        trackEl.classList.toggle('inactive', wasActive);
        star.src = wasActive ? 'img/star2.png' : 'img/star.png';
        
        window.updateFavoritesRefsModelActiveFlag?.(item.__a, item.__t, !wasActive);
        
        if (window.playerCore && 
            this.getCurrentAlbum() === '__favorites__' &&
            window.playerCore.getIndex() === index && wasActive) {
          window.playerCore.next();
        }
      });

      container.appendChild(trackEl);
    });

    // Устанавливаем плейлист избранного в PlayerCore
    const tracks = model
      .filter(item => item.__active && item.audio)
      .map(item => ({
        src: item.audio,
        title: item.title,
        artist: item.__artist || 'Витрина Разбита',
        album: item.__album || 'Избранное',
        cover: item.__cover || 'img/logo.png',
        lyrics: item.lyrics || null,
        fulltext: item.fulltext || null
      }));

    if (window.playerCore) {
      window.playerCore.setPlaylist(tracks, 0, {
        artist: 'Витрина Разбита',
        album: 'Избранное',
        cover: 'img/logo.png'
      });
      
      this.playingAlbum = '__favorites__';
    }
  }

  async ensureFavoritesPlayback(index) {
    const model = window.favoritesRefsModel || [];
    
    if (!model.length) {
      window.NotificationSystem?.warning('Нет избранных треков');
      return;
    }

    const tracks = model
      .filter(item => item.__active && item.audio)
      .map(item => ({
        src: item.audio,
        title: item.title,
        artist: item.__artist || 'Витрина Разбита',
        album: item.__album || 'Избранное',
        cover: item.__cover || 'img/logo.png',
        lyrics: item.lyrics || null,
        fulltext: item.fulltext || null
      }));

    if (!tracks.length) {
      window.NotificationSystem?.warning('Нет доступных треков');
      return;
    }

    if (window.playerCore) {
      window.playerCore.setPlaylist(tracks, index, {
        artist: 'Витрина Разбита',
        album: 'Избранное',
        cover: 'img/logo.png'
      });
      
      window.playerCore.play(index);
      this.playingAlbum = '__favorites__';
      
      // Обновляем UI
      this.highlightCurrentTrack(index);
      window.PlayerUI?.ensurePlayerBlock(index);
    }
  }

  async loadNewsAlbum() {
    this.renderAlbumTitle('📰 НОВОСТИ 📰', 'news');
    
    await this.loadGallery('__reliz__');
    
    const coverSlot = document.getElementById('cover-slot');
    if (coverSlot && this.galleryItems.length) {
      this.galleryIndex = 0;
      this.renderGalleryCover();
    }

    const container = document.getElementById('track-list');
    if (container) {
      container.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #8ab8fd;">
          <h3>Следите за новостями</h3>
          <p>Новые треки появятся здесь</p>
          <div style="margin-top: 20px;">
            <a href="https://t.me/vitrina_razbita" target="_blank" 
               style="color: #4daaff; text-decoration: underline;">
              Telegram канал
            </a>
            ·
            <a href="./news.html" target="_blank"
               style="color: #4daaff; text-decoration: underline;">
              Страница новостей
            </a>
          </div>
        </div>
      `;
    }

    const coverWrap = document.getElementById('cover-wrap');
    if (coverWrap) coverWrap.style.display = '';
  }

  renderAlbumTitle(title, modifier = '') {
    const titleEl = document.getElementById('active-album-title');
    if (titleEl) {
      titleEl.textContent = title;
      titleEl.className = 'active-album-title';
      if (modifier) titleEl.classList.add(modifier);
    }
  }

  renderCover(albumInfo, albumData) {
    const coverSlot = document.getElementById('cover-slot');
    if (!coverSlot) return;

    if (this.galleryItems.length > 0) {
      this.renderGalleryCover();
    } else {
      const coverUrl = albumData.cover 
        ? `${albumInfo.base}${albumData.cover}` 
        : `${albumInfo.base}cover.jpg`;
      
      coverSlot.innerHTML = `<img src="${coverUrl}" alt="${albumInfo.title}" draggable="false" loading="lazy">`;
    }
  }

  renderSocials(links) {
    const container = document.getElementById('social-links');
    if (!container) return;

    container.innerHTML = '';
    if (!links || links.length === 0) return;

    links.forEach(link => {
      const a = document.createElement('a');
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = link.label;
      container.appendChild(a);
    });
  }

  renderTrackList(tracks, albumInfo) {
    const container = document.getElementById('track-list');
    if (!container) return;

    container.innerHTML = '';

    tracks.forEach((track, index) => {
      const trackEl = this.createTrackElement(track, albumInfo.key, index);
      container.appendChild(trackEl);
    });
  }

  createTrackElement(track, albumKey, index) {
    const trackEl = document.createElement('div');
    trackEl.className = 'track';
    trackEl.id = `trk${index}`;
    trackEl.dataset.index = index;
    trackEl.dataset.album = albumKey;

    const isFavorite = window.getLikedForAlbum?.(albumKey)?.includes(track.num) || false;

    trackEl.innerHTML = `
      <div class="tnum">${track.num || index + 1}</div>
      <div class="track-title">${track.title}</div>
      <img src="${isFavorite ? 'img/star.png' : 'img/star2.png'}" 
           class="like-star" 
           alt="звезда"
           data-album="${albumKey}" 
           data-num="${track.num || index + 1}">
    `;

    trackEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('like-star')) return;
      
      this.highlightCurrentTrack(index);
      
      window.playerCore?.play(index);
      this.playingAlbum = albumKey;
      
      window.PlayerUI?.ensurePlayerBlock(index);
    });

    const star = trackEl.querySelector('.like-star');
    star?.addEventListener('click', (e) => {
      e.stopPropagation();
      const trackNum = parseInt(star.dataset.num);
      const wasLiked = window.getLikedForAlbum?.(albumKey)?.includes(trackNum);
      
      window.toggleLikeForAlbum?.(albumKey, trackNum, !wasLiked);
      star.src = wasLiked ? 'img/star2.png' : 'img/star.png';
      
      trackEl.classList.toggle('is-favorite', !wasLiked);
    });

    return trackEl;
  }

  highlightCurrentTrack(index) {
    document.querySelectorAll('.track.current').forEach(el => el.classList.remove('current'));
    const trackEl = document.querySelector(`.track[data-index="${index}"]`);
    if (trackEl) trackEl.classList.add('current');
  }

  updateActiveIcon(albumKey) {
    document.querySelectorAll('.album-icon').forEach(icon => {
      icon.classList.toggle('active', icon.dataset.album === albumKey);
    });
  }

  clearUI() {
    const trackList = document.getElementById('track-list');
    const coverSlot = document.getElementById('cover-slot');
    const socials = document.getElementById('social-links');

    if (trackList) trackList.innerHTML = '';
    if (coverSlot) coverSlot.innerHTML = '';
    if (socials) socials.innerHTML = '';
    
    this.galleryItems = [];
    this.galleryIndex = 0;
    this.updateGalleryNavigation();
  }

  getCurrentAlbum() {
    return this.currentAlbum;
  }

  getPlayingAlbum() {
    return this.playingAlbum;
  }

  getAlbumData(albumKey) {
    return this.albumsData.get(albumKey);
  }

  getAlbumConfigByKey(albumKey) {
    return this.albumsData.get(albumKey);
  }
}

window.AlbumsManager = new AlbumsManager();

export default AlbumsManager;
