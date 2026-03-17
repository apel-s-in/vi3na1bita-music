// UID.002_(UID-first core)_(сохранить AlbumsManager как контентный навигатор по uid-трекам)_(album shell не должен брать на себя semantic/recommendation ownership)
// UID.017_(Launch source stats)_(подготовить точку фиксации запуска из album view)_(future analytics/recs слой сможет читать source=album именно отсюда)
// UID.019_(Compact TrackProfile index)_(дать будущим album-row/card enhancements опору)_(album screen сможет читать preview profile через TrackRegistry/Intel bridge без загрузки full profile)
// UID.041_(Showcase semantic filters)_(развести обычный album UI и semantic showcase)_(albums.js не должен превращаться в semantic browser)
// UID.094_(No-paralysis rule)_(обычные альбомы обязаны работать без intel-слоя)_(любой semantic enhancement на строке трека только optional)
import { injectIndicator } from '../ui/offline-indicators.js';
import { renderFavoriteStar, setFavoriteStarState } from '../ui/icon-utils.js';
import { canLaunchTrackInFavoritesOnlyContext } from './player/favorites-only-resolver.js';

const W = window, D = document, C = W.APP_CONFIG || {};
const { $, toStr, escHtml, isMobileUA } = W.AppUtils || { $: id => D.getElementById(id), toStr: v => v == null ? '' : String(v), escHtml: s => String(s||''), isMobileUA: () => false };
const [FAV, NEWS, SHOWCASE, PROFILE, LOGO] = [W.SPECIAL_FAVORITES_KEY || '__favorites__', W.SPECIAL_RELIZ_KEY || '__reliz__', W.SPECIAL_SHOWCASE_KEY || '__showcase__', C.SPECIAL_PROFILE_KEY || '__profile__', 'img/logo.png'];

class AlbumsManager {
  curr = null; playing = null; cache = new Map(); covers = new Map(); loading = false; galVis = true;

  async initialize() {
    if (!W.albumsIndex?.length) try { await W.Utils?.onceEvent?.(W, 'albumsIndex:ready', { timeoutMs: 5000 }); } catch {}
    this._renderIcons(); this._bindEvents();
    const def = C.ICON_ALBUMS_ORDER?.find(x => !x.key.startsWith('__'))?.key || W.albumsIndex?.[0]?.key, key = localStorage.getItem('currentAlbum') || def;
    if (key) await this.loadAlbum(key);
    W.addEventListener('quality:changed', () => this.cache.forEach(d => delete d._pTracks));
  }

  _renderIcons() {
    const box = $('album-icons'); if (!box) return;
    const isMob = isMobileUA(), idx = W.albumsIndex || [];
    box.innerHTML = (C.ICON_ALBUMS_ORDER || []).filter(it => it.key && (it.key.startsWith('__') || idx.some(a => a.key === it.key))).map(it => {
      let b = it.icon || LOGO, p1 = b, p2 = b;
      if (b.includes('icon_album') && !b.includes('Fav_logo')) { p1 = isMob ? b.replace(/icon_album\/(.+)\.png$/, 'icon_album/mobile/$1@1x.jpg') : b.replace(/\.png$/, '@1x.png'); p2 = isMob ? p1.replace(/@1x\.jpg$/, '@2x.jpg') : p1.replace(/@1x\.png$/, '@2x.png'); }
      return `<div class="album-icon" data-album="${it.key}" data-akey="${it.key}" title="${escHtml(it.title)}"><img src="${p1}" srcset="${p2} 2x" alt="${escHtml(it.title)}" draggable="false" loading="lazy" width="60" height="60"></div>`;
    }).join('');
  }

