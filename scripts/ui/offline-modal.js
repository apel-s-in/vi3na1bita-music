// scripts/ui/offline-modal.js
// OFFLINE modal — центр управления (ТЗ раздел 12)
// Зависимости: Utils.createModal, offlineManager (из utils/offline-manager.js), notify.js для тостов

import offlineManager from '../utils/offline-manager.js'; // Предполагаем ES modules или адаптировать под ваш загрузчик
import { showToast } from './notify.js'; // Если тосты экспортированы

class OfflineModal {
  constructor() {
    this.modal = null;
    this.initButton();
  }

  initButton() {
    const btn = document.getElementById('offline-btn');
    if (!btn) return;

    // Всегда текст "OFFLINE" (ТЗ 12.1, AC13)
    btn.textContent = 'OFFLINE';
    btn.classList.remove('online'); // Убираем старые классы, если были

    btn.onclick = () => this.openModal();

    // Индикатор “!” при needsUpdate/needsReCache (ТЗ 13)
    this.updateAlertIndicator();
  }

  async updateAlertIndicator() {
    const btn = document.getElementById('offline-btn');
    // TODO: Когда реализуем needsUpdate/needsReCache — проверять здесь
    const hasUpdates = await this.checkForUpdates(); // Заглушка, потом реальная проверка
    if (hasUpdates) {
      btn.classList.add('alert');
      btn.title = 'Есть треки для обновления';
      btn.onclick = (e) => {
        if (e.detail === 1) { // Одиночный клик — тост x2 длительности
          showToast('Есть треки для обновления.', { duration: 6000 });
        } else if (e.detail === 2) { // Двойной клик — открыть модалку
          this.openModal();
        }
      };
    } else {
      btn.classList.remove('alert');
      btn.onclick = () => this.openModal();
    }
  }

  async checkForUpdates() {
    // Заглушка. Позже: пройти по всем трекам в DB и сравнить size/size_low из config.json
    return false;
  }

  openModal() {
    if (this.modal) {
      this.modal.show();
      return;
    }

    const content = this.buildContent();
    this.modal = Utils.createModal({
      title: 'OFFLINE управление',
      content: content,
      wide: true,
      onClose: () => this.modal = null
    });

    this.modal.show();
    this.bindEvents(content);
  }

  buildContent() {
    const div = document.createElement('div');
    div.className = 'offline-modal-content';
    div.innerHTML = `
      <!-- A) Offline mode (политика) -->
      <section class="offline-section">
        <h3>Offline mode</h3>
        <label>
          <input type="checkbox" id="offline-mode-toggle" checked>
          Включён (политика загрузок)
        </label>
        <p class="desc">Не выключает интернет, только управляет автоматическими загрузками.</p>
      </section>

      <!-- B) Cache quality -->
      <section class="offline-section">
        <h3>Качество кэша (для pinned / cloud / 100% offline)</h3>
        <select id="cache-quality-select">
          <option value="hi">Hi</option>
          <option value="lo" selected>Lo</option>
        </select>
      </section>

      <!-- C) Cloud settings -->
      <section class="offline-section">
        <h3>Cloud ☁ настройки</h3>
        <label>
          Порог N (полных прослушиваний):
          <input type="number" id="cloud-n" min="1" value="5">
        </label>
        <label>
          TTL D (дней):
          <input type="number" id="cloud-d" min="1" value="31">
        </label>
      </section>

      <!-- D) Network policy -->
      <section class="offline-section">
        <h3>Сеть</h3>
        <label><input type="checkbox" id="network-wifi" checked> Разрешить Wi-Fi / проводной</label><br>
        <label><input type="checkbox" id="network-mobile" checked> Разрешить мобильный интернет</label>
      </section>

      <!-- E) Cache limit + breakdown -->
      <section class="offline-section">
        <h3>Лимит кэша</h3>
        <label>
          <input type="radio" name="cache-limit" value="auto" checked> Авто (максимально доступно)
        </label><br>
        <label>
          <input type="radio" name="cache-limit" value="manual"> Ручной (МБ):
          <input type="number" id="manual-limit" min="100" disabled>
        </label>
        <div id="cache-breakdown">
          <!-- Заполнится динамически -->
          <p>Загрузка статистики...</p>
        </div>
      </section>

      <!-- F) Загрузки -->
      <section class="offline-section">
        <h3>Загрузки</h3>
        <p>Скачивается сейчас: <span id="current-download">—</span></p>
        <p>В очереди: <span id="queue-count">0</span></p>
        <button id="pause-downloads">Пауза</button>
        <button id="resume-downloads" disabled>Возобновить</button>
      </section>

      <!-- G) Обновления -->
      <section class="offline-section">
        <h3>Обновления</h3>
        <button id="update-all-files">Обновить все файлы</button>
        <p class="desc">Проверит и перекачает устаревшие треки (pinned и cloud).</p>
      </section>

      <!-- H) Очистка кэша -->
      <section class="offline-section">
        <h3>Очистка кэша</h3>
        <div id="cleanup-breakdown">
          <!-- Категории с размерами -->
        </div>
        <button class="danger" id="clear-all-cache">Очистить всё (двойное подтверждение)</button>
      </section>

      <!-- I) 100% OFFLINE -->
      <section class="offline-section">
        <h3>100% OFFLINE</h3>
        <p>Полное кэширование выбранного контента в качестве <span id="cq-display">Hi</span></p>
        <label>
          <input type="radio" name="full-offline-mode" value="favorites" checked> Только ИЗБРАННОЕ
        </label><br>
        <label>
          <input type="radio" name="full-offline-mode" value="albums"> Выбранные альбомы
        </label>
        <div id="albums-checkboxes" style="display:none; max-height:200px; overflow-y:auto;">
          <!-- Чекбоксы альбомов из albums.json -->
        </div>
        <button id="start-full-offline">Начать 100% OFFLINE</button>
        <p class="desc">Оценит объём, проверит место и сеть.</p>
      </section>
    `;

    return div;
  }

