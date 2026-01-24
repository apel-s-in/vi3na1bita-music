import { Modal, Toast } from '../core/ui-kit.js';
import { getOfflineManager } from '../offline/offline-manager.js';
import { getNetPolicy, setNetPolicy } from '../offline/net-policy.js';

// Простой HTML генератор
const renderBody = (state) => `
    <div class="om-stack">
        <div class="om-card">
            <div class="om-row"><span class="om-kv">Статус сети:</span> <b>${state.net.online ? 'Online' : 'Offline'}</b></div>
            <div class="om-row"><span class="om-kv">Всего в кэше:</span> <b>${(state.cacheSizeBytes / 1024 / 1024).toFixed(1)} MB</b></div>
        </div>
        
        <div class="om-card">
            <div class="om-card__title">Настройки загрузки</div>
            <label class="om-row om-row--tight">
                <input type="checkbox" id="om-pol-wifiOnly" ${state.policy.wifiOnly ? 'checked' : ''}>
                <span>Только по Wi-Fi</span>
            </label>
            <div class="om-actions">
                <button id="om-save-pol" class="om-btn-primary">Сохранить настройки</button>
            </div>
        </div>

        <div class="om-card">
            <div class="om-card__title">Управление</div>
            <div class="om-actions">
                <button id="om-full-start" class="om-btn-success">Скачать ВСЁ (100% Offline)</button>
                <button id="om-clear-all" class="om-btn-danger">Очистить кэш</button>
            </div>
        </div>
    </div>
`;

export async function openOfflineModal() {
    const mgr = getOfflineManager();
    const net = { online: navigator.onLine };
    const cacheSizeBytes = await mgr.getCacheSizeBytes();
    const policy = getNetPolicy();

    const state = { net, cacheSizeBytes, policy };

    const modal = Modal.open({
        title: 'Оффлайн Режим',
        bodyHtml: renderBody(state)
    });

    // Биндинг кнопок
    modal.querySelector('#om-save-pol').onclick = () => {
        setNetPolicy({
            wifiOnly: modal.querySelector('#om-pol-wifiOnly').checked
        });
        Toast.success('Настройки сохранены');
    };

    modal.querySelector('#om-clear-all').onclick = async () => {
        if(confirm('Удалить всю музыку с устройства?')) {
            await mgr.clearAllCache();
            Toast.success('Кэш очищен');
            modal.remove(); // Закрыть
        }
    };

    modal.querySelector('#om-full-start').onclick = async () => {
        Toast.info('Начинаю загрузку всех треков...');
        // Простая реализация mass download
        const tracks = window.TrackRegistry.getAllTracks(); // Используем глобальный реестр
        const uids = tracks.map(t => t.uid);
        await mgr.startFullOffline(uids);
    };
}