  _bindEvents() {
    const iconsBox = $('album-icons');
    if (iconsBox) {
      let tTimer = null, isDrag = false;
      iconsBox.addEventListener('touchstart', e => { const k = e.target.closest('.album-icon')?.dataset.album; if (!k || k.startsWith('__')) return; isDrag = false; tTimer = setTimeout(() => { tTimer = null; W.ShowcaseManager?.openColorPicker?.(null, k); }, 600); }, {passive: true});
      iconsBox.addEventListener('touchmove', () => { isDrag = true; if(tTimer) clearTimeout(tTimer); }, {passive: true});
      iconsBox.addEventListener('touchend', () => { if(tTimer) clearTimeout(tTimer); });
      iconsBox.addEventListener('contextmenu', e => { const k = e.target.closest('.album-icon')?.dataset.album; if (k && !k.startsWith('__')) { e.preventDefault(); W.ShowcaseManager?.openColorPicker?.(null, k); } });
      iconsBox.addEventListener('click', e => {
        if (isDrag) return; const k = e.target.closest('.album-icon')?.dataset.album; if (!k) return;
        if (this.curr === k && !k.startsWith('__')) { this.galVis = !this.galVis; const w = $('cover-wrap'); if (w) w.style.display = this.galVis ? '' : 'none'; W.NotificationSystem?.info(this.galVis ? '🖼️ Галерея показана' : '🚫 Галерея скрыта'); } 
        else this.loadAlbum(k);
      });
    }

    $('track-list')?.addEventListener('click', e => {
      W.playerCore?.prepareContext?.();
      if (this.curr === FAV || e.target.closest('.offline-ind')) return;
      const trk = e.target.closest('.track'); if (!trk) return;
      const aKey = toStr(trk.dataset.album).trim(), uid = toStr(trk.dataset.uid).trim(), pc = W.playerCore;
      if (!aKey || aKey.startsWith('__')) return;

      const star = e.target.closest('.like-star');
      if (star && uid && pc) {
        e.preventDefault(); e.stopPropagation();
        setFavoriteStarState(star, !pc.isFavorite(uid)); star.classList.add('animating'); setTimeout(() => star.classList.remove('animating'), 320);
        pc.toggleFavorite(uid, { fromAlbum: true, albumKey: aKey }); return;
      }

      const data = this.cache.get(aKey); if (!data || !pc) return;
      this.playing = aKey;
      if (!data._pTracks) data._pTracks = data.tracks.filter(t => t.src).map(t => ({ src: t.src, sources: t.sources, title: t.title, artist: data.artist, album: data.title, cover: this.covers.get(aKey) || LOGO, uid: t.uid, lyrics: t.lyrics, fulltext: t.fulltext, hasLyrics: t.hasLyrics, sourceAlbum: aKey }));
      
      const pIdx = data._pTracks.findIndex(t => t.uid === uid); if (pIdx === -1) return;

      const gate = canLaunchTrackInFavoritesOnlyContext({ uid, albumKey: aKey });
      if (!gate.ok && localStorage.getItem('favoritesOnlyMode') === '1') {
        const tr = data._pTracks[pIdx];
        return W.Modals?.choice?.({
          title: 'Режим только избранные',
          textHtml: `Плеер работает в режиме <b>только избранные</b>.<br><br><b>${escHtml(tr.title)}</b> не отмечен ⭐.<br><br>Выберите действие:`,
          actions: [
            {
              key: 'disable',
              text: 'Отключить F и воспроизвести',
              primary: true,
              onClick: () => {
                localStorage.setItem('favoritesOnlyMode', '0');
                pc.playExactFromPlaylist?.(data._pTracks, uid, { dir: 1 });
                pc.applyFavoritesOnlyFilter?.({ autoPlayIfNeeded: true });
                this.highlightCurrentTrack(pIdx, { uid, albumKey: aKey });
                W.PlayerUI?.ensurePlayerBlock?.(pIdx, { userInitiated: true });
              }
            },
            {
              key: 'add',
              text: 'Добавить ⭐ и играть в F',
              onClick: () => {
                pc.toggleFavorite(uid, { fromAlbum: true, albumKey: aKey });
                pc.playExactFromPlaylist?.(data._pTracks, uid, { dir: 1 });
                pc.applyFavoritesOnlyFilter?.({ autoPlayIfNeeded: true });
                this.highlightCurrentTrack(pIdx, { uid, albumKey: aKey });
                W.PlayerUI?.ensurePlayerBlock?.(pIdx, { userInitiated: true });
              }
            },
            { key: 'cancel', text: 'Отмена', onClick: () => {} }
          ]
        });
      }

      if (!pc.playExactFromPlaylist?.(data._pTracks, uid, { dir: 1 })) return;
      pc.applyFavoritesOnlyFilter?.({ autoPlayIfNeeded: true });
      this.highlightCurrentTrack(pIdx, { uid, albumKey: aKey });
      W.PlayerUI?.ensurePlayerBlock?.(pIdx, { userInitiated: true });
    });

    W.playerCore?.onFavoritesChanged(d => D.querySelectorAll(d?.albumKey ? `.like-star[data-album="${CSS.escape(d.albumKey)}"][data-uid="${CSS.escape(d.uid)}"]` : `.like-star[data-uid="${CSS.escape(d?.uid)}"]`).forEach(el => setFavoriteStarState(el, !!d?.liked)));
  }

