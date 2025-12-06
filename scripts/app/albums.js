// scripts/app/albums.js
// ⭐ ИСПРАВЛЕНО: НЕ создаёт UI плеера (это делает player-controls.js)

import { APP_CONFIG } from '../core/config.js';

class AlbumsManager {
  constructor() {
    this.currentAlbum = null;
    this.albumsData = new Map();
    this.isLoading = false;
  }

  async initialize() {
    // ⭐ Проверяем, что albums.json загружен
    if (!window.albumsIndex || window.albumsIndex.length === 0) {
      console.error('❌ No albums found');
      return;
    }

    console.log(`✅ Albums available: ${window.albumsIndex.length}`);

    this.renderAlbumIcons();
    
    // Загрузить последний альбом
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
      iconEl.title = title;
      iconEl.innerHTML = `<img src="${icon}" alt="${title}" draggable="false">`;

      iconEl.addEventListener('click', () => this.loadAlbum(key));
      container.appendChild(iconEl);
    });
  }

  async loadAlbum(albumKey) {
    if (this.isLoading) {
      console.warn('⚠️ Album loading in progress');
      return;
    }

    this.isLoading = true;

    try {
      if (window.playerCore) {
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
    if (!albumInfo) {
      throw new Error(`Album ${albumKey} not found`);
    }

    let albumData = this.albumsData.get(albumKey);
    
    if (!albumData) {
      const response = await fetch(`${albumInfo.base}tracks.json`, {
        cache: 'no-cache'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      albumData = await response.json();
      this.albumsData.set(albumKey, albumData);
    }

    this.renderAlbumTitle(albumInfo.title);
    this.renderCover(albumInfo, albumData);
    this.renderSocials(albumData.social_links);
    this.renderTrackList(albumData.tracks, albumInfo);

    // ⭐ Загрузить в PlayerCore
    if (window.playerCore) {
      const tracks = albumData.tracks.map((t, idx) => ({
        src: `${albumInfo.base}${t.file}`,
        title: t.title,
        artist: 'Витрина Разбита',
        album: albumInfo.title,
        cover: `${albumInfo.base}${albumData.cover || 'cover.jpg'}`,
        lyrics: t.lyrics ? `${albumInfo.base}${t.lyrics}` : null
      }));
      
      window.playerCore.setPlaylist(tracks, 0, {
        artist: 'Витрина Разбита',
        album: albumInfo.title,
        cover: `${albumInfo.base}${albumData.cover || 'cover.jpg'}`
      });
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

    const coverUrl = albumData.cover 
      ? `${albumInfo.base}${albumData.cover}` 
      : `${albumInfo.base}cover.jpg`;
    
    coverSlot.innerHTML = `
      <img src="${coverUrl}" alt="${albumInfo.title}" draggable="false">
    `;
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
    trackEl.dataset.index = index;
    trackEl.dataset.album = albumKey;

    const isFavorite = window.FavoritesManager?.isFavorite(albumKey, track.num) || false;

    trackEl.innerHTML = `
      <div class="tnum">${track.num || index + 1}</div>
      <div class="track-title">${track.title}</div>
      <button class="like-star" 
              data-album="${albumKey}" 
              data-num="${track.num || index + 1}">
        ${isFavorite ? '⭐' : '☆'}
      </button>
    `;

    // ⭐ Клик по треку - воспроизведение
    trackEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('like-star')) return;
      
      if (window.playerCore) {
        window.playerCore.play(index);
      }
    });

    // Клик по звездочке
    const star = trackEl.querySelector('.like-star');
    star?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFavorite(albumKey, track.num || index + 1, star);
    });

    return trackEl;
  }

  toggleFavorite(albumKey, trackNum, starEl) {
    if (!window.FavoritesManager) return;

    const isFav = window.FavoritesManager.isFavorite(albumKey, trackNum);

    if (isFav) {
      window.FavoritesManager.removeFavorite(albumKey, trackNum);
      starEl.textContent = '☆';
    } else {
      window.FavoritesManager.addFavorite(albumKey, trackNum);
      starEl.textContent = '⭐';
    }
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
  }

  getCurrentAlbum() {
    return this.currentAlbum;
  }

  getAlbumData(albumKey) {
    return this.albumsData.get(albumKey);
  }

  async loadFavoritesAlbum() {
    this.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');
    
    const newsContainer = document.getElementById('track-list');
    if (newsContainer) {
      newsContainer.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #8ab8fd;">
          <h3>Избранные треки</h3>
          <p>Здесь будут ваши любимые песни</p>
        </div>
      `;
    }

    const coverWrap = document.getElementById('cover-wrap');
    if (coverWrap) coverWrap.style.display = 'none';
  }

  async loadNewsAlbum() {
    this.renderAlbumTitle('📰 НОВОСТИ 📰', 'news');
    
    const newsContainer = document.getElementById('track-list');
    if (newsContainer) {
      newsContainer.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #8ab8fd;">
          <h3>Следите за новостями</h3>
          <p>Новые треки появятся здесь</p>
          <div style="margin-top: 20px;">
            <a href="https://t.me/vitrina_razbita" target="_blank" 
               style="color: #4daaff; text-decoration: underline;">
              Telegram канал
            </a>
          </div>
        </div>
      `;
    }

    const coverWrap = document.getElementById('cover-wrap');
    if (coverWrap) coverWrap.style.display = 'none';
  }
}

window.AlbumsManager = new AlbumsManager();

export default AlbumsManager;
