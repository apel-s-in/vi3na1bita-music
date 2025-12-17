// scripts/app/albums.js
// Управление альбомами на новой платформе PlayerCore

// import { APP_CONFIG } from '../core/config.js';
// ВАЖНО: config.js публикует window.APP_CONFIG. Используем глобальный конфиг для устойчивости на GitHub Pages/SW.
const APP_CONFIG = window.APP_CONFIG;

class AlbumsManager {
  constructor() {
    this.currentAlbum = null;
    this.playingAlbum = null;
    this.albumsData = new Map();
    this.isLoading = false;
    
    // ✅ Флаг видимости галереи (toggle при повторном клике)
    this.isGalleryVisible = true;
  }

  async initialize() {
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
    
    const lastAlbum = localStorage.getItem('currentAlbum');
    const albumToLoad = lastAlbum || window.albumsIndex[0].key;
    
    await this.loadAlbum(albumToLoad);
  }

  renderAlbumIcons() {
    const container = document.getElementById('album-icons');
    if (!container) return;

    container.innerHTML = '';

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

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

      const baseIcon = icon || 'img/logo.png';
      const path1x = isMobile
        ? baseIcon.replace(/icon_album\/(.+)\.png$/i, 'icon_album/mobile/$1@1x.jpg')
        : baseIcon.replace(/\.png$/i, '@1x.png');
      const path2x = isMobile
        ? path1x.replace(/@1x\.jpg$/i, '@2x.jpg')
        : path1x.replace(/@1x\.png$/i, '@2x.png');

      iconEl.innerHTML = `<img src="${path1x}" srcset="${path2x} 2x" alt="${title}" draggable="false" loading="lazy" width="60" height="60">`;

      // ✅ КРИТИЧНО: Обработка кликов с проверкой активности
      iconEl.addEventListener('click', () => this.handleAlbumIconClick(key));
      
      container.appendChild(iconEl);
    });
  }

  /**
   * ✅ НОВАЯ ЛОГИКА: Если кликнули на УЖЕ активный альбом — toggle галереи
   */
  async handleAlbumIconClick(albumKey) {
    console.log(`🎯 Album icon clicked: ${albumKey}, current: ${this.currentAlbum}`);
    
    // Повторный клик по текущему альбому — toggle видимости галереи
    if (this.currentAlbum === albumKey && !albumKey.startsWith('__')) {
      this.toggleGalleryVisibility();
      return;
    }
    
    // Иначе загружаем новый альбом
    await this.loadAlbum(albumKey);
  }

  /**
   * ✅ Toggle видимости галереи
   */
  toggleGalleryVisibility() {
    this.isGalleryVisible = !this.isGalleryVisible;
    
    const coverWrap = document.getElementById('cover-wrap');
    if (coverWrap) {
      coverWrap.style.display = this.isGalleryVisible ? '' : 'none';
    }
    
    window.NotificationSystem?.info(
      this.isGalleryVisible ? '🖼️ Галерея показана' : '🚫 Галерея скрыта'
    );
  }

  async loadAlbum(albumKey) {
    if (this.isLoading) {
      console.warn('⚠️ Album loading already in progress');
      return;
    }
    
    this.isLoading = true;

    try {
      // ✅ Сбрасываем видимость галереи (по умолчанию показана)
      this.isGalleryVisible = true;

      this.clearUI();

      // ✅ Кнопка фильтра видима во всех режимах, кроме "ИЗБРАННОЕ" и "НОВОСТИ"
      const filterBtn = document.getElementById('filter-favorites-btn');
      if (filterBtn) {
        filterBtn.style.display = (albumKey === '__favorites__' || albumKey === '__reliz__') ? 'none' : '';
      }

      if (albumKey === '__favorites__') {
        await this.loadFavoritesAlbum();
      } else if (albumKey === '__reliz__') {
        await this.loadNewsAlbum();
      } else {
        await this.loadRegularAlbum(albumKey);
      }

      this.currentAlbum = albumKey;
      this.updateActiveIcon(albumKey);
      localStorage.setItem('currentAlbum', albumKey);
      
      console.log(`✅ currentAlbum set to: ${albumKey}`);

      // Сброс фильтрации
      const trackList = document.getElementById('track-list');

      // filterBtn уже получен выше в этом методе; переиспользуем его, чтобы не объявлять повторно
      if (filterBtn) {
        filterBtn.textContent = 'Скрыть не отмеченные ⭐ песни';
        filterBtn.classList.remove('filtered');
      }

      if (trackList) {
        trackList.classList.remove('filtered');
      }

      if (window.PlayerUI && typeof window.PlayerUI.switchAlbumInstantly === 'function') {
        window.PlayerUI.switchAlbumInstantly(albumKey);
      }

      if (window.PlayerState && typeof window.PlayerState.save === 'function') {
        window.PlayerState.save();
      }

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
      const normTracks = tracks.map((t, idx) => {
        const file = t.audio ? new URL(t.audio, base).toString() : null;
        const lyrics = t.lyrics ? new URL(t.lyrics, base).toString() : null;
        const fulltext = t.fulltext ? new URL(t.fulltext, base).toString() : null;

        const uid = (typeof t.uid === 'string' && t.uid.trim()) ? t.uid.trim() : null;

        // num оставляем только для UI-отображения
        const num = idx + 1;

        const sizeMB = typeof t.size === 'number' ? t.size : null;

        return {
          num,
          title: t.title || `Трек ${idx + 1}`,
          file,
          lyrics,
          fulltext,
          uid,
          size: sizeMB
        };
      });

      const coverPath = data.cover || 'cover.jpg';

      const socialLinks = Array.isArray(data.social_links) 
        ? data.social_links 
        : (Array.isArray(data.socials) 
            ? data.socials.map(s => ({ label: s.title, url: s.url }))
            : []);

      albumData = {
        title: data.albumName || albumInfo.title,
        artist: data.artist || 'Витрина Разбита',
        cover: coverPath,
        social_links: socialLinks,
        tracks: normTracks
      };

      this.albumsData.set(albumKey, albumData);
    }

    // ✅ Загрузка галереи ТОЛЬКО через GalleryManager
    await this.loadGallery(albumKey);

    // ✅ Fallback: если галерея не загрузилась/пуста — показываем logo.png,
    // не трогая воспроизведение (базовое правило плеера соблюдаем).
    try {
      const count = window.GalleryManager?.getItemsCount?.() || 0;
      if (count <= 0) {
        const slot = document.getElementById('cover-slot');
        if (slot) {
          slot.innerHTML = `<img src="img/logo.png" alt="Обложка" draggable="false" loading="lazy">`;
        }
      }
    } catch {}

    this.renderAlbumTitle(albumData.title || albumInfo.title);
    
    // ✅ cover.jpg намеренно не рендерим: источник обложек — центральная галерея.
    
    this.renderSocials(albumData.social_links);
    this.renderTrackList(albumData.tracks, albumInfo);

    if (window.PlayerUI) {
      window.PlayerUI.updateMiniHeader?.();
      window.PlayerUI.updateNextUpLabel?.();
    }

    // ✅ Показываем галерею (по умолчанию видима)
    const coverWrap = document.getElementById('cover-wrap');
    if (coverWrap) coverWrap.style.display = '';
  }

  async loadGallery(albumKey) {
    if (window.GalleryManager) {
      await window.GalleryManager.loadGallery(albumKey);
    }
  }

  async loadFavoritesAlbum() {
    this.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');
    
    const coverWrap = document.getElementById('cover-wrap');
    if (coverWrap) coverWrap.style.display = 'none';

    // ✅ Скрываем кнопку фильтра в избранном (не нужна)
    const filterBtn = document.getElementById('filter-favorites-btn');
    if (filterBtn) filterBtn.style.display = 'none';

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

    // ✅ Новая логика: нет "удалить недоступные" как массовой чистки.
    // Удаление — только через модалку при клике по серой строке.
    container.innerHTML = '';

    model.forEach((item, index) => {
      const trackEl = document.createElement('div');
      trackEl.className = 'track' + (item.__active ? '' : ' inactive');
      trackEl.id = `fav_${item.__a}_${item.__uid}`;
      trackEl.dataset.index = index;
      trackEl.dataset.album = item.__a;
      trackEl.dataset.uid = item.__uid;

      const displayNum = String(index + 1).padStart(2, '0');
      const isActive = item.__active;

      const albumTitle = item.__album || 'Альбом';
      const trackTitle = item.title || 'Трек';

      trackEl.innerHTML = `
        <div class="tnum">${displayNum}.</div>
        <div class="track-title" title="${trackTitle} - ${albumTitle}">
          ${trackTitle} - ${albumTitle}
        </div>
        <img src="${isActive ? 'img/star.png' : 'img/star2.png'}"
             class="like-star"
             alt="звезда"
             data-album="${item.__a}"
             data-uid="${item.__uid}">
      `;

      trackEl.addEventListener('click', async (e) => {
        if (e.target.classList.contains('like-star')) return;

        if (item.__active && item.audio) {
          await this.ensureFavoritesPlayback(index);
          return;
        }

        // ✅ Как в старом: модалка для неактивного трека (добавить в ⭐ / удалить)
        if (window.FavoritesData && typeof window.FavoritesData.showFavoritesInactiveModal === 'function') {
          window.FavoritesData.showFavoritesInactiveModal({
            albumKey: item.__a,
            uid: item.__uid,
            title: item.title || 'Трек',
            onDeleted: async () => {
              if (window.PlayerUI?.updateAvailableTracksForPlayback) {
                window.PlayerUI.updateAvailableTracksForPlayback();
              }
            }
          });
          return;
        }

        window.NotificationSystem?.warning('Трек недоступен.');
      });

      const star = trackEl.querySelector('.like-star');
      star?.addEventListener('click', (e) => {
        e.stopPropagation();

        // ✅ В "ИЗБРАННОЕ" снятие звезды НЕ удаляет строку.
        // Оно переводит строку в неактивную (серую) и трек перестаёт быть воспроизводимым.
        const wasActive = !!item.__active;
        const makeLiked = !wasActive;

        const uid = String(item.__uid || '').trim();
        if (!uid) return;

        if (window.FavoritesManager && typeof window.FavoritesManager.toggleLike === 'function') {
          window.FavoritesManager.toggleLike(item.__a, uid, makeLiked);
        }

        // ✅ ВАЖНО: в "ИЗБРАННОЕ" refs храним всегда (oldstar-механика).
        // Если включили лайк — гарантируем, что ref существует.
        if (makeLiked && window.FavoritesData && typeof window.FavoritesData.ensureFavoritesRefsWithLikes === 'function') {
          window.FavoritesData.ensureFavoritesRefsWithLikes();
        }

        item.__active = makeLiked;

        // Если лайк снят в избранном — строка остаётся, но становится не воспроизводимой
        if (!makeLiked) {
          item.audio = null;
          item.lyrics = null;
          item.fulltext = null;
        }

        trackEl.classList.toggle('inactive', !makeLiked);
        star.src = makeLiked ? 'img/star.png' : 'img/star2.png';

        // ✅ Realtime синхронизация делается через событие favorites:changed и общий ререндер/обновление UI.
        // Здесь не делаем ручных обходов DOM по data-num (uid-модель).

        // Перестроим доступные индексы для режима "только избранные"/очереди.
        if (window.PlayerUI && typeof window.PlayerUI.updateAvailableTracksForPlayback === 'function') {
          window.PlayerUI.updateAvailableTracksForPlayback();
        }

        // Если сейчас играет именно эта строка избранного, и мы сняли лайк —
        // переключаемся на следующий доступный трек (это НЕ "остановка").
        if (window.playerCore &&
            this.getPlayingAlbum() === (window.SPECIAL_FAVORITES_KEY || '__favorites__') &&
            window.playerCore.getIndex() === index &&
            wasActive && !makeLiked) {
          window.playerCore.next();
        }
      });

      container.appendChild(trackEl);
    });
  }
  // cleanupUnavailableFavorites удалён по дизайну:
  // удаление из "ИЗБРАННОЕ" выполняется только через модалку на неактивной строке.

  async ensureFavoritesPlayback(index) {
    const model = Array.isArray(window.favoritesRefsModel) ? window.favoritesRefsModel : [];

    if (!model.length) {
      window.NotificationSystem?.warning('Нет избранных треков');
      return;
    }

    // ✅ Доступные треки избранного — только активные с аудио
    const activeItems = model.filter(item => item && item.__active && item.audio);

    if (!activeItems.length) {
      window.NotificationSystem?.warning('Нет доступных треков');
      return;
    }

    // Индекс клика в UI (model index) надо перевести в индекс активного списка
    const clicked = model[index];
    let startIndex = 0;

    if (clicked && clicked.__active && clicked.audio) {
      const uid = String(clicked.__uid || '').trim();
      const idxInActive = activeItems.findIndex(it => String(it.__uid || '').trim() === uid && String(it.__a || '').trim() === String(clicked.__a || '').trim());
      startIndex = idxInActive >= 0 ? idxInActive : 0;
    } else {
      startIndex = 0;
    }

    const tracks = activeItems.map(item => ({
      src: item.audio,
      title: item.title,
      artist: item.__artist || 'Витрина Разбита',
      album: window.SPECIAL_FAVORITES_KEY || '__favorites__',
      cover: item.__cover || 'img/logo.png',
      lyrics: item.lyrics || null,
      fulltext: item.fulltext || null,
      uid: (typeof item.__uid === 'string' && item.__uid.trim()) ? item.__uid.trim() : null,

      // ✅ ВАЖНО: исходный альбом трека (для лайка/мини-звезды)
      sourceAlbum: item.__a
    }));

    if (!tracks.length) {
      window.NotificationSystem?.warning('Нет доступных треков');
      return;
    }

    if (window.playerCore) {
      // Всегда ставим плейлист "активных" (иначе next/prev будут попадать на неактивные)
      window.playerCore.setPlaylist(tracks, startIndex, {
        artist: 'Витрина Разбита',
        album: 'Избранное',
        cover: 'img/logo.png'
      });

      window.playerCore.play(startIndex);

      this.setPlayingAlbum(window.SPECIAL_FAVORITES_KEY || '__favorites__');

      // Подсветка в UI: подсветим исходную строку (в model), а не индекс плейлиста.
      // Визуально пользователю важна строка, по которой он нажал.
      this.highlightCurrentTrack(index);
      window.PlayerUI?.ensurePlayerBlock(index);

      // ✅ ВАЖНО: обновим доступные индексы — теперь плейлист уже активный, можно оставить null.
      if (window.PlayerUI && typeof window.PlayerUI.updateAvailableTracksForPlayback === 'function') {
        window.PlayerUI.updateAvailableTracksForPlayback();
      }
    }
  }

  async loadNewsAlbum() {
    this.renderAlbumTitle('📰 НОВОСТИ 📰', 'news');
    
    // ✅ Показываем галерею для __reliz__
    await this.loadGallery('__reliz__');
    
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

    const coverUrl = albumData.cover 
      ? `${albumInfo.base}${albumData.cover}` 
      : `${albumInfo.base}cover.jpg`;
    
    coverSlot.innerHTML = `<img src="${coverUrl}" alt="${albumInfo.title}" draggable="false" loading="lazy">`;
  }

  renderSocials(links) {
    const container = document.getElementById('social-links');
    if (!container) return;

    container.innerHTML = '';
    
    const normalized = Array.isArray(links) 
      ? links.map(link => ({
          label: link.label || link.title || 'Ссылка',
          url: link.url
        }))
      : [];

    if (normalized.length === 0) return;

    normalized.forEach(link => {
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

    // ✅ Индекс воспроизведения внутри playlist (после фильтрации по file).
    // Это защищает от рассинхрона, если в альбоме появятся треки без audio/file.
    const albumDataForIndex = this.albumsData.get(albumKey);
    if (albumDataForIndex && Array.isArray(albumDataForIndex.tracks)) {
      const playable = albumDataForIndex.tracks.filter(t => !!t && !!t.file);
      const idxInPlayable = playable.findIndex(t => t && t.uid && track.uid && String(t.uid) === String(track.uid));
      if (idxInPlayable >= 0) {
        trackEl.dataset.playIndex = String(idxInPlayable);
      } else {
        // fallback: если uid нет/не найден — используем UI index (лучше чем ничего)
        trackEl.dataset.playIndex = String(index);
      }
    } else {
      trackEl.dataset.playIndex = String(index);
    }

    const isFavorite = window.FavoritesManager
      ? window.FavoritesManager.isFavorite(albumKey, track.uid)
      : false;

    trackEl.innerHTML = `
      <div class="tnum">${track.num || index + 1}</div>
      <div class="track-title">${track.title}</div>
      <img src="${isFavorite ? 'img/star.png' : 'img/star2.png'}" 
           class="like-star" 
           alt="звезда"
           data-album="${albumKey}" 
           data-uid="${track.uid || ''}">
    `;

    trackEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('like-star')) return;

      const albumData = this.albumsData.get(albumKey);
      if (!albumData || !window.playerCore) {
        this.highlightCurrentTrack(index);
        window.NotificationSystem?.error('Альбом ещё не готов к воспроизведению');
        return;
      }

      const snapshot = window.playerCore.getPlaylistSnapshot?.() || [];
      const needsNewPlaylist =
        snapshot.length !== albumData.tracks.length ||
        snapshot.some((t, i) => {
          const ad = albumData.tracks[i];
          return !ad || !ad.file || t.src !== ad.file;
        });

      const playIndex = (() => {
        const raw = trackEl.dataset.playIndex;
        const n = Number.parseInt(String(raw || ''), 10);
        return Number.isFinite(n) && n >= 0 ? n : index;
      })();

      if (needsNewPlaylist) {
        const albumInfo = window.albumsIndex?.find(a => a.key === albumKey);
        const base = albumInfo?.base || '';

        const tracksForCore = albumData.tracks
          .filter(t => !!t.file)
          .map((t) => ({
            src: t.file,
            title: t.title,
            artist: albumData.artist || 'Витрина Разбита',
            album: albumKey,
            cover: albumData.cover
              ? new URL(albumData.cover, base).toString()
              : (albumInfo ? new URL('cover.jpg', albumInfo.base).toString() : 'img/logo.png'),
            lyrics: t.lyrics || null,
            fulltext: t.fulltext || null,
            uid: (typeof t.uid === 'string' && t.uid.trim()) ? t.uid.trim() : null
          }));

        if (tracksForCore.length > 0) {
          window.playerCore.setPlaylist(tracksForCore, playIndex, {
            artist: albumData.artist || 'Витрина Разбита',
            album: albumData.title || albumInfo?.title || '',
            cover: albumData.cover
              ? new URL(albumData.cover, base).toString()
              : (albumInfo ? new URL('cover.jpg', albumInfo.base).toString() : 'img/logo.png')
          });
        }
      }

      this.highlightCurrentTrack(index);

      window.playerCore.play(playIndex);
      this.setPlayingAlbum(albumKey);

      // ensurePlayerBlock должен получать индекс текущей строки UI (чтобы вставить блок под неё)
      window.PlayerUI?.ensurePlayerBlock(index);
    });

    const star = trackEl.querySelector('.like-star');
    star?.addEventListener('click', (e) => {
      e.stopPropagation();

      const trackUid = String(star.dataset.uid || '').trim();
      if (!trackUid) {
        window.NotificationSystem?.warning('UID трека не найден в config.json');
        return;
      }

      let isLiked = false;

      if (window.FavoritesManager) {
        isLiked = !!window.FavoritesManager.isFavorite(albumKey, trackUid);
        window.FavoritesManager.toggleLike(albumKey, trackUid, !isLiked);
      }

      const nowLiked = !isLiked;
      star.src = nowLiked ? 'img/star.png' : 'img/star2.png';
      trackEl.classList.toggle('is-favorite', nowLiked);

      // ✅ Oldstar правило:
      // refs НЕ удаляем автоматически (удаление из «ИЗБРАННОЕ» только через модалку).
      // Снятие ⭐ лишь деактивирует строку в «ИЗБРАННОЕ» (через favorites:changed / buildFavoritesRefsModel).
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
    const socials = document.getElementById('social-links');

    if (trackList) trackList.innerHTML = '';
    if (socials) socials.innerHTML = '';
    
    if (window.GalleryManager) {
      window.GalleryManager.clear();
    }
  }

  getCurrentAlbum() {
    return this.currentAlbum;
  }

  getPlayingAlbum() {
    return this.playingAlbum;
  }

  setPlayingAlbum(albumKey) {
    this.playingAlbum = albumKey || null;
  }

  getAlbumData(albumKey) {
    return this.albumsData.get(albumKey);
  }

  getAlbumConfigByKey(albumKey) {
    return this.albumsData.get(albumKey);
  }
  getTrackUid(albumKey, trackUid) {
    // ✅ Back-compat: теперь uid приходит из config.json (строка).
    // albumKey оставляем в сигнатуре для старых вызовов, но сам uid не генерируем.
    const uid = String(trackUid || '').trim();
    return uid || null;
  }
}

window.AlbumsManager = new AlbumsManager();

export default AlbumsManager;
