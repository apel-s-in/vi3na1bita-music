// scripts/ui/favorites-data.js
// Data-хелперы «Избранного» + TTL-кэш обложек.
// Экспортирует совместимые функции в window.* для обратной совместимости.

(function FavoritesDataModule() {
  const w = window;

  const FAVORITES_REFS_KEY = 'favoritesAlbumRefs:v1';
  const COVER_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов
  const albumCoverCache = Object.create(null); // { [albumKey]: { url:string, ts:number } }

  // Безопасные геттеры likedTracks:v2
  function getLikedMap() {
    try { const raw = localStorage.getItem('likedTracks:v2'); const obj = raw ? JSON.parse(raw) : {}; return obj && typeof obj === 'object' ? obj : {}; }
    catch { return {}; }
  }
  function getLikedForAlbum(albumKey) {
    try { const map = getLikedMap(); const arr = map && typeof map === 'object' ? map[albumKey] : []; return Array.isArray(arr) ? arr : []; }
    catch { return []; }
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
    const albumsIndex = w.albumsIndex || [];
    for (const alb of albumsIndex) {
      if (!alb || !alb.key) continue;
      const liked = getLikedForAlbum(alb.key);
      liked.forEach(ti => {
        const k = `${alb.key}:${ti}`;
        if (!keySet.has(k)) { refs.push({ a: alb.key, t: ti }); keySet.add(k); }
      });
    }
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
    if (albumConfigCache[albumKey]?.config) return albumConfigCache[albumKey].config;

    const albumsIndex = w.albumsIndex || [];
    const meta = albumsIndex.find(a => a && a.key === albumKey);
    if (!meta) return null;

    const base = (typeof w.normalizeBase === 'function') ? w.normalizeBase(meta.base) : meta.base;
    const absJoin = typeof w.absJoin === 'function' ? w.absJoin : ((b, r) => new URL(String(r||''), String(b||'') + '/').toString());

    try {
      const r = await fetch(absJoin(base, 'config.json'), { cache: 'no-cache' });
      const data = await r.json();
      (data.tracks || []).forEach(t => {
        t.audio = absJoin(base, t.audio);
        t.lyrics = absJoin(base, t.lyrics);
        if (t.fulltext) t.fulltext = absJoin(base, t.fulltext);
      });
      albumConfigCache[albumKey] = { base, config: data };
      w.albumConfigCache = albumConfigCache;
      return data;
    } catch {
      return null;
    }
  }

  async function getAlbumCoverUrl(albumKey) {
    const now = Date.now();
    const cache = albumCoverCache[albumKey];
    if (cache && (now - cache.ts) < COVER_TTL_MS) return cache.url;

    try {
      const centralIdForAlbumKey = w.centralIdForAlbumKey;
      const normalizeGalleryItem = w.normalizeGalleryItem;
      const CENTRAL_GALLERY_BASE = w.CENTRAL_GALLERY_BASE || './albums/gallery/';
      const cid = typeof centralIdForAlbumKey === 'function' ? centralIdForAlbumKey(albumKey) : null;
      if (!cid) {
        albumCoverCache[albumKey] = { url: 'img/logo.png', ts: now };
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
          return url;
        }
      }
    } catch {}
    albumCoverCache[albumKey] = { url: 'img/logo.png', ts: now };
    return 'img/logo.png';
  }

  async function buildFavoritesRefsModel() {
    const sortedRefs = getSortedFavoritesRefs();
    const out = [];
    for (const ref of sortedRefs) {
      const cfg = await getAlbumConfigByKey(ref.a);
      const tr = cfg?.tracks?.[ref.t];
      if (!tr) continue;
      const active = getLikedForAlbum(ref.a).includes(ref.t);
      const cover = await getAlbumCoverUrl(ref.a);
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

  // Экспорт API
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

  // Совместимость со старым кодом (глобали)
  w.readFavoritesRefs = readFavoritesRefs;
  w.writeFavoritesRefs = writeFavoritesRefs;
  w.ensureFavoritesRefsWithLikes = ensureFavoritesRefsWithLikes;
  w.getSortedFavoritesRefs = getSortedFavoritesRefs;
  w.getAlbumConfigByKey = getAlbumConfigByKey;
  w.buildFavoritesRefsModel = buildFavoritesRefsModel;
  w.updateFavoritesRefsModelActiveFlag = updateFavoritesRefsModelActiveFlag;

})();
