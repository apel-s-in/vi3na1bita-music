// scripts/ui/favorites.js
// FavoritesUI: UI-модель «Избранного» поверх PlayerCore (Optimized v2.0)
(function (W) {
  'use strict';

  const FAV = W.SPECIAL_FAVORITES_KEY || '__favorites__';
  const LOGO = 'img/logo.png';
  const TTL = 12 * 3600 * 1000; // 12 часов
  const coverCache = new Map(); // Memory cache

  const trim = (v) => String(v ?? '').trim() || null;
  const getTitle = (k) => (Array.isArray(W.albumsIndex) && W.albumsIndex.find(x => x.key === k)?.title) || 'Альбом';

  // Optimized Cover Loader: Session -> Memory -> Net -> Save
  const getAlbumCoverUrl = async (key) => {
    const a = trim(key);
    if (!a) return LOGO;
    
    const now = Date.now();
    const sk = `favCoverCache:v1:${a}`;

    // 1. SessionStorage
    try {
      const stored = JSON.parse(sessionStorage.getItem(sk));
      if (stored?.url && stored.ts && (now - stored.ts < TTL)) {
        coverCache.set(a, stored);
        return stored.url;
      }
    } catch {}

    // 2. Memory
    const mem = coverCache.get(a);
    if (mem && (now - mem.ts < TTL)) return mem.url;

    // 3. Network (Gallery)
    try {
      const url = (await W.GalleryManager?.getFirstCoverUrl?.(a)) || LOGO;
      const rec = { ts: now, url };
      coverCache.set(a, rec);
      try { sessionStorage.setItem(sk, JSON.stringify(rec)); } catch {}
      return url;
    } catch { return LOGO; }
  };

  const buildFavoritesRefsModel = async () => {
    const pc = W.playerCore;
    if (!pc?.getFavoritesState) return (W.favoritesRefsModel = []);

    const st = pc.getFavoritesState();
    // Merge active & inactive into one list immediately
    const raw = [
      ...(Array.isArray(st?.active) ? st.active : []),
      ...(Array.isArray(st?.inactive) ? st.inactive : [])
    ].map(t => ({ uid: trim(t?.uid), a: trim(t?.sourceAlbum) })).filter(x => x.uid);

    if (!raw.length) return (W.favoritesRefsModel = []);

    // 1. Preload covers in parallel
    const albums = [...new Set(raw.map(x => x.a).filter(Boolean))];
    const covers = new Map(await Promise.all(albums.map(async a => [a, await getAlbumCoverUrl(a)])));

    // 2. Cache liked sets per album (to avoid N * M complexity)
    const likedCache = new Map();
    const isLiked = (uid, alb) => {
      if (!alb) return !!pc.isFavorite?.(uid);
      if (!likedCache.has(alb)) {
        const uids = pc.getLikedUidsForAlbum?.(alb) || [];
        likedCache.set(alb, new Set(uids.map(trim).filter(Boolean)));
      }
      return likedCache.get(alb).has(uid);
    };

    // 3. Build Model
    const out = raw.map(({ uid, a }) => {
      const meta = W.TrackRegistry?.getTrackByUid(uid);
      const active = isLiked(uid, a);
      const audio = (active && meta) ? (trim(meta.urlHi || meta.audio) || trim(meta.urlLo || meta.audio_low)) : null;

      return {
        title: meta?.title || 'Трек',
        uid,
        audio, // null for inactive
        lyrics: (active && meta) ? trim(meta.lyrics) : null,
        fulltext: (active && meta) ? trim(meta.fulltext) : null,
        
        // UI fields for favorites-view.js
        __a: a,
        __uid: uid,
        __artist: 'Витрина Разбита',
        __album: getTitle(a),
        __active: active,
        __cover: covers.get(a) || LOGO
      };
    });

    W.favoritesRefsModel = out;
    return out;
  };

  // Init Binding
  const init = () => {
    if (W.__favoritesUIBound) return;
    W.__favoritesUIBound = true;

    const bind = () => {
      if (W.playerCore?.onFavoritesChanged) {
        W.playerCore.onFavoritesChanged(() => {
          if (W.AlbumsManager?.getCurrentAlbum?.() === FAV) buildFavoritesRefsModel().catch(() => {});
        });
      } else setTimeout(bind, 100);
    };
    bind();
  };

  // Public API
  W.FavoritesUI = {
    buildFavoritesRefsModel,
    getModel: () => Array.isArray(W.favoritesRefsModel) ? W.favoritesRefsModel : [],
    getActiveModel: (m) => (m || W.FavoritesUI.getModel()).filter(it => it && it.__active && it.audio),
    getAlbumCoverUrl,
    playFirstActiveFavorite: async () => { try { await buildFavoritesRefsModel(); } catch {} } // Legacy compat
  };

  // Back-compat global alias
  W.buildFavoritesRefsModel = buildFavoritesRefsModel;
  
  init();
})(window);
