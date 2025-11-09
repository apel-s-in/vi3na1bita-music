// scripts/ui/gallery.js (ESM)
// Полная реализация галереи: нормализация index.json, быстрый первый кадр,
// ротация, навигация, префетч. Функции экспортируются и регистрируются на window,
// чтобы существующие вызовы в index.html продолжали работать без изменений.

(function(){
  // Доступ к глобальному состоянию, которое использует index.html
  function state() {
    // Глобальные переменные определены в index.html (оставлены только объявления),
    // здесь используем их через window для надёжности.
    if (!Array.isArray(window.coverGalleryArr)) window.coverGalleryArr = [];
    if (typeof window.coverGalleryIdx !== 'number') window.coverGalleryIdx = 0;
    // coverAutoplay может быть null|number (id таймера)
    if (typeof window.galleryRotationStarted !== 'boolean') window.galleryRotationStarted = false;
    // внутренние (необязательные) хелперы
    if (!window.__galleryPrefetched) window.__galleryPrefetched = new Set();
    if (!window.__galleryImgLoader) window.__galleryImgLoader = null;
    return {
      get arr() { return window.coverGalleryArr; },
      set arr(v) { window.coverGalleryArr = v; },
      get idx() { return window.coverGalleryIdx; },
      set idx(v) { window.coverGalleryIdx = v; },
      get autoplay() { return window.coverAutoplay; },
      set autoplay(v) { window.coverAutoplay = v; },
      get started() { return window.galleryRotationStarted; },
      set started(v) { window.galleryRotationStarted = v; },
      get prefetched() { return window.__galleryPrefetched; },
      get loader() { return window.__galleryImgLoader; },
      set loader(v) { window.__galleryImgLoader = v; },
    };
  }

  function parseAspectFromFileName(url) {
    try {
      const name = url.split('?')[0].split('#')[0].split('/').pop();
      const m = name.match(/(?:\(|-|_)(\d+)\s*[x:]\s*(\d+)\)?/i);
      if (m) {
        const w = parseInt(m[1], 10), h = parseInt(m[2], 10);
        if (w > 0 && h > 0) return (w / h);
      }
    } catch {}
    return 1;
  }

  // Нормализация элемента из index.json
  function normalizeGalleryItem(raw, baseDir) {
    if (!raw) return null;
    const toAbs = (p) => {
      if (!p) return null;
      const s = String(p).replace(/^\.?\//, '');
      if (/^https?:\/\//i.test(s)) return s;
      if (/^(albums|img|icons|assets)\//i.test(s)) return `./${s}`;
      return baseDir + s;
    };

    if (typeof raw === 'string') {
      const isHtml = /\.html(\?|#|$)/i.test(raw);
      const src = toAbs(raw);
      return { type: isHtml ? 'html' : 'img', src, formats: null, ar: parseAspectFromFileName(src) || 1 };
    }

    const type = (String(raw.type || '').toLowerCase() === 'html') ? 'html' : 'img';
    if (type === 'html') {
      const src = toAbs(raw.src || '');
      return { type: 'html', src, formats: null, ar: 1 };
    }

    const fm = raw.formats || {};
    const formats = {
      webp: toAbs(fm.webp || null),
      full: toAbs(fm.full || raw.src || null),
      thumb: toAbs(fm.thumb || null)
    };
    const src = formats.full || toAbs(raw.src || '');
    const ar = (raw.width && raw.height && raw.width > 0 && raw.height > 0)
      ? (raw.width / raw.height)
      : (parseAspectFromFileName(src) || 1);
    return { type: 'img', src, formats, ar };
  }

  function showGalleryNav() {
    const wrap = document.getElementById('cover-wrap');
    if (wrap) wrap.classList.add('gallery-nav-ready');
  }

  function setCoverWrapVisible(visible) {
    const cw = document.getElementById('cover-wrap');
    if (cw) cw.style.display = visible ? '' : 'none';
  }

  function resetGallery() {
    const st = state();
    const wrap = document.getElementById('cover-wrap');
    if (wrap) wrap.classList.remove('gallery-nav-ready');

    if (st.autoplay) {
      clearInterval(st.autoplay);
      st.autoplay = null;
    }
    if (st.loader) {
      st.loader.onload = null;
      st.loader.onerror = null;
      st.loader = null;
    }

    st.arr = [];
    st.idx = 0;
    st.started = false;

    const slot = document.getElementById('cover-slot');
    if (slot) {
      while (slot.firstChild) {
        if (slot.firstChild.tagName === 'IFRAME') slot.firstChild.src = 'about:blank';
        slot.removeChild(slot.firstChild);
      }
    }
  }

  function pickBestSrc(item) {
    if (!item || item.type !== 'img') return item?.src;
    const webp = item.formats?.webp || null;
    const full = item.formats?.full || item.src || null;
    return webp || full;
  }

  function renderCoverItem(item) {
    const st = state();
    const slot = document.getElementById('cover-slot');
    const wrap = document.getElementById('cover-wrap');
    if (!slot || !item) return;

    if (st.loader) {
      st.loader.onload = null;
      st.loader.onerror = null;
      st.loader = null;
    }
    if (wrap && item.ar) wrap.style.aspectRatio = String(item.ar);

    if (item.type === 'html') {
      const ifr = document.createElement('iframe');
      ifr.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
      ifr.setAttribute('referrerpolicy', 'no-referrer');
      ifr.loading = 'lazy';
      ifr.src = item.src;
      while (slot.firstChild) {
        if (slot.firstChild.tagName === 'IFRAME') slot.firstChild.src = 'about:blank';
        slot.removeChild(slot.firstChild);
      }
      slot.appendChild(ifr);
      return;
    }

    const img = new Image();
    st.loader = img;
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';

    const applyImage = () => {
      if (st.loader !== img) return;
      const picture = document.createElement('picture');
      if (item.formats?.webp) {
        const s = document.createElement('source');
        s.type = 'image/webp';
        s.srcset = item.formats.webp;
        picture.appendChild(s);
      }
      const displayImg = document.createElement('img');
      displayImg.src = img.src;
      displayImg.alt = 'Обложка альбома';
      displayImg.decoding = 'async';
      displayImg.referrerPolicy = 'no-referrer';
      displayImg.style.opacity = '0';
      displayImg.style.transition = 'opacity .15s ease-out';
      picture.appendChild(displayImg);

      while (slot.firstChild) {
        if (slot.firstChild.tagName === 'IFRAME') slot.firstChild.src = 'about:blank';
        slot.removeChild(slot.firstChild);
      }
      slot.appendChild(picture);
      requestAnimationFrame(() => { displayImg.style.opacity = '1'; });
    };

    img.onload = applyImage;
    img.onerror = () => { if (st.loader === img) console.warn('Failed to load image:', item.src); };
    img.src = pickBestSrc(item);
  }

  function setQuickCoverSrc(url) {
    try {
      const slot = document.getElementById('cover-slot');
      const wrap = document.getElementById('cover-wrap');
      if (!slot) return;
      slot.innerHTML = '';
      const img = new Image();
      img.decoding = 'async';
      img.loading = 'eager';
      img.referrerPolicy = 'no-referrer';
      img.alt = 'Обложка альбома';
      img.onload = () => {
        try {
          if (wrap && img.naturalWidth && img.naturalHeight) {
            const ar = img.naturalWidth / img.naturalHeight;
            if (isFinite(ar) && ar > 0) wrap.style.aspectRatio = String(ar);
          }
        } catch {}
      };
      img.src = url;
      slot.appendChild(img);
    } catch {}
  }

  function setQuickCoverHtml(url) {
    try {
      const slot = document.getElementById('cover-slot');
      const wrap = document.getElementById('cover-wrap');
      if (!slot) return;
      slot.innerHTML = '';
      if (wrap) wrap.style.aspectRatio = '1 / 1';
      const ifr = document.createElement('iframe');
      ifr.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
      ifr.setAttribute('referrerpolicy', 'no-referrer');
      ifr.loading = 'lazy';
      ifr.src = url;
      slot.appendChild(ifr);
    } catch {}
  }

  async function buildCentralGalleryList(albumKey, signal) {
    const id = window.centralIdForAlbumKey && window.centralIdForAlbumKey(albumKey);
    if (!id) return [];
    const baseDir = `${window.CENTRAL_GALLERY_BASE || './albums/gallery/'}${id}/`;
    try {
      const r = await fetch(baseDir + 'index.json', { cache: 'force-cache', signal });
      if (!r.ok) return [];
      const j = await r.json();
      const arr = Array.isArray(j.items) ? j.items : (Array.isArray(j) ? j : []);
      const out = [];
      for (const raw of arr) {
        const norm = normalizeGalleryItem(raw, baseDir);
        if (norm) out.push(norm);
      }
      return out;
    } catch { return []; }
  }

  async function buildCoverGalleryList(albumKey, _baseUrl, signal) {
    return await buildCentralGalleryList(albumKey, signal);
  }

  function prefetchNextCover() {
    const st = state();
    const arr = st.arr;
    if (!Array.isArray(arr) || arr.length < 2) return;
    const nextIdx = (st.idx + 1) % arr.length;
    const it = arr[nextIdx];
    if (!it || it.type !== 'img') return;
    const webp = it.formats?.webp || null;
    if (st.prefetched.size > 20) st.prefetched.clear();
    try {
      if (webp && !st.prefetched.has(webp)) {
        const imgW = new Image();
        imgW.src = webp;
        st.prefetched.add(webp);
      }
    } catch {}
  }

  function setCoverImage(idx) {
    const st = state();
    const arr = st.arr;
    if (!Array.isArray(arr) || !arr.length) return;
    if (st.__transitioning) return;
    st.__transitioning = true;

    st.idx = (idx + arr.length) % arr.length;
    const item = arr[st.idx];

    if (item) {
      renderCoverItem(item);
      setTimeout(() => {
        prefetchNextCover();
        st.__transitioning = false;
      }, 200);
    } else {
      st.__transitioning = false;
    }
  }

  function startCoverAutoPlay() {
    const st = state();
    if (st.autoplay) { clearInterval(st.autoplay); st.autoplay = null; }
    if (!Array.isArray(st.arr) || st.arr.length <= 1) return;
    st.autoplay = setInterval(() => {
      if (Array.isArray(st.arr) && st.arr.length > 1) {
        setCoverImage(st.idx + 1);
      }
    }, 5000);
    st.started = true;
  }

  async function ensureQuickCoverForAlbum(meta) {
    try {
      const id = window.centralIdForAlbumKey && window.centralIdForAlbumKey(meta.key);
      if (!id) { setQuickCoverSrc('img/logo.png'); return; }
      const baseDir = `${window.CENTRAL_GALLERY_BASE || './albums/gallery/'}${id}/`;
      const r = await fetch(baseDir + 'index.json', { cache: 'no-cache' });
      if (r.ok) {
        const j = await r.json();
        const arr = Array.isArray(j.items) ? j.items : (Array.isArray(j) ? j : []);
        const tmp = [];
        for (const raw of arr) {
          const norm = normalizeGalleryItem(raw, baseDir);
          if (norm) tmp.push(norm);
        }
        const pickKey = (item) => {
          const url = (item.formats?.full || item.src || '').split('?')[0];
          const name = url.split('/').pop() || '';
          return name.replace(/\.(avif|webp|jpe?g|png)$/i, '').replace(/-thumb$/i, '');
        };
        const seen = new Set();
        const out = [];
        for (const it of tmp) {
          const k = pickKey(it);
          if (k && !seen.has(k)) { seen.add(k); out.push(it); }
        }
        const first = out[0] || null;
        if (first) {
          if (first.type === 'html') setQuickCoverHtml(first.src);
          else setQuickCoverSrc(first.formats?.full || first.src);
          showGalleryNav();
          return;
        }
      }
      setQuickCoverSrc('img/logo.png');
      showGalleryNav();
    } catch {
      setQuickCoverSrc('img/logo.png');
      showGalleryNav();
    }
  }

  async function applyAlbumBackgroundFromGallery(albumKey) {
    try {
      const id = window.centralIdForAlbumKey && window.centralIdForAlbumKey(albumKey);
      if (!id) { document.body.style.background = '#181818'; return; }
      const baseDir = `${window.CENTRAL_GALLERY_BASE || './albums/gallery/'}${id}/`;
      const r = await fetch(baseDir + 'index.json', { cache: 'no-cache' });
      if (!r.ok) { document.body.style.background = '#181818'; return; }
      const j = await r.json();
      const first = Array.isArray(j.items) ? j.items[0] : (Array.isArray(j) ? j[0] : null);
      if (first) {
        const norm = normalizeGalleryItem(first, baseDir);
        if (norm && norm.type === 'img') {
          const src = norm.formats?.full || norm.src || 'img/logo.png';
          const attach = (typeof window.isMobileUA === 'function' && window.isMobileUA()) ? '' : ' fixed';
          document.body.style.background = `url(${src}) center/cover${attach} #111`;
          return;
        }
      }
      document.body.style.background = '#181818';
    } catch {
      document.body.style.background = '#181818';
    }
  }

  // Навигация стрелками — оставляем index.html; здесь — только функции.

  // Экспорт/регистрация
  const API = {
    normalizeGalleryItem,
    renderCoverItem,
    setQuickCoverSrc,
    setQuickCoverHtml,
    showGalleryNav,
    resetGallery,
    buildCentralGalleryList,
    buildCoverGalleryList,
    prefetchNextCover,
    setCoverImage,
    startCoverAutoPlay,
    ensureQuickCoverForAlbum,
    applyAlbumBackgroundFromGallery,
    setCoverWrapVisible
  };

  // Именованный экспорт для import
  Object.assign(window, {
    normalizeGalleryItem,
    renderCoverItem,
    setQuickCoverSrc,
    setQuickCoverHtml,
    showGalleryNav,
    resetGallery,
    buildCentralGalleryList,
    buildCoverGalleryList,
    prefetchNextCover,
    setCoverImage,
    startCoverAutoPlay,
    ensureQuickCoverForAlbum,
    applyAlbumBackgroundFromGallery,
    setCoverWrapVisible
  });

  window.UIGallery = API;
})();

export const normalizeGalleryItem = window.normalizeGalleryItem;
export const renderCoverItem = window.renderCoverItem;
export const setQuickCoverSrc = window.setQuickCoverSrc;
export const setQuickCoverHtml = window.setQuickCoverHtml;
export const showGalleryNav = window.showGalleryNav;
export const resetGallery = window.resetGallery;
export const buildCentralGalleryList = window.buildCentralGalleryList;
export const buildCoverGalleryList = window.buildCoverGalleryList;
export const prefetchNextCover = window.prefetchNextCover;
export const setCoverImage = window.setCoverImage;
export const startCoverAutoPlay = window.startCoverAutoPlay;
export const ensureQuickCoverForAlbum = window.ensureQuickCoverForAlbum;
export const applyAlbumBackgroundFromGallery = window.applyAlbumBackgroundFromGallery;
export const setCoverWrapVisible = window.setCoverWrapVisible;
