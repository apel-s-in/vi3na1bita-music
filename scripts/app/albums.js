import { registerTrack } from './track-registry.js';
const { $, toStr, escHtml, isMobileUA } = window.AppUtils || { $: id => document.getElementById(id), toStr: v => v == null ? '' : String(v), escHtml: s => String(s||''), isMobileUA: () => false };
import { injectIndicator } from '../ui/offline-indicators.js';

const C = window.APP_CONFIG || {};
const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__';
const SHOWCASE = window.SPECIAL_SHOWCASE_KEY || '__showcase__';
const PROFILE = window.APP_CONFIG?.SPECIAL_PROFILE_KEY || '__profile__';
const STAR_ON = 'img/star.png';
const STAR_OFF = 'img/star2.png';
const LOGO = 'img/logo.png';
const toUrl = (b, r) => r ? new URL(r, b).toString() : null;

class AlbumsManager {
  curr = null; playing = null; cache = new Map(); covers = new Map(); loading = false; galVis = true;

  async initialize() {
    if (!window.albumsIndex?.length) try { await window.Utils?.onceEvent?.(window, 'albumsIndex:ready', { timeoutMs: 5000 }); } catch {}
    this._renderIcons(); this._bindEvents();
    const def = C.ICON_ALBUMS_ORDER?.find(x => !x.key.startsWith('__'))?.key || window.albumsIndex?.[0]?.key;
    const key = localStorage.getItem('currentAlbum') || def;
    if (key) await this.loadAlbum(key);
    window.addEventListener('quality:changed', () => {
      this.cache.forEach(d => delete d._pTracks);
    });
  }

  _renderIcons() {
    const box = $('album-icons'); if (!box) return;
    const isMob = isMobileUA(), idx = window.albumsIndex || [];
    box.innerHTML = (C.ICON_ALBUMS_ORDER || []).filter(it => it.key && (it.key.startsWith('__') || idx.some(a => a.key === it.key))).map(it => {
      let b = it.icon || LOGO, p1 = b, p2 = b;
      if (b.includes('icon_album') && !b.includes('Fav_logo')) {
        p1 = isMob ? b.replace(/icon_album\/(.+)\.png$/, 'icon_album/mobile/$1@1x.jpg') : b.replace(/\.png$/, '@1x.png');
        p2 = isMob ? p1.replace(/@1x\.jpg$/, '@2x.jpg') : p1.replace(/@1x\.png$/, '@2x.png');
      }
      return `<div class="album-icon" data-album="${it.key}" data-akey="${it.key}" title="${escHtml(it.title)}"><img src="${p1}" srcset="${p2} 2x" alt="${escHtml(it.title)}" draggable="false" loading="lazy" width="60" height="60"></div>`;
    }).join('');
  }

  _bindEvents() {
    const iconsBox = $('album-icons');
    if (iconsBox) {
      let touchTimer = null, isDragging = false;
      iconsBox.addEventListener('touchstart', e => {
        const k = e.target.closest('.album-icon')?.dataset.album;
        if (!k || k.startsWith('__')) return;
        isDragging = false;
        touchTimer = setTimeout(() => { touchTimer = null; window.ShowcaseManager?.openColorPicker?.(null, k); }, 600);
      }, {passive: true});
      iconsBox.addEventListener('touchmove', () => { isDragging = true; if(touchTimer) clearTimeout(touchTimer); }, {passive: true});
      iconsBox.addEventListener('touchend', () => { if(touchTimer) clearTimeout(touchTimer); });
      iconsBox.addEventListener('contextmenu', e => {
        const k = e.target.closest('.album-icon')?.dataset.album;
        if (k && !k.startsWith('__')) { e.preventDefault(); window.ShowcaseManager?.openColorPicker?.(null, k); }
      });

      iconsBox.addEventListener('click', e => {
        if (isDragging) return;
        const k = e.target.closest('.album-icon')?.dataset.album; if (!k) return;
        if (this.curr === k && !k.startsWith('__')) {
          this.galVis = !this.galVis;
          const w = $('cover-wrap'); if (w) w.style.display = this.galVis ? '' : 'none';
          window.NotificationSystem?.info(this.galVis ? '🖼️ Галерея показана' : '🚫 Галерея скрыта');
        } else this.loadAlbum(k);
      });
    }

    $('track-list')?.addEventListener('click', e => {
      window.playerCore?.prepareContext?.();
      if (this.curr === FAV || e.target.closest('.offline-ind')) return;
      const trk = e.target.closest('.track'); if (!trk) return;
      const aKey = toStr(trk.dataset.album).trim(), uid = toStr(trk.dataset.uid).trim();
      if (!aKey || aKey.startsWith('__')) return;

      if (e.target.classList.contains('like-star') && uid && window.playerCore) {
        e.preventDefault(); e.stopPropagation();
        e.target.src = !window.playerCore.isFavorite(uid) ? STAR_ON : STAR_OFF;
        e.target.classList.add('animating'); setTimeout(() => e.target.classList.remove('animating'), 320);
        window.playerCore.toggleFavorite(uid, { fromAlbum: true, albumKey: aKey });
        return;
      }

      const data = this.cache.get(aKey); if (!data) return;
      this.playing = aKey;
      
      // Оптимизация памяти (Cache Playlist Array) - предотвращает GC-фризы при навигации
      if (!data._pTracks) data._pTracks = data.tracks.filter(t => t.src).map(t => ({ src: t.src, sources: t.sources, title: t.title, artist: data.artist, album: data.title, cover: this.covers.get(aKey) || LOGO, uid: t.uid, lyrics: t.lyrics, fulltext: t.fulltext, hasLyrics: t.hasLyrics, sourceAlbum: aKey }));
      
      const pIdx = data._pTracks.findIndex(t => t.uid === uid); if (pIdx === -1) return;
      const curSnap = window.playerCore.getPlaylistSnapshot() || [];
      if (curSnap.length !== data._pTracks.length || curSnap[0]?.sourceAlbum !== aKey) window.playerCore.setPlaylist(data._pTracks, pIdx, null, { preservePosition: false });
      
      this.highlightCurrentTrack(pIdx); window.playerCore.play(pIdx);
      window.PlayerUI?.ensurePlayerBlock?.(pIdx, { userInitiated: true });
    });

    window.playerCore?.onFavoritesChanged(d => {
      const s = d?.liked ? STAR_ON : STAR_OFF, sel = d?.albumKey ? `.like-star[data-album="${CSS.escape(d.albumKey)}"][data-uid="${CSS.escape(d.uid)}"]` : `.like-star[data-uid="${CSS.escape(d?.uid)}"]`;
      document.querySelectorAll(sel).forEach(el => el.src = s);
    });
  }

