import './core/utils.js'; // Загружаем глобальные утилиты
import { TrackRegistry } from './core/track-registry.js';
import { FavoritesStore } from './core/favorites-store.js';
import { PlayerCore } from './core/player-core.js';
import { AppController } from './app/app-controller.js';
import { initOfflineManager } from './offline/offline-manager.js';
import { Toast, Modal } from './core/ui-kit.js';
import './app/promocode.js'; // IIFE для промокода

// Публикуем UI кит глобально для совместимости старых модулей
window.NotificationSystem = Toast;
window.Modals = Modal;

async function startApp() {
    try {
        console.log('🚀 App Start');
        
        // 1. Загрузка данных
        const res = await fetch('albums.json');
        if (!res.ok) throw new Error('Failed to load albums.json');
        const data = await res.json();
        const albums = data.albums || [];

        // 2. Регистрация альбомов
        TrackRegistry.registerAlbums(albums);

        // 3. Загрузка конфигураций альбомов
        const loadPromises = albums.map(async (alb) => {
            const id = alb.id || alb.key;
            if (!alb.base) return;
            const configUrl = alb.base.endsWith('/') ? `${alb.base}config.json` : `${alb.base}/config.json`;
            try {
                const r = await fetch(configUrl);
                if (r.ok) {
                    const cfg = await r.json();
                    if (cfg.tracks) TrackRegistry.registerTracks(id, cfg.tracks);
                }
            } catch (e) {
                console.warn(`Config load error for ${id}:`, e);
            }
        });
        await Promise.all(loadPromises);

        // 4. Инициализация систем
        FavoritesStore.init();
        PlayerCore.initialize(); // Инициализация Howler wrapper
        
        // Offline
        initOfflineManager().then(() => console.log('Offline system ready'));

        // 5. Запуск UI
        AppController.init(albums);

        // Кнопка перезагрузки
        const reloadBtn = document.getElementById('reload-btn');
        if(reloadBtn) reloadBtn.onclick = () => window.location.reload();

    } catch (e) {
        console.error('Critical Init Error:', e);
        if(Toast) Toast.error('Ошибка запуска: ' + e.message);
        else alert('Ошибка запуска: ' + e.message);
    }
}

// Экспортируем функцию запуска, чтобы promocode.js мог её вызвать
window.startApp = startApp;
