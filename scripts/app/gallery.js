import { buildGalleryRecommendationCards, recordGalleryRecommendationClicked, recordGalleryRecommendationShown, renderGalleryRecommendationCard } from './gallery-recommendation-cards.js';
import { openRecommendedTrack, playRecommendedTrack } from './recommendation-playback.js';

const W = window;
const D = document;
const $ = id => D.getElementById(id);
const BASE = './albums/gallery/';
const LOGO = 'img/logo.png';
const C404 = 'gallery_404_cache:v2';
const MAP = { krevetochka: '00', 'mezhdu-zlom-i-dobrom': '01', 'golos-dushi': '02', 'odnazhdy-v-skazke': '03', 'ne-vse-ravno': '04', neizvestniy: '05', 'v-ssore': '06' };
const ss = (key, value) => value === undefined ? JSON.parse(sessionStorage.getItem(key) || '{}') : sessionStorage.setItem(key, JSON.stringify(value));

class GalleryManager {
  it = [];
  idx = 0;
  tm = null;
  pre = new Set();
  flip = 0;
  meta = new Map();
  loadSeq = 0;

  initialize() {
    const move = direction => {
      if (this.it.length <= 1) return;
      this.show((this.idx + direction + this.it.length) % this.it.length);
      this.play();
    };
    $('cover-gallery-arrow-left')?.addEventListener('click', () => move(-1));
    $('cover-gallery-arrow-right')?.addEventListener('click', () => move(1));

    const wrap = $('cover-wrap');
    const slot = $('cover-slot');
    if (wrap) {
      let startX = null;
      wrap.addEventListener('touchstart', event => {
        startX = event.touches[0].clientX;
      }, { passive: true });
      wrap.addEventListener('touchend', event => {
        if (startX !== null && Math.abs(event.changedTouches[0].clientX - startX) > 50) {
          move(event.changedTouches[0].clientX < startX ? 1 : -1);
        }
        startX = null;
      }, { passive: true });
      wrap.addEventListener('mouseenter', () => this.stop());
      wrap.addEventListener('mouseleave', () => this.play());
      wrap.addEventListener('focusin', () => this.stop());
      wrap.addEventListener('focusout', () => this.play());
    }

    slot?.addEventListener('click', event => {
      const playUid = event.target.closest('[data-gallery-play]')?.dataset.galleryPlay;
      const openUid = event.target.closest('[data-gallery-open]')?.dataset.galleryOpen;
      const albumKey = event.target.closest('[data-gallery-album]')?.dataset.galleryAlbum;
      const card = this.it[this.idx]?.type === 'recommendation' ? this.it[this.idx] : null;

      if (playUid) {
        event.preventDefault();
        recordGalleryRecommendationClicked(card, playUid).catch(() => null);
        playRecommendedTrack(playUid).catch(() => null);
      } else if (openUid) {
        event.preventDefault();
        recordGalleryRecommendationClicked(card, openUid).catch(() => null);
        openRecommendedTrack(openUid).catch(() => null);
      } else if (albumKey) {
        event.preventDefault();
        W.AlbumsManager?.loadAlbum?.(albumKey);
      }
    });

    D.addEventListener('visibilitychange', () => D.hidden ? this.stop() : this.play());
  }

  _norm(item, directory) {
    if (!item || item.type === 'html' || (typeof item === 'string' && /\.html/i.test(item))) return null;
    const path = typeof item === 'string' ? item : item.formats?.webp || item.formats?.full || item.src;
    if (!path) return null;
    const src = /^(https?:)?\/\//.test(path) ? path : /^(albums|img|icons)\//.test(path) ? `./${path}` : `${directory}${path}`;
    return { type: 'image', src };
  }

  async _loadMeta(id) {
    let items = this.meta.get(id);
    if (items) return items;
    const directory = `${BASE}${id}/`;
    const data = await W.Utils.fetchCache.getJson({ key: `gallery:index:${id}`, url: `${directory}index.json`, ttlMs: 43200000, store: 'session', fetchInit: { cache: 'force-cache' } });
    items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    this.meta.set(id, items);
    return items;
  }

