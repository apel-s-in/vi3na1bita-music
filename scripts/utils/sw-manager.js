//=================================================
// FILE: /scripts/utils/sw-manager.js
/**
 * scripts/utils/sw-manager.js
 * Optimized Service Worker Manager v2.1 (Fix Loop)
 * - Удалено: скачивание альбомов, очистка кэша (перенесено в OfflineManager)
 * - Исправлено: бесконечный цикл перезагрузки в DevTools
 * - Оптимизировано: минимальный размер
 */
(function (W, nav) {
  'use strict';

  let refreshing = false;

  class SWManager {
    constructor() {
      this.reg = null;
    }

    async init() {
      if (!('serviceWorker' in nav)) return;

      // 1. Prevent infinite loop on controller change
      nav.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        W.location.reload();
      });

      try {
        // 2. Register
        this.reg = await nav.serviceWorker.register('./service-worker.js', { scope: './' });

        // 3. Detect Update (waiting state)
        if (this.reg.waiting) {
          this._notifyUpdate();
        }

        // 4. Detect Future Updates
        this.reg.addEventListener('updatefound', () => {
          const newWorker = this.reg.installing;
          if (!newWorker) return;
          
          newWorker.addEventListener('statechange', () => {
            // Show button ONLY if there is already a controller (it's an update, not fresh install)
            if (newWorker.state === 'installed' && nav.serviceWorker.controller) {
              this._notifyUpdate();
            }
          });
        });

      } catch (e) {
        console.error('SW:', e);
      }
    }

    // Обработка сообщений о версии (из app.js)
    handleVersionMessage(data) {
      if (data?.swVer && data.swVer !== (W.VERSION || '')) {
        this._notifyUpdate();
      }
    }

    _notifyUpdate() {
      // Prevent duplicates
      if (document.getElementById('update-app-btn')) return;

      W.NotificationSystem?.info('Доступно обновление', 5000);

      const btn = document.createElement('button');
      btn.id = 'update-app-btn';
      btn.textContent = 'ОБНОВИТЬ';
      // Стили: поверх всего, внизу по центру, но чуть выше плеера
      btn.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);padding:10px 24px;background:#4daaff;color:#fff;border:0;border-radius:30px;font-weight:900;z-index:10001;box-shadow:0 6px 20px rgba(0,0,0,.6);cursor:pointer;animation:fadeIn .4s ease-out;font-size:14px;letter-spacing:0.05em;';
      
      btn.onclick = () => {
        btn.disabled = true;
        btn.textContent = 'ОБНОВЛЕНИЕ...';
        // Сохраняем состояние плеера перед релоадом
        if (W.PlayerState?.save) W.PlayerState.save({ forReload: true });
        
        // Команда SW пропустить ожидание -> вызовет controllerchange -> reload
        if (this.reg?.waiting) {
          this.reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        } else {
          W.location.reload();
        }
      };
      
      document.body.appendChild(btn);
    }

    // API для Offline Modal (получение размера кэша)
    getCacheSize() {
      if (!this.reg?.active) return Promise.resolve(0);
      return new Promise(resolve => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => resolve(e.data?.size || 0);
        // Timeout 1s чтобы интерфейс не завис
        setTimeout(() => resolve(0), 1000);
        this.reg.active.postMessage({ type: 'GET_CACHE_SIZE' }, [ch.port2]);
      });
    }
  }

  W.ServiceWorkerManager = new SWManager();

  // Init logic
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => W.ServiceWorkerManager.init());
  } else {
    W.ServiceWorkerManager.init();
  }

})(window, navigator);
