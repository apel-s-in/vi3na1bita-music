import { registerTrack } from './track-registry.js';
import { injectIndicator } from '../ui/offline-indicators.js';

const W = window, D = document, C = W.APP_CONFIG || {};
const { $, toStr, escHtml, isMobileUA } = W.AppUtils || { $: id => D.getElementById(id), toStr: v => v == null ? '' : String(v), escHtml: s => String(s||''), isMobileUA: () => false };

const [FAV, NEWS, SHOWCASE, PROFILE, STAR_ON, STAR_OFF, LOGO] = [
  W.SPECIAL_FAVORITES_KEY || '__favorites__', W.SPECIAL_RELIZ_KEY || '__reliz__',
  W.SPECIAL_SHOWCASE_KEY || '__showcase__', C.SPECIAL_PROFILE_KEY || '__profile__',
  'img/star.png', 'img/star2.png', 'img/logo.png'
];

class AlbumsManager {
  curr = null; playing = null; cache = new Map(); covers = new Map();
  loading = false; galVis = true;

  async initialize() {
    if (!W.albumsIndex?.length) try { await W.Utils?.onceEvent?.(W, 'albumsIndex:ready', { timeoutMs: 5000 }); } catch {}
    this._renderIcons();
    this._bindEvents();
    
    const def = C.ICON_ALBUMS_ORDER?.find(x => !x.key.startsWith('__'))?.key || W.albumsIndex?.[0]?.key;
    const key = localStorage.getItem('currentAlbum') || def;
    if (key) await this.loadAlbum(key);

    W.addEventListener('quality:changed', () => this.cache.forEach(d => delete d._pTracks));
  }

