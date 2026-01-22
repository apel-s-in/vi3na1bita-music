// scripts/app/albums.js
const APP_CONFIG = window.APP_CONFIG;

import { registerTrack } from './track-registry.js';
import { $, toStr, escHtml, isMobileUA } from './utils/app-utils.js';
import { renderFavoritesList, renderFavoritesEmpty, bindFavoritesList } from '../ui/favorites-view.js';
import { loadAndRenderNewsInline } from '../ui/news-inline.js';

const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__';

const STAR_ON = 'img/star.png';
const STAR_OFF = 'img/star2.png';
const LOGO = 'img/logo.png';

function setStar(img, liked) {
  if (!img) return;
  try { img.src = liked ? STAR_ON : STAR_OFF; } catch {}
}

function firstUrl(base, rel) {
  return rel ? new URL(rel, base).toString() : null;
}

function normalizeSocials(raw) {
  if (Array.isArray(raw?.social_links)) return raw.social_links;
  if (Array.isArray(raw?.socials)) return raw.socials.map((s) => ({ label: s?.title, url: s?.url }));
  return [];
}

function buildAlbumIconSrc(baseIcon, isMobile) {
  const p1 = isMobile
    ? baseIcon.replace(/icon_album\/(.+)\.png$/i, 'icon_album/mobile/$1@1x.jpg')
    : baseIcon.replace(/\.png$/i, '@1x.png');
  const p2 = isMobile ? p1.replace(/@1x\.jpg$/i, '@2x.jpg') : p1.replace(/@1x\.png$/i, '@2x.png');
  return { p1, p2 };
}

function normalizeTracks(tracks, base, albumKey) {
  const out = [];

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i] || {};

    const fileHi = firstUrl(base, t.audio);
    const fileLo = firstUrl(base, t.audio_low);

    const lyrics = firstUrl(base, t.lyrics) || firstUrl(base, t.lrc);
    const fulltext = firstUrl(base, t.fulltext);

    const uid = typeof t.uid === 'string' && t.uid.trim() ? t.uid.trim() : null;

    const sizeHi = typeof t.size === 'number' ? t.size : null;
    const sizeLo = typeof t.size_low === 'number' ? t.size_low : null;

    const hasLyrics = typeof t.hasLyrics === 'boolean' ? t.hasLyrics : !!lyrics;
    const sources = fileHi || fileLo ? { audio: { hi: fileHi, lo: fileLo } } : null;

    const tr = {
      num: i + 1,
      title: t.title || `Трек ${i + 1}`,

      // back-compat:
      file: fileHi,

      fileHi,
      fileLo,
      sizeHi,
      sizeLo,
      sources,

      lyrics,
      fulltext,
      uid,
      hasLyrics,
    };

    out.push(tr);

    if (uid) {
      try {
        registerTrack({
          uid,
          title: tr.title,
          audio: tr.fileHi || tr.file || null,
          audio_low: tr.fileLo || null,
          size: tr.sizeHi || null,
          size_low: tr.sizeLo || null,
          lyrics: tr.lyrics || null,
          fulltext: tr.fulltext || null,
          sourceAlbum: albumKey,
        });
      } catch {}
    }
  }

  return out;
}

class AlbumsManager {
  constructor() {
    this.currentAlbum = null;
    this.playingAlbum = null;

    this.albumsData = new Map();
    this.albumCoverUrlCache = new Map();

    // cache для стабильных вычислений на кликах
    // albumKey -> { tracksForCore, uidToIndex }
    this._corePlaylistCache = new Map();

    this.isLoading = false;
    this.isGalleryVisible = true;

    this._favSyncBound = false;
    this._favoritesViewBound = false;
  }

  async initialize() {
    await this._ensureAlbumsIndexReady();
    if (!Array.isArray(window.albumsIndex) || window.albumsIndex.length === 0) return;

    this.renderAlbumIcons();
    this._bindFavoritesAlbumSync();

    const key = localStorage.getItem('currentAlbum') || this._pickDefaultAlbumKey();
    if (key) await this.loadAlbum(key);
  }

  async _ensureAlbumsIndexReady() {
    if ((!Array.isArray(window.albumsIndex) || window.albumsIndex.length === 0) && window.Utils?.onceEvent) {
      try { await window.Utils.onceEvent(window, 'albumsIndex:ready', { timeoutMs: 8000 }); } catch {}
    }
    if (!Array.isArray(window.albumsIndex) || window.albumsIndex.length === 0) {
      console.error('❌ No albums found (albumsIndex is empty)');
    }
  }

