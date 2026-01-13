// scripts/app/albums.js
const APP_CONFIG = window.APP_CONFIG;

import { registerTrack, registerTracks } from './track-registry.js';

const U = window.Utils;
const $ = (id) => U?.dom?.byId ? U.dom.byId(id) : document.getElementById(id);
const S = (v) => (U?.trimStr ? U.trimStr(v) : (String(v ?? '').trim() || null));
const esc = (v) => (U?.escapeHtml ? U.escapeHtml(v) : String(v ?? ''));
const isMobileUA = () => (U?.isMobile ? U.isMobile() : /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

const FAV = window.SPECIAL_FAVORITES_KEY || '__favorites__';
const NEWS = window.SPECIAL_RELIZ_KEY || '__reliz__';

const STAR_ON = 'img/star.png';
const STAR_OFF = 'img/star2.png';
const LOGO = 'img/logo.png';

const emptyFavoritesHTML =
  `<div class="news-inline">` +
    `<h3>Избранные треки</h3>` +
    `<p>Отметьте треки звёздочкой ⭐</p>` +
  `</div>`;

function setStar(img, liked) {
  if (!img) return;
  try { img.src = liked ? STAR_ON : STAR_OFF; } catch {}
}

function normalizeTracks(tracks, base, albumKey) {
  const out = [];

  const list = Array.isArray(tracks) ? tracks : [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i] || {};

    const uid = S(t.uid);

    const fileHi = U.safeUrlJoin(base, t.audio);
    const fileLo = U.safeUrlJoin(base, t.audio_low);

    const lyrics = U.safeUrlJoin(base, t.lyrics) || U.safeUrlJoin(base, t.lrc);
    const fulltext = U.safeUrlJoin(base, t.fulltext);

    const sizeHi = (typeof t.size === 'number') ? t.size : null;
    const sizeLo = (typeof t.size_low === 'number') ? t.size_low : null;

    const sources = {
      audio: {
        hi: fileHi,
        lo: fileLo
      }
    };

    const hasLyrics = (typeof t.hasLyrics === 'boolean')
      ? t.hasLyrics
      : !!lyrics;

    const track = {
      uid,
      title: String(t.title || ''),
      num: (typeof t.num === 'number' ? t.num : (i + 1)),
      fileHi,
      fileLo,
      file: fileHi || fileLo || null,
      sources,
      lyrics: lyrics || null,
      fulltext: fulltext || null,
      sizeHi,
      sizeLo,
      hasLyrics
    };

    // Регистрируем в TrackRegistry для offline/updates
    registerTrack({
      uid,
      title: track.title,
      audio: fileHi,
      audio_low: fileLo,
      size: sizeHi,
      size_low: sizeLo,
      lyrics: track.lyrics,
      fulltext: track.fulltext,
      sourceAlbum: albumKey
    });

    out.push(track);
  }

  return out;
}

class AlbumsManager {
  constructor() {
    this.currentAlbum = null;
    this.playingAlbum = null;

    this.albumsData = new Map();
    this.albumCoverUrlCache = new Map();
    this._loading = new Map();
  }

  async initialize() {
    this.renderAlbumIcons();
    this.attachGlobalListeners();

    // Автозагрузка первого альбома (не special)
    const first = (Array.isArray(window.ICON_ALBUMS_ORDER) ? window.ICON_ALBUMS_ORDER : [])
      .map(x => x?.key)
      .find(k => k && !U.isSpecialAlbumKey(k));

    if (first) {
      await this.loadAlbum(first);
    } else {
      // fallback если ICON_ALBUMS_ORDER пуст: возьмём первый из albumsIndex
      const idx = Array.isArray(window.albumsIndex) ? window.albumsIndex : [];
      const k = idx.find(a => a && a.key && !U.isSpecialAlbumKey(a.key))?.key || null;
      if (k) await this.loadAlbum(k);
    }

    console.log('✅ AlbumsManager initialized');
  }

