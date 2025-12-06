// scripts/app/albums.js
// Управление альбомами с интеграцией старого функционала

import { APP_CONFIG } from '../core/config.js';

class AlbumsManager {
  constructor() {
    this.currentAlbum = null;
    this.albumsData = new Map();
    this.isLoading = false;
    this.galleryIndex = 0;
    this.galleryItems = [];
  }

  async initialize() {
    if (!window.albumsIndex || window.albumsIndex.length === 0) {
      console.error('❌ No albums found');
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
      iconEl.dataset.akey = key; // Для E2E тестов
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
      // Остановить плеер ТОЛЬКО если не играет
      // (согласно требованию: "плеер всегда играет")
      if (window.playerCore && !window.playerCore.isPlaying()) {
        window.playerCore.stop();
      }

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
    if (!albumInfo) throw new Error(`Album ${albumKey} not found`);

    // Загрузка tracks.json
    let albumData = this.albumsData.get(albumKey);
    
    if (!albumData) {
      const response = await fetch(`${albumInfo.base}tracks.json`, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      albumData = await response.json();
      this.albumsData.set(albumKey, albumData);
    }

    // Загрузка галереи
    await this.loadGallery(albumKey);

    this.renderAlbumTitle(albumInfo.title);
    this.renderCover(albumInfo, albumData);
    this.renderSocials(albumData.social_links);
    this.renderTrackList(albumData.tracks, albumInfo);

    // Загрузка в PlayerCore
    if (window.playerCore) {
      const tracks = albumData.tracks.map((t, idx) => ({
        src: `${albumInfo.base}${t.file}`,
        title: t.title,
        artist: 'Витрина Разбита',
        album: albumInfo.title,
        cover: `${albumInfo.base}${albumData.cover || 'cover.jpg'}`,
        lyrics: t.lyrics ? `${albumInfo.base}${t.lyrics}` : null,
        fulltext: t.fulltext ? `${albumInfo.base}${t.fulltext}` : null
      }));
      
      // КРИТИЧНО: setPlaylist БЕЗ автоматического воспроизведения
      window.playerCore.setPlaylist(tracks, 0, {
        artist: 'Витрина Разбита',
        album: albumInfo.title,
        cover: `${albumInfo.base}${albumData.cover || 'cover.jpg'}`
      });
    }

    const coverWrap = document.getElementById('cover-wrap');
    if (coverWrap) coverWrap.style.display = '';
  }

  async loadGallery(albumKey) {
    // Определение centralId для галереи
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
    
    if (typeof window.openFavoritesView === 'function') {
      await window.openFavoritesView();
    } else {
      const container = document.getElementById('track-list');
      if (container) {
        container.innerHTML = `
          <div style="padding: 20px; text-align: center; color: #8ab8fd;">
            <h3>Избранные треки</h3>
            <p>Отметьте треки звёздочкой ⭐</p>
          </div>
        `;
      }
    }

    const coverWrap = document.getElementById('cover-wrap');
    if (coverWrap) coverWrap.style.display = 'none';
  }

  async loadNewsAlbum() {
    this.renderAlbumTitle('📰 НОВОСТИ 📰', 'news');
    
    // Загрузка галереи новостей
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

    // Клик по треку - воспроизведение
    trackEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('like-star')) return;
      
      // Обновляем подсветку
      document.querySelectorAll('.track.current').forEach(el => el.classList.remove('current'));
      trackEl.classList.add('current');
      
      window.playerCore?.play(index);
    });

    // Клик по звездочке - избранное
    const star = trackEl.querySelector('.like-star');
    star?.addEventListener('click', (e) => {
      e.stopPropagation();
      const trackNum = parseInt(star.dataset.num);
      const wasLiked = window.getLikedForAlbum?.(albumKey)?.includes(trackNum);
      
      window.toggleLikeForAlbum?.(albumKey, trackNum, !wasLiked);
      star.src = wasLiked ? 'img/star2.png' : 'img/star.png';
      
      // Обновить класс is-favorite
      trackEl.classList.toggle('is-favorite', !wasLiked);
    });

    return trackEl;
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

  getAlbumData(albumKey) {
    return this.albumsData.get(albumKey);
  }
}

window.AlbumsManager = new AlbumsManager();

export default AlbumsManager;
