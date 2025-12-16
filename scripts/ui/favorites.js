// scripts/ui/favorites.js
// Управление избранными треками по UID (единственный источник правды).
// Хранилище:
// - NEW: likedTrackUids:v1  => { [albumKey: string]: string[] }
// - OLD: likedTracks:v2     => { [albumKey: string]: number[] }  (мигрируем при наличии albumsIndex + config.json)

class FavoritesManager {
  constructor() {
    this.storageKey = 'likedTrackUids:v1';
    this.legacyStorageKey = 'likedTracks:v2';
    this._migrated = false;
  }

  async initialize() {
    try {
      // гарантируем JSON для нового ключа
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        localStorage.setItem(this.storageKey, JSON.stringify({}));
      } else {
        const j = JSON.parse(raw);
        if (!j || typeof j !== 'object') {
          localStorage.setItem(this.storageKey, JSON.stringify({}));
        }
      }

      // попытка миграции (не блокирующая)
      this.migrateLegacyIfNeeded().catch(() => {});

      console.log('✅ FavoritesManager initialized (uid-based)');
    } catch (e) {
      console.warn('FavoritesManager.initialize failed:', e);
    }
  }

  getLikedUidMap() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const map = raw ? JSON.parse(raw) : {};
      return (map && typeof map === 'object') ? map : {};
    } catch {
      return {};
    }
  }

  getLikedUidsForAlbum(albumKey) {
    try {
      const map = this.getLikedUidMap();
      const arr = (map && typeof map === 'object') ? map[albumKey] : [];
      if (!Array.isArray(arr)) return [];
      return Array.from(
        new Set(
          arr.map(x => String(x || '').trim()).filter(Boolean)
        )
      );
    } catch {
      return [];
    }
  }

  isFavorite(albumKey, trackUid) {
    const uid = String(trackUid || '').trim();
    if (!uid) return false;
    return this.getLikedUidsForAlbum(String(albumKey || '')).includes(uid);
  }

  toggleLike(albumKey, trackUid, makeLiked = null) {
    const a = String(albumKey || '').trim();
    const uid = String(trackUid || '').trim();
    if (!a || !uid) return false;

    const map = this.getLikedUidMap();
    const arrRaw = Array.isArray(map[a]) ? map[a] : [];
    const arr = Array.from(new Set(arrRaw.map(x => String(x || '').trim()).filter(Boolean)));

    const has = arr.includes(uid);
    const shouldLike = makeLiked !== null ? !!makeLiked : !has;

    let next = arr.slice();
    if (shouldLike && !has) next.push(uid);
    if (!shouldLike && has) next = next.filter(x => x !== uid);

    map[a] = Array.from(new Set(next));

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(map));
    } catch {
      return false;
    }

    // Синхронизация активности в уже построенной модели избранного (если есть)
    try {
      if (typeof window.updateFavoritesRefsModelActiveFlag === 'function') {
        window.updateFavoritesRefsModelActiveFlag(a, uid, shouldLike);
      }
    } catch {}

    return true;
  }

  // ========= MIGRATION =========

  async migrateLegacyIfNeeded() {
    if (this._migrated) return;
    this._migrated = true;

    let legacyRaw = null;
    try { legacyRaw = localStorage.getItem(this.legacyStorageKey); } catch {}
    if (!legacyRaw) return;

    let legacyMap = null;
    try { legacyMap = JSON.parse(legacyRaw); } catch { return; }
    if (!legacyMap || typeof legacyMap !== 'object') return;

    // Если legacy пуст — ничего не делаем
    const legacyAlbumKeys = Object.keys(legacyMap);
    if (legacyAlbumKeys.length === 0) return;

    const albumsIndex = Array.isArray(window.albumsIndex) ? window.albumsIndex : [];
    if (!albumsIndex.length) return;

    const newMap = this.getLikedUidMap();
    let changed = false;

    const absJoin = typeof window.absJoin === 'function'
      ? window.absJoin
      : ((b, r) => new URL(String(r || ''), String(b || '') + '/').toString());

    for (const albumKey of legacyAlbumKeys) {
      const nums = Array.isArray(legacyMap[albumKey]) ? legacyMap[albumKey] : [];
      const normNums = Array.from(new Set(nums.map(n => parseInt(n, 10)).filter(Number.isFinite)));
      if (!normNums.length) continue;

      const meta = albumsIndex.find(a => a && a.key === albumKey);
      if (!meta || !meta.base) continue;

      // грузим config.json, чтобы взять uid
      let cfg = null;
      try {
        const r = await fetch(absJoin(meta.base, 'config.json'), { cache: 'no-cache' });
        if (!r.ok) continue;
        cfg = await r.json();
      } catch {
        continue;
      }

      const tracks = Array.isArray(cfg?.tracks) ? cfg.tracks : [];
      if (!tracks.length) continue;

      const uids = [];
      for (const n of normNums) {
        // legacy хранит "номер" (обычно 1..N). В старом коде это было именно num.
        // Здесь допускаем, что legacy число = порядковый номер (1-based).
        const t = tracks[n - 1];
        const uid = String(t?.uid || '').trim();
        if (uid) uids.push(uid);
      }

      if (!uids.length) continue;

      const prev = Array.isArray(newMap[albumKey]) ? newMap[albumKey] : [];
      const merged = Array.from(new Set([...prev, ...uids]));
      newMap[albumKey] = merged;
      changed = true;
    }

    if (changed) {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(newMap));
      } catch {}
    }
  }
}

window.FavoritesManager = new FavoritesManager();
