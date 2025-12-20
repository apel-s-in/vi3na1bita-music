// scripts/app/gallery.js
// Управление галереей обложек

class GalleryManager {
  constructor() {
    this.items = [];
    this.currentIndex = 0;
    this.autoplayInterval = null;
    this.isAutoplayEnabled = false;
    this.transitionLock = false;
    
    this.prefetchedUrls = new Set();
    this.imageLoader = null;
    
    this.ALBUM_GALLERY_MAP = {
      'krevetochka': '00',
      'mezhdu-zlom-i-dobrom': '01',
      'golos-dushi': '02',
      'odnazhdy-v-skazke': '03',
      '__reliz__': 'news'
    };
    
    this.ALLOWED_IDS = new Set(['00', '01', '02', '03', 'news']);
    this.GALLERY_BASE = './albums/gallery/';
  }

  initialize() {
    this.setupNavigation();
    this.setupSwipeGestures();
    this.setupVisibilityHandler();
    console.log('✅ GalleryManager initialized');
  }

  getCentralId(albumKey) {
    if (!albumKey || albumKey === '__favorites__') return null;
    const id = this.ALBUM_GALLERY_MAP[albumKey];
    return (id && this.ALLOWED_IDS.has(id)) ? id : null;
  }

  async loadGallery(albumKey) {
    const id = this.getCentralId(albumKey);
    
    if (!id) {
      this.items = [];
      this.currentIndex = 0;
      this.updateNavigationState();
      
      // ✅ Показываем logo.png как fallback для альбомов без галереи
      const slot = document.getElementById('cover-slot');
      if (slot) {
        slot.innerHTML = `<img src="img/logo.png" alt="Обложка" draggable="false" loading="lazy">`;
      }
      return;
    }

    try {
      const baseDir = `${this.GALLERY_BASE}${id}/`;
      const response = await fetch(`${baseDir}index.json`, { cache: 'force-cache' });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const rawItems = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);

      this.items = rawItems
        .map(item => this.normalizeItem(item, baseDir))
        .filter(Boolean);

      this.currentIndex = 0;
      
      if (this.items.length > 0) {
        this.renderItem(0);
        this.updateNavigationState();
        this.startAutoplay();
      }

      console.log(`✅ Gallery loaded: ${this.items.length} items`);
    } catch (error) {
      // ✅ Тихо обрабатываем ошибку загрузки галереи (не засоряем консоль)
      this.items = [];
      this.currentIndex = 0;
      this.updateNavigationState();
      
      // ✅ Показываем logo.png как fallback
      const slot = document.getElementById('cover-slot');
      if (slot) {
        slot.innerHTML = `<img src="img/logo.png" alt="Обложка" draggable="false" loading="lazy">`;
      }
    }
  }

  normalizeItem(raw, baseDir) {
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
      return {
        type: isHtml ? 'html' : 'img',
        src: toAbs(raw),
        formats: null
      };
    }

    const type = String(raw.type || '').toLowerCase() === 'html' ? 'html' : 'img';

    if (type === 'html') {
      return {
        type: 'html',
        src: toAbs(raw.src || ''),
        formats: null
      };
    }

    const formats = {
      webp: toAbs(raw.formats?.webp || null),
      full: toAbs(raw.formats?.full || raw.src || null),
      thumb: toAbs(raw.formats?.thumb || null)
    };

    return {
      type: 'img',
      src: formats.full || toAbs(raw.src || ''),
      formats
    };
  }

  renderItem(index) {
    if (this.transitionLock) return;
    if (!this.items.length) return;

    this.transitionLock = true;
    this.currentIndex = (index + this.items.length) % this.items.length;

    const item = this.items[this.currentIndex];
    const slot = document.getElementById('cover-slot');
    
    if (!slot || !item) {
      this.transitionLock = false;
      return;
    }

    if (this.imageLoader) {
      this.imageLoader.onload = null;
      this.imageLoader.onerror = null;
      this.imageLoader = null;
    }

    if (item.type === 'html') {
      this.renderHtml(slot, item.src);
    } else {
      this.renderImage(slot, item);
    }

    setTimeout(() => {
      this.prefetchNext();
      this.transitionLock = false;
    }, 200);
  }

  renderHtml(slot, src) {
    const iframe = document.createElement('iframe');
    
    // ✅ Локальные html-баннеры (albums/gallery/...) доверенные.
    // Для корректной работы вложенных виджетов (например, Яндекс.Музыка) нужен allow-same-origin.
    // ✅ Минимизируем security-ошибки от сторонних виджетов внутри баннера:
    // не даём outer-iframe same-origin.
    iframe.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.loading = 'lazy';
    iframe.src = src;

    this.clearSlot(slot);
    slot.appendChild(iframe);
  }

  renderImage(slot, item) {
    const img = new Image();
    this.imageLoader = img;

    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';

    const src = item.formats?.webp || item.formats?.full || item.src;

    img.onload = () => {
      if (this.imageLoader !== img) return;

      const picture = document.createElement('picture');

      if (item.formats?.webp) {
        const source = document.createElement('source');
        source.type = 'image/webp';
        source.srcset = item.formats.webp;
        picture.appendChild(source);
      }

      const displayImg = document.createElement('img');
      displayImg.src = src;
      displayImg.alt = 'Обложка альбома';
      displayImg.decoding = 'async';
      displayImg.referrerPolicy = 'no-referrer';
      displayImg.style.cssText = 'opacity: 0; transition: opacity .15s ease-out';

      picture.appendChild(displayImg);

      this.clearSlot(slot);
      slot.appendChild(picture);

      requestAnimationFrame(() => {
        displayImg.style.opacity = '1';
      });
    };

    img.onerror = () => console.warn('Failed to load image:', src);
    img.src = src;
  }

  clearSlot(slot) {
    while (slot.firstChild) {
      if (slot.firstChild.tagName === 'IFRAME') {
        slot.firstChild.src = 'about:blank';
      }
      slot.removeChild(slot.firstChild);
    }
  }

  prefetchNext() {
    if (this.items.length < 2) return;

    const nextIndex = (this.currentIndex + 1) % this.items.length;
    const item = this.items[nextIndex];

    if (!item || item.type !== 'img') return;

    const webp = item.formats?.webp || null;

    if (this.prefetchedUrls.size > 20) this.prefetchedUrls.clear();

    if (webp && !this.prefetchedUrls.has(webp)) {
      const img = new Image();
      img.src = webp;
      this.prefetchedUrls.add(webp);
    }
  }

  setupNavigation() {
    const leftBtn = document.getElementById('cover-gallery-arrow-left');
    const rightBtn = document.getElementById('cover-gallery-arrow-right');

    leftBtn?.addEventListener('click', () => {
      if (!this.items.length) return;
      this.renderItem(this.currentIndex - 1);
      this.restartAutoplay();
    });

    rightBtn?.addEventListener('click', () => {
      if (!this.items.length) return;
      this.renderItem(this.currentIndex + 1);
      this.restartAutoplay();
    });
  }

  setupSwipeGestures() {
    const wrap = document.getElementById('cover-wrap');
    if (!wrap) return;

    let startX = null;

    wrap.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
    }, { passive: true });

    wrap.addEventListener('touchend', (e) => {
      if (startX === null) return;

      const dx = e.changedTouches[0].clientX - startX;

      if (Math.abs(dx) > 50) {
        if (dx > 0) {
          this.renderItem(this.currentIndex - 1);
        } else {
          this.renderItem(this.currentIndex + 1);
        }
        this.restartAutoplay();
      }

      startX = null;
    }, { passive: true });
  }

  setupVisibilityHandler() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // ✅ Останавливаем только галерею (плеер не трогаем)
        this.stopAutoplay();
      } else {
        // Возобновляем, только если есть что крутить
        if (this.items.length > 1) {
          this.startAutoplay();
        }
      }
    });
  }

  updateNavigationState() {
    const wrap = document.getElementById('cover-wrap');
    if (!wrap) return;

    if (this.items.length > 1) {
      wrap.classList.add('gallery-nav-ready');
    } else {
      wrap.classList.remove('gallery-nav-ready');
    }
  }

  startAutoplay() {
    if (this.items.length <= 1) return;
    if (this.autoplayInterval) return;

    this.autoplayInterval = setInterval(() => {
      this.renderItem(this.currentIndex + 1);
    }, 5000);

    this.isAutoplayEnabled = true;
  }

  stopAutoplay() {
    if (this.autoplayInterval) {
      clearInterval(this.autoplayInterval);
      this.autoplayInterval = null;
    }
    this.isAutoplayEnabled = false;
  }

  restartAutoplay() {
    this.stopAutoplay();
    this.startAutoplay();
  }

  clear() {
    this.stopAutoplay();
    this.items = [];
    this.currentIndex = 0;
    this.prefetchedUrls.clear();
    
    if (this.imageLoader) {
      this.imageLoader.onload = null;
      this.imageLoader.onerror = null;
      this.imageLoader = null;
    }

    const slot = document.getElementById('cover-slot');
    if (slot) this.clearSlot(slot);

    this.updateNavigationState();
  }

  getItemsCount() {
    return this.items.length;
  }

  getCurrentIndex() {
    return this.currentIndex;
  }
}

window.GalleryManager = new GalleryManager();

export default GalleryManager;
