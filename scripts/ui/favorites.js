// scripts/ui/favorites.js
// FavoritesUI: UI-модель «Избранного» поверх PlayerCore.
// Источник истины: src/PlayerCore.js.
// Ускорение: метаданные треков берём из window.TrackRegistry (preload на старте допустим).
// Инварианты:
// - не трогает воспроизведение напрямую (кроме helper playFirstActiveFavorite через AlbumsManager, как и раньше)
// - inactive — чисто UI-буфер, не попадает в воспроизведение

(function FavoritesUIModule() {
  'use strict';

  const w = window;
  const FAV = w.SPECIAL_FAVORITES_KEY || '__favorites__';
  const LOGO = 'img/logo.png';
  const COVER_TTL_MS = 12 * 60 * 60 * 1000;

  const trim = (v) => {
    const s = String(v ?? '').trim();
    return s || null;
  };

  const albumCoverCache = new Map(); // albumKey -> { ts, url }

  function getAlbumTitleFromIndex(albumKey) {
    const a = trim(albumKey);
    const idx = Array.isArray(w.albumsIndex) ? w.albumsIndex : [];
    return (idx.find(x => x && x.key === a)?.title) || 'Альбом';
  }

  async function getAlbumCoverUrl(albumKey) {
    const a = trim(albumKey);
    if (!a) return LOGO;

    const now = Date.now();

    // sessionStorage cache (быстрый)
    try {
      const sKey = `favCoverCache:v1:${a}`;
      const raw = sessionStorage.getItem(sKey);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && obj.url && obj.ts && (now - obj.ts) < COVER_TTL_MS) {
          albumCoverCache.set(a, { ts: obj.ts, url: obj.url });
          return obj.url;
        }
      }
    } catch {}

    const cached = albumCoverCache.get(a);
    if (cached && (now - cached.ts) < COVER_TTL_MS) return cached.url;

    try {
      const url = await w.GalleryManager?.getFirstCoverUrl?.(a);
      const safe = (url && typeof url === 'string') ? url : LOGO;
      albumCoverCache.set(a, { ts: now, url: safe });
      try { sessionStorage.setItem(`favCoverCache:v1:${a}`, JSON.stringify({ url: safe, ts: now })); } catch {}
      return safe;
    } catch {
      albumCoverCache.set(a, { ts: now, url: LOGO });
      return LOGO;
    }
  }

  function getTrackMeta(uid) {
    const u = trim(uid);
    if (!u) return null;

    const reg = w.TrackRegistry;
    if (!reg || typeof reg.getTrackByUid !== 'function') return null;

    return reg.getTrackByUid(u) || null;
  }

  function getAudioUrl(meta) {
    // TrackRegistry нормализует urlHi/urlLo + может хранить audio/audio_low
    const hi = trim(meta?.urlHi || meta?.audio);
    const lo = trim(meta?.urlLo || meta?.audio_low);
    return hi || lo || null;
  }

  function getLyricsUrl(meta) {
    return trim(meta?.lyrics);
  }

  function getFulltextUrl(meta) {
    return trim(meta?.fulltext);
  }

  async function buildFavoritesRefsModel() {
    const pc = w.playerCore;
    if (!pc?.getFavoritesState) {
      w.favoritesRefsModel = [];
      return [];
    }

    const state = pc.getFavoritesState();

    const refs = []
      .concat((Array.isArray(state?.active) ? state.active : []).map(t => ({ uid: trim(t?.uid), a: trim(t?.sourceAlbum), active: true })))
      .concat((Array.isArray(state?.inactive) ? state.inactive : []).map(t => ({ uid: trim(t?.uid), a: trim(t?.sourceAlbum), active: false })))
      .filter(x => x && x.uid && x.a);

    if (!refs.length) {
      w.favoritesRefsModel = [];
      return [];
    }

    // Обложки получаем 1 раз на альбом (параллельно)
    const albumKeys = Array.from(new Set(refs.map(r => r.a).filter(Boolean)));
    const coverByAlbum = new Map();
    await Promise.all(albumKeys.map(async (a) => {
      coverByAlbum.set(a, await getAlbumCoverUrl(a));
    }));

    // Состояние "active" определяем по likedTrackUids:v1 (точно по альбому)
    const out = refs.map((ref) => {
      const a = ref.a;
      const uid = ref.uid;

      const meta = getTrackMeta(uid);

      const isActive = (a && typeof pc.getLikedUidsForAlbum === 'function')
        ? pc.getLikedUidsForAlbum(a).includes(uid)
        : !!pc.isFavorite?.(uid);

      const cover = coverByAlbum.get(a) || LOGO;

      // ВАЖНО: inactive никогда не получает audio/lyrics/fulltext
      const audio = (isActive && meta) ? getAudioUrl(meta) : null;
      const lyrics = (isActive && meta) ? getLyricsUrl(meta) : null;
      const fulltext = (isActive && meta) ? getFulltextUrl(meta) : null;

      return {
        title: meta?.title || 'Трек',
        uid,

        audio,
        lyrics,
        fulltext,

        __a: a,
        __uid: uid,
        __artist: 'Витрина Разбита',
        __album: getAlbumTitleFromIndex(a),
        __active: isActive,
        __cover: cover
      };
    });

    w.favoritesRefsModel = out;
    return out;
  }

    // Убираем дубли (uid+a)
    const seen = new Set();
    const refs = [];
    for (const r of refs0) {
      const uid = trim(r?.uid);
      const a = trim(r?.a);
      if (!uid || !a) continue;
      const k = `${a}::${uid}`;
      if (seen.has(k)) continue;
      seen.add(k);
      refs.push({ uid, a });
    }

    if (!refs.length) {
      w.favoritesRefsModel = [];
      return [];
    }

    // Обложки получаем 1 раз на альбом (параллельно)
    const albumKeys = Array.from(new Set(refs.map(r => r.a).filter(Boolean)));
    const coverByAlbum = new Map();
    await Promise.all(albumKeys.map(async (a) => {
      coverByAlbum.set(a, await getAlbumCoverUrl(a));
    }));

    const out = refs.map((ref) => {
      const a = ref.a;
      const uid = ref.uid;

      const meta = getTrackMeta(uid);

      // ✅ Active определяется строго по likedTrackUids:v1 для этого альбома.
      const isActive = (a && pc && typeof pc.getLikedUidsForAlbum === 'function')
        ? pc.getLikedUidsForAlbum(a).includes(uid)
        : !!pc?.isFavorite?.(uid);

      const cover = coverByAlbum.get(a) || LOGO;

      // ✅ ВАЖНО: inactive никогда не получает audio/lyrics/fulltext
      const audio = (isActive && meta) ? getAudioUrl(meta) : null;
      const lyrics = (isActive && meta) ? getLyricsUrl(meta) : null;
      const fulltext = (isActive && meta) ? getFulltextUrl(meta) : null;

      return {
        title: meta?.title || 'Трек',
        uid,

        audio,
        lyrics,
        fulltext,

        __a: a,
        __uid: uid,
        __artist: 'Витрина Разбита',
        __album: getAlbumTitleFromIndex(a),
        __active: isActive,
        __cover: cover
      };
    });

    w.favoritesRefsModel = out;
    return out;
  }

  function getModel() {
    // ✅ безопасно, без перестроения: вернуть текущую модель
    const m = w.favoritesRefsModel;
    return Array.isArray(m) ? m : [];
  }

  function getActiveModel(model) {
    const list = Array.isArray(model) ? model : getModel();
    return list.filter(it => it && it.__active && it.audio);
  }

  async function playFirstActiveFavorite() {
    try {
      await buildFavoritesRefsModel();
      const model = getModel();
      const active = getActiveModel(model);
      if (!active.length) return;

      // ensureFavoritesPlayback ожидает индекс в favoritesRefsModel (как сейчас в проекте),
      // поэтому находим индекс первого active в исходной модели.
      const first = active[0];
      const idx = model.findIndex(it => it && it.__uid === first.__uid && it.__a === first.__a);
      if (idx < 0) return;

      await w.AlbumsManager?.ensureFavoritesPlayback?.(idx);
    } catch {}
  }

  // Авто-пересборка модели только когда открыт favorites view
  if (!w.__favoritesUIBound) {
    w.__favoritesUIBound = true;

    const bind = () => {
      const pc = w.playerCore;
      if (!pc?.onFavoritesChanged) return void setTimeout(bind, 100);

      pc.onFavoritesChanged(() => {
        if (w.AlbumsManager?.getCurrentAlbum?.() === FAV) {
          buildFavoritesRefsModel().catch(() => {});
        }
      });
    };

    bind();
    bind();
  }
  function getModel() {
    const m = w.favoritesRefsModel;
    return Array.isArray(m) ? m : [];
  }

  w.FavoritesUI = {
    buildFavoritesRefsModel,
    getModel,
    getAlbumCoverUrl,
    playFirstActiveFavorite
  };

  // Back-compat alias
  w.buildFavoritesRefsModel = buildFavoritesRefsModel;
})();
