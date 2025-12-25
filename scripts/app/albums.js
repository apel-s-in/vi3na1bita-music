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

    // ✅ Кэш URL обложки альбома (первая картинка из центральной галереи)
    this.albumCoverUrlCache = new Map();
    
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

    // ✅ Если альбом не сохранён (первый запуск/очистка) — берём первый "обычный" альбом
    // из ICON_ALBUMS_ORDER, чтобы порядок был стабильный и управляемый.
    let albumToLoad = lastAlbum;

    if (!albumToLoad) {
      const ordered = (APP_CONFIG?.ICON_ALBUMS_ORDER || []).map(x => x.key).filter(Boolean);
      const firstRegular = ordered.find(k => k && !String(k).startsWith('__') && window.albumsIndex.some(a => a.key === k));
      albumToLoad = firstRegular || (window.albumsIndex[0]?.key || null);
    }

    if (albumToLoad) {
      await this.loadAlbum(albumToLoad);
    }
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
        
        // ✅ Автоопределение URL лирики: поддержка .lrc и .json
        let lyrics = null;
        if (t.lyrics) {
          lyrics = new URL(t.lyrics, base).toString();
        } else if (t.lrc) {
          // ✅ Поддержка поля lrc напрямую
          lyrics = new URL(t.lrc, base).toString();
        }
        
        const fulltext = t.fulltext ? new URL(t.fulltext, base).toString() : null;

        const uid = (typeof t.uid === 'string' && t.uid.trim()) ? t.uid.trim() : null;

        // num оставляем только для UI-отображения
        const num = idx + 1;

        const sizeMB = typeof t.size === 'number' ? t.size : null;

        // ✅ Флаг hasLyrics для оптимизации (без HEAD-запросов)
        // Если явно указан — используем, иначе определяем по наличию URL
        let hasLyrics = null;
        if (typeof t.hasLyrics === 'boolean') {
          hasLyrics = t.hasLyrics;
        } else {
          hasLyrics = !!(lyrics || t.lyrics || t.lrc);
        }

        return {
          num,
          title: t.title || `Трек ${idx + 1}`,
          file,
          lyrics,
          fulltext,
          uid,
          size: sizeMB,
          hasLyrics // ✅ Новое поле
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

    // ✅ Обложка для PlayerCore/MediaSession: первая картинка центральной галереи (или logo)
    try {
      const coverUrl = await window.GalleryManager?.getFirstCoverUrl?.(albumKey);
      this.albumCoverUrlCache.set(albumKey, coverUrl || 'img/logo.png');
    } catch {
      this.albumCoverUrlCache.set(albumKey, 'img/logo.png');
    }

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

    if (window.buildFavoritesRefsModel) {
      await window.buildFavoritesRefsModel();
    }

    const model = Array.isArray(window.favoritesRefsModel) ? window.favoritesRefsModel : [];
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

    // ✅ Делегирование событий: один обработчик на весь список.
    // И один обработчик favorites:changed для точечного обновления строки.
    if (!this.__favoritesDelegationBound) {
      this.__favoritesDelegationBound = true;

      container.addEventListener('click', async (e) => {
        // Обрабатываем только когда открыт экран «ИЗБРАННОЕ»
        if (this.currentAlbum !== window.SPECIAL_FAVORITES_KEY) return;

        const target = e.target;
        const row = target?.closest?.('.track');
        if (!row || !container.contains(row)) return;

        const idx = Number.parseInt(String(row.dataset.index || ''), 10);
        if (!Number.isFinite(idx) || idx < 0) return;

        const m = Array.isArray(window.favoritesRefsModel) ? window.favoritesRefsModel : [];
        const item = m[idx];
        if (!item) return;

        // Клик по звезде
        if (target && target.classList && target.classList.contains('like-star')) {
          e.preventDefault();
          e.stopPropagation();

          const uid = String(item.__uid || '').trim();
          const albumKey = String(item.__a || '').trim();
          if (!uid || !albumKey) return;

          if (window.FavoritesManager && typeof window.FavoritesManager.toggleLike === 'function') {
            window.FavoritesManager.toggleLike(
              albumKey,
              uid,
              !item.__active,
              { source: 'favorites' }
            );
          }
          return;
        }

        // Клик по строке
        if (item.__active && item.audio) {
          await this.ensureFavoritesPlayback(idx);
          return;
        }

        // Неактивная строка: модалка "вернуть/удалить"
        if (window.FavoritesData && typeof window.FavoritesData.showFavoritesInactiveModal === 'function') {
          window.FavoritesData.showFavoritesInactiveModal({
            albumKey: item.__a,
            uid: item.__uid,
            title: item.title || 'Трек',
            onDeleted: async () => {
              // ✅ Теперь строка удаляется realtime через favorites:refsChanged (без полного reload списка).
              window.PlayerUI?.updateAvailableTracksForPlayback?.();
            }
          });
          return;
        }

        window.NotificationSystem?.warning('Трек недоступен.');
      });

      // ✅ Realtime точечное обновление DOM строки (и только когда открыт «ИЗБРАННОЕ»)
      window.addEventListener('favorites:changed', (ev) => {
        if (this.currentAlbum !== window.SPECIAL_FAVORITES_KEY) return;

        const d = ev?.detail || {};
        const albumKey = String(d.albumKey || '').trim();
        const uid = String(d.uid || '').trim();
        const liked = !!d.liked;

        if (!albumKey || !uid) return;

        const id = `fav_${albumKey}_${uid}`;
        const row = document.getElementById(id);
        if (!row) return;

        // Обновим модель (если доступно) — чтобы item.__active соответствовал UI
        try {
          window.FavoritesData?.updateFavoritesRefsModelActiveFlag?.(albumKey, uid, liked);
        } catch {}

        // UI: active/inactive
        row.classList.toggle('inactive', !liked);

        // UI: картинка звезды
        const star = row.querySelector('.like-star');
        if (star) {
          star.src = liked ? 'img/star.png' : 'img/star2.png';
        }

        // Плеер/очередь не трогаем (базовое правило соблюдаем)
      });

      // ✅ Realtime: refsChanged — точечное удаление строки без полной перезагрузки списка
      window.addEventListener('favorites:refsChanged', (ev) => {
        if (this.currentAlbum !== window.SPECIAL_FAVORITES_KEY) return;

        const d = ev?.detail || {};
        const albumKey = String(d.albumKey || '').trim();
        const uid = String(d.uid || '').trim();
        const action = String(d.action || '').trim();

        if (!albumKey || !uid) return;

        if (action === 'refRemoved') {
          const id = `fav_${albumKey}_${uid}`;
          const row = document.getElementById(id);
          if (row) row.remove();

          // Если список стал пустым — покажем empty state (без полного loadFavoritesAlbum)
          try {
            const left = container.querySelectorAll('.track').length;
            if (left === 0) {
              container.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #8ab8fd;">
                  <h3>Избранные треки</h3>
                  <p>Отметьте треки звёздочкой ⭐</p>
                </div>
              `;
            }
          } catch {}
        }
      });
    }

    // ✅ Рендер списка одной строкой (быстрее и короче)
    const esc = (s) => (window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || ''));
    container.innerHTML = model.map((item, index) => {
      const displayNum = String(index + 1).padStart(2, '0');
      const isActive = !!item.__active;
      const albumTitle = item.__album || 'Альбом';
      const trackTitle = item.title || 'Трек';
      const a = String(item.__a || '');
      const u = String(item.__uid || '');
      return `
        <div class="track${isActive ? '' : ' inactive'}"
             id="fav_${esc(a)}_${esc(u)}"
             data-index="${index}"
             data-album="${esc(a)}"
             data-uid="${esc(u)}">
          <div class="tnum">${displayNum}.</div>
          <div class="track-title" title="${esc(trackTitle)} - ${esc(albumTitle)}">
            <span class="fav-track-name">${esc(trackTitle)}</span>
            <span class="fav-album-name"> — ${esc(albumTitle)}</span>
          </div>
          <img src="${isActive ? 'img/star.png' : 'img/star2.png'}"
               class="like-star"
               alt="звезда"
               data-album="${esc(a)}"
               data-uid="${esc(u)}">
        </div>
      `;
    }).join('');
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
      window.PlayerUI?.ensurePlayerBlock(index, { userInitiated: true });

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

    const coverWrap = document.getElementById('cover-wrap');
    if (coverWrap) coverWrap.style.display = '';

    const container = document.getElementById('track-list');
    if (!container) return;

    container.innerHTML = `
      <div style="padding: 14px 10px; text-align: center; color: #8ab8fd;">
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-bottom: 12px;">
          <a href="https://t.me/vitrina_razbita" target="_blank"
             style="color: #4daaff; text-decoration: underline;">
            Telegram канал
          </a>
          <span style="opacity:.6;">·</span>
          <a href="./news.html" target="_blank"
             style="color: #4daaff; text-decoration: underline;">
            Страница новостей
          </a>
        </div>
        <div id="news-inline-status" style="opacity:.85;">Загрузка...</div>
      </div>
      <div id="news-inline-list" style="display:grid; gap:12px; padding: 0 0 10px 0;"></div>
    `;

    try {
      const r = await fetch('./news/news.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const items = Array.isArray(j?.items) ? j.items : [];

      const status = document.getElementById('news-inline-status');
      const list = document.getElementById('news-inline-list');

      if (!list) return;

      if (!items.length) {
        if (status) status.textContent = 'Пока новостей нет';
        return;
      }

      if (status) status.style.display = 'none';

      const esc = (s) => String(s || '').replace(/[<>&'"]/g, m => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;'
      }[m]));

      const renderCard = (it) => {
        const title = esc(it.title || 'Новость');
        const date = esc(it.date || '');
        const text = esc(it.text || '');
        const tags = Array.isArray(it.tags) ? it.tags : [];

        let media = '';
        if (it.embedUrl) {
          media = `<div style="margin: 10px 0;">
            <iframe loading="lazy"
              style="width:100%; border:0; border-radius:10px; min-height:220px; background:#0b0e15;"
              src="${esc(it.embedUrl)}"
              allowfullscreen></iframe>
          </div>`;
        } else if (it.image) {
          media = `<div style="margin: 10px 0;">
            <img loading="lazy"
              style="width:100%; border:0; border-radius:10px; background:#0b0e15;"
              src="${esc(it.image)}" alt="">
          </div>`;
        } else if (it.video) {
          media = `<div style="margin: 10px 0;">
            <video controls preload="metadata"
              style="width:100%; border:0; border-radius:10px; min-height:220px; background:#0b0e15;"
              src="${esc(it.video)}"></video>
          </div>`;
        }

        const tagHtml = tags.length
          ? `<div style="margin-top: 8px; display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
              ${tags.map(t => `<span style="font-size:12px; color:#4daaff; background: rgba(77,170,255,.12); border: 1px solid rgba(77,170,255,.25); padding:4px 8px; border-radius:999px;">#${esc(t)}</span>`).join('')}
            </div>`
          : '';

        return `<article style="
          background: #131a26;
          border: 1px solid #23324a;
          border-radius: 12px;
          padding: 12px;
          box-shadow: 0 4px 16px rgba(0,0,0,.25);
        ">
          <div style="font-weight: 900; font-size: 16px; color:#eaf2ff;">${title}</div>
          ${date ? `<div style="color:#9db7dd; font-size: 13px; margin-top: 6px;">${date}</div>` : ''}
          ${media}
          ${text ? `<div style="margin-top: 8px; line-height: 1.45; color:#eaf2ff;">${text}</div>` : ''}
          ${tagHtml}
        </article>`;
      };

      list.innerHTML = items.map(renderCard).join('');
    } catch (e) {
      const status = document.getElementById('news-inline-status');
      if (status) {
        status.textContent = 'Не удалось загрузить новости';
        status.style.color = '#ff6b6b';
      }
    }
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

    const numText = `${String(track.num || (index + 1)).padStart(2, '0')}.`;

    trackEl.innerHTML = `
      <div class="tnum">${numText}</div>
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
        const coverUrl = this.albumCoverUrlCache.get(albumKey) || 'img/logo.png';

        const tracksForCore = albumData.tracks
          .filter(t => !!t.file)
          .map((t) => ({
            src: t.file,
            title: t.title,
            artist: albumData.artist || 'Витрина Разбита',
            album: albumKey,
            cover: coverUrl,
            lyrics: t.lyrics || null,
            fulltext: t.fulltext || null,
            uid: (typeof t.uid === 'string' && t.uid.trim()) ? t.uid.trim() : null,
            hasLyrics: t.hasLyrics // ✅ Передаём флаг в PlayerCore
          }));

        if (tracksForCore.length > 0) {
          window.playerCore.setPlaylist(tracksForCore, playIndex, {
            artist: albumData.artist || 'Витрина Разбита',
            album: albumData.title || albumInfo?.title || '',
            cover: coverUrl,
          });
        }
      }

      this.highlightCurrentTrack(index);

      window.playerCore.play(playIndex);
      this.setPlayingAlbum(albumKey);

      // ensurePlayerBlock должен получать индекс текущей строки UI (чтобы вставить блок под неё)
      window.PlayerUI?.ensurePlayerBlock(index, { userInitiated: true });
    });

    const star = trackEl.querySelector('.like-star');
      star?.addEventListener('click', (e) => {
           e.stopPropagation();
           const trackUid = String(star.dataset.uid || '').trim();
           if (!trackUid) {
               window.NotificationSystem?.warning('UID трека не найден в config.json');
               return;
          }
          // Делегирование в FavoritesManager
           if (window.FavoritesManager && typeof window.FavoritesManager.toggleLike === 'function') {
               // Это вызовет событие favorites:changed, которое обновит UI
               window.FavoritesManager.toggleLike(
                 albumKey,
                 trackUid,
                 !window.FavoritesManager.isFavorite(albumKey, trackUid),
                 { source: 'album' }
               );
           }
           // Логика обновления UI будет в обработчике события favorites:changed
      });

    return trackEl;
  }

  highlightCurrentTrack(index) {
    document.querySelectorAll('.track.current').forEach(el => el.classList.remove('current'));
    
    // ✅ Защита от некорректного индекса
    if (typeof index !== 'number' || index < 0 || !Number.isFinite(index)) {
      return;
    }
    
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