  _pickDefaultAlbumKey() {
    const order = Array.isArray(APP_CONFIG?.ICON_ALBUMS_ORDER) ? APP_CONFIG.ICON_ALBUMS_ORDER : [];
    const keys = order.map((x) => x?.key).filter(Boolean);
    const idx = Array.isArray(window.albumsIndex) ? window.albumsIndex : [];

    const firstRegular = keys.find((k) => !toStr(k).startsWith('__') && idx.some((a) => a.key === k));
    return firstRegular || idx?.[0]?.key || null;
  }

  _bindFavoritesAlbumSync() {
    if (this._favSyncBound) return;
    this._favSyncBound = true;

    const pc = window.playerCore;
    if (!pc?.onFavoritesChanged) return;

    pc.onFavoritesChanged((d) => {
      const a = toStr(d?.albumKey).trim();
      const u = toStr(d?.uid).trim();
      if (!a || !u) return;

      const liked = !!d?.liked;
      const sel = `.like-star[data-album="${CSS.escape(a)}"][data-uid="${CSS.escape(u)}"]`;
      document.querySelectorAll(sel).forEach((img) => setStar(img, liked));
    });
  }

  renderAlbumIcons() {
    const container = $('album-icons');
    if (!container) return;

    container.innerHTML = '';

    const isMobile = isMobileUA();
    const order = Array.isArray(APP_CONFIG?.ICON_ALBUMS_ORDER) ? APP_CONFIG.ICON_ALBUMS_ORDER : [];
    const idx = Array.isArray(window.albumsIndex) ? window.albumsIndex : [];

    for (const it of order) {
      const key = it?.key;
      if (!key) continue;
      if (!toStr(key).startsWith('__') && !idx.some((a) => a.key === key)) continue;

      const title = it?.title || '';
      const baseIcon = it?.icon || LOGO;
      const { p1, p2 } = buildAlbumIconSrc(baseIcon, isMobile);

      const el = document.createElement('div');
      el.className = 'album-icon';
      el.dataset.album = key;
      el.dataset.akey = key;
      el.title = title;
      el.innerHTML = `<img src="${p1}" srcset="${p2} 2x" alt="${escHtml(title)}" draggable="false" loading="lazy" width="60" height="60">`;

      const onActivate = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleAlbumIconClick(key);
      };

      el.addEventListener('click', onActivate);
      el.addEventListener('pointerup', onActivate, { passive: false });

      container.appendChild(el);
    }
  }

  async handleAlbumIconClick(albumKey) {
    if (this.currentAlbum === albumKey && !toStr(albumKey).startsWith('__')) {
      this.toggleGalleryVisibility();
      return;
    }
    await this.loadAlbum(albumKey);
  }

  toggleGalleryVisibility() {
    this.isGalleryVisible = !this.isGalleryVisible;
    const coverWrap = $('cover-wrap');
    if (coverWrap) coverWrap.style.display = this.isGalleryVisible ? '' : 'none';
    window.NotificationSystem?.info(this.isGalleryVisible ? '🖼️ Галерея показана' : '🚫 Галерея скрыта');
  }

  async loadAlbum(albumKey) {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      this.isGalleryVisible = true;
      this.clearUI();

      if (albumKey === FAV) await this.loadFavoritesAlbum();
      else if (albumKey === NEWS) await this.loadNewsAlbum();
      else await this.loadRegularAlbum(albumKey);

      this.currentAlbum = albumKey;
      this.updateActiveIcon(albumKey);
      localStorage.setItem('currentAlbum', albumKey);

      $('track-list')?.classList.remove('filtered');

      window.PlayerUI?.switchAlbumInstantly?.(albumKey);
      window.PlayerState?.save?.();
    } catch (e) {
      console.error('❌ Failed to load album:', e);
      window.NotificationSystem?.error('Ошибка загрузки альбома');
    } finally {
      this.isLoading = false;
    }
  }

  async loadRegularAlbum(albumKey) {
    const albumInfo = window.albumsIndex?.find((a) => a.key === albumKey);
    if (!albumInfo) throw new Error(`Album ${albumKey} not found`);

    let albumData = this.albumsData.get(albumKey);
    if (!albumData) {
      const base = albumInfo.base.endsWith('/') ? albumInfo.base : `${albumInfo.base}/`;

      const res = await fetch(`${base}config.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Failed to load config.json for ${albumKey}: HTTP ${res.status}`);

      const raw = (await res.json()) || {};
      const tracksRaw = Array.isArray(raw.tracks) ? raw.tracks : [];

      albumData = {
        title: raw.albumName || albumInfo.title,
        artist: raw.artist || 'Витрина Разбита',
        cover: raw.cover || 'cover.jpg',
        social_links: normalizeSocials(raw),
        tracks: normalizeTracks(tracksRaw, base, albumKey),
      };

      this.albumsData.set(albumKey, albumData);
      this._corePlaylistCache.delete(albumKey);
    }

    await this.loadGallery(albumKey);

    try {
      const url = await window.GalleryManager?.getFirstCoverUrl?.(albumKey);
      this.albumCoverUrlCache.set(albumKey, url || LOGO);
    } catch {
      this.albumCoverUrlCache.set(albumKey, LOGO);
    }

    try {
      const count = window.GalleryManager?.getItemsCount?.() || 0;
      if (count <= 0) {
        const slot = $('cover-slot');
        if (slot) slot.innerHTML = `<img src="${LOGO}" alt="Обложка" draggable="false" loading="lazy">`;
      }
    } catch {}

    this.renderAlbumTitle(albumData.title || albumInfo.title);
    this.renderSocials(albumData.social_links);
    this.renderTrackList(albumData.tracks, albumInfo);

    window.PlayerUI?.updateMiniHeader?.();
    window.PlayerUI?.updateNextUpLabel?.();

    const coverWrap = $('cover-wrap');
    if (coverWrap) coverWrap.style.display = '';
  }

  async loadGallery(albumKey) {
    await window.GalleryManager?.loadGallery?.(albumKey);
  }

  _getTracksForCore(albumKey, albumData) {
    const cached = this._corePlaylistCache.get(albumKey);
    if (cached?.tracksForCore?.length && cached?.uidToIndex) return cached;

    const coverUrl = this.albumCoverUrlCache.get(albumKey) || LOGO;

    const tracksForCore = (Array.isArray(albumData?.tracks) ? albumData.tracks : [])
      .filter((t) => t && (t.fileHi || t.file || t.fileLo))
      .map((t) => ({
        src: t.fileHi || t.file || t.fileLo,
        sources: t.sources || null,
        title: t.title,
        artist: albumData.artist || 'Витрина Разбита',
        album: albumKey,
        cover: coverUrl,
        lyrics: t.lyrics || null,
        fulltext: t.fulltext || null,
        uid: typeof t.uid === 'string' && t.uid.trim() ? t.uid.trim() : null,
        hasLyrics: t.hasLyrics,
      }))
      .filter((t) => !!t.uid && !!t.src);

    const uidToIndex = new Map();
    tracksForCore.forEach((t, i) => uidToIndex.set(String(t.uid), i));

    const pack = { tracksForCore, uidToIndex };
    this._corePlaylistCache.set(albumKey, pack);
    return pack;
  }

  async loadFavoritesAlbum() {
    this.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');

    const coverWrap = $('cover-wrap');
    if (coverWrap) coverWrap.style.display = 'none';

    const container = $('track-list');
    if (!container) return;

    const getModel = () => {
      const m = window.FavoritesUI?.getModel?.();
      if (Array.isArray(m)) return m;
      return Array.isArray(window.favoritesRefsModel) ? window.favoritesRefsModel : [];
    };

    const rebuild = async () => {
      try { await window.FavoritesUI?.buildFavoritesRefsModel?.(); } catch {}
      const model = getModel();
      if (!model.length) renderFavoritesEmpty(container);
      else renderFavoritesList(container, model);
    };

    if (!this._favoritesViewBound) {
      this._favoritesViewBound = true;

      bindFavoritesList(container, {
        getModel,

        onStarClick: ({ uid, albumKey }) => {
          window.playerCore?.toggleFavorite?.(uid, { fromAlbum: false, albumKey });
        },

        onActiveRowClick: async ({ uid, albumKey }) => {
          const model = getModel();
          const active = model.filter((it) => it && it.__active && it.audio);

          const activeIndex = active.findIndex(
            (it) => String(it?.__uid || '').trim() === uid && String(it?.__a || '').trim() === albumKey
          );

          if (activeIndex >= 0) await this.ensureFavoritesPlayback(activeIndex);
        },

        onInactiveRowClick: ({ uid, title }) => {
          window.playerCore?.showInactiveFavoriteModal?.({
            uid,
            title,
            onDeleted: async () => window.PlayerUI?.updateAvailableTracksForPlayback?.(),
          });
        },
      });

      const pc = window.playerCore;
      if (pc?.onFavoritesChanged) {
        pc.onFavoritesChanged(async () => {
          if (this.currentAlbum !== FAV) return;
          await rebuild();
          window.PlayerUI?.updateAvailableTracksForPlayback?.();
          window.PlayerUI?.ensurePlayerBlock?.(-1);
        });
      }
    }

    await rebuild();
  }

  async ensureFavoritesPlayback(activeIndex) {
    let model = null;
    try { model = window.FavoritesUI?.getModel?.(); } catch {}
    if (!Array.isArray(model)) model = window.favoritesRefsModel;

    const list = Array.isArray(model) ? model : [];
    if (!list.length) return void window.NotificationSystem?.warning('Нет избранных треков');

    const active = list.filter((it) => it && it.__active && it.audio);
    if (!active.length) return void window.NotificationSystem?.warning('Нет доступных треков');

    const startIndex = Number.isFinite(activeIndex) && activeIndex >= 0 ? activeIndex : 0;
    const clicked = active[startIndex] || active[0];

    const tracks = active.map((it) => ({
      src: it.audio,
      sources: it.sources || null,
      title: it.title,
      artist: it.__artist || 'Витрина Разбита',
      album: FAV,
      cover: it.__cover || LOGO,
      lyrics: it.lyrics || null,
      fulltext: it.fulltext || null,
      uid: typeof it.__uid === 'string' && it.__uid.trim() ? it.__uid.trim() : null,
      sourceAlbum: it.__a,
      hasLyrics: it.hasLyrics,
    })).filter((t) => !!t.uid && !!t.src);

    if (!tracks.length) return void window.NotificationSystem?.warning('Нет доступных треков');

    window.playerCore.setPlaylist(
      tracks,
      startIndex,
      { artist: 'Витрина Разбита', album: 'Избранное', cover: LOGO },
      { preservePosition: false }
    );

    window.playerCore.play(startIndex);

    this.setPlayingAlbum(FAV);

    const cu = toStr(clicked?.__uid).trim();
    const ca = toStr(clicked?.__a).trim();
    this.highlightCurrentTrack(-1, { uid: cu, albumKey: ca });

    window.PlayerUI?.ensurePlayerBlock?.(startIndex, { userInitiated: true });
    window.PlayerUI?.updateAvailableTracksForPlayback?.();
  }

  async loadNewsAlbum() {
    this.renderAlbumTitle('📰 НОВОСТИ 📰', 'news');
    await this.loadGallery(NEWS);

    const coverWrap = $('cover-wrap');
    if (coverWrap) coverWrap.style.display = '';

    const container = $('track-list');
    if (!container) return;

    await loadAndRenderNewsInline(container);
  }

  renderAlbumTitle(title, modifier = '') {
    const el = $('active-album-title');
    if (!el) return;
    el.textContent = title;
    el.className = 'active-album-title';
    if (modifier) el.classList.add(modifier);
  }

  renderSocials(links) {
    const container = $('social-links');
    if (!container) return;

    container.innerHTML = '';

    const normalized = Array.isArray(links)
      ? links.map((l) => ({ label: l?.label || l?.title || 'Ссылка', url: l?.url })).filter((l) => !!l.url)
      : [];

    for (const link of normalized) {
      const a = document.createElement('a');
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = link.label;
      container.appendChild(a);
    }
  }

  renderTrackList(tracks, albumInfo) {
    const container = $('track-list');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 0; i < tracks.length; i++) {
      container.appendChild(this.createTrackElement(tracks[i], albumInfo.key, i));
    }
  }

  createTrackElement(track, albumKey, index) {
    const el = document.createElement('div');
    el.className = 'track';
    el.id = `trk${index}`;
    el.dataset.index = String(index);
    el.dataset.album = albumKey;

    const uid = typeof track?.uid === 'string' && track.uid.trim() ? track.uid.trim() : '';
    el.dataset.uid = uid;

    const liked = window.playerCore?.isFavorite?.(uid) || false;
    const numText = `${String(track?.num || index + 1).padStart(2, '0')}.`;

    el.innerHTML = `
      <div class="tnum">${numText}</div>
      <div class="track-title">${toStr(track?.title || '')}</div>
      <img src="${liked ? STAR_ON : STAR_OFF}"
           class="like-star"
           alt="звезда"
           data-album="${albumKey}"
           data-uid="${uid}">
    `;

    el.addEventListener('click', (e) => {
      if (e.target?.classList?.contains('like-star')) return;

      const albumData = this.albumsData.get(albumKey);
      if (!albumData || !window.playerCore) {
        this.highlightCurrentTrack(index);
        window.NotificationSystem?.error('Альбом ещё не готов к воспроизведению');
        return;
      }

      const { tracksForCore, uidToIndex } = this._getTracksForCore(albumKey, albumData);
      const playIndex = uidToIndex.get(uid);

      if (!Number.isFinite(playIndex)) {
        window.NotificationSystem?.warning('Трек недоступен для воспроизведения');
        return;
      }

      const snapshot = window.playerCore.getPlaylistSnapshot?.() || [];
      const needsNew =
        snapshot.length !== tracksForCore.length ||
        snapshot.some((t, i) => String(t?.uid || '').trim() !== String(tracksForCore[i]?.uid || '').trim());

      if (needsNew) {
        const coverUrl = this.albumCoverUrlCache.get(albumKey) || LOGO;

        window.playerCore.setPlaylist(
          tracksForCore,
          playIndex,
          {
            artist: albumData.artist || 'Витрина Разбита',
            album: albumData.title || '',
            cover: coverUrl,
          },
          { preservePosition: false }
        );
      }

      this.highlightCurrentTrack(index);
      window.playerCore.play(playIndex);

      this.setPlayingAlbum(albumKey);
      window.PlayerUI?.ensurePlayerBlock?.(index, { userInitiated: true });
    });

    const star = el.querySelector('.like-star');
    star?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const trackUid = toStr(star.dataset.uid).trim();
      if (!trackUid) return void window.NotificationSystem?.warning('UID трека не найден в config.json');
      if (!window.playerCore?.toggleFavorite) return void window.NotificationSystem?.error('PlayerCore недоступен');

      const isLiked = !!window.playerCore?.isFavorite?.(trackUid);
      const next = !isLiked;

      setStar(star, next);
      star.classList.add('animating');
      setTimeout(() => star.classList.remove('animating'), 320);

      window.playerCore.toggleFavorite(trackUid, { fromAlbum: true, albumKey });
    });

    return el;
  }

  highlightCurrentTrack(index, opts = {}) {
    document.querySelectorAll('.track.current').forEach((n) => n.classList.remove('current'));

    const uid = toStr(opts?.uid).trim();
    const albumKey = toStr(opts?.albumKey).trim();

    if (this.currentAlbum === FAV && uid && albumKey) {
      const sel = `.track[data-album="${CSS.escape(albumKey)}"][data-uid="${CSS.escape(uid)}"]`;
      document.querySelector(sel)?.classList.add('current');
      return;
    }

    if (uid) {
      const sel = `.track[data-uid="${CSS.escape(uid)}"]`;
      document.querySelector(sel)?.classList.add('current');
      return;
    }

    if (!Number.isFinite(index) || index < 0) return;
    document.querySelector(`.track[data-index="${index}"]`)?.classList.add('current');
  }

  updateActiveIcon(albumKey) {
    document.querySelectorAll('.album-icon').forEach((icon) => {
      icon.classList.toggle('active', icon.dataset.album === albumKey);
    });
  }

  clearUI() {
    const tl = $('track-list');
    if (tl) tl.innerHTML = '';
    const sl = $('social-links');
    if (sl) sl.innerHTML = '';
    window.GalleryManager?.clear?.();
  }

  getCurrentAlbum() { return this.currentAlbum; }
  getPlayingAlbum() { return this.playingAlbum; }
  setPlayingAlbum(albumKey) { this.playingAlbum = albumKey || null; }

  getAlbumData(albumKey) { return this.albumsData.get(albumKey); }
  getAlbumConfigByKey(albumKey) { return this.albumsData.get(albumKey); }

  getTrackUid(_albumKey, trackUid) { return toStr(trackUid).trim() || null; }
}

window.AlbumsManager = new AlbumsManager();
export default AlbumsManager;