  attachGlobalListeners() {
    // Обновляем звёзды в видимых строках при изменениях
    window.addEventListener('favorites:changed', () => {
      try { this.refreshVisibleStars(); } catch {}
    });

    // Перестроение favorites view при смене refs
    window.addEventListener('favorites:refsChanged', () => {
      if (this.currentAlbum === FAV) {
        try { this.loadAlbum(FAV); } catch {}
      }
    });
  }

  renderAlbumIcons() {
    const wrap = $('album-icons');
    if (!wrap) return;

    const order = Array.isArray(window.ICON_ALBUMS_ORDER) ? window.ICON_ALBUMS_ORDER : [];
    wrap.innerHTML = '';

    for (const it of order) {
      const key = String(it?.key || '').trim();
      if (!key) continue;

      const btn = document.createElement('div');
      btn.className = 'album-icon';
      btn.dataset.album = key;
      btn.dataset.akey = key; // для e2e/back-compat
      btn.title = String(it?.title || key);

      const img = document.createElement('img');
      img.src = String(it?.icon || LOGO);
      img.alt = String(it?.title || key);

      btn.appendChild(img);

      btn.addEventListener('click', () => {
        this.loadAlbum(key);
      });

      wrap.appendChild(btn);
    }
  }

  async loadAlbum(albumKey) {
    const key = String(albumKey || '').trim();
    if (!key) return;

    this.currentAlbum = key;
    this.updateActiveIcon(key);

    if (key === NEWS) {
      await this.renderNewsAlbum();
      return;
    }

    if (key === FAV) {
      await this.renderFavoritesAlbum();
      return;
    }

    await this.renderRegularAlbum(key);
  }

  async renderRegularAlbum(albumKey) {
    this.clearUI();

    const tl = $('track-list');
    if (!tl) return;

    const titleEl = $('active-album-title');
    const iconMeta = (Array.isArray(window.ICON_ALBUMS_ORDER) ? window.ICON_ALBUMS_ORDER : []).find(x => x && x.key === albumKey);
    if (titleEl) {
      titleEl.classList.remove('fav', 'news');
      titleEl.textContent = iconMeta?.title || albumKey;
    }

    // Галерея
    try { await window.GalleryManager?.loadGallery?.(albumKey); } catch {}

    const data = await this.getAlbumDataOrLoad(albumKey);
    if (!data) {
      tl.innerHTML = `<div class="news-inline"><div class="news-inline__status news-inline__status--error">Не удалось загрузить альбом</div></div>`;
      return;
    }

    // Соцссылки
    this.renderSocialLinks(data.socials);

    // Рендер треков
    const frag = document.createDocumentFragment();

    for (let i = 0; i < data.tracks.length; i++) {
      frag.appendChild(this.createTrackElement(albumKey, data, data.tracks[i], i));
    }

    tl.appendChild(frag);
  }