  async loadAlbum(key) {
    if (this.loading) return; this.loading = true; this.galVis = true;
    try {
      const tList = $('track-list'); if (tList) tList.innerHTML = '';
      $('social-links').innerHTML = ''; W.GalleryManager?.clear?.();

      const sp = { [FAV]: 'loadFavoritesAlbum', [NEWS]: 'loadNewsAlbum', [SHOWCASE]: 'loadShowcaseAlbum', [PROFILE]: 'loadProfileAlbum' };
      if (sp[key]) { await (await import('./albums/specials.js'))[sp[key]](this); } 
      else {
        if (this.cache.has(key)) delete this.cache.get(key)._pTracks;
        await W.TrackRegistry?.ensurePopulated?.();
        let d = this.cache.get(key);
        if (!d) {
          const cfg = W.TrackRegistry.getAlbumConfig(key); if (!cfg) throw new Error(`Album ${key} missing`);
          this.cache.set(key, d = { ...cfg, tracks: W.TrackRegistry.getTracksForAlbum(key) });
        }
        
        await W.GalleryManager?.loadGallery?.(key); this.covers.set(key, await W.GalleryManager?.getFirstCoverUrl?.(key) || LOGO);
        const cSlot = $('cover-slot'); if (cSlot && W.GalleryManager?.getItemsCount?.() <= 0) cSlot.innerHTML = `<img src="${LOGO}" alt="Cover">`;
        $('cover-wrap').style.display = ''; this.renderAlbumTitle(d.title);
        $('social-links').innerHTML = (d.links || []).filter(l => l.url).map(l => `<a href="${l.url}" target="_blank" rel="noopener noreferrer">${l.label}</a>`).join('');
        
        if (tList) {
          tList.innerHTML = d.tracks.map((t, i) => `<div class="track" id="trk${i}" data-index="${i}" data-album="${escHtml(key)}" data-uid="${escHtml(t.uid)}"><div class="tnum">${String(t.num).padStart(2,'0')}.</div><div class="track-title">${escHtml(t.title)}</div>${renderFavoriteStar(!!(t.uid && W.playerCore?.isFavorite?.(t.uid)), `data-album="${escHtml(key)}" data-uid="${escHtml(t.uid)}"` )}</div>`).join('');
          tList.querySelectorAll('.track[data-uid]').forEach(el => injectIndicator(el));
        }
        W.PlayerUI?.updateMiniHeader?.();
      }
      this.curr = key; localStorage.setItem('currentAlbum', key);
      D.body.classList.toggle('news-view', key === NEWS);
      D.querySelectorAll('.album-icon').forEach(el => el.classList.toggle('active', el.dataset.album === key));
      $('track-list')?.classList.remove('filtered'); W.PlayerUI?.switchAlbumInstantly?.(key);
    } catch (e) { console.error('[AlbumsManager] Ошибка:', e); W.NotificationSystem?.error('Ошибка загрузки'); } 
    finally { this.loading = false; }
  }

  highlightCurrentTrack(i, { uid, albumKey } = {}) {
    D.querySelectorAll('.track.current').forEach(n => n.classList.remove('current'));
    if (W.Utils?.isShowcaseContext?.(this.curr) && uid) return D.querySelectorAll(`[data-uid="${CSS.escape(uid)}"]`).forEach(el => el.classList.add('current'));
    const sel = (this.curr === FAV && uid && albumKey) ? `.track[data-album="${CSS.escape(albumKey)}"][data-uid="${CSS.escape(uid)}"]` : (uid ? `.track[data-uid="${CSS.escape(uid)}"]` : (i >= 0 ? `.track[data-index="${i}"]` : null));
    if (sel) D.querySelector(sel)?.classList.add('current');
  }

  getCurrentAlbum() { return this.curr; } getPlayingAlbum() { return this.playing; } setPlayingAlbum(k) { this.playing = k; }
  getPlayingAlbumTracks() { if (W.Utils?.isShowcaseContext?.(this.playing)) return W.ShowcaseManager?.getActiveListTracks?.() || []; const d = this.cache.get(this.playing); return d ? (d._pTracks || d.tracks) : []; }
  renderAlbumTitle(t, mod) { const el = $('active-album-title'); if(el) { el.textContent = t; el.className = `active-album-title ${mod||''}`; } }
}
W.AlbumsManager = new AlbumsManager(); export default W.AlbumsManager;