  _renderIcons() {
    const box = $('album-icons'); 
    if (!box) return;
    
    const isMob = isMobileUA(), idx = W.albumsIndex || [];
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
        touchTimer = setTimeout(() => { touchTimer = null; W.ShowcaseManager?.openColorPicker?.(null, k); }, 600);
      }, {passive: true});
      
      iconsBox.addEventListener('touchmove', () => { isDragging = true; if(touchTimer) clearTimeout(touchTimer); }, {passive: true});
      iconsBox.addEventListener('touchend', () => { if(touchTimer) clearTimeout(touchTimer); });
      
      iconsBox.addEventListener('contextmenu', e => {
        const k = e.target.closest('.album-icon')?.dataset.album;
        if (k && !k.startsWith('__')) { e.preventDefault(); W.ShowcaseManager?.openColorPicker?.(null, k); }
      });
      
      iconsBox.addEventListener('click', e => {
        if (isDragging) return;
        const k = e.target.closest('.album-icon')?.dataset.album; 
        if (!k) return;
        
        if (this.curr === k && !k.startsWith('__')) {
          this.galVis = !this.galVis;
          const w = $('cover-wrap'); 
          if (w) w.style.display = this.galVis ? '' : 'none';
          W.NotificationSystem?.info(this.galVis ? '🖼️ Галерея показана' : '🚫 Галерея скрыта');
        } else this.loadAlbum(k);
      });
    }

    $('track-list')?.addEventListener('click', e => {
      W.playerCore?.prepareContext?.();
      if (this.curr === FAV || e.target.closest('.offline-ind')) return;
      
      const trk = e.target.closest('.track'); 
      if (!trk) return;
      
      const aKey = toStr(trk.dataset.album).trim(), uid = toStr(trk.dataset.uid).trim(), pc = W.playerCore;
      if (!aKey || aKey.startsWith('__')) return;

      if (e.target.classList.contains('like-star') && uid && pc) {
        e.preventDefault(); e.stopPropagation();
        e.target.src = !pc.isFavorite(uid) ? STAR_ON : STAR_OFF;
        e.target.classList.add('animating'); 
        setTimeout(() => e.target.classList.remove('animating'), 320);
        pc.toggleFavorite(uid, { fromAlbum: true, albumKey: aKey });
        return;
      }

      const data = this.cache.get(aKey); 
      if (!data || !pc) return;
      this.playing = aKey;
      
      if (!data._pTracks) {
        data._pTracks = data.tracks.filter(t => t.src).map(t => ({ 
          src: t.src, sources: t.sources, title: t.title, artist: data.artist, album: data.title, 
          cover: this.covers.get(aKey) || LOGO, uid: t.uid, lyrics: t.lyrics, fulltext: t.fulltext, 
          hasLyrics: t.hasLyrics, sourceAlbum: aKey 
        }));
      }
      
      const pIdx = data._pTracks.findIndex(t => t.uid === uid); 
      if (pIdx === -1) return;
      
      const curSnap = pc.getPlaylistSnapshot() || [];
      if (curSnap.length !== data._pTracks.length || curSnap[0]?.sourceAlbum !== aKey) {
        pc.setPlaylist(data._pTracks, pIdx, null, { preservePosition: false });
      }
      
      this.highlightCurrentTrack(pIdx); 
      pc.play(pIdx);
      W.PlayerUI?.ensurePlayerBlock?.(pIdx, { userInitiated: true });
    });

    W.playerCore?.onFavoritesChanged(d => {
      const s = d?.liked ? STAR_ON : STAR_OFF;
      const sel = d?.albumKey ? `.like-star[data-album="${CSS.escape(d.albumKey)}"][data-uid="${CSS.escape(d.uid)}"]` : `.like-star[data-uid="${CSS.escape(d?.uid)}"]`;
      D.querySelectorAll(sel).forEach(el => el.src = s);
    });
  }

  async loadAlbum(key) {
    if (this.loading) return; 
    this.loading = true; 
    this.galVis = true;
    
    try {
      const trackList = $('track-list');
      if (trackList) trackList.innerHTML = '';
      $('social-links').innerHTML = ''; 
      W.GalleryManager?.clear?.();

      const specials = {
        [FAV]: 'loadFavoritesAlbum',
        [NEWS]: 'loadNewsAlbum',
        [SHOWCASE]: 'loadShowcaseAlbum',
        [PROFILE]: 'loadProfileAlbum'
      };

      if (specials[key]) {
        const mod = await import('./albums/specials.js');
        await mod[specials[key]](this);
      } else {
        const cached = this.cache.get(key);
        if (cached) delete cached._pTracks;
        
        await W.TrackRegistry?.ensurePopulated?.();
        let data = this.cache.get(key);
        
        if (!data) {
          const cfg = W.TrackRegistry.getAlbumConfig(key);
          if (!cfg) throw new Error(`Album ${key} missing or failed to load`);
          data = { ...cfg, tracks: W.TrackRegistry.getTracksForAlbum(key) };
          this.cache.set(key, data);
        }
        
        await W.GalleryManager?.loadGallery?.(key);
        this.covers.set(key, await W.GalleryManager?.getFirstCoverUrl?.(key) || LOGO);
        
        const coverSlot = $('cover-slot');
        if (coverSlot && W.GalleryManager?.getItemsCount?.() <= 0) {
          coverSlot.innerHTML = `<img src="${LOGO}" alt="Cover">`;
        }
        
        $('cover-wrap').style.display = ''; 
        this.renderAlbumTitle(data.title);
        
        $('social-links').innerHTML = (data.links || []).filter(l => l.url).map(l => `<a href="${l.url}" target="_blank" rel="noopener noreferrer">${l.label}</a>`).join('');
        
        if (trackList) {
          trackList.innerHTML = data.tracks.map((t, i) => `<div class="track" id="trk${i}" data-index="${i}" data-album="${escHtml(key)}" data-uid="${escHtml(t.uid)}"><div class="tnum">${String(t.num).padStart(2,'0')}.</div><div class="track-title">${escHtml(t.title)}</div><img src="${t.uid && W.playerCore?.isFavorite?.(t.uid) ? STAR_ON : STAR_OFF}" class="like-star" alt="★" data-album="${escHtml(key)}" data-uid="${escHtml(t.uid)}"></div>`).join('');
          trackList.querySelectorAll('.track[data-uid]').forEach(el => injectIndicator(el));
        }
        W.PlayerUI?.updateMiniHeader?.();
      }

      this.curr = key; 
      localStorage.setItem('currentAlbum', key);
      D.querySelectorAll('.album-icon').forEach(el => el.classList.toggle('active', el.dataset.album === key));
      $('track-list')?.classList.remove('filtered'); 
      W.PlayerUI?.switchAlbumInstantly?.(key);
      
    } catch (e) { 
      console.error('[AlbumsManager] Ошибка загрузки альбома:', e);
      W.NotificationSystem?.error('Ошибка загрузки');
    } finally { 
      this.loading = false; 
    }
  }

  highlightCurrentTrack(i, { uid, albumKey } = {}) {
    D.querySelectorAll('.track.current').forEach(n => n.classList.remove('current'));
    
    if (W.Utils?.isShowcaseContext?.(this.curr) && uid) {
      D.querySelectorAll(`[data-uid="${CSS.escape(uid)}"]`).forEach(el => el.classList.add('current'));
      return;
    }
    
    const sel = (this.curr === FAV && uid && albumKey) ?
      `.track[data-album="${CSS.escape(albumKey)}"][data-uid="${CSS.escape(uid)}"]` : 
      (uid ? `.track[data-uid="${CSS.escape(uid)}"]` : (i >= 0 ? `.track[data-index="${i}"]` : null));
      
    if (sel) D.querySelector(sel)?.classList.add('current');
  }

  getCurrentAlbum() { return this.curr; } 
  getPlayingAlbum() { return this.playing; } 
  setPlayingAlbum(k) { this.playing = k; }
  
  getPlayingAlbumTracks() {
    if (W.Utils?.isShowcaseContext?.(this.playing)) return W.ShowcaseManager?.getActiveListTracks?.() || [];
    const d = this.cache.get(this.playing);
    return d ? (d._pTracks || d.tracks) : [];
  }
  
  renderAlbumTitle(t, mod) { 
    const el = $('active-album-title'); 
    if(el) { 
      el.textContent = t; 
      el.className = `active-album-title ${mod||''}`; 
    } 
  }
}

W.AlbumsManager = new AlbumsManager();
export default W.AlbumsManager;
