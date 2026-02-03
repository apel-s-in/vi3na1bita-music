// scripts/app/albums.js
import { registerTrack } from './track-registry.js';
import { $, toStr, escHtml, isMobileUA } from './utils/app-utils.js';
import { renderFavoritesList, renderFavoritesEmpty, bindFavoritesList } from '../ui/favorites-view.js';
import { loadAndRenderNewsInline } from '../ui/news-inline.js';

const C = window.APP_CONFIG || {};
const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__';
const STAR_ON = 'img/star.png';
const STAR_OFF = 'img/star2.png';
const LOGO = 'img/logo.png';

// --- Helpers ---
const setStar = (img, liked) => { if(img) img.src = liked ? STAR_ON : STAR_OFF; };
const toUrl = (b, r) => r ? new URL(r, b).toString() : null;
const getUid = (el) => toStr(el?.dataset?.uid).trim();
const getAlb = (el) => toStr(el?.dataset?.album).trim();

class AlbumsManager {
  constructor() {
    this.curr = null;   // Visually open album
    this.playing = null; // Currently playing album context
    this.cache = new Map(); // Data cache
    this.covers = new Map(); // Cover URL cache
    this.coreCache = new Map(); // Playlist snapshots
    
    this.loading = false;
    this.galVis = true;
    
    this._bound = { fav: false, track: false, favView: false };
    this._clickGuard = 0; // Для защиты от дребезга кликов
  }

  async initialize() {
    if (!window.albumsIndex?.length && window.Utils?.onceEvent) {
      try { await window.Utils.onceEvent(window, 'albumsIndex:ready', { timeoutMs: 5000 }); } catch {}
    }
    if (!window.albumsIndex?.length) return console.error('❌ Albums index empty');

    this._renderIcons();
    this._bindFavSync();
    this._bindTrackClicks();

    const def = C.ICON_ALBUMS_ORDER?.find(x => !x.key.startsWith('__'))?.key || window.albumsIndex[0]?.key;
    const key = localStorage.getItem('currentAlbum') || def;
    if (key) await this.loadAlbum(key);
  }

  // --- Rendering ---
  _renderIcons() {
    const box = $('album-icons');
    if (!box) return;
    
    const isMob = isMobileUA();
    const order = C.ICON_ALBUMS_ORDER || [];
    const index = window.albumsIndex || [];

    box.innerHTML = order
      .filter(it => it.key && (it.key.startsWith('__') || index.some(a => a.key === it.key)))
      .map(it => {
        const base = it.icon || LOGO;
        const p1 = isMob ? base.replace(/icon_album\/(.+)\.png$/, 'icon_album/mobile/$1@1x.jpg') : base.replace(/\.png$/, '@1x.png');
        const p2 = isMob ? p1.replace(/@1x\.jpg$/, '@2x.jpg') : p1.replace(/@1x\.png$/, '@2x.png');
        
        return `<div class="album-icon" data-album="${it.key}" data-akey="${it.key}" title="${escHtml(it.title)}">
          <img src="${p1}" srcset="${p2} 2x" alt="${escHtml(it.title)}" draggable="false" loading="lazy" width="60" height="60">
        </div>`;
      }).join('');

    box.addEventListener('click', (e) => {
      const el = e.target.closest('.album-icon');
      if (el) this._onIconClick(el.dataset.album);
    });
  }

  _onIconClick(key) {
    if (this.curr === key && !key.startsWith('__')) {
      this.galVis = !this.galVis;
      const w = $('cover-wrap');
      if (w) w.style.display = this.galVis ? '' : 'none';
      window.NotificationSystem?.info(this.galVis ? '🖼️ Галерея показана' : '🚫 Галерея скрыта');
    } else {
      this.loadAlbum(key);
    }
  }

  updateActiveIcon(key) {
    document.querySelectorAll('.album-icon').forEach(el => el.classList.toggle('active', el.dataset.album === key));
  }

  renderAlbumTitle(t, mod = '') {
    const el = $('active-album-title');
    if (el) { el.textContent = t; el.className = `active-album-title ${mod}`; }
  }

