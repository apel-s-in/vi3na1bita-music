// UID.002_(UID-first core)_(сохранить AlbumsManager как контентный навигатор по uid-трекам)_(album shell не должен брать на себя semantic/recommendation ownership)
// UID.017_(Launch source stats)_(подготовить точку фиксации запуска из album view)_(future analytics/recs слой сможет читать source=album именно отсюда)
// UID.019_(Compact TrackProfile index)_(дать будущим album-row/card enhancements опору)_(album screen сможет читать preview profile через TrackRegistry/Intel bridge без загрузки full profile)
// UID.041_(Showcase semantic filters)_(развести обычный album UI и semantic showcase)_(albums.js не должен превращаться в semantic browser)
// UID.094_(No-paralysis rule)_(обычные альбомы обязаны работать без intel-слоя)_(любой semantic enhancement на строке трека только optional)
import { injectIndicator } from '../ui/offline-indicators.js';
import { renderFavoriteStar, setFavoriteStarState } from '../ui/icon-utils.js';
import { makeFavoritesOnlyAfterPlay, playWithFavoritesOnlyResolution } from './player/favorites-only-actions.js';

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
      if (it.key === PROFILE) {
        const l = W.achievementEngine?.profile?.level || '-';
        const x = W.achievementEngine?.profile?.xp !== undefined ? `${W.achievementEngine.profile.xp} XP` : '...';
        return `<div class="album-icon profile-dyn-icon" data-album="${it.key}" data-akey="${it.key}" title="${escHtml(it.title)}"><span class="pg-lvl-val" id="pg-lvl-val">${l}</span><div class="pg-xp-cur" id="pg-xp-cur">${x}</div></div>`;
      }
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

      const afterPlay = makeFavoritesOnlyAfterPlay({
        highlight: (i, meta) => this.highlightCurrentTrack(i, meta),
        ensureBlock: (i, o) => W.PlayerUI?.ensurePlayerBlock?.(i, o)
      });
      return playWithFavoritesOnlyResolution({
        list: data._pTracks,
        uid,
        albumKey: aKey,
        track: data._pTracks[pIdx],
        play: (list, trackUid) => pc.playExactFromPlaylist?.(list, trackUid, { dir: 1 }),
        addFavorite: trackUid => pc.toggleFavorite(trackUid, { fromAlbum: true, albumKey: aKey }),
        disableMode: () => localStorage.setItem('favoritesOnlyMode', '0'),
        afterPlay: () => afterPlay({ index: pIdx, uid, albumKey: aKey })
      });
    });

    W.playerCore?.onFavoritesChanged(d => D.querySelectorAll(d?.albumKey ? `.like-star[data-album="${CSS.escape(d.albumKey)}"][data-uid="${CSS.escape(d.uid)}"]` : `.like-star[data-uid="${CSS.escape(d?.uid)}"]`).forEach(el => setFavoriteStarState(el, !!d?.liked)));
  }

  async loadAlbum(key) {
    if (this.loading) return;
    this.loading = true;
    this.galVis = true;
    try {
      D.body.classList.toggle('profile-view', key === PROFILE);

      const tList = $('track-list');
      const social = $('social-links');
      if (tList) tList.innerHTML = '';
      if (social) social.innerHTML = '';
      W.GalleryManager?.clear?.();

      const sp = { [FAV]: 'loadFavoritesAlbum', [NEWS]: 'loadNewsAlbum', [SHOWCASE]: 'loadShowcaseAlbum', [PROFILE]: 'loadProfileAlbum' };
      if (sp[key]) {
        const mod = await import('./albums/specials.js');
        const fn = mod?.[sp[key]];
        if (typeof fn !== 'function') throw new Error(`Special loader missing: ${sp[key]}`);
        await fn(this);
      } else {
        if (this.cache.has(key)) delete this.cache.get(key)._pTracks;

        await W.TrackRegistry?.ensurePopulated?.();
        let d = this.cache.get(key);
        if (!d) {
          const cfg = W.TrackRegistry?.getAlbumConfig?.(key);
          if (!cfg) throw new Error(`Album ${key} missing`);
          this.cache.set(key, d = { ...cfg, tracks: W.TrackRegistry?.getTracksForAlbum?.(key) || [] });
        }

        await W.GalleryManager?.loadGallery?.(key);
        this.covers.set(key, await W.GalleryManager?.getFirstCoverUrl?.(key) || LOGO);

        const cSlot = $('cover-slot');
        if (cSlot && (W.GalleryManager?.getItemsCount?.() || 0) <= 0) cSlot.innerHTML = `<img src="${LOGO}" alt="Cover">`;

        const coverWrap = $('cover-wrap');
        if (coverWrap) coverWrap.style.display = '';

        this.renderAlbumTitle(d?.title || '—');

        if (social) {
          social.innerHTML = ((d?.links || []).filter(l => l?.url)).map(l => `<a href="${l.url}" target="_blank" rel="noopener noreferrer">${l.label}</a>`).join('');
        }

        if (tList) {
          const tracks = Array.isArray(d?.tracks) ? d.tracks : [];
          tList.innerHTML = tracks.map((t, i) => `<div class="track" id="trk${i}" data-index="${i}" data-album="${escHtml(key)}" data-uid="${escHtml(t?.uid)}"><div class="tnum">${String(t?.num ?? i + 1).padStart(2,'0')}.</div><div class="track-title">${escHtml(t?.title || 'Без названия')}</div>${renderFavoriteStar(!!(t?.uid && W.playerCore?.isFavorite?.(t.uid)), `data-album="${escHtml(key)}" data-uid="${escHtml(t?.uid)}"` )}</div>`).join('');
          tList.querySelectorAll('.track[data-uid]').forEach(el => injectIndicator(el));
        }

        this.highlightCurrentTrack();
        W.PlayerUI?.updateMiniHeader?.();
      }

      this.curr = key;
      localStorage.setItem('currentAlbum', key);

      D.body.classList.toggle('news-view', key === NEWS);
      D.querySelectorAll('.album-icon').forEach(el => el.classList.toggle('active', el.dataset.album === key));

      if (tList) tList.classList.remove('filtered');

      W.PlayerUI?.switchAlbumInstantly?.(key);
      W.FavoritesOnlyActions?.syncFavoritesOnlyUiFrame?.();
    } catch (e) {
      console.error('[AlbumsManager] Ошибка:', e);
      W.NotificationSystem?.error('Ошибка загрузки');
    } finally {
      this.loading = false;
    }
  }

  highlightCurrentTrack() {
    D.querySelectorAll('.current').forEach(n => {
      if (['track','showcase-track','profile-list-item','sm-top-row'].some(c => n.classList.contains(c)) || n.tagName === 'LI') n.classList.remove('current');
    });
    const u = W.playerCore?.getCurrentTrackUid?.();
    if (u) D.querySelectorAll(`[data-uid="${CSS.escape(u)}"]`).forEach(el => {
      if (['track','showcase-track','profile-list-item','sm-top-row'].some(c => el.classList.contains(c)) || el.tagName === 'LI') el.classList.add('current');
    });
  }

  getCurrentAlbum() { return this.curr; } getPlayingAlbum() { return this.playing; } setPlayingAlbum(k) { this.playing = k; }
  getPlayingAlbumTracks() { return W.PlaybackContextSource?.getSourcePlaylistForContext?.(this.playing) || []; }
  getAlbumSourcePlaylist(key) { return W.PlaybackContextSource?.getSourcePlaylistForContext?.(key) || []; }
  renderAlbumTitle(t, mod) { const el = $('active-album-title'); if(el) { el.textContent = t; el.className = `active-album-title ${mod||''}`; } }
}
W.AlbumsManager = new AlbumsManager(); export default W.AlbumsManager;
