const tracksMap = new Map();
const albumsMap = new Map();

export const TrackRegistry = {
    // 1. Сначала регистрируем альбомы (оболочки)
    registerAlbums(albumsList) {
        albumsMap.clear();
        albumsList.forEach(alb => {
            const id = alb.id || alb.key;
            // Нормализуем base url (добавляем слеш в конце если нет)
            let base = alb.base || '';
            if (base && !base.endsWith('/')) base += '/';
            
            albumsMap.set(id, { ...alb, id, base });
        });
    },

    // 2. Потом регистрируем треки, когда они загрузились
    registerTracks(albumId, tracks) {
        const album = albumsMap.get(albumId);
        if (!album) return;

        // Сохраняем треки в объект альбома
        album.tracks = tracks; 

        tracks.forEach(track => {
            // Абсолютные пути к аудио и картинкам
            const resolveUrl = (url) => {
                if (!url) return null;
                if (url.startsWith('http')) return url;
                return album.base + url;
            };

            const fullTrack = {
                ...track,
                albumId: album.id,
                // Если у трека нет своей обложки, берем обложку альбома (которую тоже надо резолвить, если она относительная, но обычно она в albums.json абсолютная или локальная)
                cover: track.cover ? resolveUrl(track.cover) : (album.cover || 'img/logo.png'), 
                url: resolveUrl(track.audio), // mp3
                lyrics: resolveUrl(track.lyrics), // json
                artist: track.artist || album.artist || "Витрина Разбита",
                albumTitle: album.title || album.albumName // В config.json может быть albumName
            };
            
            tracksMap.set(track.uid, fullTrack);
        });
        
        console.log(`[Registry] Loaded ${tracks.length} tracks for ${albumId}`);
    },

    getTrack(uid) { return tracksMap.get(uid); },
    getAlbum(id) { return albumsMap.get(id); },
    getAlbumTracks(albumId) { 
        const alb = albumsMap.get(albumId);
        return alb && alb.tracks ? alb.tracks.map(t => t.uid) : [];
    },
    getAllTracks() { return Array.from(tracksMap.values()); }
};

export const getTrackByUid = (uid) => TrackRegistry.getTrack(uid);
export const getAllTracks = () => TrackRegistry.getAllTracks();
window.TrackRegistry = TrackRegistry;