  // --- Logic ---
  async loadAlbum(key) {
    if (this.loading) return;
    this.loading = true;
    this.galVis = true;

    try {
      $('track-list').innerHTML = '';
      $('social-links').innerHTML = '';
      window.GalleryManager?.clear?.();

      if (key === FAV) await this._loadFav();
      else if (key === NEWS) await this._loadNews();
      else await this._loadReg(key);

      this.curr = key;
      localStorage.setItem('currentAlbum', key);
      this.updateActiveIcon(key);
      $('track-list')?.classList.remove('filtered');
      window.PlayerUI?.switchAlbumInstantly?.(key);
      window.PlayerState?.save?.();
    } catch (e) {
      console.error(e);
      window.NotificationSystem?.error('Ошибка загрузки альбома');
    } finally {
      this.loading = false;
    }
  }

  async _loadReg(key) {
    const info = window.albumsIndex?.find(a => a.key === key);
    if (!info) throw new Error(`Album ${key} missing`);

    let data = this.cache.get(key);
    if (!data) {
      const base = info.base.endsWith('/') ? info.base : `${info.base}/`;
      const res = await fetch(`${base}config.json`);
      if (!res.ok) throw new Error(`Config err ${res.status}`);
      const raw = await res.json();
      
      data = {
        title: raw.albumName || info.title,
        artist: raw.artist || 'Витрина Разбита',
        links: (raw.social_links || raw.socials || []).map(s => ({ label: s.title || s.label, url: s.url })),
        tracks: (raw.tracks || []).map((t, i) => this._normTrack(t, i, base, key))
      };
      this.cache.set(key, data);
      this.coreCache.delete(key);
    }

    await window.GalleryManager?.loadGallery?.(key);
    const cover = await window.GalleryManager?.getFirstCoverUrl?.(key) || LOGO;
    this.covers.set(key, cover);

    if (window.GalleryManager?.getItemsCount?.() <= 0) {
      const s = $('cover-slot');
      if (s) s.innerHTML = `<img src="${LOGO}" alt="Cover">`;
    }

    $('cover-wrap').style.display = '';
    this.renderAlbumTitle(data.title);
    this._renderSocials(data.links);
    this._renderTracks(data.tracks, key);
    
    window.PlayerUI?.updateMiniHeader?.();
  }

  _normTrack(t, i, base, key) {
    const hi = toUrl(base, t.audio), lo = toUrl(base, t.audio_low);
    const uid = toStr(t.uid).trim() || null;
    
    // Получаем закэшированные данные альбома, чтобы достать название
    const albumData = this.cache.get(key);
    const albumTitle = albumData?.title || 'Альбом';
    const albumArtist = albumData?.artist || 'Витрина Разбита';

    // Register for Offline/PWA
    if (uid) registerTrack({
      uid, title: t.title,
      audio: hi, audio_low: lo,
      size: t.size, size_low: t.size_low,
      lyrics: toUrl(base, t.lyrics), fulltext: toUrl(base, t.fulltext),
      sourceAlbum: key
    }, { title: albumTitle, artist: albumArtist }); // <-- Передаем название альбома

    return {
      num: i + 1,
      title: t.title || `Трек ${i + 1}`,
      uid,
      src: hi,
      sources: (hi || lo) ? { audio: { hi, lo } } : null,
      lyrics: toUrl(base, t.lyrics),
      fulltext: toUrl(base, t.fulltext),
      hasLyrics: t.hasLyrics ?? !!t.lyrics
    };
  }

  async _loadFav() {
    // Делегируем специализированному модулю (удаление дублирования логики)
    // Весь код перенесен в scripts/app/albums/specials.js
    const { loadFavoritesAlbum } = await import('./albums/specials.js');
    await loadFavoritesAlbum(this);
  }

  async _loadNews() {
    this.renderAlbumTitle('📰 НОВОСТИ 📰', 'news');
    await window.GalleryManager?.loadGallery?.(NEWS);
    $('cover-wrap').style.display = '';
    await loadAndRenderNewsInline($('track-list'));
  }

  // --- Rendering Helpers ---
  _renderSocials(links) {
    const box = $('social-links');
    if (!box) return;
    box.innerHTML = (links || []).filter(l => l.url).map(l => 
      `<a href="${l.url}" target="_blank" rel="noopener noreferrer">${l.label}</a>`
    ).join('');
  }

  _renderTracks(list, key) {
    const pc = window.playerCore;
    $('track-list').innerHTML = (list || []).map((t, i) => {
      const u = t.uid || '';
      const liked = u && pc?.isFavorite?.(u);
      return `<div class="track" id="trk${i}" data-index="${i}" data-album="${escHtml(key)}" data-uid="${escHtml(u)}">
        <div class="tnum">${String(t.num).padStart(2,'0')}.</div>
        <div class="track-title">${escHtml(t.title)}</div>
        <img src="${liked ? STAR_ON : STAR_OFF}" class="like-star" alt="★" data-album="${escHtml(key)}" data-uid="${escHtml(u)}">
      </div>`;
    }).join('');
  }

