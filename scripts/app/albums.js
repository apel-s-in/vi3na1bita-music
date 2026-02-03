import { registerTrack } from './track-registry.js';
import { $, toStr, escHtml, isMobileUA } from './utils/app-utils.js';
import { loadAndRenderNewsInline } from '../ui/news-inline.js';

const C = window.APP_CONFIG || {};
const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__';
const STAR_ON = 'img/star.png';
const STAR_OFF = 'img/star2.png';
const LOGO = 'img/logo.png';

class AlbumsManager {
  constructor() {
    this.curr = null;
    this.playing = null;
    this.cache = new Map();
    this.covers = new Map();
    this.loading = false;
    this.galVis = true;
  }

  async initialize() {
    if (!window.albumsIndex?.length) {
      try { await window.Utils?.onceEvent?.(window, 'albumsIndex:ready', { timeoutMs: 5000 }); } catch {}
    }
    if (!window.albumsIndex?.length) return console.error('❌ Albums index empty');

    this._renderIcons();
    this._bindEvents();

    const def = C.ICON_ALBUMS_ORDER?.find(x => !x.key.startsWith('__'))?.key || window.albumsIndex[0]?.key;
    const key = localStorage.getItem('currentAlbum') || def;
    if (key) await this.loadAlbum(key);
  }

  _renderIcons() {
    const box = $('album-icons');
    if (!box) return;
    
    const isMob = isMobileUA();
    const index = window.albumsIndex || [];

    box.innerHTML = (C.ICON_ALBUMS_ORDER || [])
      .filter(it => it.key && (it.key.startsWith('__') || index.some(a => a.key === it.key)))
      .map(it => {
        const base = it.icon || LOGO;
        const p1 = isMob ? base.replace(/icon_album\/(.+)\.png$/, 'icon_album/mobile/$1@1x.jpg') : base.replace(/\.png$/, '@1x.png');
        const p2 = isMob ? p1.replace(/@1x\.jpg$/, '@2x.jpg') : p1.replace(/@1x\.png$/, '@2x.png');
        
        return `<div class="album-icon" data-album="${it.key}" title="${escHtml(it.title)}">
          <img src="${p1}" srcset="${p2} 2x" alt="${escHtml(it.title)}" draggable="false" loading="lazy" width="60" height="60">
        </div>`;
      }).join('');
  }

  _bindEvents() {
    // 1. Icons Click
    $('album-icons')?.addEventListener('click', (e) => {
      const el = e.target.closest('.album-icon');
      if (!el) return;
      const key = el.dataset.album;
      
      if (this.curr === key && !key.startsWith('__')) {
        this.galVis = !this.galVis;
        const w = $('cover-wrap');
        if (w) w.style.display = this.galVis ? '' : 'none';
        window.NotificationSystem?.info(this.galVis ? '🖼️ Галерея показана' : '🚫 Галерея скрыта');
      } else {
        this.loadAlbum(key);
      }
    });

    // 2. Track List Click (Native Albums Only)
    $('track-list')?.addEventListener('click', (e) => {
      const trk = e.target.closest('.track');
      if (!trk) return;

      const aKey = toStr(trk.dataset.album).trim();
      const uid = toStr(trk.dataset.uid).trim();
      
      // Игнорируем спец. альбомы (у них свои обработчики в specials.js или news)
      if (!aKey || aKey.startsWith('__')) return;

      // Лайк (без смены трека)
      if (e.target.classList.contains('like-star')) {
        e.preventDefault(); e.stopPropagation();
        if (uid && window.playerCore) {
          const next = !window.playerCore.isFavorite(uid);
          e.target.src = next ? STAR_ON : STAR_OFF;
          e.target.classList.add('animating');
          setTimeout(() => e.target.classList.remove('animating'), 320);
          window.playerCore.toggleFavorite(uid, { fromAlbum: true, albumKey: aKey });
        }
        return;
      }

      // Play
      const data = this.cache.get(aKey);
      if (!data) return;

      // ✅ 1. Мгновенная смена контекста: теперь мы в "Родном альбоме"
      this.playing = aKey; 

      // 2. Подготовка плейлиста "на лету" (без тяжелого кэша)
      const tracks = data.tracks.filter(t => t.src).map(t => ({
        src: t.src, sources: t.sources, title: t.title, artist: data.artist,
        album: data.title, cover: this.covers.get(aKey) || LOGO,
        uid: t.uid, lyrics: t.lyrics, fulltext: t.fulltext, hasLyrics: t.hasLyrics,
        sourceAlbum: aKey // Важно для сверки
      }));
      
      const pIdx = tracks.findIndex(t => t.uid === uid);
      if (pIdx === -1) return;

      // 3. Загрузка в плеер (сначала setPlaylist, потом play)
      const curSnap = window.playerCore.getPlaylistSnapshot() || [];
      // Перезагружаем плейлист только если он отличается (оптимизация)
      if (curSnap.length !== tracks.length || curSnap[0]?.sourceAlbum !== aKey) {
        window.playerCore.setPlaylist(tracks, pIdx, null, { preservePosition: false });
      }

      this.highlightCurrentTrack(pIdx);
      window.playerCore.play(pIdx);
      
      // 4. UI: Принудительный рендер (PlayerUI увидит this.playing === this.curr и отрисует снизу)
      window.PlayerUI?.ensurePlayerBlock?.(pIdx, { userInitiated: true });
    });

    // 3. Fav Sync
    window.playerCore?.onFavoritesChanged((d) => {
      const s = d?.liked ? STAR_ON : STAR_OFF;
      document.querySelectorAll(`.like-star[data-album="${CSS.escape(d?.albumKey)}"][data-uid="${CSS.escape(d?.uid)}"]`).forEach(el => el.src = s);
    });
  }

