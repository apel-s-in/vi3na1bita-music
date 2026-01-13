// scripts/ui/favorites.js
// ЕДИНЫЙ модуль UI для «Избранного» (объединяет бывшие favorites-const.js + favorites-data.js + часть favorites.js).
// Вся бизнес-логика избранного — в src/PlayerCore.js (toggleFavorite/getFavoritesState/removeInactivePermanently/restoreInactive).
// Этот файл отвечает только за:
// - построение favoritesRefsModel для UI (AlbumsManager.loadFavoritesAlbum)
// - подкачку метаданных трека из remote config.json
// - подкачку cover через GalleryManager
// - предоставление утилит UI (playFirstActiveFavorite)

(function FavoritesUIModule() {
  'use strict';

  const w = window;

  const FAV = w.SPECIAL_FAVORITES_KEY || '__favorites__';

  const COVER_TTL_MS = 12 * 60 * 60 * 1000;
  const albumCoverCache = Object.create(null);

  const CONFIG_TTL_MS = 10 * 60 * 1000; // 10 минут достаточно, config.json редко меняется
  const configCache = new Map(); // albumKey -> { ts, cfg } | { ts, p: Promise }

  const absJoin = (base, rel) => {
    try { return new URL(String(rel || ''), String(base || '').endsWith('/') ? String(base || '') : (String(base || '') + '/')).toString(); }
    catch { return null; }
  };

  function toStr(v) { return (v == null) ? '' : String(v); }
  function trim(v) { const s = String(v ?? '').trim(); return s || null; }

  async function getAlbumConfigByKey(albumKey) {
    const a = trim(albumKey);
    if (!a) return null;

    const now = Date.now();
    const cached = configCache.get(a);

    if (cached && cached.cfg && (now - cached.ts) < CONFIG_TTL_MS) {
      return cached.cfg;
    }

    if (cached && cached.p && (now - cached.ts) < CONFIG_TTL_MS) {
      try { return await cached.p; } catch { /* fallthrough */ }
    }

    const idx = Array.isArray(w.albumsIndex) ? w.albumsIndex : [];
    const meta = idx.find(x => x && x.key === a) || null;
    if (!meta?.base) return null;

    const p = (async () => {
      try {
        const url = absJoin(meta.base, 'config.json');
        const r = await fetch(url, { cache: 'no-cache' });
        if (!r.ok) return null;

        const cfg = await r.json();

        // normalize urls
        const base = String(meta.base || '');
        const tracks = Array.isArray(cfg?.tracks) ? cfg.tracks : [];
        tracks.forEach((t) => {
          if (!t || typeof t !== 'object') return;
          if (t.audio) t.audio = absJoin(base, t.audio);
          if (t.audio_low) t.audio_low = absJoin(base, t.audio_low);
          if (t.lyrics) t.lyrics = absJoin(base, t.lyrics);
          if (t.lrc) t.lrc = absJoin(base, t.lrc);
          if (t.fulltext) t.fulltext = absJoin(base, t.fulltext);
        });

        // ✅ быстрый доступ uid -> track (ускорение buildFavoritesRefsModel)
        try {
          const m = new Map();
          for (const t of tracks) {
            const uid = trim(t?.uid);
            if (uid && !m.has(uid)) m.set(uid, t);
          }
          cfg.__uidMap = m;
        } catch {}

        configCache.set(a, { ts: Date.now(), cfg });
        return cfg;
      } catch {
        configCache.delete(a);
        return null;
      }
    })();

    // dedupe inflight
    configCache.set(a, { ts: now, p });

    return await p;
  }

  async function getAlbumCoverUrl(albumKey) {
    const a = trim(albumKey);
    if (!a) return 'img/logo.png';

    const now = Date.now();
    try {
      const sKey = `favCoverCache:v1:${a}`;
      const raw = sessionStorage.getItem(sKey);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && obj.url && obj.ts && (now - obj.ts) < COVER_TTL_MS) {
          albumCoverCache[a] = { url: obj.url, ts: obj.ts };
          return obj.url;
        }
      }
    } catch {}

    const cached = albumCoverCache[a];
    if (cached && (now - cached.ts) < COVER_TTL_MS) return cached.url;

    try {
      const url = await w.GalleryManager?.getFirstCoverUrl?.(a);
      const safe = (url && typeof url === 'string') ? url : 'img/logo.png';
      albumCoverCache[a] = { url: safe, ts: now };
      try { sessionStorage.setItem(`favCoverCache:v1:${a}`, JSON.stringify({ url: safe, ts: now })); } catch {}
      return safe;
    } catch {
      albumCoverCache[a] = { url: 'img/logo.png', ts: now };
      return 'img/logo.png';
    }
  }

  function getAlbumTitleFromIndex(albumKey) {
    const a = trim(albumKey);
    const idx = Array.isArray(w.albumsIndex) ? w.albumsIndex : [];
    return (idx.find(x => x && x.key === a)?.title) || 'Альбом';
  }

  async function buildFavoritesRefsModel() {
    // Источник истины — PlayerCore
    const pc = w.playerCore;
    if (!pc?.getFavoritesState) {
      w.favoritesRefsModel = [];
      return [];
    }

    const state = pc.getFavoritesState();
    const refs = []
      .concat((Array.isArray(state?.active) ? state.active : []).map(t => ({ uid: trim(t?.uid), a: trim(t?.sourceAlbum) })))
      .concat((Array.isArray(state?.inactive) ? state.inactive : []).map(t => ({ uid: trim(t?.uid), a: trim(t?.sourceAlbum) })))
      .filter(x => x && x.uid && x.a);

    const out = [];

    for (const ref of refs) {
      const a = ref.a;
      const uid = ref.uid;

      // track meta from album config
      // eslint-disable-next-line no-await-in-loop
      const cfg = await getAlbumConfigByKey(a);
      const tr = (cfg && cfg.__uidMap && typeof cfg.__uidMap.get === 'function')
        ? (cfg.__uidMap.get(uid) || null)
        : ((Array.isArray(cfg?.tracks) ? cfg.tracks : []).find(t => trim(t?.uid) === uid) || null);

      // eslint-disable-next-line no-await-in-loop
      const cover = await getAlbumCoverUrl(a);

      const isActive = !!pc.isFavorite?.(uid);

      out.push({
        title: tr?.title || 'Трек',
        uid,

        audio: (isActive && tr?.audio) ? tr.audio : null,
        lyrics: (isActive && (tr?.lyrics || tr?.lrc)) ? (tr.lyrics || tr.lrc) : null,
        fulltext: (isActive && tr?.fulltext) ? (tr.fulltext || null) : null,

        __a: a,
        __uid: uid,
        __artist: cfg?.artist || 'Витрина Разбита',
        __album: cfg?.albumName || getAlbumTitleFromIndex(a),
        __active: isActive,
        __cover: cover
      });
    }

    w.favoritesRefsModel = out;
    return out;
  }

  /**
   * Вспомогательный метод для PlayerCore:
   * когда текущий в favorites стал inactive → стартуем первый активный (или STOP уже сделан ядром).
   */
  async function playFirstActiveFavorite() {
    try {
      await buildFavoritesRefsModel();
      const model = Array.isArray(w.favoritesRefsModel) ? w.favoritesRefsModel : [];
      const idx = model.findIndex(it => it && it.__active && it.audio);
      if (idx < 0) return;
      await w.AlbumsManager?.ensureFavoritesPlayback?.(idx);
    } catch {}
  }

  // Rebuild model when favorites change (best-effort) — без DOM events
  if (!w.__favoritesUIBound) {
    w.__favoritesUIBound = true;

    const bind = () => {
      const pc = w.playerCore;
      if (!pc?.onFavoritesChanged) return void setTimeout(bind, 100);

      pc.onFavoritesChanged(() => {
        // только модель; рендер в albums.js делает свой render()
        if (w.AlbumsManager?.getCurrentAlbum?.() === FAV) {
          buildFavoritesRefsModel().catch(() => {});
        }
      });
    };

    bind();
  }

  w.FavoritesUI = {
    buildFavoritesRefsModel,
    getAlbumConfigByKey,
    getAlbumCoverUrl,
    playFirstActiveFavorite
  };

  // Back-compat для существующих вызовов в albums.js (мы заменили на FavoritesUI, но оставим мягкий алиас)
  w.buildFavoritesRefsModel = buildFavoritesRefsModel;
})();
