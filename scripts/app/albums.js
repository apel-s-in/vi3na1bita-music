// scripts/app/albums.js — Управление альбомами (оптимизировано)

const APP_CONFIG = window.APP_CONFIG;

class AlbumsManager {
  constructor() {
    this.currentAlbum = null;
    this.playingAlbum = null;
    this.albumsData = new Map();
    this.albumCoverUrlCache = new Map();
    this.isLoading = false;
    this.isGalleryVisible = true;
  }

  async initialize() {
    await this._waitForAlbumsIndex();
    if (!window.albumsIndex?.length) {
      console.error('❌ No albums found');
      return;
    }
    console.log(`✅ Albums available: ${window.albumsIndex.length}`);
    this.renderAlbumIcons();
    
    const lastAlbum = localStorage.getItem('currentAlbum');
    const ordered = (APP_CONFIG?.ICON_ALBUMS_ORDER || []).map(x => x.key).filter(Boolean);
    const albumToLoad = lastAlbum || ordered.find(k => !k.startsWith('__') && window.albumsIndex.some(a => a.key === k)) || window.albumsIndex[0]?.key;
    
    if (albumToLoad) await this.loadAlbum(albumToLoad);
  }

  async _waitForAlbumsIndex(maxWait = 2000) {
    const step = 50;
    let waited = 0;
    while ((!window.albumsIndex?.length) && waited < maxWait) {
      await new Promise(r => setTimeout(r, step));
      waited += step;
    }
  }

  renderAlbumIcons() {
    const container = document.getElementById('album-icons');
    if (!container) return;
    container.innerHTML = '';

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    APP_CONFIG.ICON_ALBUMS_ORDER.forEach(({ key, title, icon }) => {
      if (!key.startsWith('__') && !window.albumsIndex.some(a => a.key === key)) return;

      const el = document.createElement('div');
      el.className = 'album-icon';
      el.dataset.album = key;
      el.dataset.akey = key;
      el.title = title;

      const base = icon || 'img/logo.png';
      const p1x = isMobile ? base.replace(/icon_album\/(.+)\.png$/i, 'icon_album/mobile/$1@1x.jpg') : base.replace(/\.png$/i, '@1x.png');
      const p2x = isMobile ? p1x.replace(/@1x\.jpg$/i, '@2x.jpg') : p1x.replace(/@1x\.png$/i, '@2x.png');

      el.innerHTML = `<img src="${p1x}" srcset="${p2x} 2x" alt="${title}" draggable="false" loading="lazy" width="60" height="60">`;
      el.addEventListener('click', () => this._onIconClick(key));
      container.appendChild(el);
    });
  }

  async _onIconClick(key) {
    if (this.currentAlbum === key && !key.startsWith('__')) {
      this._toggleGallery();
      return;
    }
    await this.loadAlbum(key);
  }

  _toggleGallery() {
    this.isGalleryVisible = !this.isGalleryVisible;
    const wrap = document.getElementById('cover-wrap');
    if (wrap) wrap.style.display = this.isGalleryVisible ? '' : 'none';
    window.NotificationSystem?.info(this.isGalleryVisible ? '🖼️ Галерея показана' : '🚫 Галерея скрыта');
  }

