(function (W, N) {
  'use strict';
  let refreshing = false;
  class SWManager {
    _clearUpdateUi() { document.getElementById('update-app-btn')?.remove(); }
    async init() {
      if (!('serviceWorker' in N)) return;
      this._clearUpdateUi();
      N.serviceWorker.addEventListener('controllerchange', () => { this._clearUpdateUi(); if (!refreshing) { refreshing = true; W.location.reload(); } });
      try {
        this.reg = await N.serviceWorker.register('./service-worker.js', { scope: './' });
        if (!this.reg.waiting) this._clearUpdateUi(); else this._notifyUpdate();
        this.reg.addEventListener('updatefound', () => { const newW = this.reg.installing; newW?.addEventListener('statechange', () => { if (newW.state === 'installed' && N.serviceWorker.controller) this._notifyUpdate(); }); });
      } catch (e) { console.warn('SW Register Failed:', e); }
    }
    handleVersionMessage(d) { if (d?.swVer && d.swVer !== (W.VERSION || '')) this._notifyUpdate(); }
    _notifyUpdate() {
      if (document.getElementById('update-app-btn')) return; W.NotificationSystem?.info('Доступно обновление приложения', 5000);
      const b = Object.assign(document.createElement('button'), { id: 'update-app-btn', className: 'om-btn om-btn--primary', textContent: 'ОБНОВИТЬ', style: 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:10001;box-shadow:0 6px 24px rgba(0,0,0,.6);animation:fadeIn .3s ease-out;padding:12px 28px;border-radius:30px;' });
      b.onclick = () => { b.disabled = true; b.textContent = 'ОБНОВЛЕНИЕ...'; if (this.reg?.waiting) this.reg.waiting.postMessage({ type: 'SKIP_WAITING' }); else { this._clearUpdateUi(); W.location.reload(); } };
      document.body.appendChild(b);
    }
    getCacheSize() {
      if (!this.reg?.active) return Promise.resolve(0);
      return new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = e => r(e.data?.size || 0); setTimeout(() => r(0), 1000); this.reg.active.postMessage({ type: 'GET_CACHE_SIZE' }, [ch.port2]); });
    }
  }
  W.ServiceWorkerManager = new SWManager();
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', () => W.ServiceWorkerManager.init()) : W.ServiceWorkerManager.init();
})(window, navigator);
