const tracksMap = new Map();
const albumsMap = new Map();

export const TrackRegistry = {
    init(albumsConfig) {
        tracksMap.clear();
        albumsMap.clear();
        albumsConfig.forEach(album => {
            // ВАЖНО: Используем key как id, если id нет
            const id = album.id || album.key; 
            
            // Сохраняем альбом с правильным ID
            albumsMap.set(id, { ...album, id });

            if (album.tracks) {
                album.tracks.forEach(track => {
                    tracksMap.set(track.uid, {
                        ...track,
                        albumId: id,
                        cover: album.cover,
                        artist: track.artist || album.artist || "Витрина Разбита",
                        albumTitle: album.title
                    });
                });
            }
        });
        console.log(`[Registry] Indexed ${tracksMap.size} tracks from ${albumsMap.size} albums.`);
    },
    getTrack(uid) { return tracksMap.get(uid); },
    getAlbum(id) { return albumsMap.get(id); },
    getAlbumTracks(albumId) { 
        const alb = albumsMap.get(albumId);
        return alb ? alb.tracks.map(t => t.uid) : [];
    },
    getAllTracks() { return Array.from(tracksMap.values()); }
};

export const getTrackByUid = (uid) => TrackRegistry.getTrack(uid);
export const getAllTracks = () => TrackRegistry.getAllTracks();
window.TrackRegistry = TrackRegistry;