  async loadAlbum(key) {
    if (this.loading) return; this.loading = true; this.galVis = true;
    try {
      $('track-list').innerHTML = ''; $('social-links').innerHTML = ''; window.GalleryManager?.clear?.();
      if (key === FAV) await (await import('./albums/specials.js')).loadFavoritesAlbum(this);
      else if (key === NEWS) await (await import('./albums/specials.js')).loadNewsAlbum(this);
      else if (key === SHOWCASE) await (await import('./albums/specials.js')).loadShowcaseAlbum(this);
      else if (key === PROFILE) await (await import('./albums/specials.js')).loadProfileAlbum(this);
      else await this._loadReg(key);

      this.curr = key; localStorage.setItem('currentAlbum', key);
      document.querySelectorAll('.album-icon').forEach(el => el.classList.toggle('active', el.dataset.album === key));
      $('track-list')?.classList.remove('filtered'); window.PlayerUI?.switchAlbumInstantly?.(key);
    } catch (e) { 
      console.error('[AlbumsManager] Ошибка загрузки альбома:', e);
      window.NotificationSystem?.error('Ошибка загрузки'); 
    } finally { this.loading = false; }
  }

  async _loadReg(key) {
    const cached = this.cache.get(key);
    if (cached) delete cached._pTracks; // инвалидация при каждом открытии
    
    await window.TrackRegistry?.ensurePopulated?.();
    let data = this.cache.get(key);
    
    if (!data) {
      const cfg = window.TrackRegistry.getAlbumConfig(key);
      if (!cfg) throw new Error(`Album ${key} missing or failed to load`);
      data = { ...cfg, tracks: window.TrackRegistry.getTracksForAlbum(key) };
      this.cache.set(key, data);
    }
    await window.GalleryManager?.loadGallery?.(key);
    this.covers.set(key, await window.GalleryManager?.getFirstCoverUrl?.(key) || LOGO);
    if (window.GalleryManager?.getItemsCount?.() <= 0) $('cover-slot').innerHTML = `<img src="${LOGO}" alt="Cover">`;

    $('cover-wrap').style.display = ''; this.renderAlbumTitle(data.title);
    $('social-links').innerHTML = (data.links || []).filter(l => l.url).map(l => `<a href="${l.url}" target="_blank" rel="noopener noreferrer">${l.label}</a>`).join('');
    $('track-list').innerHTML = data.tracks.map((t, i) => `<div class="track" id="trk${i}" data-index="${i}" data-album="${escHtml(key)}" data-uid="${escHtml(t.uid)}"><div class="tnum">${String(t.num).padStart(2,'0')}.</div><div class="track-title">${escHtml(t.title)}</div><img src="${t.uid && window.playerCore?.isFavorite?.(t.uid) ? STAR_ON : STAR_OFF}" class="like-star" alt="★" data-album="${escHtml(key)}" data-uid="${escHtml(t.uid)}"></div>`).join('');
    
    // ТЗ П.7.2: Инъекция офлайн-индикаторов
    $('track-list').querySelectorAll('.track[data-uid]').forEach(el => injectIndicator(el));
    window.PlayerUI?.updateMiniHeader?.();
  }

  highlightCurrentTrack(i, { uid, albumKey } = {}) {
    document.querySelectorAll('.track.current').forEach(n => n.classList.remove('current'));
    if (window.Utils?.isShowcaseContext?.(this.curr) && uid) {
      document.querySelectorAll(`[data-uid="${CSS.escape(uid)}"]`).forEach(el => el.classList.add('current'));
      return;
    }
    const sel = (this.curr === FAV && uid && albumKey) ?
      `.track[data-album="${CSS.escape(albumKey)}"][data-uid="${CSS.escape(uid)}"]` : (uid ? `.track[data-uid="${CSS.escape(uid)}"]` : (i >= 0 ? `.track[data-index="${i}"]` : null));
    if (sel) document.querySelector(sel)?.classList.add('current');
  }

  getCurrentAlbum() { return this.curr; } getPlayingAlbum() { return this.playing; } 
  setPlayingAlbum(k) { this.playing = k; }
  getPlayingAlbumTracks() {
    if (window.Utils?.isShowcaseContext?.(this.playing)) {
      return window.ShowcaseManager?.getActiveListTracks?.() || [];
    }
    const d = this.cache.get(this.playing);
    return d ? (d._pTracks || d.tracks) : [];
  }
  renderAlbumTitle(t, mod) { const el = $('active-album-title'); if(el) { el.textContent = t; el.className = `active-album-title ${mod||''}`; } }
}

window.AlbumsManager = new AlbumsManager();
export default window.AlbumsManager;