  async loadAlbum(key) {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      this.isGalleryVisible = true;
      this._clearUI();
      this._updateFilterBtn(key);

      if (key === '__favorites__') await this._loadFavorites();
      else if (key === '__reliz__') await this._loadNews();
      else await this._loadRegular(key);

      this.currentAlbum = key;
      this._updateActiveIcon(key);
      localStorage.setItem('currentAlbum', key);
      this._resetFilter();

      window.PlayerUI?.switchAlbumInstantly?.(key);
      window.PlayerState?.save?.();
      console.log(`✅ Album loaded: ${key}`);
    } catch (e) {
      console.error('❌ Failed to load album:', e);
      window.NotificationSystem?.error('Ошибка загрузки альбома');
    } finally {
      this.isLoading = false;
    }
  }

  _updateFilterBtn(key) {
    const btn = document.getElementById('filter-favorites-btn');
    if (btn) btn.style.display = (key === '__favorites__' || key === '__reliz__') ? 'none' : '';
  }

  _resetFilter() {
    const btn = document.getElementById('filter-favorites-btn');
    const list = document.getElementById('track-list');
    if (btn) { btn.textContent = 'Скрыть не отмеченные ⭐ песни'; btn.classList.remove('filtered'); }
    if (list) list.classList.remove('filtered');
  }

  async _loadRegular(key) {
    const info = window.albumsIndex.find(a => a.key === key);
    if (!info) throw new Error(`Album ${key} not found`);

    let data = this.albumsData.get(key);
    if (!data) {
      const base = info.base.endsWith('/') ? info.base : `${info.base}/`;
      const res = await fetch(`${base}config.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const raw = await res.json();
      const tracks = (raw.tracks || []).map((t, i) => ({
        num: i + 1,
        title: t.title || `Трек ${i + 1}`,
        file: t.audio ? new URL(t.audio, base).toString() : null,
        lyrics: t.lyrics ? new URL(t.lyrics, base).toString() : (t.lrc ? new URL(t.lrc, base).toString() : null),
        fulltext: t.fulltext ? new URL(t.fulltext, base).toString() : null,
        uid: t.uid?.trim() || null,
        size: t.size ?? null,
        hasLyrics: typeof t.hasLyrics === 'boolean' ? t.hasLyrics : !!(t.lyrics || t.lrc)
      }));

      data = {
        title: raw.albumName || info.title,
        artist: raw.artist || 'Витрина Разбита',
        cover: raw.cover || 'cover.jpg',
        social_links: raw.social_links || raw.socials?.map(s => ({ label: s.title, url: s.url })) || [],
        tracks
      };
      this.albumsData.set(key, data);
    }

    await this._loadGallery(key);
    try {
      const cover = await window.GalleryManager?.getFirstCoverUrl?.(key);
      this.albumCoverUrlCache.set(key, cover || 'img/logo.png');
    } catch { this.albumCoverUrlCache.set(key, 'img/logo.png'); }

    this._renderTitle(data.title || info.title);
    this._renderSocials(data.social_links);
    this._renderTracks(data.tracks, info);

    window.PlayerUI?.updateMiniHeader?.();
    window.PlayerUI?.updateNextUpLabel?.();

    const wrap = document.getElementById('cover-wrap');
    if (wrap) wrap.style.display = '';
  }

  async _loadGallery(key) {
    await window.GalleryManager?.loadGallery?.(key);
  }

  async _loadFavorites() {
    this._renderTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');
    document.getElementById('cover-wrap')?.style && (document.getElementById('cover-wrap').style.display = 'none');

    await window.buildFavoritesRefsModel?.();
    const model = window.favoritesRefsModel || [];
    const container = document.getElementById('track-list');
    if (!container) return;

    if (!model.length) {
      container.innerHTML = `<div style="padding:20px;text-align:center;color:#8ab8fd"><h3>Избранные треки</h3><p>Отметьте треки звёздочкой ⭐</p></div>`;
      return;
    }

    container.innerHTML = '';
    model.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = 'track' + (item.__active ? '' : ' inactive');
      el.id = `fav_${item.__a}_${item.__uid}`;
      el.dataset.index = i;
      el.dataset.album = item.__a;
      el.dataset.uid = item.__uid;

      el.innerHTML = `
        <div class="tnum">${String(i + 1).padStart(2, '0')}.</div>
        <div class="track-title" title="${item.title} - ${item.__album}">
          <span class="fav-track-name">${item.title}</span>
          <span class="fav-album-name"> — ${item.__album}</span>
        </div>
        <img src="${item.__active ? 'img/star.png' : 'img/star2.png'}" class="like-star" alt="★" data-album="${item.__a}" data-uid="${item.__uid}">
      `;

      el.addEventListener('click', async (e) => {
        if (e.target.classList.contains('like-star')) return;
        if (item.__active && item.audio) {
          await this.ensureFavoritesPlayback(i);
        } else {
          window.FavoritesData?.showFavoritesInactiveModal?.({
            albumKey: item.__a, uid: item.__uid, title: item.title,
            onDeleted: () => window.PlayerUI?.updateAvailableTracksForPlayback?.()
          });
        }
      });

      el.querySelector('.like-star')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasActive = item.__active;
        window.FavoritesManager?.toggleLike?.(item.__a, item.__uid, !wasActive);
        if (!wasActive) window.FavoritesData?.ensureFavoritesRefsWithLikes?.();

        item.__active = !wasActive;
        if (!item.__active) { item.audio = null; item.lyrics = null; }
        el.classList.toggle('inactive', !item.__active);
        el.querySelector('.like-star').src = item.__active ? 'img/star.png' : 'img/star2.png';

        window.PlayerUI?.updateAvailableTracksForPlayback?.();
        if (window.playerCore && this.playingAlbum === '__favorites__' && window.playerCore.getIndex() === i && wasActive && !item.__active) {
          window.playerCore.next();
        }
      });

      container.appendChild(el);
    });
  }

  async ensureFavoritesPlayback(index) {
    const model = window.favoritesRefsModel || [];
    const active = model.filter(it => it?.__active && it.audio);
    if (!active.length) { window.NotificationSystem?.warning('Нет доступных треков'); return; }

    const clicked = model[index];
    let start = 0;
    if (clicked?.__active && clicked.audio) {
      const idx = active.findIndex(it => it.__uid === clicked.__uid && it.__a === clicked.__a);
      start = idx >= 0 ? idx : 0;
    }

    const tracks = active.map(it => ({
      src: it.audio, title: it.title, artist: it.__artist || 'Витрина Разбита',
      album: '__favorites__', cover: it.__cover || 'img/logo.png',
      lyrics: it.lyrics, fulltext: it.fulltext, uid: it.__uid, sourceAlbum: it.__a
    }));

    window.playerCore?.setPlaylist(tracks, start, { artist: 'Витрина Разбита', album: 'Избранное', cover: 'img/logo.png' });
    window.playerCore?.play(start);
    this.playingAlbum = '__favorites__';
    this.highlightCurrentTrack(index);
    window.PlayerUI?.ensurePlayerBlock?.(index);
    window.PlayerUI?.updateAvailableTracksForPlayback?.();
  }

  async _loadNews() {
    this._renderTitle('📰 НОВОСТИ 📰', 'news');
    await this._loadGallery('__reliz__');
    document.getElementById('cover-wrap')?.style && (document.getElementById('cover-wrap').style.display = '');

    const container = document.getElementById('track-list');
    if (!container) return;

    container.innerHTML = `
      <div style="padding:14px 10px;text-align:center;color:#8ab8fd">
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:12px">
          <a href="https://t.me/vitrina_razbita" target="_blank" style="color:#4daaff;text-decoration:underline">Telegram</a>
          <span style="opacity:.6">·</span>
          <a href="./news.html" target="_blank" style="color:#4daaff;text-decoration:underline">Страница новостей</a>
        </div>
        <div id="news-inline-status" style="opacity:.85">Загрузка...</div>
      </div>
      <div id="news-inline-list" style="display:grid;gap:12px;padding:0 0 10px"></div>
    `;

    try {
      const r = await fetch('./news/news.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const items = (await r.json())?.items || [];

      const status = document.getElementById('news-inline-status');
      const list = document.getElementById('news-inline-list');
      if (!list) return;

      if (!items.length) { if (status) status.textContent = 'Пока новостей нет'; return; }
      if (status) status.style.display = 'none';

      const esc = s => String(s || '').replace(/[<>&'"]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&#39;','"':'&quot;'}[m]));
      list.innerHTML = items.map(it => {
        let media = '';
        if (it.embedUrl) media = `<div style="margin:10px 0"><iframe loading="lazy" style="width:100%;border:0;border-radius:10px;min-height:220px;background:#0b0e15" src="${esc(it.embedUrl)}" allowfullscreen></iframe></div>`;
        else if (it.image) media = `<div style="margin:10px 0"><img loading="lazy" style="width:100%;border:0;border-radius:10px" src="${esc(it.image)}" alt=""></div>`;
        else if (it.video) media = `<div style="margin:10px 0"><video controls preload="metadata" style="width:100%;border:0;border-radius:10px;min-height:220px" src="${esc(it.video)}"></video></div>`;

        const tags = (it.tags || []).map(t => `<span style="font-size:12px;color:#4daaff;background:rgba(77,170,255,.12);border:1px solid rgba(77,170,255,.25);padding:4px 8px;border-radius:999px">#${esc(t)}</span>`).join('');

        return `<article style="background:#131a26;border:1px solid #23324a;border-radius:12px;padding:12px;box-shadow:0 4px 16px rgba(0,0,0,.25)">
          <div style="font-weight:900;font-size:16px;color:#eaf2ff">${esc(it.title || 'Новость')}</div>
          ${it.date ? `<div style="color:#9db7dd;font-size:13px;margin-top:6px">${esc(it.date)}</div>` : ''}
          ${media}
          ${it.text ? `<div style="margin-top:8px;line-height:1.45;color:#eaf2ff">${esc(it.text)}</div>` : ''}
          ${tags ? `<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center">${tags}</div>` : ''}
        </article>`;
      }).join('');
    } catch {
      const status = document.getElementById('news-inline-status');
      if (status) { status.textContent = 'Не удалось загрузить новости'; status.style.color = '#ff6b6b'; }
    }
  }

  _renderTitle(title, mod = '') {
    const el = document.getElementById('active-album-title');
    if (el) { el.textContent = title; el.className = 'active-album-title' + (mod ? ` ${mod}` : ''); }
  }

  _renderSocials(links) {
    const container = document.getElementById('social-links');
    if (!container) return;
    container.innerHTML = '';
    (links || []).forEach(l => {
      const a = document.createElement('a');
      a.href = l.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = l.label || l.title || 'Ссылка';
      container.appendChild(a);
    });
  }

  _renderTracks(tracks, info) {
    const container = document.getElementById('track-list');
    if (!container) return;
    container.innerHTML = '';
    tracks.forEach((t, i) => container.appendChild(this._createTrackEl(t, info.key, i)));
  }

  _createTrackEl(track, albumKey, index) {
    const el = document.createElement('div');
    el.className = 'track';
    el.id = `trk${index}`;
    el.dataset.index = index;
    el.dataset.album = albumKey;

    const data = this.albumsData.get(albumKey);
    const playable = data?.tracks?.filter(t => t?.file) || [];
    const playIdx = playable.findIndex(t => t.uid && track.uid && t.uid === track.uid);
    el.dataset.playIndex = playIdx >= 0 ? playIdx : index;

    const isFav = window.FavoritesManager?.isFavorite?.(albumKey, track.uid);

    el.innerHTML = `
      <div class="tnum">${String(track.num || index + 1).padStart(2, '0')}.</div>
      <div class="track-title">${track.title}</div>
      <img src="${isFav ? 'img/star.png' : 'img/star2.png'}" class="like-star" alt="★" data-album="${albumKey}" data-uid="${track.uid || ''}">
    `;

    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('like-star')) return;
      const d = this.albumsData.get(albumKey);
      if (!d || !window.playerCore) { window.NotificationSystem?.error('Альбом не готов'); return; }

      const snap = window.playerCore.getPlaylistSnapshot?.() || [];
      const needNew = snap.length !== d.tracks.length || snap.some((t, i) => t.src !== d.tracks[i]?.file);
      const pIdx = Number(el.dataset.playIndex) || index;

      if (needNew) {
        const cover = this.albumCoverUrlCache.get(albumKey) || 'img/logo.png';
        const list = d.tracks.filter(t => t.file).map(t => ({
          src: t.file, title: t.title, artist: d.artist || 'Витрина Разбита',
          album: albumKey, cover, lyrics: t.lyrics, fulltext: t.fulltext, uid: t.uid, hasLyrics: t.hasLyrics
        }));
        if (list.length) window.playerCore.setPlaylist(list, pIdx, { artist: d.artist, album: d.title, cover });
      }

      this.highlightCurrentTrack(index);
      window.playerCore.play(pIdx);
      this.playingAlbum = albumKey;
      window.PlayerUI?.ensurePlayerBlock?.(index);
    });

    el.querySelector('.like-star')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const uid = track.uid?.trim();
      if (!uid) { window.NotificationSystem?.warning('UID не найден'); return; }

      const liked = window.FavoritesManager?.isFavorite?.(albumKey, uid);
      window.FavoritesManager?.toggleLike?.(albumKey, uid, !liked);
      e.target.src = !liked ? 'img/star.png' : 'img/star2.png';
      el.classList.toggle('is-favorite', !liked);
    });

    return el;
  }

  highlightCurrentTrack(index) {
    document.querySelectorAll('.track.current').forEach(el => el.classList.remove('current'));
    if (typeof index === 'number' && index >= 0) {
      document.querySelector(`.track[data-index="${index}"]`)?.classList.add('current');
    }
  }

  _updateActiveIcon(key) {
    document.querySelectorAll('.album-icon').forEach(el => el.classList.toggle('active', el.dataset.album === key));
  }

  _clearUI() {
    const list = document.getElementById('track-list');
    const socials = document.getElementById('social-links');
    if (list) list.innerHTML = '';
    if (socials) socials.innerHTML = '';
    window.GalleryManager?.clear?.();
  }

  getCurrentAlbum() { return this.currentAlbum; }
  getPlayingAlbum() { return this.playingAlbum; }
  setPlayingAlbum(key) { this.playingAlbum = key || null; }
  getAlbumData(key) { return this.albumsData.get(key); }
  getAlbumConfigByKey(key) { return this.albumsData.get(key); }
  getTrackUid(_, uid) { return uid?.trim() || null; }
}

window.AlbumsManager = new AlbumsManager();
export default AlbumsManager;
