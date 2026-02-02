// scripts/app/albums.js
const APP_CONFIG = window.APP_CONFIG;

import { $, toStr, escHtml, isMobileUA } from './utils/app-utils.js';
import { normalizeTracks, normalizeSocials } from './albums/loaders.js';
import {
  renderAlbumIcons as renderAlbumIconsUI,
  renderAlbumTitle as renderAlbumTitleUI,
  renderSocials as renderSocialsUI,
  renderTrackList as renderTrackListUI
} from './albums/render.js';
import { loadFavoritesAlbum, ensureFavoritesPlayback, loadNewsAlbum } from './albums/specials.js';

const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__';

const STAR_ON = 'img/star.png';
const STAR_OFF = 'img/star2.png';
const LOGO = 'img/logo.png';

function setStar(img, liked) {
  if (!img) return;
  try { img.src = liked ? STAR_ON : STAR_OFF; } catch {}
}

function buildAlbumIconSrc(baseIcon, isMobile) {
  const p1 = isMobile
    ? baseIcon.replace(/icon_album\/(.+)\.png$/i, 'icon_album/mobile/$1@1x.jpg')
    : baseIcon.replace(/\.png$/i, '@1x.png');
  const p2 = isMobile ? p1.replace(/@1x\.jpg$/i, '@2x.jpg') : p1.replace(/@1x\.png$/i, '@2x.png');
  return { p1, p2 };
}

class AlbumsManager {
  constructor() {
    this.currentAlbum = null;
    this.playingAlbum = null;

    this.albumsData = new Map();
    this.albumCoverUrlCache = new Map();

    // albumKey -> { tracksForCore, uidToIndex }
    this._corePlaylistCache = new Map();

    this.isLoading = false;
    this.isGalleryVisible = true;

    this._favSyncBound = false;
    this._favoritesViewBound = false;

    // Anti-double-play guard: предотвращает двойной запуск Howler при гонках UI (особенно в Избранном).
    this._favPlayGuard = { ts: 0 };

    // ✅ Один обработчик на треклист обычных альбомов (ускорение)
    this._trackListBound = false;
  }

  async initialize() {
    await this._ensureAlbumsIndexReady();
    if (!Array.isArray(window.albumsIndex) || window.albumsIndex.length === 0) return;

    this.renderAlbumIcons();
    this._bindFavoritesAlbumSync();
    this._bindRegularTrackListOnce();

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

  _bindRegularTrackListOnce() {
    if (this._trackListBound) return;
    this._trackListBound = true;

    const container = $('track-list');
    if (!container) return;

    container.addEventListener('click', async (e) => {
      const target = e.target;

      const row = target?.closest?.('.track');
      if (!row || !container.contains(row)) return;

      const albumKey = String(row.dataset.album || '').trim();
      const uid = String(row.dataset.uid || '').trim();
      const idx = Number(row.dataset.index);

      // В спец-альбомах (favorites/news) клики обрабатываются другими модулями
      if (!albumKey || albumKey.startsWith('__')) return;

      // ⭐ клик по звезде
      if (target?.classList?.contains('like-star')) {
        e.preventDefault();
        e.stopPropagation();

        if (!uid) return void window.NotificationSystem?.warning('UID трека не найден в config.json');
        if (!window.playerCore?.toggleFavorite) return void window.NotificationSystem?.error('PlayerCore недоступен');

        const isLiked = !!window.playerCore?.isFavorite?.(uid);
        const next = !isLiked;

        setStar(target, next);
        target.classList.add('animating');
        setTimeout(() => target.classList.remove('animating'), 320);

        try { await window.ensureTrackRegistryReadyForFavorites?.(); } catch {}
        window.playerCore.toggleFavorite(uid, { fromAlbum: true, albumKey });
        return;
      }

      // клик по строке
      const albumData = this.albumsData.get(albumKey);
      if (!albumData || !window.playerCore) {
        this.highlightCurrentTrack(Number.isFinite(idx) ? idx : -1);
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

      this.highlightCurrentTrack(Number.isFinite(idx) ? idx : -1);
      window.playerCore.play(playIndex);

      this.setPlayingAlbum(albumKey);
      window.PlayerUI?.ensurePlayerBlock?.(Number.isFinite(idx) ? idx : playIndex, { userInitiated: true });
    });
  }

  renderAlbumIcons() {
    const isMobile = isMobileUA();
    const order = Array.isArray(APP_CONFIG?.ICON_ALBUMS_ORDER) ? APP_CONFIG.ICON_ALBUMS_ORDER : [];
    const idx = Array.isArray(window.albumsIndex) ? window.albumsIndex : [];

    const items = [];

    for (const it of order) {
      const key = it?.key;
      if (!key) continue;
      if (!toStr(key).startsWith('__') && !idx.some((a) => a.key === key)) continue;

      const title = it?.title || '';
      const baseIcon = it?.icon || LOGO;
      const { p1, p2 } = buildAlbumIconSrc(baseIcon, isMobile);

      items.push({ key, title, icon: { p1, p2 } });
    }

    renderAlbumIconsUI(items, {
      onClick: (albumKey) => this.handleAlbumIconClick(albumKey),
    });
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

      // filtered (legacy) больше не используем; favonly-filtered управляется PlayerUI

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
    this.renderTrackList(albumData.tracks, albumInfo.key);

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
    return loadFavoritesAlbum(this);
  }

  async ensureFavoritesPlayback(activeIndex) {
    return ensureFavoritesPlayback(this, activeIndex);
  }

  async loadNewsAlbum() {
    return loadNewsAlbum(this);
  }

  renderAlbumTitle(title, modifier = '') {
    renderAlbumTitleUI(title, modifier);
  }

  renderSocials(links) {
    const normalized = Array.isArray(links)
      ? links.map((l) => ({ label: l?.label || l?.title || 'Ссылка', url: l?.url })).filter((l) => !!l.url)
      : [];
    renderSocialsUI(normalized);
  }

  renderTrackList(tracks, albumKey) {
    const list = Array.isArray(tracks) ? tracks : [];

    const rowTemplate = (t, i) => {
      const uid = typeof t?.uid === 'string' && t.uid.trim() ? t.uid.trim() : '';
      const liked = uid ? !!window.playerCore?.isFavorite?.(uid) : false;
      const numText = `${String(t?.num || i + 1).padStart(2, '0')}.`;
      const title = escHtml(toStr(t?.title || ''));

      return `
        <div class="track"
             id="trk${i}"
             data-index="${i}"
             data-album="${escHtml(albumKey)}"
             data-uid="${escHtml(uid)}">
          <div class="tnum">${numText}</div>
          <div class="track-title">${title}</div>
          <img src="${liked ? STAR_ON : STAR_OFF}"
               class="like-star"
               alt="звезда"
               data-album="${escHtml(albumKey)}"
               data-uid="${escHtml(uid)}">
        </div>
      `;
    };

    renderTrackListUI(list, { rowTemplate });
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
