// scripts/app.js
// Главная точка входа приложения

import { APP_CONFIG } from './core/config.js';

(function AppModule() {
  'use strict';

  const w = window;

  class Application {
    constructor() {
      this.initialized = false;
      this.serviceWorkerRegistered = false;
    }

    async initialize() {
      if (this.initialized) return;
      this.initialized = true;

      console.log(`🎵 Initializing app v${w.VERSION}`);

      try {
        // 1. Загрузка индекса альбомов
        await this.loadAlbumsIndex();

        // 2. Инициализация PlayerCore
        await this.initializePlayerCore();

        // 3. Инициализация избранного
        await this.initializeFavorites();

        // 4. Инициализация менеджера альбомов
        await this.initializeAlbums();

        // 5. Инициализация UI плеера
        await this.initializePlayerUI();

        // 6. Регистрация Service Worker
        await this.registerServiceWorker();

        // 7. Инициализация дополнительных модулей
        this.initializeModules();

        // 8. Настройка горячих клавиш
        this.setupHotkeys();

        // 9. Обработка PWA установки
        this.setupPWAInstall();

        console.log('✅ Application initialized successfully');

      } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        w.NotificationSystem?.error('Ошибка инициализации приложения');
      }
    }

    async loadAlbumsIndex() {
      try {
        const response = await fetch('./albums/index.json', { cache: 'no-cache' });
        if (!response.ok) throw new Error('Failed to load albums index');

        const data = await response.json();
        w.albumsIndex = Array.isArray(data.albums) ? data.albums : [];

        console.log(`✅ Loaded ${w.albumsIndex.length} albums`);
      } catch (error) {
        console.error('❌ Failed to load albums index:', error);
        w.albumsIndex = [];
      }
    }

    async initializePlayerCore() {
      return new Promise((resolve) => {
        const check = () => {
          if (w.playerCore && typeof w.playerCore.initialize === 'function') {
            w.playerCore.initialize();
            console.log('✅ PlayerCore initialized');
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    }

    async initializeFavorites() {
      return new Promise((resolve) => {
        const check = () => {
          if (w.FavoritesManager && typeof w.FavoritesManager.initialize === 'function') {
            w.FavoritesManager.initialize();
            console.log('✅ Favorites initialized');
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    }

    async initializeAlbums() {
      return new Promise((resolve) => {
        const check = () => {
          if (w.AlbumsManager && typeof w.AlbumsManager.initialize === 'function') {
            w.AlbumsManager.initialize();
            console.log('✅ Albums initialized');
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    }

    async initializePlayerUI() {
      return new Promise((resolve) => {
        const check = () => {
          if (w.PlayerUI && typeof w.PlayerUI.initialize === 'function') {
            w.PlayerUI.initialize();
            console.log('✅ PlayerUI initialized');
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    }

    initializeModules() {
      // Таймер сна
      if (w.SleepTimer && typeof w.SleepTimer.initialize === 'function') {
        w.SleepTimer.initialize();
      }

      // Модальное окно текста
      if (w.LyricsModal && typeof w.LyricsModal.initialize === 'function') {
        w.LyricsModal.initialize();
      }

      // Системная информация
      if (w.SystemInfo && typeof w.SystemInfo.initialize === 'function') {
        w.SystemInfo.initialize();
      }

      // Менеджер загрузок
      if (w.DownloadManager && typeof w.DownloadManager.initialize === 'function') {
        w.DownloadManager.initialize();
      }

      // Background Audio API
      if (w.BackgroundAudioManager && typeof w.BackgroundAudioManager.initialize === 'function') {
        w.BackgroundAudioManager.initialize();
      }
    }

    setupHotkeys() {
      document.addEventListener('keydown', (e) => {
        // Игнорируем если фокус в input/textarea
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

        const key = e.key.toLowerCase();

        switch (key) {
          case 'k':
          case ' ':
            e.preventDefault();
            w.PlayerUI?.togglePlayPause?.();
            break;

          case 'n':
            e.preventDefault();
            w.playerCore?.next();
            break;

          case 'p':
            e.preventDefault();
            w.playerCore?.prev();
            break;

          case 'x':
            e.preventDefault();
            w.playerCore?.stop();
            break;

          case 'm':
            e.preventDefault();
            document.getElementById('mute-btn')?.click();
            break;

          case 'r':
            e.preventDefault();
            document.getElementById('repeat-btn')?.click();
            break;

          case 'u':
            e.preventDefault();
            document.getElementById('shuffle-btn')?.click();
            break;

          case 'a':
            e.preventDefault();
            document.getElementById('animation-btn')?.click();
            break;

          case 'b':
            e.preventDefault();
            document.getElementById('bit-btn')?.click();
            break;

          case 'f':
            e.preventDefault();
            document.getElementById('favorites-btn')?.click();
            break;

          case 't':
            e.preventDefault();
            w.SleepTimer?.show?.();
            break;

          case 'y':
            e.preventDefault();
            document.getElementById('lyrics-toggle-btn')?.click();
            break;

          case 'arrowleft':
            e.preventDefault();
            w.playerCore?.seek(Math.max(0, w.playerCore.getPosition() - 5));
            break;

          case 'arrowright':
            e.preventDefault();
            w.playerCore?.seek(Math.min(w.playerCore.getDuration(), w.playerCore.getPosition() + 5));
            break;

          case 'arrowup':
            e.preventDefault();
            const currentVol = w.playerCore?.getVolume() || 100;
            w.playerCore?.setVolume(Math.min(100, currentVol + 5));
            break;

          case 'arrowdown':
            e.preventDefault();
            const vol = w.playerCore?.getVolume() || 100;
            w.playerCore?.setVolume(Math.max(0, vol - 5));
            break;
        }
      });

      console.log('✅ Hotkeys enabled');
    }

    setupPWAInstall() {
      let deferredPrompt = null;

      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;

        const btn = document.getElementById('install-pwa-btn');
        if (btn) {
          btn.style.display = 'block';
          btn.onclick = async () => {
            if (!deferredPrompt) return;

            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;

            if (outcome === 'accepted') {
              w.NotificationSystem?.success('Приложение установлено!');
            }

            deferredPrompt = null;
            btn.style.display = 'none';
          };
        }
      });

      window.addEventListener('appinstalled', () => {
        w.NotificationSystem?.success('Приложение успешно установлено!');
        const btn = document.getElementById('install-pwa-btn');
        if (btn) btn.style.display = 'none';
      });
    }

    async registerServiceWorker() {
      if (!('serviceWorker' in navigator)) {
        console.warn('⚠️ Service Worker not supported');
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register('./sw.js', {
          scope: './'
        });

        console.log('✅ Service Worker registered:', registration.scope);
        this.serviceWorkerRegistered = true;

        // Проверка обновлений каждые 5 минут
        setInterval(() => {
          registration.update();
        }, 5 * 60 * 1000);

      } catch (error) {
        console.error('❌ Service Worker registration failed:', error);
      }
    }
  }

  // Создание глобального экземпляра
  w.app = new Application();

  // Автоматический запуск если промокод уже введён
  if (localStorage.getItem('promocode') === 'VITRINA2025') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => w.app.initialize());
    } else {
      w.app.initialize();
    }
  }

})();
