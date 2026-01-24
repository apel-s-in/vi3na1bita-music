import { TrackRegistry } from './track-registry.js';

const KEY = 'app_favorites_v2';
let data = [];

const save = () => {
    localStorage.setItem(KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('favorites:updated'));
};

export const FavoritesStore = {
    init() {
        try {
            data = JSON.parse(localStorage.getItem(KEY) || '[]');
        } catch { data = []; }
    },

    isLiked(uid) {
        const item = data.find(i => i.uid === uid);
        return item && !item.inactiveAt;
    },

    // Для UI: если трек в списке, но снята звезда (полупрозрачный)
    isInactive(uid) {
        const item = data.find(i => i.uid === uid);
        return item && !!item.inactiveAt;
    },

    like(uid) {
        const u = String(uid || '').trim();
        if (!u) return false;

        const idx = data.findIndex(i => i.uid === u);
        if (idx === -1) {
            data.push({ uid: u, addedAt: Date.now(), inactiveAt: null });
        } else {
            data[idx].inactiveAt = null;
            data[idx].addedAt = Date.now();
        }
        save();
        return true;
    },

    /**
     * ТЗ: unlike в родном альбоме = "без следа" (полностью убрать из избранного).
     */
    unlikeInAlbum(uid) {
        const u = String(uid || '').trim();
        if (!u) return false;

        const before = data.length;
        data = data.filter(i => i.uid !== u);
        if (data.length !== before) save();
        return true;
    },

    /**
     * ТЗ: unlike в окне "Избранное" = перевести в inactive (буфер).
     */
    unlikeInFavorites(uid) {
        const u = String(uid || '').trim();
        if (!u) return false;

        const idx = data.findIndex(i => i.uid === u);
        if (idx === -1) {
            // если вдруг записи не было (редкий случай) — создаём как inactive
            data.push({ uid: u, addedAt: Date.now(), inactiveAt: Date.now() });
        } else {
            data[idx].inactiveAt = Date.now();
        }
        save();
        return true;
    },

    restore(uid) {
        const u = String(uid || '').trim();
        if (!u) return false;

        const idx = data.findIndex(i => i.uid === u);
        if (idx === -1) {
            data.push({ uid: u, addedAt: Date.now(), inactiveAt: null });
        } else {
            data[idx].inactiveAt = null;
            data[idx].addedAt = Date.now();
        }
        save();
        return true;
    },

    /**
     * Окончательное удаление строки из избранного (разрешено только из favorites view через модалку).
     */
    removeRef(uid) {
        const u = String(uid || '').trim();
        if (!u) return false;

        const before = data.length;
        data = data.filter(i => i.uid !== u);
        if (data.length !== before) save();
        return true;
    },

    // Для плеера: только активные
    getPlayableUIDs() {
        return data
            .filter(i => !i.inactiveAt && TrackRegistry.getTrack(i.uid))
            .sort((a, b) => b.addedAt - a.addedAt)
            .map(i => i.uid);
    },

    // Для списка "Избранное": все (и активные, и inactive)
    getAllForUI() {
        return data
            .filter(i => TrackRegistry.getTrack(i.uid))
            .sort((a, b) => b.addedAt - a.addedAt)
            .map(i => i.uid);
    },

    /**
     * purge НЕ должен удалять inactive: по ТЗ это "буфер" в избранном.
     * purge может чистить только битые uid (которых нет в TrackRegistry).
     */
    purge() {
        const before = data.length;
        data = data.filter(i => TrackRegistry.getTrack(i.uid));
        if (data.length !== before) save();
    }
};
