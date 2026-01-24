import { $ } from './core/utils.js';
import { TrackRegistry } from './core/track-registry.js';
import { FavoritesStore } from './core/favorites-store.js';
import { PlayerCore } from './core/player-core.js';
import { AppController } from './app/app-controller.js';
import { initOfflineManager } from './offline/offline-manager.js';
import { Toast, Modal } from './core/ui-kit.js';

// Глобальные хелперы для совместимости
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

        // В корневом файле albums.json лежит структура { albums: [...] }
        const res = await fetch('albums.json'); 
        const data = await res.json();
        
        TrackRegistry.init(data.albums);
        FavoritesStore.init();
        PlayerCore.init();
        initOfflineManager().then(()=>console.log('Offline Ready'));
        
        AppController.init(data.albums);

        $('#reload-btn').onclick = () => window.location.reload();

    } catch (e) {
        console.error(e);
        Toast.error('Ошибка загрузки: ' + e.message);
    }
}
