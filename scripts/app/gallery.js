// scripts/app/gallery.js — Галерея обложек
(function() {
  'use strict';

  class GalleryManager {
    constructor() {
      this.items = [];
      this.idx = 0;
      this.interval = null;
      this.lock = false;
      this.prefetched = new Set();
      this.loader = null;
      this.MAP = null;
      this.IDS = new Set(['00', '01', '02', '03', 'news']);
      this.BASE = './albums/gallery/';
    }

    initialize() {
      // Получаем конфиг после загрузки
      this.MAP = window.APP_CONFIG?.GALLERY_MAP || {
        'krevetochka': '00',
        'mezhdu-zlom-i-dobrom': '01',
        'golos-dushi': '02',
        'odnazhdy-v-skazke': '03',
        '__reliz__': 'news'
      };
      this.BASE = window.APP_CONFIG?.GALLERY_BASE || './albums/gallery/';

      const leftArrow = document.getElementById('cover-gallery-arrow-left');
      const rightArrow = document.getElementById('cover-gallery-arrow-right');
      
      if (leftArrow) {
        leftArrow.addEventListener('click', () => {
          if (this.items.length) {
            this.render(this.idx - 1);
            this.restart();
          }
        });
      }
      
      if (rightArrow) {
        rightArrow.addEventListener('click', () => {
          if (this.items.length) {
            this.render(this.idx + 1);
            this.restart();
          }
        });
      }
      
      const wrap = document.getElementById('cover-wrap');
      if (wrap) {
        let sx = null;
        wrap.addEventListener('touchstart', e => {
          sx = e.touches[0].clientX;
        }, { passive: true });
        
        wrap.addEventListener('touchend', e => {
          if (sx !== null) {
            const dx = e.changedTouches[0].clientX - sx;
            if (Math.abs(dx) > 50) {
              this.render(dx > 0 ? this.idx - 1 : this.idx + 1);
              this.restart();
            }
            sx = null;
          }
        }, { passive: true });
      }
      
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.stop();
        } else if (this.items.length > 1) {
          this.start();
        }
      });
      
      console.log('✅ GalleryManager initialized');
    }

    getId(key) {
      if (!key || key === '__favorites__') return null;
      const mapped = this.MAP[key];
      return this.IDS.has(mapped) ? mapped : null;
    }

    async loadGallery(key) {
      const id = this.getId(key);
      const slot = document.getElementById('cover-slot');
      
      if (!id) {
        this.items = [];
        this.idx = 0;
        this.updateNav();
        if (slot) {
          slot.innerHTML = '<img src="img/logo.png" alt="Обложка" draggable="false" loading="lazy">';
        }
        return;
      }
      
      // Проверяем кэш 404
      let cache404 = {};
      try {
        cache404 = JSON.parse(sessionStorage.getItem('gallery_404') || '{}');
      } catch (e) {}
      
      if (cache404[id]) {
        this.items = [];
        this.idx = 0;
        this.updateNav();
        if (slot) {
          slot.innerHTML = '<img src="img/logo.png" alt="Обложка" draggable="false" loading="lazy">';
        }
        return;
      }
      
      try {
        const dir = `${this.BASE}${id}/`;
        const r = await fetch(`${dir}index.json`, { cache: 'force-cache' });
        
        if (!r.ok) {
          if (r.status === 404) {
            cache404[id] = 1;
            try {
              sessionStorage.setItem('gallery_404', JSON.stringify(cache404));
            } catch (e) {}
          }
          throw new Error(`HTTP ${r.status}`);
        }
        
        const d = await r.json();
        const raw = Array.isArray(d.items) ? d.items : (Array.isArray(d) ? d : []);
        this.items = raw.map(it => this.norm(it, dir)).filter(Boolean);
        this.idx = 0;
        
        if (this.items.length) {
          this.render(0);
          this.updateNav();
          this.start();
        }
        
        console.log(`✅ Gallery: ${this.items.length} items`);
      } catch (e) {
        console.warn('Gallery load error:', e);
        this.items = [];
        this.idx = 0;
        this.updateNav();
        if (slot) {
          slot.innerHTML = '<img src="img/logo.png" alt="Обложка" draggable="false" loading="lazy">';
        }
      }
    }

    norm(raw, base) {
      if (!raw) return null;
      
      const abs = (p) => {
        if (!p) return null;
        const s = String(p).replace(/^\.?\//, '');
        if (/^https?:\/\//i.test(s)) return s;
        if (/^(albums|img|icons|assets)\//i.test(s)) return `./${s}`;
        return base + s;
      };
      
      if (typeof raw === 'string') {
        return {
          type: /\.html(\?|#|$)/i.test(raw) ? 'html' : 'img',
          src: abs(raw),
          formats: null
        };
      }
      
      const type = raw.type?.toLowerCase() === 'html' ? 'html' : 'img';
      
      if (type === 'html') {
        return { type: 'html', src: abs(raw.src || ''), formats: null };
      }
      
      const f = {
        webp: abs(raw.formats?.webp),
        full: abs(raw.formats?.full || raw.src),
        thumb: abs(raw.formats?.thumb)
      };
      
      return {
        type: 'img',
        src: f.full || abs(raw.src),
        formats: f
      };
    }

    render(i) {
      if (this.lock || !this.items.length) return;
      
      this.lock = true;
      this.idx = (i + this.items.length) % this.items.length;
      
      const it = this.items[this.idx];
      const slot = document.getElementById('cover-slot');
      
      if (!slot || !it) {
        this.lock = false;
        return;
      }
      
      if (this.loader) {
        this.loader.onload = null;
        this.loader.onerror = null;
        this.loader = null;
      }
      
      if (it.type === 'html') {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms');
        iframe.setAttribute('referrerpolicy', 'no-referrer');
        iframe.loading = 'lazy';
        iframe.src = it.src;
        this.clearSlot(slot);
        slot.appendChild(iframe);
      } else {
        const img = new Image();
        this.loader = img;
        const src = it.formats?.webp || it.formats?.full || it.src;
        
        img.onload = () => {
          if (this.loader !== img) return;
          
          const pic = document.createElement('picture');
          
          if (it.formats?.webp) {
            const s = document.createElement('source');
            s.type = 'image/webp';
            s.srcset = it.formats.webp;
            pic.appendChild(s);
          }
          
          const di = document.createElement('img');
          di.src = src;
          di.alt = 'Обложка';
          di.style.cssText = 'opacity:0;transition:opacity .15s';
          pic.appendChild(di);
          
          this.clearSlot(slot);
          slot.appendChild(pic);
          
          requestAnimationFrame(() => {
            di.style.opacity = '1';
          });
        };
        
        img.onerror = () => {
          console.warn('Gallery image error:', src);
        };
        
        img.src = src;
      }
      
      setTimeout(() => {
        this.prefetch();
        this.lock = false;
      }, 200);
    }

    clearSlot(slot) {
      while (slot.firstChild) {
        if (slot.firstChild.tagName === 'IFRAME') {
          slot.firstChild.src = 'about:blank';
        }
        slot.removeChild(slot.firstChild);
      }
    }
    
    prefetch() {
      if (this.items.length < 2) return;
      
      const it = this.items[(this.idx + 1) % this.items.length];
      if (!it || it.type !== 'img') return;
      
      const url = it.formats?.webp;
      if (url && !this.prefetched.has(url)) {
        new Image().src = url;
        this.prefetched.add(url);
        if (this.prefetched.size > 20) {
          this.prefetched.clear();
        }
      }
    }

    updateNav() {
      const wrap = document.getElementById('cover-wrap');
      if (wrap) {
        wrap.classList.toggle('gallery-nav-ready', this.items.length > 1);
      }
    }

    start() {
      if (this.items.length <= 1 || this.interval) return;
      this.interval = setInterval(() => this.render(this.idx + 1), 5000);
    }
    
    stop() {
      if (this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }
    }
    
    restart() {
      this.stop();
      this.start();
    }
    
    clear() {
      this.stop();
      this.items = [];
      this.idx = 0;
      this.prefetched.clear();
      
      if (this.loader) {
        this.loader.onload = null;
        this.loader.onerror = null;
        this.loader = null;
      }
      
      const slot = document.getElementById('cover-slot');
      if (slot) {
        this.clearSlot(slot);
      }
      
      this.updateNav();
    }
    
    async getFirstCoverUrl(key) {
      const id = this.getId(key);
      if (!id) return 'img/logo.png';
      
      try {
        const r = await fetch(`${this.BASE}${id}/index.json`, { cache: 'force-cache' });
        if (!r.ok) return 'img/logo.png';
        
        const d = await r.json();
        const raw = (Array.isArray(d.items) ? d.items : (Array.isArray(d) ? d : []))[0];
        
        if (!raw) return 'img/logo.png';
        
        const n = this.norm(raw, `${this.BASE}${id}/`);
        return n?.type === 'img' 
          ? (n.formats?.webp || n.formats?.full || n.src || 'img/logo.png') 
          : 'img/logo.png';
      } catch (e) {
        return 'img/logo.png';
      }
    }
  }

  // Создаём глобальный экземпляр
  window.GalleryManager = new GalleryManager();
  
  console.log('✅ GalleryManager class loaded');
})();
