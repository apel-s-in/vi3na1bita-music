const registry = new Map();
const albumsMap = new Map();

export const TrackRegistry = {
    // Метод для инициализации из albums.json (если нужно)
    init(albumsConfig) {
        // Очищать не обязательно, если мы догружаем данные
        // registry.clear();
    },

    // ✅ Добавлен метод для одиночной регистрации (используется в loaders.js)
    registerTrack(track) {
        if (!track || !track.uid) return;
        const uid = String(track.uid).trim();
        
        // Мержим с существующим, чтобы не потерять данные
        const existing = registry.get(uid);
        const merged = existing ? { ...existing, ...track } : { ...track };
        
        // Нормализация полей для совместимости
        merged.audio = merged.audio || merged.url || merged.src;
        merged.cover = merged.cover || 'img/logo.png';
        
        registry.set(uid, merged);
    },

    registerTracks(tracks) {
        if (Array.isArray(tracks)) {
            tracks.forEach(t => this.registerTrack(t));
        }
    },

    getTrack(uid) {
        if (!uid) return null;
        return registry.get(String(uid).trim());
    },
    
    // Алиас для старого кода
    getTrackByUid(uid) {
        return this.getTrack(uid);
    },

    getAllTracks() {
        return Array.from(registry.values());
    },
    
    clearRegistry() {
        registry.clear();
    }
};

// Экспорты для модулей
export const getTrackByUid = (uid) => TrackRegistry.getTrack(uid);
export const getAllTracks = () => TrackRegistry.getAllTracks();
export const registerTrack = (t) => TrackRegistry.registerTrack(t);

// Публикация в window для UI скриптов
window.TrackRegistry = TrackRegistry;
