import { $, on, debounce } from '../core/utils.js';
import { TrackRegistry } from '../core/track-registry.js';
import { FavoritesStore } from '../core/favorites-store.js';
import { TrackListRenderer } from '../ui/track-list-renderer.js';
import { PlayerCore } from '../core/player-core.js';

export const AppController = {
    // UI Elements
    container: $('#track-list-container'), // Основной контейнер списка
    headerTitle: $('#playlist-title'),
    headerCover: $('#playlist-cover'),
    
    // State
    currentContext: 'album', // 'album' | 'favorites' | 'search'
    currentListUIDs: [],
    
    init() {
        this.bindEvents();
        // При старте можно загрузить последний альбом или дефолтный экран
    },

    bindEvents() {
        // --- ГЛАВНЫЙ ФИКС: Делегирование событий ---
        // Вешаем ОДИН обработчик на весь список треков.
        // Это устраняет проблему "Plays many songs".
        
        on(this.container, 'click', (e) => {
            const row = e.target.closest('.track-row');
            const btnFav = e.target.closest('.btn-fav');
            
            if (!row) return;
            const uid = row.dataset.uid;

            // 1. Клик по лайку
            if (btnFav) {
                e.stopPropagation(); // Не запускать трек
                this.handleFavoriteClick(uid, btnFav, row);
                return;
            }

            // 2. Клик по строке (воспроизведение)
            this.handleTrackClick(uid);
        });

        // Слушаем обновления плеера для подсветки активного трека
        window.addEventListener('player:track-change', (e) => {
            this.highlightTrack(e.detail.uid);
            this.updateMiniPlayerUI(e.detail.uid);
        });

        window.addEventListener('player:state-change', (e) => {
            this.updatePlayIcons(e.detail.isPlaying);
        });
        
        // Слушаем глобальное обновление избранного (если оно изменено из другого места)
        window.addEventListener('favorites:updated', () => {
           // Если мы в избранном, можно перерисовать, но аккуратно
           // Пока оставим ручное управление DOM для плавности
        });
    },

    // Логика открытия Альбома
    openAlbum(albumId) {
        const uids = TrackRegistry.getAlbumTracks(albumId);
        if (!uids.length) return;
        
        const albumInfo = TrackRegistry.getTrack(uids[0]); // Берем инфу из первого трека (там есть album data)
        
        this.currentContext = 'album';
        this.currentListUIDs = uids;
        
        // Обновляем заголовок
        if (this.headerTitle) this.headerTitle.textContent = albumInfo.albumTitle;
        if (this.headerCover) this.headerCover.src = albumInfo.cover;

        // Рендерим
        TrackListRenderer.renderList(
            this.container, 
            uids, 
            PlayerCore.currentUid, 
            !PlayerCore.isPlaying, 
            'album'
        );
    },

    // Логика открытия Избранного
    openFavorites() {
        // ВАЖНО: Получаем полный список для UI (включая неактивные/удаленные)
        const items = FavoritesStore.getAllForUI(); 
        const uids = items.map(i => i.uid);

        this.currentContext = 'favorites';
        this.currentListUIDs = uids;

        if (this.headerTitle) this.headerTitle.textContent = "Избранное";
        if (this.headerCover) this.headerCover.src = "assets/img/fav-cover.jpg"; // Заглушка

        TrackListRenderer.renderList(
            this.container, 
            uids, 
            PlayerCore.currentUid, 
            !PlayerCore.isPlaying, 
            'favorites'
        );
    },

    handleTrackClick(uid) {
        // Если кликнули в контексте Избранного, плеер должен получить только избранные треки
        let playlistToSet = [];
        
        if (this.currentContext === 'favorites') {
            // Для плеера берем только реально активные треки
            playlistToSet = FavoritesStore.getPlayableUIDs();
        } else {
            // Для альбома берем все треки альбома
            playlistToSet = this.currentListUIDs;
        }

        // Если этот плейлист еще не загружен в плеер или отличается
        // (Простая проверка по длине и первому элементу для оптимизации, можно улучшить)
        const isNewPlaylist = JSON.stringify(playlistToSet) !== JSON.stringify(PlayerCore.originalPlaylist);
        
        if (isNewPlaylist) {
            PlayerCore.setPlaylist(playlistToSet, uid);
        } else {
            PlayerCore.play(uid);
        }
    },

    handleFavoriteClick(uid, btn, row) {
        const isLikedNow = FavoritesStore.toggle(uid);
        
        // Обновляем иконку
        if (isLikedNow) {
            btn.classList.add('liked');
            btn.title = "Убрать из избранного";
        } else {
            btn.classList.remove('liked');
            btn.title = "В избранное";
        }

        // СПЕЦИАЛЬНАЯ ЛОГИКА ДЛЯ ЭКРАНА ИЗБРАННОГО
        // Исправляет "пропадание инактивной строки"
        if (this.currentContext === 'favorites') {
            if (!isLikedNow) {
                row.classList.add('inactive'); // Становится прозрачным
            } else {
                row.classList.remove('inactive'); // Возвращается
            }
        }
    },

    highlightTrack(uid) {
        // Снимаем активный класс со всех
        const prev = this.container.querySelector('.track-row.active');
        if (prev) prev.classList.remove('active');

        // Ставим новому (если он есть в текущем списке)
        const curr = this.container.querySelector(`.track-row[data-uid="${uid}"]`);
        if (curr) curr.classList.add('active');
    },
    
    updatePlayIcons(isPlaying) {
        // Меняем иконки play/pause в списке
        const activeRow = this.container.querySelector('.track-row.active .idx-num');
        if (activeRow) {
            activeRow.textContent = isPlaying ? '⏸' : '▶'; // Лучше использовать SVG
        }
    },

    updateMiniPlayerUI(uid) {
        const track = TrackRegistry.getTrack(uid);
        if (!track) return;
        
        // Обновление глобального плеера (снизу)
        const pTitle = $('#player-track-title');
        const pArtist = $('#player-track-artist');
        const pCover = $('#player-cover');
        
        if (pTitle) pTitle.textContent = track.title;
        if (pArtist) pArtist.textContent = track.artist;
        if (pCover) pCover.src = track.cover;
        
        // Обновление MediaSession (для шторки уведомлений Android/iOS)
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title,
                artist: track.artist,
                album: track.albumTitle,
                artwork: [{ src: track.cover, sizes: '512x512', type: 'image/jpeg' }]
            });
        }
    }
};