  async renderFavoritesAlbum() {
    this.clearUI();

    const tl = $('track-list');
    if (!tl) return;

    const titleEl = $('active-album-title');
    if (titleEl) {
      titleEl.classList.add('fav');
      titleEl.classList.remove('news');
      titleEl.textContent = '⭐⭐⭐ИЗБРАННОЕ⭐⭐⭐';
    }

    try { await window.GalleryManager?.loadGallery?.(FAV); } catch {}

    // Собираем модель refs (uid-based)
    const model = (typeof window.buildFavoritesRefsModel === 'function')
      ? await window.buildFavoritesRefsModel()
      : (Array.isArray(window.favoritesRefsModel) ? window.favoritesRefsModel : []);

    const list = Array.isArray(model) ? model : [];
    if (!list.length) {
      tl.innerHTML = emptyFavoritesHTML;
      return;
    }

    const frag = document.createDocumentFragment();

    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (!it) continue;

      const row = document.createElement('div');
      row.className = 'track' + (it.__active ? '' : ' inactive');
      row.dataset.index = String(i);
      row.dataset.uid = String(it.__uid || '');
      row.id = `fav_${String(it.__a || '')}_${String(it.__uid || '')}`;

      const numText = `${String(i + 1).padStart(2, '0')}.`;
      const title = String(it.title || 'Трек');

      const isLiked = !!window.FavoritesManager?.isFavorite?.(String(it.__a || ''), String(it.__uid || ''));

      row.innerHTML = `
        <div class="tnum">${esc(numText)}</div>
        <div class="track-title">${esc(title)}</div>
        <img src="${isLiked ? STAR_ON : STAR_OFF}" class="like-star" alt="звезда"
             data-album="${esc(String(it.__a || ''))}" data-uid="${esc(String(it.__uid || ''))}">
      `;

      row.addEventListener('click', (e) => {
        if (e.target?.classList?.contains('like-star')) return;

        if (!it.__active) {
          // Двухшаговая защита: модалка с возвратом/удалением
          window.FavoritesData?.showFavoritesInactiveModal?.({
            albumKey: String(it.__a || ''),
            uid: String(it.__uid || ''),
            title
          });
          return;
        }

        // Активный — играем из избранного
        this.ensureFavoritesPlayback(i);
        this.highlightCurrentTrack(i);
        window.PlayerUI?.ensurePlayerBlock?.(i, { userInitiated: true });
      });

      const star = row.querySelector('.like-star');
      star?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const a = S(star.dataset.album);
        const uid = S(star.dataset.uid);
        if (!a || !uid) return;

        const next = !window.FavoritesManager?.isFavorite?.(a, uid);
        setStar(star, next);
        star.classList.add('animating');
        setTimeout(() => star.classList.remove('animating'), 320);

        // ВАЖНО: source='favorites' чтобы работали правила inactive/next/stop
        window.FavoritesManager?.toggleLike?.(a, uid, next, { source: 'favorites' });

        // Если стало active — снимаем inactive класс
        row.classList.toggle('inactive', !next);
      });

      frag.appendChild(row);
    }

    tl.appendChild(frag);

    // playingAlbum для контекста плеера
    this.setPlayingAlbum(FAV);
  }

  async renderNewsAlbum() {
    this.clearUI();

    const tl = $('track-list');
    if (!tl) return;

    const titleEl = $('active-album-title');
    if (titleEl) {
      titleEl.classList.add('news');
      titleEl.classList.remove('fav');
      titleEl.textContent = 'НОВОСТИ';
    }

    try { await window.GalleryManager?.loadGallery?.(NEWS); } catch {}

    tl.innerHTML = `
      <div class="news-inline">
        <h3>Новости</h3>
        <div class="news-inline__status" id="news-inline-status">Загрузка...</div>
        <div class="news-inline__list" id="news-inline-list"></div>
      </div>
    `;

    const statusEl = document.getElementById('news-inline-status');
    const listEl = document.getElementById('news-inline-list');

    try {
      const r = await fetch('./news/news.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const items = Array.isArray(j?.items) ? j.items : [];

      if (statusEl) statusEl.style.display = 'none';

      if (!items.length) {
        if (statusEl) {
          statusEl.style.display = '';
          statusEl.textContent = 'Пока новостей нет';
        }
        return;
      }

      if (!listEl) return;

      listEl.innerHTML = items.map((it) => {
        const title = esc(it?.title || 'Новость');
        const date = esc(it?.date || '');
        const text = esc(it?.text || '');

        return `
          <article class="news-card">
            <div class="news-card__title">${title}</div>
            ${date ? `<div class="news-card__date">${date}</div>` : ''}
            ${text ? `<div class="news-card__text">${text}</div>` : ''}
          </article>
        `;
      }).join('');
    } catch (e) {
      if (statusEl) {
        statusEl.classList.add('news-inline__status--error');
        statusEl.textContent = 'Не удалось загрузить новости';
      }
    }
  }

  async getAlbumDataOrLoad(albumKey) {
    const key = String(albumKey || '').trim();
    if (!key) return null;

    if (this.albumsData.has(key)) return this.albumsData.get(key);

    if (this._loading.has(key)) return this._loading.get(key);

    const p = (async () => {
      const idx = Array.isArray(window.albumsIndex) ? window.albumsIndex : [];
      const meta = idx.find(a => a && a.key === key) || null;
      if (!meta?.base) return null;

      let cfg = null;
      try {
        const url = meta.base.endsWith('/') ? `${meta.base}config.json` : `${meta.base}/config.json`;
        const r = await fetch(url, { cache: 'no-cache' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        cfg = await r.json();
      } catch (e) {
        console.warn('Album config load failed:', key, e);
        return null;
      }

      const base = String(meta.base || '');
      const tracksRaw = Array.isArray(cfg?.tracks) ? cfg.tracks : [];
      const tracks = normalizeTracks(tracksRaw, base, key);

      // Для bulk: регистрируем треки пачкой (если есть)
      try { registerTracks && registerTracks([]); } catch {}

      const socials = U.normalizeSocials(cfg) || [];

      const data = {
        key,
        title: String(cfg?.albumName || meta.title || key),
        artist: String(cfg?.artist || 'Витрина Разбита'),
        socials,
        tracks
      };

      this.albumsData.set(key, data);

      // Обложка (1-я из центральной галереи)
      try {
        const cover = await window.GalleryManager?.getFirstCoverUrl?.(key);
        if (cover) this.albumCoverUrlCache.set(key, cover);
      } catch {}

      return data;
    })();

    this._loading.set(key, p);

    const res = await p;
    this._loading.delete(key);
    return res;
  }

  renderSocialLinks(socials) {
    const wrap = $('social-links');
    if (!wrap) return;

    const list = Array.isArray(socials) ? socials : [];
    if (!list.length) {
      wrap.innerHTML = '';
      return;
    }

    wrap.innerHTML = list.map((s) => {
      const label = esc(s?.label || s?.title || '');
      const url = esc(s?.url || '');
      if (!url) return '';
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label || url}</a>`;
    }).join('');
  }

  createTrackElement(albumKey, albumData, track, index) {
    const el = document.createElement('div');
    el.className = 'track';
    el.dataset.index = String(index);
    el.dataset.uid = String(track?.uid || '');

    const uid = S(track?.uid) || '';

    const liked = !!window.FavoritesManager?.isFavorite?.(albumKey, uid);
    const numText = `${String(track?.num || index + 1).padStart(2, '0')}.`;

    el.innerHTML = `
      <div class="tnum">${esc(numText)}</div>
      <div class="track-title">${esc(String(track?.title || ''))}</div>
      <img src="${liked ? STAR_ON : STAR_OFF}" class="like-star" alt="звезда" data-album="${esc(albumKey)}" data-uid="${esc(uid)}">
    `;

    el.addEventListener('click', (e) => {
      if (e.target?.classList?.contains('like-star')) return;

      if (!albumData || !window.playerCore) {
        this.highlightCurrentTrack(index);
        window.NotificationSystem?.error?.('Альбом ещё не готов к воспроизведению');
        return;
      }

      const snapshot = window.playerCore.getPlaylistSnapshot?.() || [];
      const tracksForCore = albumData.tracks
        .filter((t) => t && (t.fileHi || t.file || t.fileLo))
        .map((t) => ({
          src: t.fileHi || t.file || t.fileLo,
          sources: t.sources || null,
          title: t.title,
          artist: albumData.artist || 'Витрина Разбита',
          album: albumKey,
          cover: this.albumCoverUrlCache.get(albumKey) || LOGO,
          lyrics: t.lyrics || null,
          fulltext: t.fulltext || null,
          uid: S(t.uid),
          hasLyrics: t.hasLyrics
        }));

      // Ставим playing album
      this.setPlayingAlbum(albumKey);

      const needsNew =
        snapshot.length !== tracksForCore.length ||
        snapshot.some((t, i) => String(t?.uid || '') !== String(tracksForCore[i]?.uid || ''));

      if (needsNew && tracksForCore.length) {
        window.playerCore.setPlaylist(tracksForCore, index, {
          artist: albumData.artist || 'Витрина Разбита',
          album: albumData.title || '',
          cover: this.albumCoverUrlCache.get(albumKey) || LOGO
        });
      }

      this.highlightCurrentTrack(index);
      window.playerCore.play(index);
      window.PlayerUI?.ensurePlayerBlock?.(index, { userInitiated: true });
    });

    const star = el.querySelector('.like-star');
    star?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const trackUid = S(star.dataset.uid);
      if (!trackUid) return void window.NotificationSystem?.warning?.('UID трека не найден в config.json');
      if (!window.FavoritesManager?.toggleLike) return void window.NotificationSystem?.error?.('FavoritesManager недоступен');

      const next = !window.FavoritesManager.isFavorite(albumKey, trackUid);
      setStar(star, next);
      star.classList.add('animating');
      setTimeout(() => star.classList.remove('animating'), 320);

      window.FavoritesManager.toggleLike(albumKey, trackUid, next, { source: 'album' });
    });

    return el;
  }

  ensureFavoritesPlayback(startIndexInModel) {
    const model = Array.isArray(window.favoritesRefsModel) ? window.favoritesRefsModel : [];
    const active = model.filter(it => it && it.__active && it.audio);

    if (!active.length) {
      window.NotificationSystem?.info?.('Отметьте понравившийся трек ⭐');
      return;
    }

    const tracksForCore = active.map((it) => ({
      src: it.audio,
      sources: { audio: { hi: it.audio, lo: null } },
      title: it.title || 'Трек',
      artist: it.__artist || 'Витрина Разбита',
      album: FAV,
      cover: it.__cover || LOGO,
      lyrics: it.lyrics || null,
      fulltext: it.fulltext || null,
      uid: String(it.__uid || '').trim() || null,
      sourceAlbum: String(it.__a || '').trim() || null,
      hasLyrics: (typeof it.hasLyrics === 'boolean') ? it.hasLyrics : null
    }));

    // индекс среди active
    const wanted = model[startIndexInModel];
    const wantedUid = String(wanted?.__uid || '').trim();
    const wantedA = String(wanted?.__a || '').trim();

    let playIndex = 0;
    if (wantedUid) {
      const idx = active.findIndex(it => String(it?.__uid || '').trim() === wantedUid && String(it?.__a || '').trim() === wantedA);
      if (idx >= 0) playIndex = idx;
    }

    this.setPlayingAlbum(FAV);

    window.playerCore?.setPlaylist?.(tracksForCore, playIndex, {
      artist: 'Витрина Разбита',
      album: 'ИЗБРАННОЕ',
      cover: wanted?.__cover || LOGO
    }, { preserveOriginalPlaylist: true, resetHistory: false });

    window.playerCore?.play?.(playIndex);
  }

  refreshVisibleStars() {
    const list = document.querySelectorAll('#track-list .like-star');
    list.forEach((img) => {
      const a = S(img?.dataset?.album);
      const uid = S(img?.dataset?.uid);
      if (!a || !uid) return;
      const liked = !!window.FavoritesManager?.isFavorite?.(a, uid);
      setStar(img, liked);

      // Для favorites view: доп. синхронизация active/inactive
      const row = img.closest?.('.track');
      if (row && this.currentAlbum === FAV) row.classList.toggle('inactive', !liked);
    });
  }

  highlightCurrentTrack(index) {
    document.querySelectorAll('.track.current').forEach((n) => n.classList.remove('current'));
    if (!Number.isFinite(index) || index < 0) return;
    document.querySelector(`.track[data-index="${index}"]`)?.classList.add('current');
  }

  updateActiveIcon(albumKey) {
    document.querySelectorAll('.album-icon').forEach((icon) => {
      const k = String(icon?.dataset?.album || icon?.dataset?.akey || '').trim();
      icon.classList.toggle('active', k === albumKey);
    });
  }

  clearUI() {
    const tl = $('track-list');
    if (tl) tl.innerHTML = '';
    const sl = $('social-links');
    if (sl) sl.innerHTML = '';
    try { window.GalleryManager?.clear?.(); } catch {}
  }

  getCurrentAlbum() { return this.currentAlbum; }
  getPlayingAlbum() { return this.playingAlbum; }
  setPlayingAlbum(albumKey) { this.playingAlbum = albumKey || null; }
  getAlbumData(albumKey) { return this.albumsData.get(albumKey); }
  getAlbumConfigByKey(albumKey) { return this.albumsData.get(albumKey); }
  getTrackUid(_albumKey, trackUid) { return S(trackUid); }
}

window.AlbumsManager = new AlbumsManager();
export default AlbumsManager;
