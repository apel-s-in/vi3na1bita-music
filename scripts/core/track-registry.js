const tracksMap = new Map(); // Map<UID, TrackData>
const albumsMap = new Map(); // Map<AlbumID, AlbumData>

export const TrackRegistry = {
    /**
     * Парсит конфиг и регистрирует все треки в единую карту.
     * @param {Array} albumsConfig - массив альбомов из config.json
     */
    init(albumsConfig) {
        tracksMap.clear();
        albumsMap.clear();

        albumsConfig.forEach(album => {
            albumsMap.set(album.id, album);
            if (album.tracks) {
                album.tracks.forEach(track => {
                    // ГАРАНТИЯ: UID - единственный ключ
                    if (!track.uid) console.warn('Track missing UID:', track);
                    
                    // Обогащаем трек данными альбома, чтобы не дублировать их
                    tracksMap.set(track.uid, {
                        ...track,
                        albumId: album.id,
                        cover: album.cover, // Ссылка на обложку альбома
                        artist: track.artist || album.artist,
                        albumTitle: album.title
                    });
                });
            }
        });
        console.log(`[Registry] Indexed ${tracksMap.size} tracks from ${albumsMap.size} albums.`);
    },

    getTrack(uid) {
        return tracksMap.get(uid);
    },

    getAllUIDs() {
        return Array.from(tracksMap.keys());
    },

    getAlbumTracks(albumId) {
        const album = albumsMap.get(albumId);
        return album ? album.tracks.map(t => t.uid) : [];
    },
    
    // Поиск по всем трекам (оптимизированный)
    search(query) {
        const lowerQ = query.toLowerCase().trim();
        if (!lowerQ) return [];
        const results = [];
        for (const [uid, track] of tracksMap.entries()) {
            if (track.title.toLowerCase().includes(lowerQ) || 
                (track.artist && track.artist.toLowerCase().includes(lowerQ))) {
                results.push(uid);
            }
        }
        return results;
    }
};
