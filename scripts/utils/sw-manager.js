(function (W, N, D) {
  'use strict';
  let refreshing = false;

  class SWManager {
    _clearUpdateUi() {
      D.getElementById('update-app-panel')?.remove();
      D.body.classList.remove('sw-update-visible');
    }

    async init() {
      if (!('serviceWorker' in N)) return;
      this._clearUpdateUi();

      // Не reload по controllerchange сам по себе. Reload только если пользователь явно нажал «ОБНОВИТЬ».
      N.serviceWorker.addEventListener('controllerchange', () => {
        this._clearUpdateUi();
        try { W.playerCore?._persistPlaybackState?.(true); } catch {}
        if (refreshing) {
          setTimeout(() => W.location.reload(), 80);
          return;
        }
        try { W.NotificationSystem?.info?.('Обновление применится при следующем запуске.', 3500); } catch {}
      });

      try {
        this.reg = await N.serviceWorker.register('./service-worker.js', { scope: './' });
        if (!this.reg.waiting) this._clearUpdateUi(); else this._notifyUpdate();
        this.reg.addEventListener('updatefound', () => {
          const nw = this.reg.installing;
          nw?.addEventListener('statechange', () => {
            if (nw.state === 'installed' && N.serviceWorker.controller) this._notifyUpdate();
          });
        });
      } catch (e) {
        console.warn('SW Register Failed:', e);
      }
    }

    handleVersionMessage(d) {
      if (d?.swVer && d.swVer !== (W.VERSION || '')) this._notifyUpdate();
    }

    _notifyUpdate() {
      if (D.getElementById('update-app-panel')) return;
      D.body.classList.add('sw-update-visible');
      W.NotificationSystem?.info?.('Доступно обновление приложения.', 3500);

      const panel = Object.assign(D.createElement('div'), {
        id: 'update-app-panel',
        className: 'sw-update-panel',
        innerHTML: `<button type="button" class="sw-update-btn sw-update-btn--apply">ОБНОВИТЬ</button><button type="button" class="sw-update-btn sw-update-btn--later">ПОЗЖЕ</button>`
      });

      panel.querySelector('.sw-update-btn--apply')?.addEventListener('click', () => this.applyUpdate());
      panel.querySelector('.sw-update-btn--later')?.addEventListener('click', () => {
        this._clearUpdateUi();
        W.NotificationSystem?.info?.('Обновится после перезапуска страницы.', 3500);
      });

      D.body.appendChild(panel);
    }

    applyUpdate() {
      refreshing = true;
      try { W.playerCore?._persistPlaybackState?.(true); } catch {}
      const waiting = this.reg?.waiting;
      if (waiting) {
        waiting.postMessage?.({ type: 'SKIP_WAITING' });
        setTimeout(() => { if (refreshing) W.location.reload(); }, 1800);
      } else {
        W.location.reload();
      }
    }

    getCacheSize() {
      if (!this.reg?.active) return Promise.resolve(0);
      return new Promise(r => {
        const ch = new MessageChannel();
        ch.port1.onmessage = e => r(e.data?.size || 0);
        setTimeout(() => r(0), 1000);
        this.reg.active.postMessage({ type: 'GET_CACHE_SIZE' }, [ch.port2]);
      });
    }
  }

  W.ServiceWorkerManager = new SWManager();
  D.readyState === 'loading' ? D.addEventListener('DOMContentLoaded', () => W.ServiceWorkerManager.init()) : W.ServiceWorkerManager.init();
})(window, navigator, document);
