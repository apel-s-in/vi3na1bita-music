// scripts/app/albums.js
// Управление альбомами - загрузка, переключение, отображение

import { APP_CONFIG } from '../core/config.js';

class AlbumsManager {
  constructor() {
    this.currentAlbum = null;
    this.albumsData = new Map();
    this.isLoading = false;
  }

  async initialize() {
    if (!window.albumsIndex || window.albumsIndex.length === 0) {
      console.error('❌ No albums found');
      return;
    }

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
      // Проверка существования (кроме спецальбомов)
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
      // Остановить плеер
      if (window.playerCore) {
        window.playerCore.stop();
      }

      // Очистить UI
      this.clearUI();

      // Обработка специальных альбомов
      if (albumKey === '__favorites__') {
        await this.loadFavoritesAlbum();
      } else if (albumKey === '__reliz__') {
        await this.loadNewsAlbum();
      } else {
        await this.loadRegularAlbum(albumKey);
      }

      // Обновить активную иконку
      this.updateActiveIcon(albumKey);

      // Сохранить текущий альбом
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

    // Загрузить tracks.json
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

    // Отобразить UI
    this.renderAlbumTitle(albumInfo.title);
    this.renderCover(albumInfo, albumData);
    this.renderSocials(albumData.social_links);
    this.renderTrackList(albumData.tracks, albumInfo);

    // Загрузить в плеер
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

    // Показать галерею
    const coverWrap = document.getElementById('cover-wrap');
    if (coverWrap) coverWrap.style.display = '';
  }

  async loadFavoritesAlbum() {
    const favorites = window.FavoritesManager?.getAllFavorites() || {};
    const allTracks = [];

    // Собрать все избранные треки
    for (const albumKey in favorites) {
      const albumInfo = window.albumsIndex.find(a => a.key === albumKey);
      if (!albumInfo) continue;

      const trackNumbers = favorites[albumKey];
      if (!trackNumbers || trackNumbers.length === 0) continue;

      // Загрузить данные альбома
      let albumData = this.albumsData.get(albumKey);
      if (!albumData) {
        try {
          const response = await fetch(`${albumInfo.base}tracks.json`, {
            cache: 'no-cache'
          });
          albumData = await response.json();
          this.albumsData.set(albumKey, albumData);
        } catch (error) {
          console.error(`Failed to load album ${albumKey}:`, error);
          continue;
        }
      }

      // Добавить избранные треки
      trackNumbers.forEach(num => {
        const track = albumData.tracks.find(t => t.num === num);
        if (track) {
          allTracks.push({
            ...track,
            album: albumKey,
            albumTitle: albumInfo.title,
            albumBase: albumInfo.base,
            originalTrackNum: num
          });
        }
      });
    }

    if (allTracks.length === 0) {
      this.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');
      this.showEmptyFavorites();
      return;
    }

    // Отобразить избранное
    this.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');
    this.renderFavoritesCover();
    this.renderFavoritesTrackList(allTracks);

    // Загрузить в плеер
    if (window.playerCore) {
      const tracks = allTracks.map((t, idx) => ({
        title: t.title,
        url: `${t.albumBase}${t.file}`,
        artist: 'Витрина Разбита',
        album: t.albumTitle,
        cover: 'img/icon_album/icon-album-00.png',
        trackNumber: idx,
        originalAlbum: t.album,
        originalTrackNum: t.originalTrackNum
      }));
      
      window.playerCore.setPlaylist(tracks, 0, {
        artist: 'Витрина Разбита',
        album: 'Избранное',
        cover: 'img/icon_album/icon-album-00.png'
      });
    }

    // Скрыть галерею
    const coverWrap = document.getElementById('cover-wrap');
    if (coverWrap) coverWrap.style.display = 'none';
  }

