// scripts/app/albums.js (ESM)
// Блок «Альбомы/загрузка конфигов/иконки» вынесен из index.html.
// Все функции пробрасываются в window.* для полной совместимости.
// ВНИМАНИЕ: управление звуком/плеером НЕ перехватывается — только UI/данные альбомов.

(function () {
  // Лёгкие хелперы
  function isMobileUA() {
    try {
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    } catch { return false; }
  }

  function normalizeBase(b) {
    try {
      const hasScheme = /^[a-z]+:\/\//i.test(String(b));
      const u = new URL(String(b), hasScheme ? undefined : (location.origin + '/'));
      return u.origin + u.pathname.replace(/\/+$/, '');
    } catch {
      const s = String(b || '').replace(/[?#].*$/, '').replace(/\/+$/, '');
      if (/^https?:\/\//i.test(s)) return s;
      return location.origin + '/' + s.replace(/^\/+/, '');
    }
  }

  function absJoin(base, rel) {
    try { return new URL(String(rel || ''), normalizeBase(base) + '/').toString(); }
    catch {
      const norm = normalizeBase(base);
      return norm + '/' + String(rel || '').replace(/^\/+/, '');
    }
  }

  function albumByKey(key) {
    try {
      return (Array.isArray(window.albumsIndex) ? window.albumsIndex : []).find(a => a.key === key) || null;
    } catch { return null; }
  }

  function resolveRealAlbumKey(iconKey) {
    const ICON_KEY_ALIASES = window.ICON_KEY_ALIASES || {};
    if (albumByKey(iconKey)) return iconKey;
    const aliases = ICON_KEY_ALIASES[iconKey] || [];
    for (const k of aliases) if (albumByKey(k)) return k;
    const titleMap = window.ICON_TITLE_MAP || {};
    const expectedTitle = titleMap[iconKey];
    if (expectedTitle) {
      const found = (window.albumsIndex || []).find(a => String(a.title).toLowerCase().includes(expectedTitle.toLowerCase()));
      if (found) return found.key;
    }
    return null;
  }

  // Иконки альбомов
  function buildAlbumIcons() {
    const box = document.getElementById('album-icons');
    if (!box) return;

    const order = window.ICON_ALBUMS_ORDER || [];
    const isMob = isMobileUA();
    const html = order.map(it => {
      let dataKey = it.key;
      if (it.key !== window.SPECIAL_FAVORITES_KEY && it.key !== window.SPECIAL_RELIZ_KEY) {
        const real = resolveRealAlbumKey(it.key);
        dataKey = real || '__unknown__';
      }
      const title = it.title || '';
      const baseIcon = it.icon || 'img/logo.png';
      const path1x = isMob
        ? baseIcon.replace(/icon_album\/(.+)\.png$/i, 'icon_album/mobile/$1@1x.jpg')
        : baseIcon.replace(/\.png$/i, '@1x.png');
      const path2x = isMob
        ? path1x.replace(/@1x\.jpg$/i, '@2x.jpg')
        : path1x.replace(/@1x\.png$/i, '@2x.png');

      return `<div class="album-icon" data-akey="${dataKey}" data-icon="${it.key}" title="${title}">
        <img loading="lazy" src="${path1x}" srcset="${path2x} 2x" alt="${title}" width="60" height="60">
      </div>`;
    }).join('');

    box.innerHTML = html;
    box.querySelectorAll('.album-icon').forEach(el => {
      el.onclick = () => onAlbumIconClick(el.getAttribute('data-akey'));
    });

    setActiveAlbumIcon(window.currentAlbumKey || document.getElementById('album-select')?.value || ((window.albumsIndex || [])[0]?.key || ''));
  }

  function setActiveAlbumIcon(key) {
    const box = document.getElementById('album-icons');
    if (!box) return;
    box.querySelectorAll('.album-icon').forEach(el => {
      const k = el.getAttribute('data-akey');
      el.classList.toggle('active', k && key && k === key);
    });
  }

  function setAlbumHeaderTitle(key) {
    const el = document.getElementById('active-album-title');
    if (!el) return;
    let title = '—';
    let cls = '';

    if (key === window.SPECIAL_FAVORITES_KEY) { title = '★ ★ ★ ИЗБРАННОЕ ★ ★ ★'; cls = 'fav'; }
    else if (key === window.SPECIAL_RELIZ_KEY) { title = 'НОВОСТИ'; cls = 'news'; }
    else {
      const meta = albumByKey(key);
      title = meta?.title || (window.config?.albumName || 'Альбом');
    }

    el.textContent = title;
    el.title = title;
    el.className = 'active-album-title' + (cls ? (' ' + cls) : '');
  }

  // Состояние загрузчика альбома
  const albumConfigCache = {}; // { key: { base, config } }
  let __albumLoadCtrl = null;
  let __currentGalleryVisible = true;

  // Загрузка списка альбомов
  async function loadAlbumsIndex() {
    const sel = document.getElementById('album-select');
    try {
      const r = await fetch('./albums.json', { cache: 'no-cache' });
      const j = await r.json();
      window.albumsIndex = Array.isArray(j.albums) ? j.albums : [];
      if (!window.albumsIndex.length) throw new Error('empty index');
    } catch (e) {
      window.albumsIndex = (window.ALBUMS_FALLBACK || []).slice();
    }

    if (sel) {
      sel.innerHTML = (window.albumsIndex || []).map(a => `<option value="${a.key}">${a.title}</option>`).join('');
    }

    const first = (window.albumsIndex || [])[0];
    if (first) {
      try { const promo = document.getElementById('promo-cover'); if (promo) promo.src = 'img/logo.png'; } catch {}
    }

    buildAlbumIcons();
    setActiveAlbumIcon(document.getElementById('album-select')?.value || (window.albumsIndex?.[0]?.key || ''));
  }

  // Показ/скрытие галереи
  function setCoverWrapVisible(visible) {
    const cw = document.getElementById('cover-wrap');
    if (cw) cw.style.display = visible ? '' : 'none';
  }

  // Соцсети
  function buildSocials() {
    const linksEl = document.getElementById('social-links');
    if (!window.config || !window.config.socials || !linksEl) { if (linksEl) linksEl.innerHTML = ''; return; }
    linksEl.innerHTML = (window.config.socials || []).map(x => `<a href="${x.url}" target="_blank" rel="noopener">${x.title}</a>`).join(' ');
  }

  // Навигация по клику на иконке альбома
  function onAlbumIconClick(key) {
    if (key === window.SPECIAL_FAVORITES_KEY) {
      window.openFavoritesView && window.openFavoritesView();
      setActiveAlbumIcon(key);
      setAlbumHeaderTitle(window.SPECIAL_FAVORITES_KEY);
      return;
    }
    if (key === window.SPECIAL_RELIZ_KEY) {
      openRelizView();
      setActiveAlbumIcon(key);
      setAlbumHeaderTitle(window.SPECIAL_RELIZ_KEY);
      return;
    }

    if (!key || key === '__unknown__') {
      const real = resolveRealAlbumKey(key);
      if (real) key = real;
    }
    const meta = albumByKey(key);
    if (!meta) { window.NotificationSystem && window.NotificationSystem.error && window.NotificationSystem.error('Альбом не найден'); return; }

    // При уходе из «Избранного» — снимаем overrides
    if (typeof window.exitFavoritesView === 'function') {
      try { window.exitFavoritesView(); } catch {}
    }

    // Если нажали на уже активный — просто показываем/скрываем галерею
    if (window.viewMode === 'album' && key === window.currentAlbumKey) {
      __currentGalleryVisible = !__currentGalleryVisible;
      setCoverWrapVisible(__currentGalleryVisible);
      setActiveAlbumIcon(key);
      setAlbumHeaderTitle(key);
      return;
    }

    // Переход в альбом
    window.applyRelizUiMode && window.applyRelizUiMode(false);
    window.viewMode = 'album';
    clearRelizView();
    const list = document.getElementById('track-list');
    const cw = document.getElementById('cover-wrap');
    if (list) list.style.display = '';
    if (cw) cw.style.display = '';

    const sel = document.getElementById('album-select'); if (sel) sel.value = key;
    setActiveAlbumIcon(key);

    // Открыть галерею по умолчанию
    __currentGalleryVisible = true;
    setCoverWrapVisible(true);

    loadAlbumByKey(key).then(() => setAlbumHeaderTitle(key));
  }

  // Загрузка/применение альбома
  async function loadAlbumByKey(key) {
    const meta = albumByKey(key);
    if (!meta) { window.NotificationSystem && window.NotificationSystem.error && window.NotificationSystem.error('Альбом не найден'); return; }

    // Очистка галереи и её кэша
    try { typeof gc === 'function' && gc(); } catch {}
    try { window.resetGallery && window.resetGallery(); } catch {}
    if (window.__galleryPrefetched && window.__galleryPrefetched.size > 0) {
      window.__galleryPrefetched.clear();
    }

    window.currentAlbumKey = key;
    const base = normalizeBase(meta.base);
    window.albumBase = base;
    try { localStorage.setItem('currentAlbum', window.currentAlbumKey); } catch {}

    try { __albumLoadCtrl?.abort(); } catch {}
    __albumLoadCtrl = new AbortController();
    const signal = __albumLoadCtrl.signal;

    try { window.ensureQuickCoverForAlbum && window.ensureQuickCoverForAlbum({ key, base }); } catch {}

    // Кэшированные config.json
    if (albumConfigCache[key]?.config) {
      const cached = albumConfigCache[key];
      await applyAlbumConfig(cached.base, cached.config, { skipCovers: true, signal });

      // Галерея
      try {
        window.buildCoverGalleryList && window.buildCoverGalleryList(key, base, signal).then(gal => {
          if (signal.aborted) return;
          window.coverGalleryArr = (Array.isArray(gal) && gal.length) ? gal : [{ type: 'img', src: 'img/logo.png', formats: { full: 'img/logo.png' }, ar: 1 }];
          window.coverGalleryIdx = 0;
          window.setCoverImage && window.setCoverImage(0);
          window.showGalleryNav && window.showGalleryNav();
          if (!window.galleryRotationStarted) setTimeout(() => { if (!signal.aborted) window.startCoverAutoPlay && window.startCoverAutoPlay(); }, 5000);
        }).catch(() => {});
      } catch {}
      warmupOtherAlbums(key);
      return;
    }

    // Первый сетап альбома
    try {
      const resp = await fetch(absJoin(base, 'config.json'), { cache: 'no-cache', signal });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();

      if (!Array.isArray(data.tracks)) {
        try { window.NotificationSystem && window.NotificationSystem.error && window.NotificationSystem.error('config.json: отсутствует массив tracks[]'); } catch {}
        data.tracks = [];
      }
      data.tracks.forEach((t, i) => {
        const titleSafe = t && t.title ? t.title : `Трек #${i + 1}`;
        if (!t.audio) {
          try { window.NotificationSystem && window.NotificationSystem.warning && window.NotificationSystem.warning(`config.json: у «${titleSafe}» отсутствует поле audio`); } catch {}
        }
        if (t.audio) t.audio = absJoin(base, t.audio);
        if (t.lyrics) t.lyrics = absJoin(base, t.lyrics);
        if (t.fulltext) t.fulltext = absJoin(base, t.fulltext);
      });

      albumConfigCache[key] = { base, config: data };
      await applyAlbumConfig(base, data, { skipCovers: true, signal });

      // Галерея
      try {
        const gal = window.buildCoverGalleryList ? await window.buildCoverGalleryList(window.currentAlbumKey, base, signal) : [];
        if (signal.aborted) return;
        window.coverGalleryArr = (Array.isArray(gal) && gal.length)
          ? gal : [{ type: 'img', src: 'img/logo.png', formats: { full: 'img/logo.png' }, ar: 1 }];
        window.coverGalleryIdx = 0;
        window.setCoverImage && window.setCoverImage(0);
        window.showGalleryNav && window.showGalleryNav();
        if (!window.galleryRotationStarted) setTimeout(() => { if (!signal.aborted) window.startCoverAutoPlay && window.startCoverAutoPlay(); }, 5000);
      } catch {
        if (signal.aborted) return;
        window.coverGalleryArr = [{ type: 'img', src: 'img/logo.png', formats: { full: 'img/logo.png' }, ar: 1 }];
        window.coverGalleryIdx = 0;
        window.setCoverImage && window.setCoverImage(0);
        window.showGalleryNav && window.showGalleryNav();
        if (!window.galleryRotationStarted) setTimeout(() => { if (!signal.aborted) window.startCoverAutoPlay && window.startCoverAutoPlay(); }, 5000);
      }

      warmupOtherAlbums(key);
    } catch (e) {
      if (signal.aborted) return;
      console.error('Не удалось загрузить config.json альбома:', e);
      try { window.NotificationSystem && window.NotificationSystem.error && window.NotificationSystem.error('Не удалось загрузить альбом'); } catch {}
      try {
        const meta2 = albumByKey(key);
        renderComingSoonPlaceholder(meta2?.title || 'Альбом');
      } catch {}
    } finally {
      setActiveAlbumIcon(window.currentAlbumKey);
      setCoverWrapVisible(__currentGalleryVisible);
      setAlbumHeaderTitle(window.currentAlbumKey);
    }
  }

  function renderComingSoonPlaceholder(title) {
    try {
      const slot = document.getElementById('cover-slot');
      const list = document.getElementById('track-list');
      if (slot) {
        slot.replaceChildren();
        const box = document.createElement('div');
        box.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#0f1219;color:#cfe3ff;font-weight:800;text-align:center;padding:16px;';
        box.innerHTML = `<div><div style="font-size:18px;margin-bottom:6px;">Скоро релиз</div><div style="opacity:.85;">${(title || 'Альбом')}</div></div>`;
        slot.appendChild(box);
      }
      if (list) {
        list.innerHTML = '<div style="text-align:center; opacity:.8; margin:10px 0;">Скоро релиз — треклист недоступен</div>';
      }
    } catch {}
  }

  async function applyAlbumConfig(base, data, { skipCovers = false, signal } = {}) {
    try {
      if (data.background) {
        const attach = isMobileUA() ? '' : ' fixed';
        document.body.style.background = `url(${absJoin(base, data.background)}) center/cover${attach} #111`;
      } else {
        document.body.style.background = `#181818`;
      }
    } catch {}

    window.config = data;
    if (!Array.isArray(window.config.tracks)) window.config.tracks = [];

    // Галерея
    if (!skipCovers) {
      try {
        const gal = window.buildCoverGalleryList ? await window.buildCoverGalleryList(window.currentAlbumKey, base, signal) : [];
        window.coverGalleryArr = (Array.isArray(gal) && gal.length) ? gal : [{ type: 'img', src: 'img/logo.png', formats: { full: 'img/logo.png' }, ar: 1 }];
      } catch {
        window.coverGalleryArr = [{ type: 'img', src: 'img/logo.png', formats: { full: 'img/logo.png' }, ar: 1 }];
      }
      if (!signal?.aborted) {
        window.coverGalleryIdx = 0;
        window.setCoverImage && window.setCoverImage(window.coverGalleryIdx);
        window.showGalleryNav && window.showGalleryNav();
        if (!window.galleryRotationStarted) setTimeout(() => { if (!signal?.aborted) window.startCoverAutoPlay && window.startCoverAutoPlay(); }, 5000);
      }
    }

    try { const s = document.getElementById('support-link'); if (s) s.href = (window.config.donateLink || '#'); } catch {}
    try { const t = document.getElementById('album-title-modal'); if (t) t.textContent = (window.config.albumName || 'Альбом'); } catch {}
    buildSocials();

    // UI обновления
    try { window.buildTrackList && window.buildTrackList(); } catch {}
    try { window.updateAvailableTracks && window.updateAvailableTracks(); } catch {}
    try { window.applyMiniModeUI && window.applyMiniModeUI(); } catch {}
    try { window.updateNextUpLabel && window.updateNextUpLabel(); } catch {}
    try { window.updateMiniNowHeader && window.updateMiniNowHeader(); } catch {}
    try { window.parseDeepLink && window.parseDeepLink(); } catch {}
    // Не перебиваем текущее воспроизведение при просмотре другого альбома (мини-режим)
    try {
      const pc = window.playerCore;
      const browsingOther = (window.playingAlbumKey && window.currentAlbumKey && window.playingAlbumKey !== window.currentAlbumKey);
      if (!(pc && typeof pc.isPlaying === 'function' && pc.isPlaying() && browsingOther)) {
        // Эта функция не существует и вызывает ошибку. Закомментируем.
        // window.updatePlayerCorePlaylistFromConfig && window.updatePlayerCorePlaylistFromConfig();
        if (window.playerCore && typeof window.playerCore.setPlaylist === 'function') {
           const albumMeta = {
              artist: window.config?.artist || 'Витрина Разбита',
              album: window.config?.albumName || 'Альбом',
              cover: window.coverGalleryArr?.[0]?.formats?.full || 'img/logo.png'
           };
           window.playerCore.setPlaylist(window.config.tracks, 0, albumMeta);
        }
      }
      // Обновим мини-режим UI
      window.applyMiniModeUI && window.applyMiniModeUI();
    } catch {}
  }

  // Прогрев соседних альбомов
  async function warmupOtherAlbums(currentKey) {
    try {
      const list = (window.albumsIndex || []).map(a => a.key);
      const pos = list.indexOf(currentKey);
      const neigh = [list[pos - 1], list[pos + 1]].filter(Boolean);

      for (const key of neigh) {
        // Пропускаем не опубликованные альбомы
        const published = window.PUBLISHED_ALBUM_KEYS instanceof Set ? window.PUBLISHED_ALBUM_KEYS : new Set();
        if (published.size && !published.has(key)) continue;

        if (albumConfigCache[key]?.config) continue;
        const meta = albumByKey(key);
        if (!meta) continue;
        const base = normalizeBase(meta.base);

        // Конфиг альбома
        try {
          const r = await fetch(absJoin(base, 'config.json'), { cache: 'force-cache' });
          if (r && r.ok) {
            const data = await r.json();
            (data.tracks || []).forEach(t => {
              if (t.audio) t.audio = absJoin(base, t.audio);
              if (t.lyrics) t.lyrics = absJoin(base, t.lyrics);
              if (t.fulltext) t.fulltext = absJoin(base, t.fulltext);
            });
            albumConfigCache[key] = { base, config: data };
          }
        } catch {}

        // Центральная галерея — только если id в белом списке
        try {
          const centralId = (function () {
            const map = window.ALBUM_GALLERY_MAP || {};
            const allowed = window.CENTRAL_ALLOWED_IDS || new Set();
            const id = map[key] || null;
            return id && (allowed.has ? allowed.has(id) : true) ? id : null;
          })();
          if (centralId) fetch(`${(window.CENTRAL_GALLERY_BASE || './albums/gallery/')}${centralId}/index.json`).catch(() => {});
        } catch {}
      }
    } catch {}
  }

  // «Новости»
  async function openRelizView() {
    window.viewMode = 'reliz';
    setActiveAlbumIcon(window.SPECIAL_RELIZ_KEY);
    setAlbumHeaderTitle(window.SPECIAL_RELIZ_KEY);

    const list = document.getElementById('track-list');
    const cw = document.getElementById('cover-wrap');
    if (list) list.style.display = 'none';
    if (cw) cw.style.display = '';
    window.applyRelizUiMode && window.applyRelizUiMode(true);

    try { window.resetGallery && window.resetGallery(); } catch {}
    __currentGalleryVisible = true;
    setCoverWrapVisible(true);

    clearRelizView();
    let cont = document.getElementById('reliz-container');
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'reliz-container';
      const header = document.querySelector('header');
      header && header.insertAdjacentElement('afterend', cont);
    }
    cont.innerHTML = '';

    try {
      window.ensureQuickCoverForAlbum && window.ensureQuickCoverForAlbum({ key: window.SPECIAL_RELIZ_KEY, base: location.origin + location.pathname });

      const ctrl = new AbortController();
      __albumLoadCtrl = ctrl;
      const signal = ctrl.signal;

      const gal = window.buildCoverGalleryList ? await window.buildCoverGalleryList(window.SPECIAL_RELIZ_KEY, location.origin + location.pathname, signal) : [];
      if (signal.aborted) return;
      window.coverGalleryArr = (Array.isArray(gal) && gal.length) ? gal : [{ type: 'img', src: 'img/logo.png', ar: 1 }];
      window.coverGalleryIdx = 0;
      window.setCoverImage && window.setCoverImage(0);
      window.showGalleryNav && window.showGalleryNav();
      if (!window.galleryRotationStarted) setTimeout(() => { if (!signal.aborted) window.startCoverAutoPlay && window.startCoverAutoPlay(); }, 5000);
    } catch (e) {
      console.error('Новости: не удалось собрать галерею', e);
      window.coverGalleryArr = [{ type: 'img', src: 'img/logo.png', ar: 1 }];
      window.coverGalleryIdx = 0;
      window.setCoverImage && window.setCoverImage(0);
      window.showGalleryNav && window.showGalleryNav();
      if (!window.galleryRotationStarted) setTimeout(() => window.startCoverAutoPlay && window.startCoverAutoPlay(), 5000);
    }

    try {
      const newsWrap = document.createElement('div');
      newsWrap.style.margin = '12px auto';
      newsWrap.style.maxWidth = '400px';
      newsWrap.innerHTML = `
        <iframe
          src="./news.html"
          title="Новости — Витрина Разбита"
          style="width:100%; min-height: 800px; border:1px solid rgba(255,255,255,.1); border-radius:10px; background:#0b0e15;"
          loading="lazy"
          referrerpolicy="strict-origin-when-cross-origin"
          allow="encrypted-media; picture-in-picture; fullscreen">
        </iframe>`;
      cont.appendChild(newsWrap);
    } catch {}

    window.applyMiniModeUI && window.applyMiniModeUI();
  }

  function clearRelizView() {
    const cont = document.getElementById('reliz-container');
    if (cont) cont.remove();
  }

  // Экспорт в window.*
  window.isMobileUA = window.isMobileUA || isMobileUA;
  window.normalizeBase = window.normalizeBase || normalizeBase;
  window.absJoin = window.absJoin || absJoin;
  window.albumByKey = window.albumByKey || albumByKey;
  window.resolveRealAlbumKey = window.resolveRealAlbumKey || resolveRealAlbumKey;
  window.buildAlbumIcons = window.buildAlbumIcons || buildAlbumIcons;
  window.setActiveAlbumIcon = window.setActiveAlbumIcon || setActiveAlbumIcon;
  window.setAlbumHeaderTitle = window.setAlbumHeaderTitle || setAlbumHeaderTitle;
  window.onAlbumIconClick = window.onAlbumIconClick || onAlbumIconClick;
  window.loadAlbumsIndex = window.loadAlbumsIndex || loadAlbumsIndex;
  window.loadAlbumByKey = window.loadAlbumByKey || loadAlbumByKey;
  window.applyAlbumConfig = window.applyAlbumConfig || applyAlbumConfig;
  window.warmupOtherAlbums = window.warmupOtherAlbums || warmupOtherAlbums;
  window.openRelizView = window.openRelizView || openRelizView;
  window.clearRelizView = window.clearRelizView || clearRelizView;
  window.buildSocials = window.buildSocials || buildSocials;

  // Официальный экспорт для offline.js / favorites.js
  window.__getAlbumConfigByKey = window.__getAlbumConfigByKey || (async function __getAlbumConfigByKey(akey) {
    try {
      // Вернем из кэша, если есть
      if (akey && albumConfigCache[akey]?.config) return albumConfigCache[akey].config;

      if (!window.albumsIndex || !window.albumsIndex.length) {
        await (window.loadAlbumsIndex ? window.loadAlbumsIndex() : Promise.resolve());
      }
      const meta = (window.albumsIndex || []).find(a => a.key === akey);
      if (!meta) return null;

      const base = normalizeBase(meta.base);
      const resp = await fetch(absJoin(base, 'config.json'), { cache: 'force-cache' });
      if (!resp.ok) return null;
      const data = await resp.json();
      (data.tracks || []).forEach((t) => {
        if (t.audio)    t.audio    = absJoin(base, t.audio);
        if (t.lyrics)   t.lyrics   = absJoin(base, t.lyrics);
        if (t.fulltext) t.fulltext = absJoin(base, t.fulltext);
      });
      albumConfigCache[akey] = { base, config: data };
      return data;
    } catch {
      return null;
    }
  });
})();
