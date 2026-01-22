// scripts/app.js
// Главная точка входа приложения (clean + без дублей)
// ВАЖНО: iOS unlock НЕ тут, а в PlayerCore.
(function () {
  'use strict';

  const w = window;

  class Application {
    constructor() {
      this.initialized = false;
      this.__swMsgBound = false;
    }

    async initialize() {
      if (this.initialized) return;
      this.initialized = true;

      try {
        await this.loadAlbumsIndex();

        // OFFLINE: строгая последовательность
        try {
          const offlineBoot = await import('./app/offline-ui-bootstrap.js');
          offlineBoot?.attachOfflineUI?.();
        } catch (e) {
          console.error('❌ Critical: Offline Bootstrap failed:', e);
        }

        await new Promise(r => setTimeout(r, 50));

        try {
          const [indicatorsMod, overlayMod, pcBoot] = await Promise.all([
            import('./ui/offline-indicators.js'),
            import('./ui/cache-progress-overlay.js'),
            import('./app/playback-cache-bootstrap.js'),
          ]);
          indicatorsMod?.attachOfflineIndicators?.();
          overlayMod?.attachCacheProgressOverlay?.();
          pcBoot?.attachPlaybackCache?.();
        } catch (e) {
          console.warn('⚠️ Offline UI subsystems partial failure:', e);
        }

        // OFFLINE: preload TrackRegistry once
        try {
          const key = 'offline:preloadAllTracksOnce:v1';
          if (localStorage.getItem(key) !== '1') {
            const mod = await import('./ui/offline-modal.js');
            if (mod?.preloadAllAlbumsTrackIndex) {
              await mod.preloadAllAlbumsTrackIndex();
              localStorage.setItem(key, '1');
            }
          }
        } catch (e) {
          console.warn('OFFLINE preloadAllAlbumsTrackIndex failed:', e);
        }

        await this.initializeFavorites();
        await this.initializeGallery();
        await this.initializeAlbums();
        await this.initializePlayerUI();

        this.initializeModules();

        if (w.PlayerState?.apply) await w.PlayerState.apply();

        this.setupHotkeys();
        this.setupPWAInstall();
        this.setupServiceWorkerMessaging();
      } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        w.NotificationSystem?.error?.('Ошибка инициализации приложения');
      }
    }

    async loadAlbumsIndex() {
      if (Array.isArray(w.albumsIndex) && w.albumsIndex.length) return;

      try {
        if (w.Utils?.onceEvent) await w.Utils.onceEvent(window, 'albumsIndex:ready', { timeoutMs: 8000 });
        else await new Promise(r => setTimeout(r, 200));
      } catch {}

      w.albumsIndex = Array.isArray(w.albumsIndex) ? w.albumsIndex : [];
    }

    async _waitForReady(checkFn, maxMs = 2000) {
      const waitFor = w.Utils?.waitFor;
      if (typeof waitFor === 'function') return waitFor(checkFn, maxMs, 50);

      const started = Date.now();
      while (!checkFn() && (Date.now() - started) < maxMs) { // eslint-disable-next-line no-await-in-loop
        await new Promise(r => setTimeout(r, 50));
      }
      return checkFn();
    }

    async initializeFavorites() {
      // Favorites теперь полностью в PlayerCore + FavoritesUI.
      // Старый FavoritesManager не инициализируем (избавляемся от дублей и возможных DOM событий).
      return;
    }

    async initializeGallery() {
      if (await this._waitForReady(() => !!w.GalleryManager?.initialize)) {
        w.GalleryManager.initialize();
      }
    }

    async initializeAlbums() {
      if (await this._waitForReady(() => !!w.AlbumsManager?.initialize)) {
        w.AlbumsManager.initialize();
      }
    }

    async initializePlayerUI() {
      if (await this._waitForReady(() => !!w.PlayerUI?.initialize)) {
        w.PlayerUI.initialize();
      }
    }

    initializeModules() {
      const maybeInit = (obj) => { try { obj?.initialize?.(); } catch {} };
      maybeInit(w.SleepTimer);
      maybeInit(w.LyricsModal);
      maybeInit(w.SystemInfoManager);
    }

    setupServiceWorkerMessaging() {
      if (!('serviceWorker' in navigator) || this.__swMsgBound) return;
      this.__swMsgBound = true;

      const handle = (event) => {
        const msg = event?.data || {};
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'SW_VERSION') {
          const swVer = String(msg.version || '').trim();
          const appVer = String(w.VERSION || '').trim();
          if (!swVer || (appVer && swVer === appVer)) return;
          try { w.ServiceWorkerManager?.handleVersionMessage?.({ swVer, appVer }); } catch {}
        }
      };

      navigator.serviceWorker.addEventListener('message', handle);
      window.addEventListener('message', handle);
    }

    setupHotkeys() {
      document.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;

        const key = String(e.key || '').toLowerCase();
        const pc = w.playerCore;

        switch (key) {
          case 'k':
          case ' ':
            e.preventDefault();
            w.PlayerUI?.togglePlayPause?.();
            break;

          case 'n': e.preventDefault(); pc?.next?.(); break;
          case 'p': e.preventDefault(); pc?.prev?.(); break;
          case 'x': e.preventDefault(); pc?.stop?.(); break;

          case 'm': e.preventDefault(); document.getElementById('mute-btn')?.click(); break;
          case 'r': e.preventDefault(); document.getElementById('repeat-btn')?.click(); break;
          case 'u': e.preventDefault(); document.getElementById('shuffle-btn')?.click(); break;
          case 'a': e.preventDefault(); document.getElementById('animation-btn')?.click(); break;
          case 'b': e.preventDefault(); document.getElementById('pulse-btn')?.click(); break;
          case 'f': e.preventDefault(); document.getElementById('favorites-btn')?.click(); break;
          case 't': e.preventDefault(); w.SleepTimer?.show?.(); break;
          case 'y': e.preventDefault(); document.getElementById('lyrics-toggle-btn')?.click(); break;

          case 'arrowleft': e.preventDefault(); pc?.seek?.(Math.max(0, (pc.getPosition?.() || 0) - 5)); break;
          case 'arrowright': e.preventDefault(); pc?.seek?.(Math.min(pc.getDuration?.() || 0, (pc.getPosition?.() || 0) + 5)); break;

          case 'arrowup': {
            e.preventDefault();
            const v = pc?.getVolume?.() ?? 100;
            pc?.setVolume?.(Math.min(100, v + 5));
            break;
          }
          case 'arrowdown': {
            e.preventDefault();
            const v = pc?.getVolume?.() ?? 100;
            pc?.setVolume?.(Math.max(0, v - 5));
            break;
          }
        }
      });
    }

    setupPWAInstall() {
      let deferredPrompt = null;

      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;

        const btn = document.getElementById('install-pwa-btn');
        if (!btn) return;

        btn.style.display = 'block';
        btn.onclick = async () => {
          if (!deferredPrompt) return;

          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;

          if (outcome === 'accepted') w.NotificationSystem?.success?.('Приложение установлено!');

          deferredPrompt = null;
          btn.style.display = 'none';
        };
      });

      window.addEventListener('appinstalled', () => {
        w.NotificationSystem?.success?.('Приложение успешно установлено!');
        const btn = document.getElementById('install-pwa-btn');
        if (btn) btn.style.display = 'none';
      });
    }
  }

  w.app = new Application();
})();
