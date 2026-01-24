import { $ } from './core/utils.js';
import { TrackRegistry } from './core/track-registry.js';
import { FavoritesStore } from './core/favorites-store.js';
import { PlayerCore } from './core/player-core.js';
import { AppController } from './app/app-controller.js';
import { initOfflineManager } from './offline/offline-manager.js';

const PROMOCODE = "VITRINA2025";

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Service Worker
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('./service-worker.js');
            console.log('SW registered');
        } catch (e) { console.error('SW fail', e); }
    }

    // 2. Промокод
    const saved = localStorage.getItem('promocode');
    if (saved !== PROMOCODE) {
        const block = $('#promocode-block');
        const inp = $('#promo-inp');
        const err = $('#promo-error');
        
        $('#promo-btn').onclick = () => {
            if (inp.value.trim() === PROMOCODE) {
                localStorage.setItem('promocode', PROMOCODE);
                block.classList.add('hidden');
                startApp();
            } else {
                err.textContent = "Неверный код";
            }
        };
        return; 
    }
    
    $('#promocode-block').classList.add('hidden');
    startApp();
});

async function startApp() {
    try {
        console.log('🚀 Starting...');
        $('#main-block').classList.remove('hidden');

        // Данные
        const res = await fetch('config/config.json');
        const data = await res.json();
        
        // Ядро
        TrackRegistry.init(data.albums);
        FavoritesStore.init();
        PlayerCore.init();
        
        // Оффлайн (фоновый старт)
        initOfflineManager().then(() => console.log('Offline Mgr ready'));

        // UI
        AppController.init(data.albums);

        // Кнопка перезагрузки (полезно для PWA)
        $('#reload-btn').onclick = () => window.location.reload();

    } catch (e) {
        alert('Critical Error: ' + e.message);
        console.error(e);
    }
}
