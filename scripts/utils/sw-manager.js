(function (W, N) {
  'use strict';
  let refreshing = false;
  class SWManager {
    _clearUpdateUi() { document.getElementById('update-app-btn')?.remove(); }
    async init() {
      if (!('serviceWorker' in N)) return;
      this._clearUpdateUi();
      // ВАЖНО: никакого location.reload() по controllerchange.
      // Playback-сессия не должна прерываться из-за смены SW. Обновление применяется только при ручном повторном заходе.
      N.serviceWorker.addEventListener('controllerchange', () => {
        this._clearUpdateUi();
        try { W.playerCore?._persistPlaybackState?.(true); } catch {}
        try { W.NotificationSystem?.info?.('Обновление активно. Перезапустите приложение, когда будет удобно.', 4000); } catch {}
      });
      try {
        this.reg = await N.serviceWorker.register('./service-worker.js', { scope: './' });
        if (!this.reg.waiting) this._clearUpdateUi(); else this._notifyUpdate();
        this.reg.addEventListener('updatefound', () => { const nW = this.reg.installing; nW?.addEventListener('statechange', () => { if (nW.state === 'installed' && N.serviceWorker.controller) this._notifyUpdate(); }); });
      } catch (e) { console.warn('SW Register Failed:', e); }
    }
    handleVersionMessage(d) { if (d?.swVer && d.swVer !== (W.VERSION || '')) this._notifyUpdate(); }
    _notifyUpdate() {
      if (document.getElementById('update-app-btn')) return;
      // Не форсируем reload. Если ничего не играет — применим обновление при закрытии/повторном старте.
      const isPlaying = !!W.playerCore?.isPlaying?.();
      if (!isPlaying) W.NotificationSystem?.info('Доступно обновление приложения. Закройте и откройте вкладку, чтобы применить.', 6000);
      else W.NotificationSystem?.info('Обновление готово. Применится после остановки воспроизведения.', 6000);
      const b = Object.assign(document.createElement('button'), { id: 'update-app-btn', className: 'om-btn om-btn--primary', textContent: 'ПРИМЕНИТЬ ПОЗЖЕ', style: 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:10001;box-shadow:0 6px 24px rgba(0,0,0,.6);animation:fadeIn .3s ease-out;padding:12px 28px;border-radius:30px;' });
      b.onclick = () => {
        // По явному нажатию пользователя: просто дать SW активироваться тихо, без reload.
        b.disabled = true;
        b.textContent = 'ОК, ПОЗЖЕ';
        try { this.reg?.waiting?.postMessage?.({ type: 'SKIP_WAITING' }); } catch {}
        setTimeout(() => this._clearUpdateUi(), 1200);
      };
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
