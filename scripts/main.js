import { $ } from './core/utils.js';
import { TrackRegistry } from './core/track-registry.js';
import { FavoritesStore } from './core/favorites-store.js';
import { PlayerCore } from './core/player-core.js';
import { AppController } from './app/app-controller.js';
import { initOfflineManager } from './offline/offline-manager.js';
import { Toast, Modal } from './core/ui-kit.js';

window.Utils = { formatBytes: (n) => (n/1024/1024).toFixed(1)+' MB' };
window.NotificationSystem = Toast; 
window.Modals = Modal;

const PROMOCODE = "VITRINA2025";

document.addEventListener('DOMContentLoaded', async () => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});

    const saved = localStorage.getItem('promocode');
    if (saved !== PROMOCODE) {
        const block = $('#promocode-block');
        $('#promo-btn').onclick = () => {
            if ($('#promo-inp').value.trim() === PROMOCODE) {
                localStorage.setItem('promocode', PROMOCODE);
                block.classList.add('hidden');
                startApp();
            } else {
                $('#promo-error').textContent = "Неверный код";
            }
        };
        return; 
    }
    $('#promocode-block').classList.add('hidden');
    startApp();
});

async function startApp() {
    try {
        console.log('🚀 App Start');
        $('#main-block').classList.remove('hidden');

        // 1. Загружаем список альбомов
        const res = await fetch('albums.json'); 
        if (!res.ok) throw new Error('albums.json not found');
        const data = await res.json();
        const albums = data.albums || []; 
        
        // Регистрируем сами альбомы (без треков пока)
        TrackRegistry.registerAlbums(albums);

        // 2. Параллельно загружаем config.json для каждого альбома
        const loadPromises = albums.map(async (alb) => {
            const id = alb.id || alb.key;
            if (!alb.base) return; // Пропускаем спец-альбомы без base

            const configUrl = alb.base.endsWith('/') ? `${alb.base}config.json` : `${alb.base}/config.json`;
            try {
                const r = await fetch(configUrl);
                if (r.ok) {
                    const cfg = await r.json();
                    // Регистрируем треки этого альбома
                    if (cfg.tracks) {
                        TrackRegistry.registerTracks(id, cfg.tracks);
                    }
                }
            } catch (e) {
                console.warn(`Failed to load config for ${id}`, e);
            }
        });

        // Ждем загрузки ВСЕХ конфигов
        await Promise.all(loadPromises);

        // 3. Инициализируем остальное
        FavoritesStore.init();
        PlayerCore.init();
        initOfflineManager().then(()=>console.log('Offline Ready'));
        
        // 4. Запускаем UI (теперь треки есть в реестре)
        AppController.init(albums);

        $('#reload-btn').onclick = () => window.location.reload();

    } catch (e) {
        console.error(e);
        if(Toast) Toast.error('Ошибка: ' + e.message);
        else alert('Critical Error: ' + e.message);
    }
}
