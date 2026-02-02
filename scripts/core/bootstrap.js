// scripts/core/bootstrap.js
(function () {
  'use strict';

  class AppBootstrap {
    async init() {
      if (!this._compat()) return;

      if (!(await this._waitForHowler())) return;

      this._markEnv();
      this._preventWeirdIOSZoom();
      this._errors();
      await this._loadAlbumsIndex();
    }

    _compat() {
      const missing = [];
      if (!this._hasLS()) missing.push('LocalStorage');
      if (typeof fetch === 'undefined') missing.push('Fetch API');
      if (typeof Promise === 'undefined') missing.push('Promises');
      if (!document.addEventListener) missing.push('Event Listeners');
      if (missing.length) return this._compatFail(missing), false;
      return true;
    }

    _hasLS() {
      try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; } catch { return false; }
    }

    _compatFail(missing) {
      // сохраняем поведение (оверлей), но без огромного HTML-шаблона
      document.body.innerHTML =
        '<div style="position:fixed;inset:0;background:#181818;color:#fff;display:flex;align-items:center;justify-content:center;font-family:sans-serif;padding:20px;text-align:center;z-index:99999">' +
          '<div>' +
            '<h1 style="color:#E80100;margin:0 0 16px">Браузер не поддерживается</h1>' +
            '<p style="margin:0 0 12px">Для работы требуются:</p>' +
            '<div style="color:#bbb">' + missing.map(s => '• ' + s).join('<br>') + '</div>' +
          '</div>' +
        '</div>';
    }

    async _waitForHowler() {
      const ok = await (window.Utils?.waitFor
        ? window.Utils.waitFor(() => typeof Howl !== 'undefined', 5000, 100)
        : this._poll(() => typeof Howl !== 'undefined', 5000, 100));

      if (ok) return true;

      window.NotificationSystem?.error?.('Не удалось загрузить аудио-библиотеку. Перезагрузите страницу.');
      return false;
    }

    async _poll(fn, maxMs, step) {
      let t = 0;
      while (!fn() && t < maxMs) { // eslint-disable-next-line no-await-in-loop
        await new Promise(r => setTimeout(r, step));
        t += step;
      }
      return !!fn();
    }

    _markEnv() {
      try { if (window.Utils?.isIOS?.()) document.body.classList.add('ios'); } catch {}
      try { if (window.Utils?.isStandalone?.()) document.body.classList.add('standalone'); } catch {}
    }

    _preventWeirdIOSZoom() {
      // оставляем твою логику, но компактнее
      document.body.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length > 1) e.preventDefault();
      }, { passive: false });

      let last = 0;
      document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - last <= 300 && now - last > 0) {
          const tag = e.target?.tagName;
          const interactive = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tag) ||
            e.target?.closest?.('.track, .album-icon, .like-star, .player-control-btn, .offline-btn');
          if (!interactive) e.preventDefault();
        }
        last = now;
      }, { passive: false });

      document.addEventListener('contextmenu', (e) => {
        if (e.target?.tagName === 'IMG' || e.target?.closest?.('#cover-slot')) e.preventDefault();
      });
    }

    _errors() {
      window.addEventListener('error', (e) => { console.error('Global error:', e.error || e.message); });
      window.addEventListener('unhandledrejection', (e) => { console.error('Unhandled rejection:', e.reason); });
    }

    async _loadAlbumsIndex() {
      try {
        const r = await fetch('./albums.json', { cache: 'no-cache', headers: { Accept: 'application/json' } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        window.albumsIndex = Array.isArray(data?.albums) ? data.albums : [];
      } catch (e) {
        console.error('Failed to load albums.json:', e);
        window.albumsIndex = [];
        window.NotificationSystem?.error?.('Не удалось загрузить список альбомов');
      } finally {
        try { window.dispatchEvent(new Event('albumsIndex:ready')); } catch {}
      }
    }
  }

  const run = () => new AppBootstrap().init();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
