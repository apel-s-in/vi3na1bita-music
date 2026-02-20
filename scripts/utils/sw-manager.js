/**
 * scripts/utils/sw-manager.js
 * Optimized Service Worker Manager v3.0
 * FIX: Removed dead PlayerState code, modernized UI update button styling natively.
 */
(function (W, nav) {
  'use strict';

  let refreshing = false;

  class SWManager {
    async init() {
      if (!('serviceWorker' in nav)) return;

      nav.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        W.location.reload();
      });

      try {
        this.reg = await nav.serviceWorker.register('./service-worker.js', { scope: './' });

        if (this.reg.waiting) this._notifyUpdate();

        this.reg.addEventListener('updatefound', () => {
          const newW = this.reg.installing;
          if (newW) {
            newW.addEventListener('statechange', () => {
              if (newW.state === 'installed' && nav.serviceWorker.controller) {
                this._notifyUpdate();
              }
            });
          }
        });
      } catch (e) {
        console.warn('SW Register Failed:', e);
      }
    }

    handleVersionMessage(d) {
      if (d?.swVer && d.swVer !== (W.VERSION || '')) this._notifyUpdate();
    }

    _notifyUpdate() {
      if (document.getElementById('update-app-btn')) return;

      W.NotificationSystem?.info('Доступно обновление приложения', 5000);

      const btn = document.createElement('button');
      btn.id = 'update-app-btn';
      // Re-using Offline Modal button styles to remove huge inline CSS payload
      btn.className = 'om-btn om-btn--primary'; 
      btn.textContent = 'ОБНОВИТЬ';
      btn.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:10001;box-shadow:0 6px 24px rgba(0,0,0,.6);animation:fadeIn .3s ease-out;padding:12px 28px;border-radius:30px;';

      btn.onclick = () => {
        btn.disabled = true;
        btn.textContent = 'ОБНОВЛЕНИЕ...';
        if (this.reg?.waiting) {
          this.reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        } else {
          W.location.reload();
        }
      };

      document.body.appendChild(btn);
    }

    getCacheSize() {
      if (!this.reg?.active) return Promise.resolve(0);
      return new Promise(resolve => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => resolve(e.data?.size || 0);
        setTimeout(() => resolve(0), 1000);
        this.reg.active.postMessage({ type: 'GET_CACHE_SIZE' }, [ch.port2]);
      });
    }
  }

  W.ServiceWorkerManager = new SWManager();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => W.ServiceWorkerManager.init());
  } else {
    W.ServiceWorkerManager.init();
  }

})(window, navigator);
