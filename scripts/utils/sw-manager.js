// scripts/utils/sw-manager.js
// Управление Service Worker из приложения

class ServiceWorkerManager {
  constructor() {
    this.registration = null;
    this.isSupported = 'serviceWorker' in navigator;
  }

  async init() {
    if (!this.isSupported) {
      console.warn('Service Worker not supported');
      return false;
    }

    try {
      this.registration = await navigator.serviceWorker.register('./service-worker.js', {
        scope: './'
      });

      console.log('✅ Service Worker registered:', this.registration.scope);

      // Проверка обновлений
      this.checkForUpdates();

      // Слушатель обновлений
      this.registration.addEventListener('updatefound', () => {
        this.handleUpdateFound();
      });

      // Периодическая проверка обновлений (каждый час)
      setInterval(() => {
        this.checkForUpdates();
      }, 60 * 60 * 1000);

      return true;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return false;
    }
  }

  checkForUpdates() {
    if (this.registration) {
      this.registration.update();
    }
  }

  handleUpdateFound() {
    const newWorker = this.registration.installing;
    
    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        // Новая версия доступна
        this.showUpdateNotification();
      }
    });
  }

  handleVersionMessage({ swVer, appVer } = {}) {
    // ✅ Единая точка входа для update UI из AppModule (и e2e).
    // Никаких confirm() — только единый UI (toast + кнопка).
    const s = String(swVer || '').trim();
    const a = String(appVer || '').trim();
    if (!s) return;
    if (a && s === a) return;

    this.availableVersion = s;
    this.showUpdateNotification();
  }

  showUpdateNotification() {
    const ver = String(this.availableVersion || '').trim();
    const msg = ver
      ? `Доступна новая версия приложения (${ver}).`
      : 'Доступна новая версия приложения.';

    window.NotificationSystem?.info(msg, 10000);

    // Показать кнопку обновления
    this.showUpdateButton();
  }

  showUpdateButton() {
    let updateBtn = document.getElementById('update-app-btn');
    
    if (!updateBtn) {
      updateBtn = document.createElement('button');
      updateBtn.id = 'update-app-btn';
      updateBtn.textContent = 'ОБНОВИТЬ ПРИЛОЖЕНИЕ';
      updateBtn.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        background: #4daaff;
        color: white;
        border: none;
        border-radius: 8px;
        font-weight: bold;
        cursor: pointer;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;
      
      updateBtn.addEventListener('click', () => {
        this.applyUpdate();
      });
      
      document.body.appendChild(updateBtn);
    }
    
    updateBtn.style.display = 'block';
  }

  async applyUpdate() {
    if (!this.registration || !this.registration.waiting) {
      return;
    }

    // Сохраняем состояние плеера перед обновлением, чтобы после reload восстановиться
    try {
      if (window.PlayerState && typeof window.PlayerState.save === 'function') {
        window.PlayerState.save({ forReload: true });
      }
    } catch (e) {
      console.warn('PlayerState.save before SW update failed:', e);
    }

    // Отправить сообщение SW для пропуска ожидания
    this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });

    // Перезагрузить страницу при активации нового SW
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
  }

  async clearCache(cacheType) {
    if (!this.registration || !this.registration.active) {
      return;
    }

    this.registration.active.postMessage({
      type: 'CLEAR_CACHE',
      payload: { cacheType }
    });

    window.NotificationSystem?.success('Кэш очищен');
  }

  async cacheAudioFiles(urls) {
    if (!this.registration || !this.registration.active) {
      return;
    }

    this.registration.active.postMessage({
      type: 'CACHE_AUDIO',
      payload: { urls }
    });
  }

  async getCacheSize() {
    if (!this.registration || !this.registration.active) {
      return 0;
    }

    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = (event) => {
        resolve(event.data.size || 0);
      };

      this.registration.active.postMessage(
        { type: 'GET_CACHE_SIZE' },
        [messageChannel.port2]
      );
    });
  }

  formatCacheSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

// Глобальный экземпляр
window.ServiceWorkerManager = new ServiceWorkerManager();

// Автоинициализация
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.ServiceWorkerManager.init();
  });
} else {
  window.ServiceWorkerManager.init();
}

// export default удалён: файл используется как browser script через window.ServiceWorkerManager