  async loadNewsAlbum() {
    this.renderAlbumTitle('📰 НОВОСТИ 📰', 'news');
    this.renderNewsCover();
    
    const newsContainer = document.getElementById('track-list');
    if (newsContainer) {
      newsContainer.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #8ab8fd;">
          <h3>Следите за новостями</h3>
          <p>Новые треки и альбомы появятся здесь</p>
          <div style="margin-top: 20px;">
            <a href="https://t.me/vitrina_razbita" target="_blank" 
               style="color: #4daaff; text-decoration: underline;">
              Telegram канал
            </a>
          </div>
        </div>
      `;
    }

    // Скрыть галерею
    const coverWrap = document.getElementById('cover-wrap');
    if (coverWrap) coverWrap.style.display = 'none';
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

  renderFavoritesCover() {
    const coverSlot = document.getElementById('cover-slot');
    if (!coverSlot) return;
    
    coverSlot.innerHTML = `
      <img src="img/icon_album/icon-album-00.png" alt="Избранное" draggable="false">
    `;
  }

  renderNewsCover() {
    const coverSlot = document.getElementById('cover-slot');
    if (!coverSlot) return;
    
    coverSlot.innerHTML = `
      <img src="img/icon_album/icon-album-news.png" alt="Новости" draggable="false">
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

  renderFavoritesTrackList(tracks) {
    const container = document.getElementById('track-list');
    if (!container) return;

    container.innerHTML = '';

    tracks.forEach((track, index) => {
      const trackEl = this.createTrackElement(
        track,
        track.album,
        index,
        track.albumTitle,
        track.originalTrackNum
      );
      container.appendChild(trackEl);
    });
  }

  createTrackElement(track, albumKey, index, albumTitle = null, originalTrackNum = null) {
    const trackEl = document.createElement('div');
    trackEl.className = 'track';
    trackEl.dataset.index = index;
    trackEl.dataset.album = albumKey;

    const trackNumForFavorites = originalTrackNum !== null 
      ? originalTrackNum 
      : track.num;
    
    const isFavorite = window.FavoritesManager?.isFavorite(
      albumKey,
      trackNumForFavorites
    ) || false;

    trackEl.innerHTML = `
      <div class="tnum">${track.num || index + 1}</div>
      <div class="track-title">
        ${track.title}
        ${albumTitle ? `<span style="color: #666;"> (${albumTitle})</span>` : ''}
      </div>
      <button class="like-star" 
              data-album="${albumKey}" 
              data-num="${trackNumForFavorites}" 
              aria-label="Избранное">
        ${isFavorite ? '⭐' : '☆'}
      </button>
    `;

    // Клик по треку - воспроизведение
    trackEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('like-star')) return;
      
      if (window.playerCore) {
        window.playerCore.playTrack(index);
      }
    });

    // Клик по звездочке - избранное
    const star = trackEl.querySelector('.like-star');
    star?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFavorite(albumKey, trackNumForFavorites, star);
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
      starEl.classList.add('animating');
      setTimeout(() => starEl.classList.remove('animating'), 300);
    }
  }

  showEmptyFavorites() {
    const container = document.getElementById('track-list');
    if (!container) return;

    container.innerHTML = `
      <div style="padding: 40px 20px; text-align: center; color: #999;">
        <div style="font-size: 48px; margin-bottom: 20px;">☆</div>
        <p style="font-size: 18px; margin-bottom: 10px;">
          Нет избранных треков
        </p>
        <p style="font-size: 14px;">
          Отметьте треки звёздочкой ⭐
        </p>
      </div>
    `;

    this.renderFavoritesCover();
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
    const nowPlaying = document.getElementById('now-playing');

    if (trackList) trackList.innerHTML = '';
    if (coverSlot) coverSlot.innerHTML = '';
    if (socials) socials.innerHTML = '';
    if (nowPlaying) nowPlaying.innerHTML = '';
  }

  getCurrentAlbum() {
    return this.currentAlbum;
  }

  getAlbumData(albumKey) {
    return this.albumsData.get(albumKey);
  }
}

// Глобальный экземпляр
window.AlbumsManager = new AlbumsManager();

export default AlbumsManager;
