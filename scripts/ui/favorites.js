// scripts/ui/favorites.js
// FavoritesUI: UI Model provider (Optimized v2.2)
(function (W) {
  'use strict';

  const FAV = W.SPECIAL_FAVORITES_KEY || '__favorites__';
  const LOGO = 'img/logo.png';
  const TTL = 12 * 3600 * 1000;
  const coverCache = new Map(); 
  
  const U = W.Utils;
  const trim = (v) => U.obj.trim(v);
  const getTitle = (k) => (Array.isArray(W.albumsIndex) && W.albumsIndex.find(x => x.key === k)?.title) || 'Альбом';

  const getAlbumCoverUrl = async (key) => {
    const a = trim(key);
    if (!a) return LOGO;
    
    const now = Date.now();
    const sk = `favCoverCache:v1:${a}`;

    // Session / Memory check
    try {
      const stored = U.obj.safeJson(sk);
      if (stored?.url && (now - stored.ts < TTL)) { coverCache.set(a, stored); return stored.url; }
    } catch {}
    
    const mem = coverCache.get(a);
    if (mem && (now - mem.ts < TTL)) return mem.url;

    // Fetch
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
    const raw = [
      ...(st.active || []), ...(st.inactive || [])
    ].map(t => ({ uid: trim(t?.uid), a: trim(t?.sourceAlbum) })).filter(x => x.uid);

    if (!raw.length) return (W.favoritesRefsModel = []);

    // Parallel covers
    const albums = [...new Set(raw.map(x => x.a).filter(Boolean))];
    const covers = new Map(await Promise.all(albums.map(async a => [a, await getAlbumCoverUrl(a)])));

    const likedCache = new Map();
    const isLiked = (uid, alb) => {
      if (!alb) return !!pc.isFavorite?.(uid);
      if (!likedCache.has(alb)) {
        const uids = pc.getLikedUidsForAlbum?.(alb) || [];
        likedCache.set(alb, new Set(uids.map(trim).filter(Boolean)));
      }
      return likedCache.get(alb).has(uid);
    };

    W.favoritesRefsModel = raw.map(({ uid, a }) => {
      const meta = W.TrackRegistry?.getTrackByUid(uid);
      const active = isLiked(uid, a);
      
      // Подготовка sources для резолвера
      const hi = (active && meta) ? trim(meta.urlHi || meta.audio) : null;
      const lo = (active && meta) ? trim(meta.urlLo || meta.audio_low) : null;

      return {
        title: meta?.title || 'Трек',
        uid,
        audio: hi || lo,
        sources: (hi || lo) ? { audio: { hi, lo } } : null,
        lyrics: (active && meta) ? trim(meta.lyrics) : null,
        fulltext: (active && meta) ? trim(meta.fulltext) : null,
        // UI Props
        __a: a,
        __uid: uid,
        __artist: 'Витрина Разбита',
        __album: getTitle(a),
        __active: active,
        __cover: covers.get(a) || LOGO,
        hasLyrics: !!(meta?.lyrics)
      };
    });
    
    return W.favoritesRefsModel;
  };

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

  W.FavoritesUI = {
    buildFavoritesRefsModel,
    getModel: () => W.favoritesRefsModel || [],
    getActiveModel: (m) => (m || W.FavoritesUI.getModel()).filter(it => it && it.__active && it.audio),
    getAlbumCoverUrl
  };
  
  // Back-compat alias
  W.buildFavoritesRefsModel = buildFavoritesRefsModel;
  init();
})(window);
