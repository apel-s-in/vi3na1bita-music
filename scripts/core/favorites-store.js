import { TrackRegistry } from './track-registry.js';

const STORAGE_KEY = 'app_favorites_v2';
let favoritesData = []; // Array of objects: { uid, addedAt, inactiveAt }

// Загрузка из LocalStorage
const load = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        favoritesData = raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.error('Fav load error', e);
        favoritesData = [];
    }
};

const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favoritesData));
    // Диспатчим событие для обновления UI в реальном времени
    window.dispatchEvent(new CustomEvent('favorites:updated'));
};

export const FavoritesStore = {
    init() {
        load();
    },

    isLiked(uid) {
        const item = favoritesData.find(i => i.uid === uid);
        // Считается лайкнутым, если есть в списке и НЕ помечен как inactiveAt (или inactiveAt в будущем, если нужно)
        // По ТЗ: "при снятии звезды сразу удаляется трек" - это баг.
        // Исправление: Если inactiveAt существует, значит юзер снял лайк, но трек визуально еще в списке (до перезагрузки).
        return item && !item.inactiveAt;
    },

    // Возвращает true если трек в списке избранного, но помечен "удаленным" (полупрозрачный)
    isInactive(uid) {
        const item = favoritesData.find(i => i.uid === uid);
        return item && !!item.inactiveAt;
    },

    toggle(uid) {
        const index = favoritesData.findIndex(i => i.uid === uid);
        
        if (index === -1) {
            // Добавляем новый
            favoritesData.push({ uid, addedAt: Date.now(), inactiveAt: null });
        } else {
            const item = favoritesData[index];
            if (item.inactiveAt) {
                // Восстанавливаем (снова лайк)
                item.inactiveAt = null;
                item.addedAt = Date.now(); // Обновляем дату, чтобы поднялся вверх
            } else {
                // Мягкое удаление
                item.inactiveAt = Date.now();
            }
        }
        save();
        return this.isLiked(uid);
    },

    // Получить список UID для воспроизведения (только активные)
    getPlayableUIDs() {
        return favoritesData
            .filter(item => !item.inactiveAt && TrackRegistry.getTrack(item.uid)) // Проверяем существование трека
            .sort((a, b) => b.addedAt - a.addedAt) // Новые сверху
            .map(item => item.uid);
    },

    // Получить полный список для отображения в UI (включая inactive)
    getAllForUI() {
        return favoritesData
            .filter(item => TrackRegistry.getTrack(item.uid))
            .sort((a, b) => b.addedAt - a.addedAt)
            .map(item => ({
                uid: item.uid,
                isLiked: !item.inactiveAt,
                isInactive: !!item.inactiveAt
            }));
    },
    
    // Реальная очистка (можно вызывать при старте приложения)
    purgeInactive() {
        const initialLen = favoritesData.length;
        favoritesData = favoritesData.filter(item => !item.inactiveAt);
        if (favoritesData.length !== initialLen) save();
    }
};
