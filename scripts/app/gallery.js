// Optimized GalleryManager v3.0
const W = window, D = document, $ = id => D.getElementById(id);
const BASE = './albums/gallery/', LOGO = 'img/logo.png', C404 = 'gallery_404_cache:v2';
const MAP = { 'krevetochka': '00', 'mezhdu-zlom-i-dobrom': '01', 'golos-dushi': '02', 'odnazhdy-v-skazke': '03', '__reliz__': 'news' };
const ss = (k, v) => v === undefined ? JSON.parse(sessionStorage.getItem(k) || '{}') : sessionStorage.setItem(k, JSON.stringify(v));

class GalleryManager {
  it = []; idx = 0; tm = null; pre = new Set(); flip = 0;
  
  initialize() {
    const go = d => this.it.length > 1 && (this.show((this.idx + d + this.it.length) % this.it.length), this.play());
    $('cover-gallery-arrow-left')?.addEventListener('click', () => go(-1));
    $('cover-gallery-arrow-right')?.addEventListener('click', () => go(1));
    
    const w = $('cover-wrap');
    if (w) {
      let x = null;
      w.addEventListener('touchstart', e => x = e.touches[0].clientX, { passive: true });
      w.addEventListener('touchend', e => { if (x !== null && Math.abs(e.changedTouches[0].clientX - x) > 50) go(e.changedTouches[0].clientX < x ? 1 : -1); x = null; }, { passive: true });
    }
    D.addEventListener('visibilitychange', () => D.hidden ? this.stop() : this.play());
  }
  
  _norm(i, dir) {
    if (!i || i.type === 'html' || (typeof i === 'string' && /\.html/i.test(i))) return null;
    const p = (typeof i === 'string') ? i : (i.formats?.webp || i.formats?.full || i.src);
    if (!p) return null;
    return /^(https?:)?\/\//.test(p) ? p : (/^(albums|img|icons)\//.test(p) ? './'+p : dir + p);
  }
  
  async loadGallery(key) {
    this.stop(); this.it = []; this.idx = 0;
    const id = MAP[key], slot = $('cover-slot'), dir = `${BASE}${id}/`;
    const setL = () => { if(slot) slot.innerHTML = `<img src="${LOGO}" alt="Cover" draggable="false" style="width:100%;height:100%;object-fit:contain">`; this._nav(); };
    
    if (!id || ss(C404)[id]) return setL();
    try {
      const r = await fetch(`${dir}index.json`, { cache: 'force-cache' });
      if (!r.ok) { if (r.status === 404) ss(C404, { ...ss(C404), [id]: 1 }); throw 0; }
      const d = await r.json();
      this.it = (Array.isArray(d.items) ? d.items : (Array.isArray(d) ? d : [])).map(i => this._norm(i, dir)).filter(Boolean);
      this.it.length ? (this.show(0), this.play()) : setL();
    } catch { setL(); }
    this._nav();
  }

  show(i) {
    if (!this.it.length) return;
    this.idx = i; const src = this.it[i], slot = $('cover-slot');
    if (!slot) return;
    
    if (slot.children.length < 2 || slot.querySelector('iframe')) {
      slot.innerHTML = [0,1].map(() => `<img style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;transition:opacity .3s ease-out;opacity:0" alt="Cover" draggable="false">`).join('');
      this.flip = 0;
    }
    
    const imgs = slot.querySelectorAll('img'), nxt = imgs[this.flip === 0 ? 1 : 0], cur = imgs[this.flip];
    const img = new Image();
    img.onload = () => { nxt.src = src; nxt.style.opacity = '1'; cur.style.opacity = '0'; this.flip = this.flip === 0 ? 1 : 0; this._pre(); };
    img.onerror = () => this._pre();
    img.src = src;
  }

  _pre() {
    const n = this.it[(this.idx + 1) % this.it.length];
    if (n && !this.pre.has(n)) { if (this.pre.size > 20) this.pre.clear(); (new Image()).src = n; this.pre.add(n); }
  }

  _nav() { $('cover-wrap')?.classList.toggle('gallery-nav-ready', this.it.length > 1); }
  play() { this.stop(); if (this.it.length > 1) this.tm = setInterval(() => this.show((this.idx + 1) % this.it.length), 5000); }
  stop() { if (this.tm) clearInterval(this.tm); this.tm = null; }
  clear() { this.stop(); this.it = []; this.pre.clear(); if ($('cover-slot')) $('cover-slot').innerHTML = ''; this._nav(); }
  getItemsCount() { return this.it.length; }
  getCurrentIndex() { return this.idx; }
  
  async getFirstCoverUrl(key) {
    const id = MAP[key]; if (!id) return LOGO;
    try {
      const r = await fetch(`${BASE}${id}/index.json`, { cache: 'force-cache' });
      if (!r.ok) return LOGO;
      const d = await r.json(), n = this._norm((d.items || d || [])[0], `${BASE}${id}/`);
      return n || LOGO;
    } catch { return LOGO; }
  }
}
W.GalleryManager = new GalleryManager();
export default W.GalleryManager;
