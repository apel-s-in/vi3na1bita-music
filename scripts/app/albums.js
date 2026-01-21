// scripts/app/albums.js
const APP_CONFIG = window.APP_CONFIG;

import { registerTrack } from './track-registry.js';
import { $, toStr, escHtml, isMobileUA } from './utils/app-utils.js';

const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__';

const STAR_ON = 'img/star.png';
const STAR_OFF = 'img/star2.png';
const LOGO = 'img/logo.png';

const emptyFavoritesHTML = `
  <div style="padding: 20px; text-align: center; color: #8ab8fd;">
    <h3>Избранные треки</h3>
    <p>Отметьте треки звёздочкой ⭐</p>
  </div>
`;

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

    // Регистрация трека (как было), но без лишней обвязки
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

    this.isLoading = false;
    this.isGalleryVisible = true;

    this._favSyncBound = false;
    this._favDelegationBound = false;
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
    const firstRegular = keys.find((k) => !toStr(k).startsWith('__') && window.albumsIndex?.some((a) => a.key === k));
    return firstRegular || window.albumsIndex?.[0]?.key || null;
  }

  _bindFavoritesAlbumSync() {
    if (this._favSyncBound) return;
    this._favSyncBound = true;

    // Обновление звёзд в обычных альбомах (без DOM events)
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
    if (this.currentAlbum === albumKey && !toStr(albumKey).startsWith('__')) return void this.toggleGalleryVisibility();
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
    }

    await this.loadGallery(albumKey);

    // Обложка для PlayerCore
    try {
      const url = await window.GalleryManager?.getFirstCoverUrl?.(albumKey);
      this.albumCoverUrlCache.set(albumKey, url || LOGO);
    } catch {
      this.albumCoverUrlCache.set(albumKey, LOGO);
    }

    // Если галерея пустая — показываем logo в слоте (как было)
    try {
      const count = window.GalleryManager?.getItemsCount?.() || 0;
      if (count <= 0) $('cover-slot') && ($('cover-slot').innerHTML = `<img src="${LOGO}" alt="Обложка" draggable="false" loading="lazy">`);
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

  async loadFavoritesAlbum() {
    this.renderAlbumTitle('⭐⭐⭐ ИЗБРАННОЕ ⭐⭐⭐', 'fav');

    const coverWrap = $('cover-wrap');
    if (coverWrap) coverWrap.style.display = 'none';

    await window.FavoritesUI?.buildFavoritesRefsModel?.();

    const container = $('track-list');
    if (!container) return;

    const render = () => {
      const model = Array.isArray(window.favoritesRefsModel) ? window.favoritesRefsModel : [];
      if (!model.length) return (container.innerHTML = emptyFavoritesHTML);

      container.innerHTML = model
        .map((it, i) => {
          const a = toStr(it?.__a);
          const u = toStr(it?.__uid);
          const active = !!it?.__active;
          const albumTitle = it?.__album || 'Альбом';
          const trackTitle = it?.title || 'Трек';
          return `
            <div class="track${active ? '' : ' inactive'}"
                 id="fav_${escHtml(a)}_${escHtml(u)}"
                 data-index="${i}"
                 data-album="${escHtml(a)}"
                 data-uid="${escHtml(u)}">
              <div class="tnum">${String(i + 1).padStart(2, '0')}.</div>
              <div class="track-title" title="${escHtml(trackTitle)} - ${escHtml(albumTitle)}">
                <span class="fav-track-name">${escHtml(trackTitle)}</span>
                <span class="fav-album-name"> — ${escHtml(albumTitle)}</span>
              </div>
              <img src="${active ? STAR_ON : STAR_OFF}" class="like-star" alt="звезда"
                   data-album="${escHtml(a)}" data-uid="${escHtml(u)}">
            </div>`;
        })
        .join('');
    };

    if (!this._favDelegationBound) {
      this._favDelegationBound = true;

      container.addEventListener('click', async (e) => {
        if (this.currentAlbum !== FAV) return;

        const target = e.target;
        const row = target?.closest?.('.track');
        if (!row || !container.contains(row)) return;

        const idx = Number.parseInt(toStr(row.dataset.index), 10);
        if (!Number.isFinite(idx) || idx < 0) return;

        const model = Array.isArray(window.favoritesRefsModel) ? window.favoritesRefsModel : [];
        const item = model[idx];
        if (!item) return;

        if (target?.classList?.contains('like-star')) {
          e.preventDefault();
          e.stopPropagation();
          const uid = toStr(item.__uid).trim();
          const a = toStr(item.__a).trim();
          if (uid && a) window.playerCore?.toggleFavorite?.(uid, { fromAlbum: false, albumKey: a });
          return;
        }

        if (item.__active && item.audio) return void (await this.ensureFavoritesPlayback(idx));

        // inactive row click (не по звезде) → модалка (в PlayerCore)
        window.playerCore?.showInactiveFavoriteModal?.({
          uid: toStr(item.__uid).trim(),
          title: item.title || 'Трек',
          onDeleted: async () => window.PlayerUI?.updateAvailableTracksForPlayback?.(),
        });
      });

      const pc = window.playerCore;
      if (pc?.onFavoritesChanged) {
        pc.onFavoritesChanged(() => {
          // В избранном проще и надёжнее: полная перерисовка модели
          if (this.currentAlbum !== FAV) return;
          render();
          window.PlayerUI?.updateAvailableTracksForPlayback?.();
        });
      }
    }

    render();
  }

  async ensureFavoritesPlayback(index) {
    const model = Array.isArray(window.favoritesRefsModel) ? window.favoritesRefsModel : [];
    if (!model.length) return void window.NotificationSystem?.warning('Нет избранных треков');

    const active = model.filter((it) => it && it.__active && it.audio);
    if (!active.length) return void window.NotificationSystem?.warning('Нет доступных треков');

    const clicked = model[index];
    let startIndex = 0;
    if (clicked?.__active && clicked.audio) {
      const uid = toStr(clicked.__uid).trim();
      const a = toStr(clicked.__a).trim();
      const k = active.findIndex((it) => toStr(it.__uid).trim() === uid && toStr(it.__a).trim() === a);
      startIndex = k >= 0 ? k : 0;
    }

    const tracks = active.map((it) => ({
      src: it.audio,
      title: it.title,
      artist: it.__artist || 'Витрина Разбита',
      album: FAV,
      cover: it.__cover || LOGO,
      lyrics: it.lyrics || null,
      fulltext: it.fulltext || null,
      uid: typeof it.__uid === 'string' && it.__uid.trim() ? it.__uid.trim() : null,
      sourceAlbum: it.__a,
    }));
    if (!tracks.length) return void window.NotificationSystem?.warning('Нет доступных треков');

    if (window.playerCore) {
      window.playerCore.setPlaylist(tracks, startIndex, { artist: 'Витрина Разбита', album: 'Избранное', cover: LOGO });
      window.playerCore.play(startIndex);

      this.setPlayingAlbum(FAV);

      const cu = toStr(clicked?.__uid).trim();
      const ca = toStr(clicked?.__a).trim();
      this.highlightCurrentTrack(index, { uid: cu, albumKey: ca });

      window.PlayerUI?.ensurePlayerBlock?.(index, { userInitiated: true });
      window.PlayerUI?.updateAvailableTracksForPlayback?.();
    }
  }

  async loadNewsAlbum() {
    this.renderAlbumTitle('📰 НОВОСТИ 📰', 'news');
    await this.loadGallery(NEWS);

    const coverWrap = $('cover-wrap');
    if (coverWrap) coverWrap.style.display = '';

    const container = $('track-list');
    if (!container) return;

    container.innerHTML = `
      <div style="padding: 14px 10px; text-align: center; color: #8ab8fd;">
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-bottom: 12px;">
          <a href="https://t.me/vitrina_razbita" target="_blank" style="color: #4daaff; text-decoration: underline;">Telegram канал</a>
          <span style="opacity:.6;">·</span>
          <a href="./news.html" target="_blank" style="color: #4daaff; text-decoration: underline;">Страница новостей</a>
        </div>
        <div id="news-inline-status" style="opacity:.85;">Загрузка...</div>
      </div>
      <div id="news-inline-list" style="display:grid; gap:12px; padding: 0 0 10px 0;"></div>
    `;

    const status = $('news-inline-status');
    const list = $('news-inline-list');
    if (!list) return;

    try {
      const r = await fetch('./news/news.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const items = Array.isArray(j?.items) ? j.items : [];

      if (!items.length) {
        if (status) status.textContent = 'Пока новостей нет';
        return;
      }
      if (status) status.style.display = 'none';

      list.innerHTML = items
        .map((it) => {
          const title = escHtml(it?.title || 'Новость');
          const date = escHtml(it?.date || '');
          const text = escHtml(it?.text || '');
          const tags = Array.isArray(it?.tags) ? it.tags : [];

          const media = it?.embedUrl
            ? `<div style="margin:10px 0;"><iframe loading="lazy" style="width:100%;border:0;border-radius:10px;min-height:220px;background:#0b0e15;" src="${escHtml(it.embedUrl)}" allowfullscreen></iframe></div>`
            : it?.image
              ? `<div style="margin:10px 0;"><img loading="lazy" style="width:100%;border:0;border-radius:10px;background:#0b0e15;" src="${escHtml(it.image)}" alt=""></div>`
              : it?.video
                ? `<div style="margin:10px 0;"><video controls preload="metadata" style="width:100%;border:0;border-radius:10px;min-height:220px;background:#0b0e15;" src="${escHtml(it.video)}"></video></div>`
                : '';

          const tagHtml = tags.length
            ? `<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
                 ${tags
                   .map((t) => `<span style="font-size:12px;color:#4daaff;background:rgba(77,170,255,.12);border:1px solid rgba(77,170,255,.25);padding:4px 8px;border-radius:999px;">#${escHtml(t)}</span>`)
                   .join('')}
               </div>`
            : '';

          return `<article style="background:#131a26;border:1px solid #23324a;border-radius:12px;padding:12px;box-shadow:0 4px 16px rgba(0,0,0,.25);">
            <div style="font-weight:900;font-size:16px;color:#eaf2ff;">${title}</div>
            ${date ? `<div style="color:#9db7dd;font-size:13px;margin-top:6px;">${date}</div>` : ''}
            ${media}
            ${text ? `<div style="margin-top:8px;line-height:1.45;color:#eaf2ff;">${text}</div>` : ''}
            ${tagHtml}
          </article>`;
        })
        .join('');
    } catch {
      if (status) {
        status.textContent = 'Не удалось загрузить новости';
        status.style.color = '#ff6b6b';
      }
    }
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
      ? links
          .map((l) => ({ label: l?.label || l?.title || 'Ссылка', url: l?.url }))
          .filter((l) => !!l.url)
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
    for (let i = 0; i < tracks.length; i++) container.appendChild(this.createTrackElement(tracks[i], albumInfo.key, i));
  }

  createTrackElement(track, albumKey, index) {
    const el = document.createElement('div');
    el.className = 'track';
    el.id = `trk${index}`;
    el.dataset.index = String(index);
    el.dataset.album = albumKey;

    const uid = typeof track?.uid === 'string' && track.uid.trim() ? track.uid.trim() : '';
    el.dataset.uid = uid;

    // playIndex: как в исходнике — индекс среди playable по file
    const ad = this.albumsData.get(albumKey);
    if (ad?.tracks?.length) {
      const playable = ad.tracks.filter((t) => !!t?.file);
      const k = playable.findIndex((t) => t?.uid && uid && toStr(t.uid) === uid);
      el.dataset.playIndex = String(k >= 0 ? k : index);
    } else {
      el.dataset.playIndex = String(index);
    }

    const liked = window.playerCore?.isFavorite?.(track?.uid) || false;
    const numText = `${String(track?.num || index + 1).padStart(2, '0')}.`;

    el.innerHTML = `
      <div class="tnum">${numText}</div>
      <div class="track-title">${toStr(track?.title || '')}</div>
      <img src="${liked ? STAR_ON : STAR_OFF}" class="like-star" alt="звезда" data-album="${albumKey}" data-uid="${uid}">
    `;

    el.addEventListener('click', (e) => {
      if (e.target?.classList?.contains('like-star')) return;

      const albumData = this.albumsData.get(albumKey);
      if (!albumData || !window.playerCore) {
        this.highlightCurrentTrack(index);
        window.NotificationSystem?.error('Альбом ещё не готов к воспроизведению');
        return;
      }

      const snapshot = window.playerCore.getPlaylistSnapshot?.() || [];
      const needsNew =
        snapshot.length !== albumData.tracks.length ||
        snapshot.some((t, i) => {
          const src = albumData.tracks[i]?.file;
          return !src || t.src !== src;
        });

      const piRaw = Number.parseInt(toStr(el.dataset.playIndex), 10);
      const playIndex = Number.isFinite(piRaw) && piRaw >= 0 ? piRaw : index;

      if (needsNew) {
        const coverUrl = this.albumCoverUrlCache.get(albumKey) || LOGO;
        const tracksForCore = albumData.tracks
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
          }));

        if (tracksForCore.length) {
          window.playerCore.setPlaylist(tracksForCore, playIndex, {
            artist: albumData.artist || 'Витрина Разбита',
            album: albumData.title || '',
            cover: coverUrl,
          });
        }
      }

      this.highlightCurrentTrack(index);

      // iOS unlock делает сам PlayerCore (единственный источник правды)
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

      // UI оптимистично как раньше
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

    // ✅ Для Избранного подсвечиваем по (albumKey, uid), а не по data-index
    if (this.currentAlbum === FAV && uid && albumKey) {
      const sel = `.track[data-album="${CSS.escape(albumKey)}"][data-uid="${CSS.escape(uid)}"]`;
      document.querySelector(sel)?.classList.add('current');
      return;
    }

    if (!Number.isFinite(index) || index < 0) return;
    document.querySelector(`.track[data-index="${index}"]`)?.classList.add('current');
  }

  updateActiveIcon(albumKey) {
    document.querySelectorAll('.album-icon').forEach((icon) => icon.classList.toggle('active', icon.dataset.album === albumKey));
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
