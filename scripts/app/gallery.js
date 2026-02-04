// scripts/app/gallery.js
// Optimized GalleryManager v2.0

const W = window, D = document;
const CACHE_404 = 'gallery_404_cache:v1';
const MAP = { 
  'krevetochka': '00', 'mezhdu-zlom-i-dobrom': '01', 
  'golos-dushi': '02', 'odnazhdy-v-skazke': '03', '__reliz__': 'news' 
};
const BASE = './albums/gallery/';
const LOGO = 'img/logo.png';

const $ = (id) => D.getElementById(id);
const ss = (k, v) => { 
  try { 
    if(v===undefined) return JSON.parse(sessionStorage.getItem(k)||'{}'); 
    sessionStorage.setItem(k, JSON.stringify(v)); 
  } catch(e){ return {}; } 
};

class GalleryManager {
  constructor() {
    this.it = [];   // items
    this.idx = 0;   // currentIndex
    this.tm = null; // timer
    this.lck = false; // lock
    this.pre = new Set(); // prefetched
    this.ldr = null; // current image loader
  }

  initialize() {
    // Navigation
    const go = (d) => this.it.length > 1 && (this.show((this.idx + d + this.it.length) % this.it.length), this.play());
    $('cover-gallery-arrow-left')?.addEventListener('click', () => go(-1));
    $('cover-gallery-arrow-right')?.addEventListener('click', () => go(1));

    // Swipe
    const w = $('cover-wrap');
    if (w) {
      let x = 0;
      w.addEventListener('touchstart', e => x = e.touches[0].clientX, {passive:true});
      w.addEventListener('touchend', e => {
        if (x === null) return;
        const d = e.changedTouches[0].clientX - x;
        if (Math.abs(d) > 50) go(d > 0 ? -1 : 1);
        x = null;
      }, {passive:true});
    }

    // Visibility
    D.addEventListener('visibilitychange', () => D.hidden ? this.stop() : (this.it.length > 1 && this.play()));
    console.log('✅ GalleryManager optimized');
  }

  _id(k) { return (k && k !== '__favorites__' && MAP[k]) || null; }

  async loadGallery(key) {
    this.stop();
    this.it = [];
    this.idx = 0;
    
    const id = this._id(key);
    const slot = $('cover-slot');
    const setLogo = () => { if(slot) slot.innerHTML = `<img src="${LOGO}" alt="Cover" draggable="false">`; this._nav(); };

    if (!id || ss(CACHE_404)[id]) return setLogo();

    try {
      const dir = `${BASE}${id}/`;
      const r = await fetch(`${dir}index.json`, { cache: 'force-cache' });
      if (!r.ok) {
        if (r.status === 404) ss(CACHE_404, { ...ss(CACHE_404), [id]: 1 });
        throw 0;
      }
      
      const d = await r.json();
      this.it = (Array.isArray(d.items) ? d.items : (Array.isArray(d) ? d : []))
        .map(i => this._norm(i, dir)).filter(Boolean);

      if (this.it.length) {
        this.show(0);
        this.play();
      } else setLogo();
    } catch { setLogo(); }
    
    this._nav();
  }

  _norm(i, dir) {
    if (!i) return null;
    const abs = (p) => {
      if (!p) return null;
      return /^(https?:)?\/\//.test(p) ? p : (/^(albums|img|icons)\//.test(p) ? './'+p : dir + p);
    };
    
    if (typeof i === 'string') return /\.html([?#]|$)/i.test(i) ? { t: 'html', s: abs(i) } : { t: 'img', s: abs(i) };
    const t = (i.type||'').toLowerCase() === 'html' ? 'html' : 'img';
    if (t === 'html') return { t, s: abs(i.src) };
    
    const f = i.formats || {};
    return { t, s: abs(f.full||i.src), w: abs(f.webp), f: { w: abs(f.webp), f: abs(f.full||i.src) } };
  }

  show(i) {
    if (this.lck || !this.it.length) return;
    this.lck = true;
    this.idx = i;
    
    const it = this.it[i];
    const slot = $('cover-slot');
    if (!slot || !it) return (this.lck = false);

    if (this.ldr) { 
        this.ldr.onload = null; 
        this.ldr.onerror = null; 
        this.ldr.src = ''; 
        this.ldr = null; 
    }

    const finish = () => { setTimeout(() => { this._pre(); this.lck = false; }, 200); };

    // Clear content
    while(slot.firstChild) slot.removeChild(slot.firstChild);

    if (it.t === 'html') {
      const f = D.createElement('iframe');
      f.sandbox = 'allow-scripts allow-popups allow-forms';
      f.referrerPolicy = 'no-referrer';
      f.loading = 'lazy';
      f.src = it.s;
      slot.appendChild(f);
      finish();
    } else {
      const img = new Image();
      // Очистка предыдущего загрузчика, если он был
      if(this.ldr) { this.ldr.onload = null; this.ldr.onerror = null; this.ldr.src = ''; }
      this.ldr = img;
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.src = it.w || it.s;
      
      img.onload = () => {
        if (this.ldr !== img) return;
        const p = D.createElement('picture');
        if (it.w) { const s = D.createElement('source'); s.type = 'image/webp'; s.srcset = it.w; p.appendChild(s); }
        const el = D.createElement('img');
        el.src = it.s;
        el.alt = 'Cover';
        el.decoding = 'async';
        el.referrerPolicy = 'no-referrer';
        el.style.cssText = 'opacity:0;transition:opacity .15s ease-out';
        p.appendChild(el);
        slot.appendChild(p);
        requestAnimationFrame(() => el.style.opacity = '1');
        finish();
      };
      img.onerror = finish;
    }
  }

  _pre() {
    if (this.it.length < 2) return;
    const n = this.it[(this.idx + 1) % this.it.length];
    if (n?.t === 'img' && n.w && !this.pre.has(n.w)) {
      if (this.pre.size > 20) this.pre.clear();
      (new Image()).src = n.w;
      this.pre.add(n.w);
    }
  }

  _nav() {
    $('cover-wrap')?.classList.toggle('gallery-nav-ready', this.it.length > 1);
  }

  play() {
    this.stop();
    if (this.it.length > 1) this.tm = setInterval(() => this.show((this.idx + 1) % this.it.length), 5000);
  }

  stop() { if (this.tm) clearInterval(this.tm); this.tm = null; }

  clear() {
    this.stop();
    this.it = [];
    this.pre.clear();
    this.ldr = null;
    if ($('cover-slot')) $('cover-slot').innerHTML = '';
    this._nav();
  }

  getItemsCount() { return this.it.length; }
  getCurrentIndex() { return this.idx; }

  async getFirstCoverUrl(key) {
    const id = this._id(key);
    if (!id) return LOGO;
    try {
      const dir = `${BASE}${id}/`;
      const r = await fetch(`${dir}index.json`, { cache: 'force-cache' });
      if (!r.ok) return LOGO;
      const d = await r.json();
      const i = (d.items||d||[])[0];
      if (!i) return LOGO;
      const n = this._norm(i, dir);
      return (n.t === 'img' ? (n.w || n.s) : LOGO);
    } catch { return LOGO; }
  }
}

W.GalleryManager = new GalleryManager();
export default W.GalleryManager;
