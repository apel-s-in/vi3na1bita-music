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
            const map = this.getLikedUidMap();
            const arr = (map && typeof map === 'object') ? map[albumKey] : [];
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

    toggleLike(albumKey, trackUid, makeLiked = null) {
        const a = String(albumKey || '').trim();
        const uid = String(trackUid || '').trim();
        if (!a || !uid) return false;

        const map = this.getLikedUidMap();
        const prevArr = Array.isArray(map[a]) ? map[a] : [];
        const arr = Array.from(new Set(prevArr.map(x => String(x || '').trim()).filter(Boolean)));
        const has = arr.includes(uid);
        const shouldLike = (makeLiked !== null) ? !!makeLiked : !has;

        let next = arr.slice();
        if (shouldLike && !has) next.push(uid);
        if (!shouldLike && has) next = next.filter(x => x !== uid);
        // Удаляем ключ, если массив пуст
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

        // Если лайкаем - добавляем ref, если снимаем - удаляем ref
        if (shouldLike) {
            this.addRef(a, uid);
        } else {
            this.removeRef(a, uid);
        }

        // Realtime событие
        this._emitChange({ albumKey: a, uid, liked: shouldLike });
        return true;
    }

    addRef(albumKey, uid) {
        const a = String(albumKey || '').trim();
        const u = String(uid || '').trim();
        if (!a || !u) return false;

        let refs = this.readRefs();
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

        let refs = this.readRefs();
        const next = refs.filter(r => !(r && r.a === a && String(r.uid || '').trim() === u));
        this.writeRefs(next);

        // Также убедимся, что лайк снят
        const map = this.getLikedUidMap();
        if (map[a] && Array.isArray(map[a])) {
            const updatedLikes = map[a].filter(x => String(x || '').trim() !== u);
            if (updatedLikes.length === 0) {
                delete map[a];
            } else {
                map[a] = updatedLikes;
            }
            try {
                localStorage.setItem(this.storageKey, JSON.stringify(map));
            } catch {}
        }

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
