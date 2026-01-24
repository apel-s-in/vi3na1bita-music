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

    toggle(uid) {
        const idx = data.findIndex(i => i.uid === uid);
        if (idx === -1) {
            data.push({ uid, addedAt: Date.now(), inactiveAt: null });
        } else {
            // Если был inactive -> восстанавливаем. Если был active -> удаляем (soft delete)
            if (data[idx].inactiveAt) {
                data[idx].inactiveAt = null;
                data[idx].addedAt = Date.now(); // Поднимаем вверх
            } else {
                data[idx].inactiveAt = Date.now();
            }
        }
        save();
        return this.isLiked(uid);
    },

    // Для плеера: только активные
    getPlayableUIDs() {
        return data
            .filter(i => !i.inactiveAt && TrackRegistry.getTrack(i.uid))
            .sort((a, b) => b.addedAt - a.addedAt)
            .map(i => i.uid);
    },

    // Для списка "Избранное": все (и активные, и зачеркнутые)
    getAllForUI() {
        return data
            .filter(i => TrackRegistry.getTrack(i.uid))
            .sort((a, b) => b.addedAt - a.addedAt)
            .map(i => i.uid);
    },
    
    // Очистка мусора (вызывать при старте)
    purge() {
        const len = data.length;
        data = data.filter(i => !i.inactiveAt);
        if (data.length !== len) save();
    }
};