  async loadAlbum(key) {
    if (this.loading) return;
    this.loading = true;
    this.galVis = true;

    try {
      $('track-list').innerHTML = '';
      $('social-links').innerHTML = '';
      window.GalleryManager?.clear?.();

      if (key === FAV) await (await import('./albums/specials.js')).loadFavoritesAlbum(this);
      else if (key === NEWS) await (await import('./albums/specials.js')).loadNewsAlbum(this);
      else await this._loadReg(key);

      this.curr = key;
      localStorage.setItem('currentAlbum', key);
      
      document.querySelectorAll('.album-icon').forEach(el => el.classList.toggle('active', el.dataset.album === key));
      $('track-list')?.classList.remove('filtered');
      
      // Если перешли в альбом, который сейчас играет, плеер должен встать на место (под трек)
      window.PlayerUI?.switchAlbumInstantly?.(key);
      window.PlayerState?.save?.();
    } catch (e) {
      console.error(e);
      window.NotificationSystem?.error('Ошибка загрузки');
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
      if (!res.ok) throw new Error(`Config err`);
      const raw = await res.json();
      
      data = {
        title: raw.albumName || info.title,
        artist: raw.artist || 'Витрина Разбита',
        links: (raw.social_links || raw.socials || []).map(s => ({ label: s.title || s.label, url: s.url })),
        tracks: (raw.tracks || []).map((t, i) => this._normTrack(t, i, base, key, raw.albumName || info.title))
      };
      this.cache.set(key, data);
    }

    await window.GalleryManager?.loadGallery?.(key);
    const cover = await window.GalleryManager?.getFirstCoverUrl?.(key) || LOGO;
    this.covers.set(key, cover);

    if (window.GalleryManager?.getItemsCount?.() <= 0) $('cover-slot').innerHTML = `<img src="${LOGO}" alt="Cover">`;

    $('cover-wrap').style.display = '';
    this.renderAlbumTitle(data.title);
    this._renderSocials(data.links);
    
    // Fast render
    $('track-list').innerHTML = data.tracks.map((t, i) => {
      const liked = t.uid && window.playerCore?.isFavorite?.(t.uid);
      return `<div class="track" id="trk${i}" data-index="${i}" data-album="${escHtml(key)}" data-uid="${escHtml(t.uid)}">
        <div class="tnum">${String(t.num).padStart(2,'0')}.</div>
        <div class="track-title">${escHtml(t.title)}</div>
        <img src="${liked ? STAR_ON : STAR_OFF}" class="like-star" alt="★" data-album="${escHtml(key)}" data-uid="${escHtml(t.uid)}">
      </div>`;
    }).join('');
    
    window.PlayerUI?.updateMiniHeader?.();
  }

  _normTrack(t, i, base, key, albumTitle) {
    const hi = toUrl(base, t.audio), lo = toUrl(base, t.audio_low);
    const uid = toStr(t.uid).trim() || null;
    
    if (uid) registerTrack({
      uid, title: t.title, audio: hi, audio_low: lo,
      size: t.size, size_low: t.size_low,
      lyrics: toUrl(base, t.lyrics), fulltext: toUrl(base, t.fulltext),
      sourceAlbum: key
    }, { title: albumTitle });

    return {
      num: i + 1, title: t.title || `Трек ${i + 1}`, uid, src: hi,
      sources: (hi || lo) ? { audio: { hi, lo } } : null,
      lyrics: toUrl(base, t.lyrics), fulltext: toUrl(base, t.fulltext), hasLyrics: t.hasLyrics ?? !!t.lyrics
    };
  }

  _renderSocials(links) {
    $('social-links').innerHTML = (links || []).filter(l => l.url).map(l => 
      `<a href="${l.url}" target="_blank" rel="noopener noreferrer">${l.label}</a>`
    ).join('');
  }

  highlightCurrentTrack(i, { uid, albumKey } = {}) {
    document.querySelectorAll('.track.current').forEach(n => n.classList.remove('current'));
    let sel;
    if (this.curr === FAV && uid && albumKey) sel = `.track[data-album="${CSS.escape(albumKey)}"][data-uid="${CSS.escape(uid)}"]`;
    else if (uid) sel = `.track[data-uid="${CSS.escape(uid)}"]`;
    else if (i >= 0) sel = `.track[data-index="${i}"]`;
    if (sel) document.querySelector(sel)?.classList.add('current');
  }

  getCurrentAlbum() { return this.curr; }
  getPlayingAlbum() { return this.playing; }
  setPlayingAlbum(k) { this.playing = k; }
}

window.AlbumsManager = new AlbumsManager();
export default window.AlbumsManager;
