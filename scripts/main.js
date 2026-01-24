import { $ } from './core/utils.js';
import { TrackRegistry } from './core/track-registry.js';
import { FavoritesStore } from './core/favorites-store.js';
import { PlayerCore } from './core/player-core.js';
import { AppController } from './app/app-controller.js';
import { initOfflineManager } from './offline/offline-manager.js';
import { Toast, Modal } from './core/ui-kit.js';

// Глобальные хелперы
window.Utils = { formatBytes: (n) => (n/1024/1024).toFixed(1)+' MB' };
window.NotificationSystem = Toast; 
window.Modals = Modal;

const PROMOCODE = "VITRINA2025";

document.addEventListener('DOMContentLoaded', async () => {
    // Регистрируем новый SW
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(reg => {
                // Если есть обновление, уведомляем
                reg.onupdatefound = () => {
                    const installingWorker = reg.installing;
                    installingWorker.onstatechange = () => {
                        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            Toast.info('Доступна новая версия. Перезагрузите страницу.');
                        }
                    };
                };
            })
            .catch(console.error);
    }

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

        // 👇 ИСПРАВЛЕНИЕ: Был config/config.json, стал albums.json
        const res = await fetch('albums.json');
        if (!res.ok) throw new Error(`Config not found (${res.status})`);
        
        const data = await res.json();
        // В albums.json структура { albums: [...] }
        const albums = data.albums || []; 
        
        TrackRegistry.init(albums);
        FavoritesStore.init();
        PlayerCore.init();
        
        initOfflineManager().then(() => console.log('Offline Ready'));
        
        AppController.init(albums);

        $('#reload-btn').onclick = () => window.location.reload();

    } catch (e) {
        console.error(e);
        // Если Toast еще не готов (ошибка в core), используем alert
        if (Toast) Toast.error('Ошибка: ' + e.message);
        else alert('Ошибка: ' + e.message);
    }
}
