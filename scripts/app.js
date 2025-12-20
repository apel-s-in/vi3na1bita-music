// scripts/app.js — Главный файл инициализации
(function() {
  'use strict';

  const VERSION = window.APP_CONFIG?.APP_VERSION || '8.1.0';

  // ==================== ЛЕНИВАЯ ЗАГРУЗКА МОДУЛЕЙ ====================
  const lazyModules = {
    modals: { loaded: false, path: './scripts/ui/modals.js' },
    sleep: { loaded: false, path: './scripts/ui/sleep.js' }
  };

  async function loadModule(name) {
    const mod = lazyModules[name];
    if (!mod || mod.loaded) return;
    
    try {
      const script = document.createElement('script');
      script.src = mod.path;
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      mod.loaded = true;
      console.log(`✅ Lazy loaded: ${name}`);
    } catch (e) {
      console.error(`❌ Failed to load: ${name}`, e);
    }
  }

  // Прокси для ленивых модулей
  window.LyricsModal = {
    show: async () => {
      await loadModule('modals');
      window.Modals?.showLyrics?.();
    }
  };

  window.SleepTimer = window.SleepTimer || {
    show: async () => {
      await loadModule('sleep');
      window.SleepTimer?.show?.();
    }
  };

  // ==================== SERVICE WORKER ====================
  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    try {
      const reg = await navigator.serviceWorker.register('./service-worker.js');
      console.log('✅ SW registered');

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateNotification();
          }
        });
      });
    } catch (e) {
      console.error('❌ SW registration failed:', e);
    }
  }

  function showUpdateNotification() {
    const notify = window.NotificationSystem;
    if (notify) {
      notify.info('Доступно обновление! Обновите страницу.', 10000);
    }
  }

  // ==================== PWA INSTALL ====================
  let deferredPrompt = null;

  function initPWAInstall() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredPrompt = e;
      showInstallButton();
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      hideInstallButton();
      window.NotificationSystem?.success?.('Приложение установлено!');
    });
  }

  function showInstallButton() {
    const btn = document.getElementById('install-btn');
    if (btn) btn.style.display = '';
    btn?.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('Install prompt outcome:', outcome);
      deferredPrompt = null;
    });
  }

  function hideInstallButton() {
    const btn = document.getElementById('install-btn');
    if (btn) btn.style.display = 'none';
  }

  // ==================== ONLINE/OFFLINE ====================
  function initNetworkStatus() {
    const updateStatus = () => {
      document.body.classList.toggle('offline', !navigator.onLine);
      if (!navigator.onLine) {
        window.NotificationSystem?.warning?.('Нет соединения');
      }
    };

    window.addEventListener('online', () => {
      document.body.classList.remove('offline');
      window.NotificationSystem?.success?.('Соединение восстановлено');
    });

    window.addEventListener('offline', updateStatus);
    updateStatus();
  }

  // ==================== ИНИЦИАЛИЗАЦИЯ ====================
  async function init() {
    console.log(`🎵 Витрина Разбита v${VERSION}`);

    // Инициализация менеджеров
    window.FavoritesManager?.initialize?.();
    window.GalleryManager?.initialize?.();
    window.AlbumsManager?.initialize?.();

    // Service Worker
    await registerServiceWorker();

    // PWA
    initPWAInstall();
    initNetworkStatus();

    // Прелоад модалок при взаимодействии
    document.addEventListener('click', () => {
      loadModule('modals');
      loadModule('sleep');
    }, { once: true });

    // Скрыть сплэш
    setTimeout(() => {
      const splash = document.getElementById('splash');
      if (splash) {
        splash.style.opacity = '0';
        setTimeout(() => splash.remove(), 300);
      }
    }, 500);

    console.log('✅ App initialized');
  }

  // ==================== ЗАПУСК ====================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Глобальный экспорт
  window.App = {
    version: VERSION,
    loadModule
  };
})();
