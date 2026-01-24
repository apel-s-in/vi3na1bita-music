import { $ } from './core/utils.js';
import { TrackRegistry } from './core/track-registry.js';
import { FavoritesStore } from './core/favorites-store.js';
import { PlayerCore } from './core/player-core.js';
import { AppController } from './app/app-controller.js';

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('🚀 App starting...');

        // 1. Загружаем конфиг
        const response = await fetch('config/config.json');
        const config = await response.json();

        // 2. Инициализируем Ядро
        TrackRegistry.init(config.albums);
        FavoritesStore.init(); // Загружает лайки из LS
        PlayerCore.init();     // Готовит аудио
        
        // 3. Инициализируем UI
        AppController.init();

        // 4. Привязка кнопок меню (Пример)
        const btnOpenFavs = $('#btn-open-favorites');
        if (btnOpenFavs) {
            btnOpenFavs.addEventListener('click', () => {
                AppController.openFavorites();
                // Логика переключения табов/скрытия меню
            });
        }
        
        // Обработка кликов по альбомам на главной (предполагаем наличие сетки альбомов)
        const albumGrid = $('#albums-grid');
        if (albumGrid) {
            albumGrid.addEventListener('click', (e) => {
                const card = e.target.closest('[data-album-id]');
                if (card) {
                    AppController.openAlbum(card.dataset.albumId);
                }
            });
        }

        // 5. Инициализация кнопок плеера (Next, Prev, Play)
        $('#player-play-btn').addEventListener('click', () => PlayerCore.toggle());
        $('#player-next-btn').addEventListener('click', () => PlayerCore.next());
        $('#player-prev-btn').addEventListener('click', () => PlayerCore.prev());
        $('#player-shuffle-btn').addEventListener('click', function() {
            const isS = PlayerCore.toggleShuffle();
            this.classList.toggle('active', isS);
        });
        
        // (Опционально) Открыть первый альбом по умолчанию
        if (config.albums.length > 0) {
            AppController.openAlbum(config.albums[0].id);
        }

        // Очистка старых "удаленных" из избранного при старте
        FavoritesStore.purgeInactive();

    } catch (error) {
        console.error('Critical Init Error:', error);
        alert('Ошибка инициализации приложения. Проверьте консоль.');
    }
});
