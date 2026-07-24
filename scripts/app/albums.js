// UID.002_(UID-first core)_(сохранить AlbumsManager как контентный навигатор по uid-трекам)_(album shell не должен брать на себя semantic/recommendation ownership)
// UID.017_(Launch source stats)_(подготовить точку фиксации запуска из album view)_(future analytics/recs слой сможет читать source=album именно отсюда)
// UID.019_(Compact TrackProfile index)_(дать будущим album-row/card enhancements опору)_(album screen сможет читать preview profile через TrackRegistry/Intel bridge без загрузки full profile)
// UID.041_(Showcase semantic filters)_(развести обычный album UI и semantic showcase)_(albums.js не должен превращаться в semantic browser)
// UID.094_(No-paralysis rule)_(обычные альбомы обязаны работать без intel-слоя)_(любой semantic enhancement на строке трека только optional)
// UID.096_(Helper-first anti-duplication policy)_(рендер иконок вынесен в album-icons-renderer)_(AlbumsManager хранит только навигацию и загрузку контента)

import { setFavoriteStarState } from '../ui/icon-utils.js';
import { mountAlbumCarousel } from './albums/album-carousel.js';
import { renderAlbumIconRows } from './albums/album-icons-renderer.js';
import { renderAlbumTracks } from './albums/album-track-renderer.js';
import { clearAlbumPlaybackTracks } from './albums/album-playback-builder.js';
import { bindAlbumTrackActions } from './albums/album-track-actions.js';

const W = window;
const D = document;
const C = W.APP_CONFIG || {};
const {
  $ = id => D.getElementById(id),
  escHtml = value => String(value || ''),
  isMobileUA = () => false
} = W.AppUtils || {};

const FAV = W.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = W.SPECIAL_RELIZ_KEY || '__reliz__';
const SHOWCASE = W.SPECIAL_SHOWCASE_KEY || '__showcase__';
const SHARDS = C.SPECIAL_SHARDS_KEY || W.SPECIAL_SHARDS_KEY || '__shards__';
const PROFILE = C.SPECIAL_PROFILE_KEY || '__profile__';
const GAMES = C.SPECIAL_GAMES_KEY || W.SPECIAL_GAMES_KEY || '__games__';
const FRIENDS = C.SPECIAL_FRIENDS_KEY || W.SPECIAL_FRIENDS_KEY || '__friends__';
const LOGO = 'img/logo.png';
const GALLERY_VISIBLE_KEY = 'albumGalleryVisible:v1';

const SPECIAL_LOADERS = {
  [FAV]: 'loadFavoritesAlbum',
  [NEWS]: 'loadNewsAlbum',
  [SHOWCASE]: 'loadShowcaseAlbum',
  [SHARDS]: 'loadShardsAlbum',
  [PROFILE]: 'loadProfileAlbum',
  [GAMES]: 'loadGamesAlbum',
  [FRIENDS]: 'loadFriendsAlbum'
};

class AlbumsManager {
  curr = null;
  playing = null;
  cache = new Map();
  covers = new Map();
  loading = false;
  pendingAlbum = null;
  galVis = localStorage.getItem(GALLERY_VISIBLE_KEY) !== '0';
  albumCarousel = null;
  _eventsBound = false;

  async initialize() {
    if (!W.albumsIndex?.length) {
      try {
        await W.Utils?.onceEvent?.(W, 'albumsIndex:ready', { timeoutMs: 5000 });
      } catch {}
    }

    this._renderIcons();
    this._bindEvents();

    W.addEventListener('yandex:auth:changed', event => {
      this._renderIcons();

      if (
        event.detail?.status !== 'active' &&
        this.curr === SHARDS
      ) {
        this.loadAlbum(SHOWCASE);
      }
    });

    const defaultKey =
      C.ICON_ALBUMS_ORDER?.find(item => !item.key.startsWith('__'))?.key ||
      W.albumsIndex?.[0]?.key;
    const initialKey = localStorage.getItem('currentAlbum') || defaultKey;

    if (initialKey) await this.loadAlbum(initialKey);

    W.addEventListener('quality:changed', () => {
      this.cache.forEach(album => delete album._pTracks);
    });
  }

  _renderIcons() {
    const root = $('album-icons');
    if (!root) return;

    root.innerHTML = renderAlbumIconRows({
      config: C,
      albumsIndex: W.albumsIndex || [],
      mobile: isMobileUA(),
      profileKey: PROFILE,
      logo: LOGO,
      escapeHtml: escHtml
    });

    this.albumCarousel?.destroy?.();
    this.albumCarousel = mountAlbumCarousel({
      root: $('album-icons-albums'),
      onSettled: key => {
        const item = C.ICON_ALBUMS_ORDER?.find(entry => entry.key === key);
        if (item?.title) this.renderAlbumTitle(item.title);
        if (this.curr !== key) this.loadAlbum(key);
      }
    });
  }