  bindEvents(content) {
    // Cache quality
    const cqSelect = content.querySelector('#cache-quality-select');
    cqSelect.value = offlineManager.cacheQuality;
    cqSelect.onchange = () => {
      offlineManager.cacheQuality = cqSelect.value;
      offlineManager.saveSettings();
      content.querySelector('#cq-display').textContent = cqSelect.value.toUpperCase();
      // TODO: пометить needsReCache для всех pinned/cloud
    };

    // Cloud settings
    content.querySelector('#cloud-n').value = offlineManager.cloudN;
    content.querySelector('#cloud-d').value = offlineManager.cloudD;
    content.querySelector('#cloud-n').onchange = (e) => {
      offlineManager.cloudN = parseInt(e.target.value) || 5;
      offlineManager.saveSettings();
    };
    content.querySelector('#cloud-d').onchange = (e) => {
      offlineManager.cloudD = parseInt(e.target.value) || 31;
      offlineManager.saveSettings();
    };

    // Network policy
    content.querySelector('#network-wifi').checked = offlineManager.networkPolicy.wifi;
    content.querySelector('#network-mobile').checked = offlineManager.networkPolicy.mobile;
    content.querySelector('#network-wifi').onchange = (e) => {
      offlineManager.networkPolicy.wifi = e.target.checked;
      offlineManager.saveSettings();
    };
    content.querySelector('#network-mobile').onchange = (e) => {
      offlineManager.networkPolicy.mobile = e.target.checked;
      offlineManager.saveSettings();
    };

    // Cache limit (упрощённо)
    content.querySelectorAll('input[name="cache-limit"]').forEach(radio => {
      radio.onchange = () => {
        const manual = content.querySelector('#manual-limit');
        manual.disabled = radio.value !== 'manual';
      };
    });

    // Загрузки (пауза/возобновить — опционально по ТЗ)
    content.querySelector('#pause-downloads').onclick = () => {
      // TODO: offlineManager.pauseQueue()
      content.querySelector('#pause-downloads').disabled = true;
      content.querySelector('#resume-downloads').disabled = false;
    };
    content.querySelector('#resume-downloads').onclick = () => {
      // TODO: offlineManager.resumeQueue()
      content.querySelector('#pause-downloads').disabled = false;
      content.querySelector('#resume-downloads').disabled = true;
    };

    // Обновить все файлы
    content.querySelector('#update-all-files').onclick = async () => {
      if (!await offlineManager.isNetworkAllowed()) return;
      const confirmWifi = confirm('Рекомендуется Wi-Fi. Продолжить?');
      if (!confirmWifi) return;
      // TODO: сканировать все pinned/cloud, поставить задачи update в очередь
      showToast('Запущено обновление всех файлов.');
    };

    // Очистка (двойные подтверждения)
    content.querySelector('#clear-all-cache').ondblclick = () => {
      if (confirm('Очистить весь кэш? Это действие необратимо.')) {
        if (confirm('Подтвердите ещё раз.')) {
          // TODO: полная очистка (кроме pinned — никогда)
          showToast('Кэш очищен.');
        }
      }
    };

    // 100% OFFLINE
    content.querySelectorAll('input[name="full-offline-mode"]').forEach(radio => {
      radio.onchange = () => {
        const albumsDiv = content.querySelector('#albums-checkboxes');
        albumsDiv.style.display = radio.value === 'albums' ? 'block' : 'none';
        if (radio.value === 'albums') this.loadAlbumsCheckboxes(albumsDiv);
      };
    });

    content.querySelector('#start-full-offline').onclick = async () => {
      // TODO: собрать выбранное, оценить объём по CQ, проверить место, Unknown сеть → confirm
      if (!await offlineManager.isNetworkAllowed()) return;
      showToast('Запуск 100% OFFLINE... (реализация в следующем шаге)');
    };

    // Динамическое обновление статистики загрузок/кэша
    this.updateDynamicInfo(content);
  }

  async loadAlbumsCheckboxes(container) {
    // TODO: загрузить albums.json и создать чекбоксы
    container.innerHTML = '<p>Альбомы загружаются...</p>';
  }

  async updateDynamicInfo(content) {
    // TODO: обновлять текущую загрузку, очередь, breakdown кэша
    content.querySelector('#queue-count').textContent = offlineManager.downloadQueue.length;
    // setInterval для live обновления
  }
}

// Инициализация
const offlineModal = new OfflineModal();
export default offlineModal;
