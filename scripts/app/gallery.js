const W = window, D = document, $ = id => D.getElementById(id), BASE = './albums/gallery/', LOGO = 'img/logo.png', C404 = 'gallery_404_cache:v2';
const MAP = { 'krevetochka': '00', 'mezhdu-zlom-i-dobrom': '01', 'golos-dushi': '02', 'odnazhdy-v-skazke': '03', 'ne-vse-ravno': '04' };
const ss = (k, v) => v === undefined ? JSON.parse(sessionStorage.getItem(k) || '{}') : sessionStorage.setItem(k, JSON.stringify(v));

class GalleryManager {
  it = []; idx = 0; tm = null; pre = new Set(); flip = 0; meta = new Map();
  
  initialize() {
    const go = d => this.it.length > 1 && (this.show((this.idx + d + this.it.length) % this.it.length), this.play());
    $('cover-gallery-arrow-left')?.addEventListener('click', () => go(-1)); $('cover-gallery-arrow-right')?.addEventListener('click', () => go(1));
    const w = $('cover-wrap');
    if (w) { let x = null; w.addEventListener('touchstart', e => x = e.touches[0].clientX, { passive: true }); w.addEventListener('touchend', e => { if (x !== null && Math.abs(e.changedTouches[0].clientX - x) > 50) go(e.changedTouches[0].clientX < x ? 1 : -1); x = null; }, { passive: true }); }
    D.addEventListener('visibilitychange', () => D.hidden ? this.stop() : this.play());
  }
  
  _norm(i, dir) {
    if (!i || i.type === 'html' || (typeof i === 'string' && /\.html/i.test(i))) return null;
    const p = (typeof i === 'string') ? i : (i.formats?.webp || i.formats?.full || i.src);
    return p ? (/^(https?:)?\/\//.test(p) ? p : (/^(albums|img|icons)\//.test(p) ? './'+p : dir + p)) : null;
  }
  
  async loadGallery(key) {
    this.stop(); this.it = []; this.idx = 0;
    const id = MAP[key], slot = $('cover-slot'), dir = `${BASE}${id}/`, setL = () => { if(slot) slot.innerHTML = `<img src="${LOGO}" alt="Cover" draggable="false" style="width:100%;height:100%;object-fit:contain">`; this._nav(); };
    if (!id || ss(C404)[id]) return setL();
    try {
      let items = this.meta.get(id);
      if (!items) {
        const fc = W.Utils?.fetchCache, d = fc?.getJson ? await fc.getJson({ key: `gallery:index:${id}`, url: `${dir}index.json`, ttlMs: 43200000, store: 'session', fetchInit: { cache: 'force-cache' } }) : await (W.NetPolicy?.fetchWithTraffic?.(`${dir}index.json`, { cache: 'force-cache' }) || fetch(`${dir}index.json`, { cache: 'force-cache' })).then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`));
        this.meta.set(id, items = Array.isArray(d.items) ? d.items : (Array.isArray(d) ? d : []));
      }
      this.it = items.map(i => this._norm(i, dir)).filter(Boolean); this.it.length ? (this.show(0), this.play()) : setL();
    } catch (e) { if (String(e?.message || '').includes('404')) ss(C404, { ...ss(C404), [id]: 1 }); setL(); }
    this._nav();
  }

  show(i) {
    if (!this.it.length) return;
    this.idx = i; const src = this.it[i], slot = $('cover-slot'); if (!slot) return;
    if (slot.children.length < 2 || slot.querySelector('iframe')) { slot.innerHTML = `<img style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;transition:opacity .3s ease-out;opacity:0" alt="Cover" draggable="false">`.repeat(2); this.flip = 0; }
    const imgs = slot.querySelectorAll('img'), nxt = imgs[this.flip === 0 ? 1 : 0], cur = imgs[this.flip], img = new Image();
    img.onload = () => { nxt.src = src; nxt.style.opacity = '1'; cur.style.opacity = '0'; this.flip = this.flip === 0 ? 1 : 0; this._pre(); }; img.onerror = () => this._pre(); img.src = src;
  }

  _pre() { const n = this.it[(this.idx + 1) % this.it.length]; if (n && !this.pre.has(n)) { if (this.pre.size > 20) this.pre.clear(); (new Image()).src = n; this.pre.add(n); } }
  _nav() { $('cover-wrap')?.classList.toggle('gallery-nav-ready', this.it.length > 1); }
  play() { this.stop(); if (this.it.length > 1) this.tm = setInterval(() => this.show((this.idx + 1) % this.it.length), 5000); }
  stop() { if (this.tm) clearInterval(this.tm); this.tm = null; }
  clear() { this.stop(); this.it = []; this.pre.clear(); if ($('cover-slot')) $('cover-slot').innerHTML = ''; this._nav(); }
  getItemsCount() { return this.it.length; } getCurrentIndex() { return this.idx; }
  
  async getFirstCoverUrl(key) {
    const id = MAP[key]; if (!id) return LOGO;
    try {
      let items = this.meta.get(id);
      if (!items) {
        const dir = `${BASE}${id}/`, d = W.Utils?.fetchCache?.getJson ? await W.Utils.fetchCache.getJson({ key: `gallery:index:${id}`, url: `${dir}index.json`, ttlMs: 43200000, store: 'session', fetchInit: { cache: 'force-cache' } }) : await (W.NetPolicy?.fetchWithTraffic?.(`${dir}index.json`, { cache: 'force-cache' }) || fetch(`${dir}index.json`, { cache: 'force-cache' })).then(r => r.ok ? r.json() : null);
        this.meta.set(id, items = Array.isArray(d?.items) ? d.items : (Array.isArray(d) ? d : []));
      }
      return this._norm((items || [])[0], `${BASE}${id}/`) || LOGO;
    } catch { return LOGO; }
  }
}
W.GalleryManager = new GalleryManager(); export default W.GalleryManager;