  async loadGallery(albumKey) {
    const sequence = ++this.loadSeq;
    this.stop();
    this.it = [];
    this.idx = 0;

    const id = MAP[albumKey];
    const slot = $('cover-slot');
    const directory = id ? `${BASE}${id}/` : '';
    const setLogo = () => {
      if (slot) slot.innerHTML = `<img src="${LOGO}" alt="Cover" draggable="false" style="width:100%;height:100%;object-fit:contain">`;
    };

    let images = [];
    if (id && !ss(C404)[id]) {
      try {
        const metadata = await this._loadMeta(id);
        images = metadata.map(item => this._norm(item, directory)).filter(Boolean);
      } catch (error) {
        if (String(error?.message || '').includes('404')) ss(C404, { ...ss(C404), [id]: 1 });
      }
    }

    const recommendations = await buildGalleryRecommendationCards().catch(() => []);
    if (sequence !== this.loadSeq) return false;

    this.it = [...images, ...recommendations];
    if (this.it.length) {
      this.show(0);
      this.play();
    } else {
      setLogo();
    }
    this._nav();
    return true;
  }

  show(index) {
    if (!this.it.length) return;
    this.idx = Math.max(0, Math.min(this.it.length - 1, Number(index) || 0));
    const item = this.it[this.idx];
    const slot = $('cover-slot');
    if (!slot || !item) return;

    if (item.type === 'recommendation') {
      slot.innerHTML = renderGalleryRecommendationCard(item);
      slot.dataset.galleryType = 'recommendation';
      recordGalleryRecommendationShown(item).catch(() => null);
      this._pre();
      return;
    }

    slot.dataset.galleryType = 'image';
    if (slot.children.length < 2 || slot.querySelector('.gallery-rec-card, iframe')) {
      slot.innerHTML = `<img style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;transition:opacity .3s ease-out;opacity:0" alt="Cover" draggable="false">`.repeat(2);
      this.flip = 0;
    }
    const images = slot.querySelectorAll('img');
    const next = images[this.flip === 0 ? 1 : 0];
    const current = images[this.flip];
    const preload = new Image();
    preload.onload = () => {
      next.src = item.src;
      next.style.opacity = '1';
      current.style.opacity = '0';
      this.flip = this.flip === 0 ? 1 : 0;
      this._pre();
    };
    preload.onerror = () => this._pre();
    preload.src = item.src;
  }

  _pre() {
    const next = this.it[(this.idx + 1) % this.it.length];
    if (next?.type !== 'image' || !next.src || this.pre.has(next.src)) return;
    if (this.pre.size > 20) this.pre.clear();
    new Image().src = next.src;
    this.pre.add(next.src);
  }

  _nav() {
    $('cover-wrap')?.classList.toggle('gallery-nav-ready', this.it.length > 1);
  }

  play() {
    this.stop();
    if (this.it.length <= 1 || D.hidden) return;
    const current = this.it[this.idx];
    const delay = current?.type === 'recommendation' ? 9000 : 5000;
    this.tm = setTimeout(() => {
      this.tm = null;
      this.show((this.idx + 1) % this.it.length);
      this.play();
    }, delay);
  }

  stop() {
    clearTimeout(this.tm);
    this.tm = null;
  }

  clear() {
    this.loadSeq++;
    this.stop();
    this.it = [];
    this.pre.clear();
    const slot = $('cover-slot');
    if (slot) {
      slot.innerHTML = '';
      delete slot.dataset.galleryType;
    }
    this._nav();
  }

  getItemsCount() {
    return this.it.length;
  }

  getCurrentIndex() {
    return this.idx;
  }

  getItemsSnapshot() {
    return this.it.map(item => item.type === 'image'
      ? { type: 'image', src: item.src }
      : { type: 'recommendation', id: item.id, title: item.title });
  }

  async getFirstCoverUrl(albumKey) {
    const id = MAP[albumKey];
    if (!id) return LOGO;
    try {
      const items = await this._loadMeta(id);
      return this._norm(items[0], `${BASE}${id}/`)?.src || LOGO;
    } catch {
      return LOGO;
    }
  }
}

W.GalleryManager = new GalleryManager();
export default W.GalleryManager;
