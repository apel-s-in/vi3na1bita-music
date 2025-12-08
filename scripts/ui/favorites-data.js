// scripts/ui/favorites-data.js
// Data-хелперы «Избранного» + TTL-кэш обложек.
// Экспортирует совместимые функции в window.* для обратной совместимости.

(function FavoritesDataModule() {
  const w = window;

  const FAVORITES_REFS_KEY = window.FAVORITES_REFS_KEY || 'favoritesAlbumRefs:v1';
  const COVER_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов
  const albumCoverCache = Object.create(null);

  function getLikedMap() {
    try { const raw = localStorage.getItem('likedTracks:v2'); const obj = raw ? JSON.parse(raw) : {}; return obj && typeof obj === 'object' ? obj : {}; }
    catch { return {}; }
  }
  
  function getLikedForAlbum(albumKey) {
    try {
      const map = getLikedMap();
      const arr = (map && typeof map === 'object') ? map[albumKey] : [];
      if (!Array.isArray(arr)) return [];
      const norm = Array.from(new Set(arr.map(n => parseInt(n, 10)).filter(Number.isFinite)));
      return norm;
    } catch {
      return [];
    }
  }

  function readFavoritesRefs() {
    try { const raw = localStorage.getItem(FAVORITES_REFS_KEY); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : []; }
    catch { return []; }
  }
  
  function writeFavoritesRefs(arr) {
    try { localStorage.setItem(FAVORITES_REFS_KEY, JSON.stringify(Array.isArray(arr) ? arr : [])); } catch {}
  }

  function ensureFavoritesRefsWithLikes() {
    const refs = readFavoritesRefs();
    const keySet = new Set(refs.map(x => `${x.a}:${x.t}`));

    try {
      const map = getLikedMap();
      const albumsIndex = Array.isArray(w.albumsIndex) ? w.albumsIndex : [];

      const indexKeys = albumsIndex.map(a => a && a.key).filter(Boolean);
      const likedKeys = Object.keys(map || {});
      const allKeysSet = new Set([...indexKeys, ...likedKeys]);

      for (const akey of allKeysSet) {
        const liked = Array.isArray(map?.[akey]) ? map[akey] : [];
        for (const ti of liked) {
          const k = `${akey}:${ti}`;
          if (!keySet.has(k)) {
            refs.push({ a: akey, t: ti });
            keySet.add(k);
          }
        }
      }
    } catch {}

    writeFavoritesRefs(refs);
    return refs;
  }

  function getSortedFavoritesRefs() {
    const refs = ensureFavoritesRefsWithLikes().slice();
    const ICON_ALBUMS_ORDER = (w.ICON_ALBUMS_ORDER || []).map(x => x.key)
      .filter(k => k !== w.SPECIAL_FAVORITES_KEY && k !== w.SPECIAL_RELIZ_KEY);
    const orderMap = new Map(ICON_ALBUMS_ORDER.map((k, i) => [k, i]));
    refs.sort((r1, r2) => {
      const o1 = orderMap.has(r1.a) ? orderMap.get(r1.a) : 999;
      const o2 = orderMap.has(r2.a) ? orderMap.get(r2.a) : 999;
      if (o1 !== o2) return o1 - o2;
      return (r1.t - r2.t);
    });
    return refs;
  }

  async function getAlbumConfigByKey(albumKey) {
    if (!albumKey) return null;
    const albumConfigCache = w.albumConfigCache || {};

    let realKey = albumKey;
    if (typeof w.resolveRealAlbumKey === 'function') {
      try {
        const cand = w.resolveRealAlbumKey(albumKey);
        if (cand) realKey = cand;
      } catch {}
    }

    if (albumConfigCache[albumKey]?.config) return albumConfigCache[albumKey].config;
    if (albumConfigCache[realKey]?.config)  return albumConfigCache[realKey].config;

    const albumsIndex = w.albumsIndex || [];
    const meta = (albumsIndex.find(a => a && a.key === realKey) ||
                  albumsIndex.find(a => a && a.key === albumKey)) || null;
    if (!meta) return null;

    const base = (typeof w.normalizeBase === 'function') ? w.normalizeBase(meta.base) : meta.base;
    const absJoin = typeof w.absJoin === 'function'
      ? w.absJoin
      : ((b, r) => new URL(String(r || ''), String(b || '') + '/').toString());

    try {
      const r = await fetch(absJoin(base, 'config.json'), { cache: 'no-cache' });
      if (!r || !r.ok) return null;
      const data = await r.json();
      (data.tracks || []).forEach(t => {
        t.audio   = absJoin(base, t.audio);
        t.lyrics  = absJoin(base, t.lyrics);
        if (t.fulltext) t.fulltext = absJoin(base, t.fulltext);
      });

      albumConfigCache[realKey]  = { base, config: data };
      albumConfigCache[albumKey] = { base, config: data };
      w.albumConfigCache = albumConfigCache;

      return data;
    } catch {
      return null;
    }
  }

  async function getAlbumCoverUrl(albumKey) {
    const now = Date.now();

    try {
      const sKey = `favCoverCache:v1:${albumKey}`;
      const raw = sessionStorage.getItem(sKey);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && obj.url && obj.ts && (now - obj.ts) < COVER_TTL_MS) {
          albumCoverCache[albumKey] = { url: obj.url, ts: obj.ts };
          return obj.url;
        }
      }
    } catch {}

    const cache = albumCoverCache[albumKey];
    if (cache && (now - cache.ts) < COVER_TTL_MS) return cache.url;

    try {
      const centralIdForAlbumKey = w.centralIdForAlbumKey;
      const normalizeGalleryItem = w.normalizeGalleryItem;
      const CENTRAL_GALLERY_BASE = w.CENTRAL_GALLERY_BASE || './albums/gallery/';
      const cid = typeof centralIdForAlbumKey === 'function' ? centralIdForAlbumKey(albumKey) : null;
      if (!cid) {
        albumCoverCache[albumKey] = { url: 'img/logo.png', ts: now };
        try { sessionStorage.setItem(`favCoverCache:v1:${albumKey}`, JSON.stringify({ url: 'img/logo.png', ts: now })); } catch {}
        return 'img/logo.png';
      }
      const baseDir = `${CENTRAL_GALLERY_BASE}${cid}/`;
      const r = await fetch(baseDir + 'index.json', { cache: 'force-cache' });
      if (r.ok) {
        const j = await r.json();
        const first = Array.isArray(j.items) ? j.items[0] : (Array.isArray(j) ? j[0] : null);
        if (first) {
          const norm = typeof normalizeGalleryItem === 'function' ? normalizeGalleryItem(first, baseDir) : first;
          const url = (norm && (norm.formats?.webp || norm.formats?.full || norm.src)) || 'img/logo.png';
          albumCoverCache[albumKey] = { url, ts: now };
          try { sessionStorage.setItem(`favCoverCache:v1:${albumKey}`, JSON.stringify({ url, ts: now })); } catch {}
          return url;
        }
      }
    } catch {}

    albumCoverCache[albumKey] = { url: 'img/logo.png', ts: now };
    try { sessionStorage.setItem(`favCoverCache:v1:${albumKey}`, JSON.stringify({ url: 'img/logo.png', ts: now })); } catch {}
    return 'img/logo.png';
  }

  async function buildFavoritesRefsModel() {
    const sortedRefs = getSortedFavoritesRefs();
    const out = [];

    for (const ref of sortedRefs) {
      const active = getLikedForAlbum(ref.a).includes(ref.t);

      let cfg = null;
      try { cfg = await getAlbumConfigByKey(ref.a); } catch {}
      const tr = cfg?.tracks?.[ref.t] || null;

      const cover = await getAlbumCoverUrl(ref.a);

      if (tr && tr.audio) {
        out.push({
          title: tr.title,
          audio: tr.audio,
          lyrics: tr.lyrics,
          fulltext: tr.fulltext || null,
          __a: ref.a,
          __t: ref.t,
          __artist: cfg?.artist || 'Витрина Разбита',
          __album: cfg?.albumName || 'Альбом',
          __active: active,
          __cover: cover
        });
        continue;
      }

      // ❌ ПРОПУСКАЕМ неполные треки ПОЛНОСТЬЮ
      console.warn(`⚠️ Track not found: album=${ref.a}, track=${ref.t}`);
      
      // ✅ Автоматически удаляем из localStorage
      if (window.FavoritesManager && typeof window.FavoritesManager.toggleLike === 'function') {
        window.FavoritesManager.toggleLike(ref.a, ref.t, false);
      }
    }

    w.favoritesRefsModel = out;
    return out;
  }

  function updateFavoritesRefsModelActiveFlag(albumKey, trackIndex, isActive) {
    const model = w.favoritesRefsModel;
    if (!Array.isArray(model)) return;
    const item = model.find(x => x.__a === albumKey && x.__t === trackIndex);
    if (item) item.__active = !!isActive;
  }

  function centralIdForAlbumKey(albumKey) {
    if (!albumKey) return null;
    if (albumKey === '__favorites__') return null;
    
    const ALBUM_GALLERY_MAP = {
      'krevetochka': '00',
      'mezhdu-zlom-i-dobrom': '01',
      'golos-dushi': '02',
      '__reliz__': 'news'
    };
    
    const CENTRAL_ALLOWED_IDS = new Set(['00', '01', '02', 'news']);
    const id = ALBUM_GALLERY_MAP[albumKey] || null;
    return id && CENTRAL_ALLOWED_IDS.has(id) ? id : null;
  }

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
      return { 
        type: isHtml ? 'html' : 'img', 
        src, 
        formats: null, 
        ar: 1 
      };
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
    
    return { type: 'img', src, formats, ar: 1 };
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
    try {
      return new URL(String(rel || ''), normalizeBase(base) + '/').toString();
    } catch {
      const norm = normalizeBase(base);
      return norm + '/' + String(rel || '').replace(/^\/+/, '');
    }
  }

  w.centralIdForAlbumKey = centralIdForAlbumKey;
  w.normalizeGalleryItem = normalizeGalleryItem;
  w.normalizeBase = normalizeBase;
  w.absJoin = absJoin;
  w.CENTRAL_GALLERY_BASE = w.APP_CONFIG?.CENTRAL_GALLERY_BASE || './albums/gallery/';

  w.FavoritesData = {
    readFavoritesRefs,
    writeFavoritesRefs,
    ensureFavoritesRefsWithLikes,
    getSortedFavoritesRefs,
    getAlbumConfigByKey,
    buildFavoritesRefsModel,
    updateFavoritesRefsModelActiveFlag,
    getAlbumCoverUrl
  };

  w.readFavoritesRefs = readFavoritesRefs;
  w.writeFavoritesRefs = writeFavoritesRefs;
  w.ensureFavoritesRefsWithLikes = ensureFavoritesRefsWithLikes;
  w.getSortedFavoritesRefs = getSortedFavoritesRefs;
  w.getAlbumConfigByKey = getAlbumConfigByKey;
  w.buildFavoritesRefsModel = buildFavoritesRefsModel;
  w.updateFavoritesRefsModelActiveFlag = updateFavoritesRefsModelActiveFlag;

})();
