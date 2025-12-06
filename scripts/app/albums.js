// scripts/app/albums.js
// ⭐ ИСПРАВЛЕНО: создаёт UI плеера при загрузке альбома

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

      // ⭐ КРИТИЧНО: Создать UI плеера ПЕРЕД загрузкой треков
      this.ensurePlayerUI();

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

  // ⭐ НОВЫЙ МЕТОД: создаёт UI плеера, если его ещё нет
  ensurePlayerUI() {
    const container = document.getElementById('now-playing');
    if (!container) return;

    // Если UI уже создан — не дублируем
    if (container.querySelector('.player-controls')) {
      return;
    }

    console.log('🎨 Creating player UI...');

    container.innerHTML = `
      <div class="player-controls">
        <!-- Прогресс -->
        <div class="progress-container">
          <div class="progress-bar" id="progress-bar">
            <div class="progress-fill" id="progress-fill"></div>
            <div class="progress-handle" id="progress-handle"></div>
          </div>
          <div class="time-display">
            <span id="current-time">0:00</span>
            <span id="duration">0:00</span>
          </div>
        </div>

        <!-- Кнопки -->
        <div class="control-buttons">
          <button id="repeat-btn" class="control-btn" title="Повтор">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 1l4 4-4 4"/>
              <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
              <path d="M7 23l-4-4 4-4"/>
              <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
          </button>

          <button id="prev-btn" class="control-btn" title="Назад">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
            </svg>
          </button>

          <button id="play-pause-btn" class="control-btn play-pause-btn" title="Играть">
            <svg class="play-icon" width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
            <svg class="pause-icon" width="32" height="32" viewBox="0 0 24 24" fill="currentColor" style="display: none;">
              <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
            </svg>
          </button>

          <button id="next-btn" class="control-btn" title="Вперёд">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 18h2V6h-2zM6 18l8.5-6L6 6z"/>
            </svg>
          </button>

          <button id="shuffle-btn" class="control-btn" title="Перемешать">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
            </svg>
          </button>
        </div>

        <!-- Громкость -->
        <div class="volume-container">
          <button id="volume-icon" class="control-btn volume-icon" title="Громкость">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          </button>
          <input type="range" id="volume-slider" class="volume-slider" 
                 min="0" max="100" value="100" title="Громкость">
        </div>

        <!-- Трек -->
        <div class="track-info">
          <div class="track-title" id="track-title-display">—</div>
          <div class="track-album" id="track-album-display">—</div>
        </div>
      </div>
    `;
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

    if (window.playerCore) {
      const tracks = albumData.tracks.map((t, idx) => ({
        title: t.title,
        url: `${albumInfo.base}${t.file}`,
        artist: 'Витрина Разбита',
        album: albumInfo.title,
        cover: `${albumInfo.base}${albumData.cover || 'cover.jpg'}`,
        trackNumber: idx
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

  // ... остальные методы без изменений (loadFavoritesAlbum, loadNewsAlbum и т.д.)
  // [Копируйте из предыдущей версии]

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

    trackEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('like-star')) return;
      
      if (window.playerCore) {
        window.playerCore.playTrack(index);
      }
    });

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

  // ⭐ Методы для избранного и новостей - добавьте по необходимости
  async loadFavoritesAlbum() {
    // Ваша реализация
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
