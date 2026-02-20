const W = window, D = document;
const CACHE_404 = 'gallery_404_cache:v1';
const MAP = { 
  'krevetochka': '00', 'mezhdu-zlom-i-dobrom': '01', 
  'golos-dushi': '02', 'odnazhdy-v-skazke': '03', '__reliz__': 'news' 
};
const BASE = './albums/gallery/';
const LOGO = 'img/logo.png';

const $ = (id) => D.getElementById(id);
const ss = (k, v) => { try { if(v===undefined) return JSON.parse(sessionStorage.getItem(k)||'{}'); sessionStorage.setItem(k, JSON.stringify(v)); } catch(e){ return {}; } };

class GalleryManager {
  constructor() {
    this.it = []; this.idx = 0; this.tm = null; this.lck = false;
    this.pre = new Set(); this.ldr = null; this.flip = 0;
  }

  initialize() {
    const go = (d) => this.it.length > 1 && (this.show((this.idx + d + this.it.length) % this.it.length), this.play());
    $('cover-gallery-arrow-left')?.addEventListener('click', () => go(-1));
    $('cover-gallery-arrow-right')?.addEventListener('click', () => go(1));

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
    D.addEventListener('visibilitychange', () => D.hidden ? this.stop() : (this.it.length > 1 && this.play()));
  }

  _id(k) { return (k && k !== '__favorites__' && MAP[k]) || null; }

  async loadGallery(key) {
    this.stop(); this.it = []; this.idx = 0;
    const id = this._id(key);
    const slot = $('cover-slot');
    const setLogo = () => { if(slot) slot.innerHTML = `<img src="${LOGO}" alt="Cover" draggable="false" style="width:100%;height:100%;object-fit:contain">`; this._nav(); };

    if (!id || ss(CACHE_404)[id]) return setLogo();

    try {
      const dir = `${BASE}${id}/`;
      const r = await fetch(`${dir}index.json`, { cache: 'force-cache' });
      if (!r.ok) { if (r.status === 404) ss(CACHE_404, { ...ss(CACHE_404), [id]: 1 }); throw 0; }
      const d = await r.json();
      this.it = (Array.isArray(d.items) ? d.items : (Array.isArray(d) ? d : [])).map(i => this._norm(i, dir)).filter(Boolean);

      if (this.it.length) { this.show(0); this.play(); } else setLogo();
    } catch { setLogo(); }
    this._nav();
  }

  _norm(i, dir) {
    if (!i || i.type === 'html' || (typeof i === 'string' && /\.html/i.test(i))) return null;
    const abs = (p) => p ? (/^(https?:)?\/\//.test(p) ? p : (/^(albums|img|icons)\//.test(p) ? './'+p : dir + p)) : null;
    if (typeof i === 'string') return { s: abs(i) };
    const f = i.formats || {};
    return { s: abs(f.full||i.src), w: abs(f.webp) };
  }

  show(i) {
    if (this.lck || !this.it.length) return;
    this.lck = true; this.idx = i;
    const it = this.it[i], slot = $('cover-slot');
    if (!slot || !it) return (this.lck = false);

    // GC Leak Fix: Держим только 2 тега <img> и переключаем opacity.
    if (slot.children.length < 2 || slot.querySelector('iframe')) {
      slot.innerHTML = '<img style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;transition:opacity .3s ease-out;opacity:1" alt="Cover" draggable="false"><img style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;transition:opacity .3s ease-out;opacity:0" alt="Cover" draggable="false">';
      this.flip = 0;
    }

    if (this.ldr) { this.ldr.onload = this.ldr.onerror = null; this.ldr.src = ''; }
    const img = new Image(); this.ldr = img;
    img.src = it.w || it.s;

    const finish = () => { setTimeout(() => { this._pre(); this.lck = false; }, 200); };

    img.onload = () => {
      if (this.ldr !== img) return;
      const imgs = slot.querySelectorAll('img'), nxt = imgs[this.flip === 0 ? 1 : 0], cur = imgs[this.flip];
      nxt.src = it.w || it.s; // Браузеры нативно понимают webp в img.src
      nxt.style.opacity = '1'; cur.style.opacity = '0';
      this.flip = this.flip === 0 ? 1 : 0;
      finish();
    };
    img.onerror = finish;
  }

  _pre() {
    if (this.it.length < 2) return;
    const n = this.it[(this.idx + 1) % this.it.length];
    if (n && n.w && !this.pre.has(n.w)) {
      if (this.pre.size > 20) this.pre.clear();
      (new Image()).src = n.w; this.pre.add(n.w);
    }
  }

  _nav() { $('cover-wrap')?.classList.toggle('gallery-nav-ready', this.it.length > 1); }
  play() { this.stop(); if (this.it.length > 1) this.tm = setInterval(() => this.show((this.idx + 1) % this.it.length), 5000); }
  stop() { if (this.tm) clearInterval(this.tm); this.tm = null; }
  clear() { this.stop(); this.it = []; this.pre.clear(); this.ldr = null; if ($('cover-slot')) $('cover-slot').innerHTML = ''; this._nav(); }
  getItemsCount() { return this.it.length; }
  getCurrentIndex() { return this.idx; }
  
  async getFirstCoverUrl(key) {
    const id = this._id(key); if (!id) return LOGO;
    try {
      const r = await fetch(`${BASE}${id}/index.json`, { cache: 'force-cache' });
      if (!r.ok) return LOGO;
      const d = await r.json(), i = (d.items||d||[])[0];
      if (!i) return LOGO;
      const n = this._norm(i, `${BASE}${id}/`);
      return n ? (n.w || n.s) : LOGO;
    } catch { return LOGO; }
  }
}

W.GalleryManager = new GalleryManager();
export default W.GalleryManager;
