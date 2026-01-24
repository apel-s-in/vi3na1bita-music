const tracksMap = new Map();
const albumsMap = new Map();

export const TrackRegistry = {
    init(albumsConfig) {
        tracksMap.clear();
        albumsMap.clear();
        albumsConfig.forEach(album => {
            albumsMap.set(album.id, album);
            if (album.tracks) {
                album.tracks.forEach(track => {
                    tracksMap.set(track.uid, {
                        ...track,
                        albumId: album.id,
                        cover: album.cover,
                        artist: track.artist || album.artist || "Витрина Разбита",
                        albumTitle: album.title
                    });
                });
            }
        });
        console.log(`[Registry] Indexed ${tracksMap.size} tracks.`);
    },
    getTrack(uid) { return tracksMap.get(uid); },
    getAlbum(id) { return albumsMap.get(id); },
    getAlbumTracks(albumId) { 
        const alb = albumsMap.get(albumId);
        return alb ? alb.tracks.map(t => t.uid) : [];
    },
    getAllTracks() { return Array.from(tracksMap.values()); }
};

// 👇 ВАЖНО: Добавляем эти экспорты для совместимости с offline-менеджером
export const getTrackByUid = (uid) => TrackRegistry.getTrack(uid);
export const getAllTracks = () => TrackRegistry.getAllTracks();

// Публикуем в window для старых скриптов (на всякий случай)
window.TrackRegistry = TrackRegistry;
