// scripts/ui/offline-modal.js
// OFFLINE modal — центр управления (ТЗ 12 полный)
// Зависимости: Utils.createModal, offlineManager, notify.js (showToast)

import offlineManager from '../utils/offline-manager.js'; // Адаптировать под ваш загрузчик

class OfflineModal {
  constructor() {
    this.modal = null;
    this.initButton();
    this.loadAlbumsList(); // Для 100% OFFLINE
  }

  async initButton() {
    const btn = document.getElementById('offline-btn');
    if (!btn) return;

    btn.textContent = 'OFFLINE'; // Всегда "OFFLINE" (ТЗ 12.1)

    await this.updateAlertIndicator();

    btn.addEventListener('click', (e) => {
      if (btn.classList.contains('alert') && e.detail === 1) {
        showToast('Есть треки для обновления.', { duration: 6000 }); // x2 длительность (ТЗ 13)
      } else {
        this.openModal();
      }
    });
  }

  async updateAlertIndicator() {
    const btn = document.getElementById('offline-btn');
    const hasUpdates = await offlineManager.checkForUpdates(); // Реализовать в OfflineManager: сравнение size/size_low
    if (hasUpdates) {
      btn.classList.add('alert');
      btn.title = 'Есть треки для обновления';
    } else {
      btn.classList.remove('alert');
    }
  }

  async loadAlbumsList() {
    // Загрузка albums.json для чекбоксов 100% OFFLINE
    try {
      const resp = await fetch('albums.json');
      this.albumsData = await resp.json();
    } catch (e) {
      this.albumsData = [];
    }
  }

  openModal() {
    if (this.modal) {
      this.modal.show();
      return;
    }

    const content = document.createElement('div');
    content.className = 'offline-modal-content';
    content.innerHTML = this.buildHTML();

    this.modal = Utils.createModal({
      title: 'OFFLINE',
      content: content.outerHTML,
      onOpen: () => this.bindEvents()
    });
  }

  buildHTML() {
    return `
      <div class="offline-section">
        <h3>A) Offline mode (политика)</h3>
        <label><input type="checkbox" id="offline-mode-toggle" ${offlineManager.offlineMode ? 'checked' : ''}> Включить Offline mode</label>
        <p class="desc">Pinned/cloud работают независимо, но загрузки подчиняются network policy (ТЗ 5.3)</p>
      </div>

      <div class="offline-section">
        <h3>B) Cache quality (CQ)</h3>
        <select id="cache-quality">
          <option value="hi" ${offlineManager.cacheQuality === 'hi' ? 'selected' : ''}>Hi</option>
          <option value="lo" ${offlineManager.cacheQuality === 'lo' ? 'selected' : ''}>Lo</option>
        </select>
      </div>

      <div class="offline-section">
        <h3>C) Cloud settings</h3>
        <label>Порог N: <input type="number" id="cloud-n" value="${offlineManager.cloudN}" min="1"></label><br>
        <label>TTL D (дней): <input type="number" id="cloud-d" value="${offlineManager.cloudD}" min="1"></label>
      </div>

      <div class="offline-section">
        <h3>D) Network policy</h3>
        <label><input type="checkbox" id="network-wifi" ${offlineManager.networkPolicy.wifi ? 'checked' : ''}> Wi Fi/проводной</label><br>
        <label><input type="checkbox" id="network-mobile" ${offlineManager.networkPolicy.mobile ? 'checked' : ''}> Мобильный</label>
      </div>

      <div class="offline-section">
        <h3>E) Cache limit + breakdown</h3>
        <p id="cache-breakdown">Загрузка...</p>
      </div>

      <div class="offline-section">
        <h3>F) Загрузки</h3>
        <p>Скачивается сейчас: <span id="current-downloads">0</span></p>
        <p>В очереди: <span id="queue-length">${offlineManager.downloadQueue.length}</span></p>
        <button id="pause-downloads">Пауза/Возобновить</button>
      </div>

      <div class="offline-section">
        <h3>G) Обновления</h3>
        <button id="update-all">Обновить все файлы</button>
        <p class="desc">Предупреждение: оценка объёма + рекомендация Wi Fi</p>
      </div>

      <div class="offline-section">
        <h3>H) Очистка кэша</h3>
        <button id="clear-pinned">Очистить pinned (двойное подтверждение)</button><br>
        <button id="clear-cloud">Очистить cloud</button><br>
        <button id="clear-all">Очистить всё (двойное подтверждение)</button>
      </div>

      <div class="offline-section">
        <h3>I) 100% OFFLINE</h3>
        <label><input type="radio" name="full-offline-mode" value="favorites"> Только ИЗБРАННОЕ</label><br>
        <label><input type="radio" name="full-offline-mode" value="albums" checked> Выбранные альбомы</label>
        <div id="albums-checkboxes">${this.buildAlbumsCheckboxes()}</div>
        <button id="start-full-offline">Запустить (оценка объёма + проверки)</button>
      </div>
    `;
  }

  buildAlbumsCheckboxes() {
    return this.albumsData.map(album => `
      <label><input type="checkbox" value="${album.id}"> ${album.title}</label><br>
    `).join('');
  }

  async bindEvents() {
    // Сохранение настроек
    document.getElementById('cache-quality').addEventListener('change', (e) => {
      offlineManager.cacheQuality = e.target.value;
      offlineManager.saveSettings();
      offlineManager.triggerReCache(); // Тихая замена (ТЗ P-RECACHE-1)
    });

    // ... аналогично для других toggles/input (cloudN, networkPolicy и т.д.)

    // Breakdown кэша
    this.updateCacheBreakdown();

    // Update all
    document.getElementById('update-all').addEventListener('click', async () => {
      const estimate = await offlineManager.estimateUpdateSize();
      if (confirm(`Обновить ${estimate.files} файлов, ~${estimate.mb} МБ? Рекомендуем Wi Fi`)) {
        offlineManager.queueAllUpdates();
      }
    });

    // 100% OFFLINE
    document.getElementById('start-full-offline').addEventListener('click', async () => {
      const mode = document.querySelector('input[name="full-offline-mode"]:checked').value;
      const selected = mode === 'favorites' ? ['__favorites__'] : Array.from(document.querySelectorAll('#albums-checkboxes input:checked')).map(ch => ch.value);

      const estimate = await offlineManager.estimateFullOfflineSize(selected, offlineManager.cacheQuality);
      if (estimate.mb > 1000) showToast('Большой объём! Рекомендуем Wi Fi');

      const storage = await navigator.storage.estimate();
      if (storage.usage + estimate.bytes > storage.quota * 0.9) {
        showToast('Недостаточно места. Очистите кэш.');
        return;
      }

      if (navigator.connection?.type === 'unknown' && !confirm('Тип сети неизвестен. Продолжить?')) return;

      offlineManager.startFullOffline(selected);
    });

    // ... другие кнопки (очистка с двойным confirm и т.д.)
  }

  async updateCacheBreakdown() {
    const estimate = await navigator.storage.estimate();
    document.getElementById('cache-breakdown').innerHTML = `
      Лимит: ${offlineManager.cacheLimit === 'auto' ? 'Авто' : offlineManager.cacheLimit + ' MB'}<br>
      Использовано: ${(estimate.usage / 1024 / 1024).toFixed(1)} MB из ${(estimate.quota / 1024 / 1024).toFixed(1)} MB<br>
      Breakdown: pinned ${await offlineManager.getSize('pinned')} MB | cloud ... (реализовать)
    `;
  }
}

const offlineModal = new OfflineModal();
export default offlineModal;
