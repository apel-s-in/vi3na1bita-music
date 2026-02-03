//=================================================
// FILE: /scripts/utils/sw-manager.js
/**
 * scripts/utils/sw-manager.js
 * Optimized Service Worker Manager v2.0
 * Очищен от устаревшей логики "Скачать альбом" и дублирования кэша.
 * Только жизненный цикл SW: установка, детекция обновлений, reload.
 */
(function (W, nav) {
  'use strict';

  class SWManager {
    constructor() {
      this.reg = null;
      this.ver = null;
    }

    async init() {
      if (!('serviceWorker' in nav)) return false;

      try {
        this.reg = await nav.serviceWorker.register('./service-worker.js', { scope: './' });
        
        // Auto-update check
        setInterval(() => this.reg?.update(), 3600000); // 1h
        this.reg.addEventListener('updatefound', () => this._trackInstall(this.reg.installing));
        
        // Controller change -> Reload (Atomic update)
        nav.serviceWorker.addEventListener('controllerchange', () => W.location.reload());

        return true;
      } catch (e) {
        console.error('SW Init:', e);
        return false;
      }
    }

    _trackInstall(worker) {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && nav.serviceWorker.controller) {
          this._notifyUpdate();
        }
      });
    }

    handleVersionMessage({ swVer, appVer } = {}) {
      const s = String(swVer || '').trim();
      const a = String(appVer || '').trim();
      if (s && s !== a) {
        this.ver = s;
        this._notifyUpdate();
      }
    }

    _notifyUpdate() {
      const msg = this.ver ? `Доступна версия ${this.ver}` : 'Доступно обновление';
      W.NotificationSystem?.info(msg, 8000);
      this._showBtn();
    }

    _showBtn() {
      if (document.getElementById('update-app-btn')) return;
      
      const btn = document.createElement('button');
      btn.id = 'update-app-btn';
      btn.textContent = 'ОБНОВИТЬ';
      // Inline styles for critical update UI stability
      btn.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);padding:10px 20px;background:#4daaff;color:#fff;border:0;border-radius:20px;font-weight:800;z-index:10001;box-shadow:0 4px 15px rgba(0,0,0,.4);cursor:pointer;animation:fadeIn .3s';
      
      btn.onclick = () => this.applyUpdate();
      document.body.appendChild(btn);
    }

    async applyUpdate() {
      if (W.PlayerState?.save) W.PlayerState.save({ forReload: true });
      
      // Skip waiting logic
      const waiting = this.reg?.waiting;
      if (waiting) {
        waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        W.location.reload();
      }
    }

    // API для UI (Offline Modal)
    async getCacheSize() {
      if (!this.reg?.active) return 0;
      return new Promise(r => {
        const ch = new MessageChannel();
        ch.port1.onmessage = e => r(e.data?.size || 0);
        // Timeout fallback
        setTimeout(() => r(0), 1000);
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
