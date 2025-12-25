// scripts/ui/favorites.js
// Управление избранными треками по UID (единственный источник правды).
// Storage: likedTrackUids:v1 => { [albumKey]: string[] }
// Refs: favoritesAlbumRefsByUid:v1 => [{ a: albumKey, uid: string }]
class FavoritesManager {
  constructor() {
    this.storageKey = 'likedTrackUids:v1';
    this.refsKey = 'favoritesAlbumRefsByUid:v1';
  }

  async initialize() {
    try {
      // Инициализация likedTrackUids:v1
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        localStorage.setItem(this.storageKey, JSON.stringify({}));
      } else {
        const j = JSON.parse(raw);
        if (!j || typeof j !== 'object') {
          localStorage.setItem(this.storageKey, JSON.stringify({}));
        }
      }

      // Инициализация favoritesAlbumRefsByUid:v1
      const rawRefs = localStorage.getItem(this.refsKey);
      if (!rawRefs) {
        localStorage.setItem(this.refsKey, JSON.stringify([]));
      } else {
        const j = JSON.parse(rawRefs);
        if (!Array.isArray(j)) {
          localStorage.setItem(this.refsKey, JSON.stringify([]));
        }
      }

      console.log('✅ FavoritesManager initialized (uid-based)');
    } catch (e) {
      console.warn('FavoritesManager.initialize failed:', e);
    }
  }

  _emitChange(payload) {
    // ✅ Realtime sync: все места UI слушают событие и обновляют звёзды/списки/очередь.
    try {
      window.dispatchEvent(new CustomEvent('favorites:changed', { detail: payload }));
    } catch {}
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
      const key = String(albumKey || '').trim();
      if (!key) return [];
      const map = this.getLikedUidMap();
      const arr = (map && typeof map === 'object') ? map[key] : [];
      if (!Array.isArray(arr)) return [];
      return Array.from(new Set(arr.map(x => String(x || '').trim()).filter(Boolean)));
    } catch {
      return [];
    }
  }

  isFavorite(albumKey, trackUid) {
    const a = String(albumKey || '').trim();
    const uid = String(trackUid || '').trim();
    if (!a || !uid) return false;
    return this.getLikedUidsForAlbum(a).includes(uid);
  }

  /**
   * source:
   * - 'album'      => ⭐ OFF удаляет ref полностью ("без следа")
   * - 'favorites'  => ⭐ OFF оставляет ref (строка станет inactive)
   * - 'mini'       => как 'album' (это не список «ИЗБРАННОЕ»)
   */
  toggleLike(albumKey, trackUid, makeLiked = null, options = {}) {
    const a = String(albumKey || '').trim();
    const uid = String(trackUid || '').trim();
    if (!a || !uid) return false;

    const source = String(options?.source || 'album');

    const map = this.getLikedUidMap();
    const prevArr = Array.isArray(map[a]) ? map[a] : [];
    const arr = Array.from(new Set(prevArr.map(x => String(x || '').trim()).filter(Boolean)));

    const has = arr.includes(uid);
    const shouldLike = (makeLiked !== null) ? !!makeLiked : !has;

    let next = arr.slice();
    if (shouldLike && !has) next.push(uid);
    if (!shouldLike && has) next = next.filter(x => x !== uid);

    if (next.length === 0) {
      delete map[a];
    } else {
      map[a] = Array.from(new Set(next));
    }

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(map));
    } catch {
      return false;
    }

    // ✅ refs-логика по ТЗ
    if (shouldLike) {
      // ⭐ ON: всегда добавляем ref (если нет)
      this.addRef(a, uid);
    } else {
      // ⭐ OFF:
      // - если действие из «Избранного» — ref НЕ удаляем (буферная строка остаётся)
      // - иначе (родной альбом/мини) — удаляем ref полностью
      if (source !== 'favorites') {
        this.removeRef(a, uid);
      }
    }

    // Realtime событие (добавляем source)
    this._emitChange({ albumKey: a, uid, liked: shouldLike, source });

    // ✅ Спец-правило: если сейчас играет __favorites__ и пользователь сделал трек inactive,
    // то нужно перейти на следующий активный, а если активных больше нет — stop (разрешено правилами).
    // Важно: это правило применяется только для source==='favorites' (т.е. действие именно в списке «ИЗБРАННОЕ»).
    if (!shouldLike && source === 'favorites') {
      this._handlePlayingFavoritesAfterUnlike({ sourceAlbumKey: a, uid });
    }

    return true;
  }

  _handlePlayingFavoritesAfterUnlike({ sourceAlbumKey, uid }) {
    try {
      const playingAlbum = window.AlbumsManager?.getPlayingAlbum?.();
      if (playingAlbum !== window.SPECIAL_FAVORITES_KEY) return;

      const pc = window.playerCore;
      if (!pc) return;

      const cur = pc.getCurrentTrack?.();
      if (!cur) return;

      const curUid = String(cur.uid || '').trim();
      const curSrcAlbum = String(cur.sourceAlbum || '').trim();

      // Реагируем только если сняли лайк именно у текущего трека (в __favorites__)
      if (!curUid || curUid !== String(uid || '').trim()) return;
      if (curSrcAlbum && curSrcAlbum !== String(sourceAlbumKey || '').trim()) return;

      // Соберём актуальные активные элементы из favoritesRefsModel
      const model = Array.isArray(window.favoritesRefsModel) ? window.favoritesRefsModel : [];
      const activeItems = model.filter(it => it && it.__active && it.audio);

      if (activeItems.length === 0) {
        // ✅ По ТЗ: если активных не осталось — STOP (это разрешено таймером/кнопками/этим правилом избранного)
        pc.stop?.();
        return;
      }

      // Найдём следующий активный (простая стратегия: первый активный)
      // Не стопаем. Если плеер уже играет — он продолжит (setPlaylist не стопает).
      // AlbumsManager.ensureFavoritesPlayback сам формирует плейлист активных и делает play().
      const idxInModel = model.findIndex(it =>
        it &&
        String(it.__uid || '').trim() === curUid &&
        String(it.__a || '').trim() === String(sourceAlbumKey || '').trim()
      );

      const nextIndexInModel = (() => {
        // Ищем следующий активный в model после текущего, иначе с начала
        const start = Math.max(0, idxInModel + 1);
        for (let i = start; i < model.length; i++) {
          const it = model[i];
          if (it && it.__active && it.audio) return i;
        }
        for (let i = 0; i < model.length; i++) {
          const it = model[i];
          if (it && it.__active && it.audio) return i;
        }
        return -1;
      })();

      if (nextIndexInModel >= 0) {
        window.AlbumsManager?.ensureFavoritesPlayback?.(nextIndexInModel);
      } else {
        pc.stop?.();
      }
    } catch (e) {
      console.warn('_handlePlayingFavoritesAfterUnlike failed:', e);
    }
  }

  addRef(albumKey, uid) {
    const a = String(albumKey || '').trim();
    const u = String(uid || '').trim();
    if (!a || !u) return false;

    const refs = this.readRefs();
    const exists = refs.some(r => r && r.a === a && String(r.uid || '').trim() === u);
    if (exists) return false;

    refs.push({ a, uid: u });
    this.writeRefs(refs);
    return true;
  }

  removeRef(albumKey, uid) {
    const a = String(albumKey || '').trim();
    const u = String(uid || '').trim();
    if (!a || !u) return false;

    const refs = this.readRefs();
    const next = refs.filter(r => !(r && r.a === a && String(r.uid || '').trim() === u));
    this.writeRefs(next);
    return next.length !== refs.length;
  }

  readRefs() {
    try {
      const raw = localStorage.getItem(this.refsKey);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  writeRefs(arr) {
    try {
      localStorage.setItem(this.refsKey, JSON.stringify(Array.isArray(arr) ? arr : []));
    } catch {}
  }
}

// ✅ Глобальный экземпляр (критично: его ждёт scripts/app.js)
window.FavoritesManager = new FavoritesManager();