  highlightCurrentTrack(i, { uid, albumKey } = {}) {
    document.querySelectorAll('.track.current').forEach(n => n.classList.remove('current'));
    let sel;
    if (this.curr === FAV && uid && albumKey) sel = `.track[data-album="${CSS.escape(albumKey)}"][data-uid="${CSS.escape(uid)}"]`;
    else if (uid) sel = `.track[data-uid="${CSS.escape(uid)}"]`;
    else if (i >= 0) sel = `.track[data-index="${i}"]`;
    
    if (sel) document.querySelector(sel)?.classList.add('current');
  }

  // --- Events ---
  _bindFavSync() {
    if (this._bound.fav) return;
    this._bound.fav = true;
    window.playerCore?.onFavoritesChanged((d) => {
      const s = d?.liked ? STAR_ON : STAR_OFF;
      document.querySelectorAll(`.like-star[data-album="${CSS.escape(d?.albumKey)}"][data-uid="${CSS.escape(d?.uid)}"]`).forEach(el => el.src = s);
    });
  }

  _bindTrackClicks() {
    if (this._bound.track) return;
    this._bound.track = true;
    
    const ctr = $('track-list');
    ctr.addEventListener('click', (e) => {
      // Глобальный Debounce
      if (Date.now() - this._clickGuard < 300) return;
      this._clickGuard = Date.now();

      const trk = e.target.closest('.track');
      if (!trk || !ctr.contains(trk)) return;

      const aKey = getAlb(trk), uid = getUid(trk);
      if (!aKey || aKey.startsWith('__')) return; // спец. альбомы обрабатываются отдельно

      // Star click
      if (e.target.classList.contains('like-star')) {
        e.preventDefault(); e.stopPropagation();
        if (!uid || !window.playerCore) return;
        
        const next = !window.playerCore.isFavorite(uid);
        setStar(e.target, next);
        e.target.classList.add('animating');
        setTimeout(() => e.target.classList.remove('animating'), 320);
        // В родном альбоме source не указываем, по умолчанию будет 'album' (Hard Delete)
        window.playerCore.toggleFavorite(uid, { fromAlbum: true, albumKey: aKey });
        return;
      }

      // Play click
      const data = this.cache.get(aKey);
      if (!data) return window.NotificationSystem?.error('Данные альбома не готовы');

      let core = this.coreCache.get(aKey);
      if (!core) {
        // Формируем кэш для плеера
        const tracks = data.tracks.filter(t => t.src).map(t => ({
          src: t.src, sources: t.sources, title: t.title, artist: data.artist,
          album: aKey, cover: this.covers.get(aKey) || LOGO,
          uid: t.uid, lyrics: t.lyrics, fulltext: t.fulltext, hasLyrics: t.hasLyrics
        }));
        const map = new Map(); tracks.forEach((t, n) => map.set(t.uid, n));
        core = { tracks, map };
        this.coreCache.set(aKey, core);
      }

      const pIdx = core.map.get(uid);
      if (pIdx === undefined) return window.NotificationSystem?.warning('Трек недоступен');

      // 1. СНАЧАЛА устанавливаем контекст (Исправление бага с мини-плеером)
      this.playing = aKey; 

      // 2. Проверяем плейлист
      const curSnap = window.playerCore.getPlaylistSnapshot() || [];
      // Сравниваем не только длину, но и контекст альбома первого трека
      if (curSnap.length !== core.tracks.length || curSnap[0]?.album !== aKey) {
        window.playerCore.setPlaylist(core.tracks, pIdx, {
          artist: data.artist, album: data.title, cover: this.covers.get(aKey) || LOGO
        }, { preservePosition: false });
      }

      this.highlightCurrentTrack(pIdx);
      
      // 3. ЗАПУСКАЕМ (Интерфейс уже знает, что playing == aKey)
      window.playerCore.play(pIdx);
      
      window.PlayerUI?.ensurePlayerBlock?.(pIdx, { userInitiated: true });
    });
  }

  // --- API ---
  getCurrentAlbum() { return this.curr; }
  getPlayingAlbum() { return this.playing; }
  setPlayingAlbum(k) { this.playing = k; }
  getAlbumData(k) { return this.cache.get(k); }
}

window.AlbumsManager = new AlbumsManager();
export default window.AlbumsManager;
