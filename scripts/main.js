import { $ } from './core/utils.js';
import { TrackRegistry } from './core/track-registry.js';
import { FavoritesStore } from './core/favorites-store.js';
import { PlayerCore } from './core/player-core.js';
import { AppController } from './app/app-controller.js';

// Конфиг
const PROMOCODE = "VITRINA2025";

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Промокод (Простая логика без лишних файлов)
    const saved = localStorage.getItem('promocode');
    if (saved !== PROMOCODE) {
        const block = $('#promocode-block');
        const inp = $('#promo-inp');
        const btn = $('#promo-btn');
        const err = $('#promo-error');

        btn.onclick = () => {
            if (inp.value.trim() === PROMOCODE) {
                localStorage.setItem('promocode', PROMOCODE);
                block.classList.add('hidden');
                initApp();
            } else {
                err.textContent = "Неверный код";
            }
        };
        return; // Ждем ввода
    }
    
    $('#promocode-block').classList.add('hidden');
    initApp();
});

async function initApp() {
    try {
        console.log('🚀 Init App...');
        $('#main-block').classList.remove('hidden');

        // 2. Загрузка данных
        const res = await fetch('config/config.json'); // Или albums.json если переименовали
        const data = await res.json();
        const albums = data.albums || [];

        // 3. Инициализация Ядра
        TrackRegistry.init(albums);
        FavoritesStore.init();
        PlayerCore.init();
        
        // 4. Инициализация UI
        AppController.init(albums);

        // 5. Offline (Заглушка для совместимости, можно расширить позже)
        $('#offline-btn').onclick = () => alert('Offline режим в разработке');

    } catch (e) {
        console.error('Init failed', e);
        alert('Ошибка запуска: ' + e.message);
    }
}