  _bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;

    this._bindAlbumIconEvents();
    bindAlbumTrackActions({
      root: $('track-list'),
      getCurrentAlbum: () => this.curr,
      getAlbum: key => this.cache.get(key),
      getCover: key => this.covers.get(key),
      setPlayingAlbum: key => { this.playing = key; },
      highlightCurrentTrack: (index, meta) => this.highlightCurrentTrack(index, meta),
      logo: LOGO
    });

    W.playerCore?.onFavoritesChanged(detail => {
      const uid = String(detail?.uid || '').trim();
      if (!uid) return;

      const selector = detail?.albumKey
        ? `.like-star[data-album="${CSS.escape(detail.albumKey)}"][data-uid="${CSS.escape(uid)}"]`
        : `.like-star[data-uid="${CSS.escape(uid)}"]`;

      D.querySelectorAll(selector).forEach(element =>
        setFavoriteStarState(element, !!detail?.liked)
      );
    });
  }

  _bindAlbumIconEvents() {
    const root = $('album-icons');
    if (!root) return;

    let longPressTimer = 0;
    let suppressTouchClickUntil = 0;

    const cancelLongPress = () => {
      clearTimeout(longPressTimer);
      longPressTimer = 0;
    };

    root.addEventListener('touchstart', event => {
      const key = event.target.closest('.album-icon')?.dataset.album;
      if (!key || key.startsWith('__')) return;

      cancelLongPress();
      longPressTimer = setTimeout(() => {
        longPressTimer = 0;
        suppressTouchClickUntil = Date.now() + 450;
        W.ShowcaseManager?.openColorPicker?.(null, key);
      }, 600);
    }, { passive: true });

    root.addEventListener('touchmove', () => {
      suppressTouchClickUntil = Date.now() + 350;
      cancelLongPress();
    }, { passive: true });

    root.addEventListener('touchend', cancelLongPress, { passive: true });
    root.addEventListener('touchcancel', cancelLongPress, { passive: true });

    root.addEventListener('contextmenu', event => {
      const key = event.target.closest('.album-icon')?.dataset.album;
      if (!key || key.startsWith('__')) return;

      event.preventDefault();
      W.ShowcaseManager?.openColorPicker?.(null, key);
    });

    root.addEventListener('click', event => {
      if (Date.now() < suppressTouchClickUntil) return;

      const key = event.target.closest('.album-icon')?.dataset.album;
      if (!key) return;

      if (key.startsWith('__')) {
        this.albumCarousel?.cancelPendingSelection?.();
      }

      if (this.curr === key && !key.startsWith('__')) {
        this._toggleGalleryVisibility();
        return;
      }

      this.loadAlbum(key);
    });
  }

  _toggleGalleryVisibility() {
    this.galVis = !this.galVis;

    try {
      localStorage.setItem(GALLERY_VISIBLE_KEY, this.galVis ? '1' : '0');
    } catch {}

    const coverWrap = $('cover-wrap');
    if (coverWrap) coverWrap.style.display = this.galVis ? '' : 'none';

    W.NotificationSystem?.info(
      this.galVis ? '🖼️ Галерея показана' : '🚫 Галерея скрыта'
    );
  }

  async loadAlbum(key) {
    if (this.loading) {
      this.pendingAlbum = key;
      return false;
    }

    this.loading = true;

    if (String(key).startsWith('__')) {
      this.albumCarousel?.cancelPendingSelection?.();
    }

    try {
      this._prepareAlbumScreen(key);

      const trackList = $('track-list');
      const socialLinks = $('social-links');

      if (SPECIAL_LOADERS[key]) {
        await this._loadSpecialAlbum(key);
      } else {
        await this._loadRegularAlbum(key, trackList, socialLinks);
      }

      this._commitLoadedAlbum(key, trackList);
      return true;
    } catch (error) {
      console.error(error);
      W.NotificationSystem?.error('Ошибка загрузки');
      return false;
    } finally {
      this.loading = false;

      const next = this.pendingAlbum;
      this.pendingAlbum = null;

      if (next && next !== this.curr) {
        queueMicrotask(() => this.loadAlbum(next));
      }
    }
  }

  _prepareAlbumScreen(key) {
    D.body.classList.toggle('profile-view', key === PROFILE);
    D.body.classList.toggle('games-view', key === GAMES);
    D.body.classList.toggle('friends-view', key === FRIENDS);

    const trackList = $('track-list');
    const socialLinks = $('social-links');
    const playerBlock = $('lyricsplayerblock');

    if (playerBlock && trackList?.contains(playerBlock)) {
      D.body.appendChild(playerBlock);
    }

    if (trackList) trackList.innerHTML = '';
    if (socialLinks) socialLinks.innerHTML = '';

    W.GalleryManager?.clear?.();
  }

  async _loadSpecialAlbum(key) {
    const module = await import('./albums/specials.js');
    const functionName = SPECIAL_LOADERS[key];
    const loader = module?.[functionName];

    if (typeof loader !== 'function') {
      throw new Error(`Missing ${functionName}`);
    }

    await loader(this);
  }

  async _loadRegularAlbum(key, trackList, socialLinks) {
    if (this.cache.has(key)) clearAlbumPlaybackTracks(this.cache.get(key));

    await W.TrackRegistry?.ensurePopulated?.();

    let album = this.cache.get(key);
    if (!album) {
      const config = W.TrackRegistry?.getAlbumConfig?.(key);
      if (!config) throw new Error(`Missing ${key}`);

      album = {
        ...config,
        tracks: W.TrackRegistry?.getTracksForAlbum?.(key) || []
      };
      this.cache.set(key, album);
    }

    await W.GalleryManager?.loadGallery?.(key);
    this.covers.set(
      key,
      await W.GalleryManager?.getFirstCoverUrl?.(key) || LOGO
    );

    this._renderCoverFallback();
    this._applyGalleryVisibility();
    this.renderAlbumTitle(album.title || '—');
    this._renderSocialLinks(album, socialLinks);
    renderAlbumTracks({ root: trackList, albumKey: key, tracks: album.tracks, escapeHtml: escHtml, isFavorite: uid => W.playerCore?.isFavorite?.(uid) });
    this.highlightCurrentTrack();
    W.PlayerUI?.updateMiniHeader?.();
  }

  _renderCoverFallback() {
    const coverSlot = $('cover-slot');
    if (coverSlot && (W.GalleryManager?.getItemsCount?.() || 0) <= 0) {
      coverSlot.innerHTML = `<img src="${LOGO}" alt="Cover">`;
    }
  }

  _applyGalleryVisibility() {
    const coverWrap = $('cover-wrap');
    if (coverWrap) coverWrap.style.display = this.galVis ? '' : 'none';
  }

  _renderSocialLinks(album, root) {
    if (!root) return;

    root.innerHTML = (album.links || [])
      .filter(link => link?.url)
      .map(link =>
        `<a href="${escHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escHtml(link.label)}</a>`
      )
      .join('');
  }

  _commitLoadedAlbum(key, trackList) {
    const previousKey = this.curr;
    this.curr = key;
    localStorage.setItem('currentAlbum', key);
    W.dispatchEvent(new CustomEvent('album:changed', {
      detail: { key, previousKey }
    }));
    D.body.classList.toggle('news-view', key === NEWS);

    D.querySelectorAll('.album-icon').forEach(element => {
      element.classList.toggle('active', element.dataset.album === key);
    });

    const albumRow = $('album-icons-albums');
    if (albumRow) {
      const special = String(key).startsWith('__');
      albumRow.dataset.active = special ? '' : key;

      if (!special) {
        this.albumCarousel?.setCurrent?.(key, {
          animate: true,
          notify: false,
          persist: true,
          reason: 'album_loaded'
        });
      }
    }

    trackList?.classList.remove('filtered');
    W.PlayerUI?.switchAlbumInstantly?.(key);
    W.FavoritesOnlyActions?.syncFavoritesOnlyUiFrame?.();
  }

  highlightCurrentTrack() {
    D.querySelectorAll('.current').forEach(element => {
      const supported =
        ['track', 'showcase-track', 'profile-list-item', 'sm-top-row']
          .some(className => element.classList.contains(className)) ||
        element.tagName === 'LI';

      if (supported) element.classList.remove('current');
    });

    const uid = W.playerCore?.getCurrentTrackUid?.();
    if (!uid) return;

    D.querySelectorAll(`[data-uid="${CSS.escape(uid)}"]`).forEach(element => {
      const supported =
        ['track', 'showcase-track', 'profile-list-item', 'sm-top-row']
          .some(className => element.classList.contains(className)) ||
        element.tagName === 'LI';

      if (supported) element.classList.add('current');
    });
  }

  getCurrentAlbum() {
    return this.curr;
  }

  getPlayingAlbum() {
    return this.playing;
  }

  setPlayingAlbum(key) {
    this.playing = key;
  }

  getPlayingAlbumTracks() {
    return W.PlaybackContextSource?.getSourcePlaylistForContext?.(this.playing) || [];
  }

  getAlbumSourcePlaylist(key) {
    return W.PlaybackContextSource?.getSourcePlaylistForContext?.(key) || [];
  }

  renderAlbumTitle(title, modifier) {
    const element = $('active-album-title');
    if (!element) return;

    element.textContent = title;
    element.className = `active-album-title ${modifier || ''}`;
  }
}

W.AlbumsManager = new AlbumsManager();

export default W.AlbumsManager;
