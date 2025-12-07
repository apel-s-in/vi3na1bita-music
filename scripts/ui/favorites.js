// scripts/ui/favorites.js
// Управление избранными треками
class FavoritesManager {
  constructor() {
    this.storageKey = 'likedTracks:v2';
    this.refsKey = 'favoritesAlbumRefs:v1';
    this.refsModel = null;
  }

  /**
   * Инициализация менеджера избранного.
   * Вызывается из Application.initialize().
   * Сейчас прогреваем refs‑модель, чтобы «Избранное» сразу было готово.
   */
  async initialize() {
    try {
      await this.updateRefsModel();
      console.log('✅ FavoritesManager initialized');
    } catch (e) {
      console.warn('FavoritesManager.initialize failed:', e);
    }
  }

  // Получение карты избранных треков
  getLikedMap() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const map = raw ? JSON.parse(raw) : {};
      return (map && typeof map === 'object') ? map : {};
    } catch {
      return {};
    }
  }

  // Получение избранных треков для альбома
  getLikedForAlbum(albumKey) {
    try {
      const map = this.getLikedMap();
      const arr = (map && typeof map === 'object') ? map[albumKey] : [];
      // Нормализуем к числам и убираем дубликаты
      return Array.from(new Set((Array.isArray(arr) ? arr : [])
        .map(n => parseInt(n, 10))
        .filter(Number.isFinite)));
    } catch {
      return [];
    }
  }

  // Переключение избранного для трека
  toggleLike(albumKey, trackIndex, makeLiked = null) {
    const index = parseInt(trackIndex, 10);
    if (!Number.isFinite(index)) return;
    
    const map = this.getLikedMap();
    const arrRaw = Array.isArray(map[albumKey]) ? map[albumKey] : [];
    const arr = Array.from(new Set(arrRaw
      .map(n => parseInt(n, 10))
      .filter(Number.isFinite)));
    
    const has = arr.includes(index);
    const shouldLike = makeLiked !== null ? makeLiked : !has;
    
    let next = arr.slice();
    if (shouldLike && !has) next.push(index);
    if (!shouldLike && has) next = next.filter(x => x !== index);
    
    map[albumKey] = Array.from(new Set(next));
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(map));
      // Обновляем refs модель
      this.updateRefsModel();
      return true;
    } catch {
      return false;
    }
  }

  // Проверка, является ли трек избранным
  isFavorite(albumKey, trackIndex) {
    return this.getLikedForAlbum(albumKey).includes(parseInt(trackIndex, 10));
  }

  // Обновление модели refs
  async updateRefsModel() {
    const refs = this.readFavoritesRefs();
    const map = this.getLikedMap();
    
    // Добавляем новые избранные в refs
    Object.entries(map).forEach(([albumKey, trackIndices]) => {
      trackIndices.forEach(trackIndex => {
        const key = `${albumKey}:${trackIndex}`;
        if (!refs.some(r => r.a === albumKey && r.t === trackIndex)) {
          refs.push({ a: albumKey, t: trackIndex });
        }
      });
    });
    
    // Удаляем неактивные refs
    const activeRefs = refs.filter(ref => {
      const liked = this.getLikedForAlbum(ref.a);
      return liked.includes(ref.t);
    });
    
    this.writeFavoritesRefs(activeRefs);
    await this.buildFavoritesRefsModel();
  }

  // Чтение refs из localStorage
  readFavoritesRefs() {
    try {
      const raw = localStorage.getItem(this.refsKey);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  // Запись refs в localStorage
  writeFavoritesRefs(arr) {
    try {
      localStorage.setItem(this.refsKey, JSON.stringify(Array.isArray(arr) ? arr : []));
    } catch {}
  }

  // Построение модели избранных
  async buildFavoritesRefsModel() {
    const refs = this.readFavoritesRefs();
    const model = [];
    
    for (const ref of refs) {
      // Активность — всегда из likedTracks:v2
      const active = this.getLikedForAlbum(ref.a).includes(ref.t);
      
      // Пытаемся получить конфиг альбома и целевой трек
      let cfg = null;
      try {
        cfg = await window.AlbumsManager?.getAlbumConfigByKey(ref.a);
      } catch {}
      
      const tr = cfg?.tracks?.[ref.t] || null;
      
      // Обложку стараемся получить из центральной галереи
      const cover = await this.getAlbumCoverUrl(ref.a);
      
      if (tr && tr.audio) {
        model.push({
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
    }
    
    this.refsModel = model;
    return model;
  }

  // Получение URL обложки альбома
  async getAlbumCoverUrl(albumKey) {
    try {
      const centralIdForAlbumKey = window.centralIdForAlbumKey;
      const normalizeGalleryItem = window.normalizeGalleryItem;
      const CENTRAL_GALLERY_BASE = window.APP_CONFIG?.CENTRAL_GALLERY_BASE || './albums/gallery/';
      
      const cid = typeof centralIdForAlbumKey === 'function' ? centralIdForAlbumKey(albumKey) : null;
      if (!cid) return 'img/logo.png';
      
      const baseDir = `${CENTRAL_GALLERY_BASE}${cid}/`;
      const r = await fetch(baseDir + 'index.json', { cache: 'force-cache' });
      
      if (r.ok) {
        const j = await r.json();
        const first = Array.isArray(j.items) ? j.items[0] : (Array.isArray(j) ? j[0] : null);
        if (first) {
          const norm = typeof normalizeGalleryItem === 'function' ? normalizeGalleryItem(first, baseDir) : first;
          return (norm && (norm.formats?.webp || norm.formats?.full || norm.src)) || 'img/logo.png';
        }
      }
    } catch {}
    
    return 'img/logo.png';
  }

  // Обновление флага активности в модели
  updateRefsModelActiveFlag(albumKey, trackIndex, isActive) {
    if (!Array.isArray(this.refsModel)) return;
    
    const item = this.refsModel.find(x => x.__a === albumKey && x.__t === trackIndex);
    if (item) {
      item.__active = !!isActive;
    }
  }

  // Получение отсортированных refs
  getSortedRefs() {
    const refs = this.readFavoritesRefs().slice();
    const ICON_ALBUMS_ORDER = (window.ICON_ALBUMS_ORDER || []).map(x => x.key)
      .filter(k => k !== window.SPECIAL_FAVORITES_KEY && k !== window.SPECIAL_RELIZ_KEY);
    
    const orderMap = new Map(ICON_ALBUMS_ORDER.map((k, i) => [k, i]));
    
    refs.sort((r1, r2) => {
      const o1 = orderMap.has(r1.a) ? orderMap.get(r1.a) : 999;
      const o2 = orderMap.has(r2.a) ? orderMap.get(r2.a) : 999;
      if (o1 !== o2) return o1 - o2;
      return (r1.t - r2.t);
    });
    
    return refs;
  }
}

// Глобальный экземпляр
window.FavoritesManager = new FavoritesManager();
