// scripts/ui/sysinfo.js
// Модальное окно с информацией о системе и приложении

(function() {
  'use strict';

  // ✅ единый форматтер (без дублей)
  // sysinfo.js не ESM, поэтому импорт не используем
  const formatBytes = (n) => {
    const fn = window.Utils?.formatBytes;
    if (typeof fn === 'function') return fn(n);
    // fallback (минимальный; если utils.js не успел загрузиться)
    const b = Number(n) || 0;
    if (b < 1024) return `${Math.floor(b)} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  class SystemInfoManager {
    constructor() {
      this.modal = null;
      this.init();
    }

    init() {
      // Кнопка открытия
      const button = document.getElementById('sysinfo-btn');
      if (button) {
        button.style.display = '';
        button.addEventListener('click', () => this.show());
      }

      // Горячая клавиша Ctrl+I
      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
          e.preventDefault();
          this.show();
        }
      });
    }

    show() {
      if (!window.Modals?.open) return;

      if (this.modal) {
        try { this.modal.remove(); } catch {}
        this.modal = null;
      }

      const info = this.collectSystemInfo();
      const esc = window.Utils?.escapeHtml
        ? (s) => window.Utils.escapeHtml(String(s || ''))
        : (s) => String(s || '');

      this.modal = window.Modals.open({
        title: 'О системе',
        maxWidth: 500,
        bodyHtml: `
          <div style="font-size: 14px; line-height: 1.6;">
            <h3 style="color: #8ab8fd; margin-top: 0;">Приложение</h3>
            <div><strong>Версия:</strong> ${esc(info.app.version)}</div>
            <div><strong>Дата сборки:</strong> ${esc(info.app.buildDate)}</div>
            <div><strong>PWA:</strong> ${info.app.isPWA ? '✅ Да' : '❌ Нет'}</div>
            <div id="sw-version-placeholder"><strong>SW версия:</strong> ...</div>

            <h3 style="color: #8ab8fd; margin-top: 20px;">Браузер</h3>
            <div><strong>User Agent:</strong> ${esc(info.browser.userAgent)}</div>
            <div><strong>Язык:</strong> ${esc(info.browser.language)}</div>
            <div><strong>Online:</strong> ${info.browser.online ? '✅' : '❌'}</div>

            <h3 style="color: #8ab8fd; margin-top: 20px;">Устройство</h3>
            <div><strong>Разрешение:</strong> ${esc(info.device.resolution)}</div>
            <div><strong>DPR:</strong> ${esc(info.device.dpr)}</div>
            <div><strong>Touch:</strong> ${info.device.touch ? '✅' : '❌'}</div>
            <div><strong>Platform:</strong> ${esc(info.device.platform)}</div>

            <h3 style="color: #8ab8fd; margin-top: 20px;">Плеер</h3>
            <div><strong>Ядро:</strong> ${esc(info.player.core)}</div>
            <div><strong>Версия Howler:</strong> ${esc(info.player.howlerVersion)}</div>
            <div><strong>Поддержка Web Audio:</strong> ${info.player.webAudio ? '✅' : '❌'}</div>
            <div><strong>Поддержка HTML5:</strong> ${info.player.html5 ? '✅' : '❌'}</div>

            <h3 style="color: #8ab8fd; margin-top: 20px;">Хранилище</h3>
            <div><strong>LocalStorage:</strong> ${info.storage.localStorage ? '✅' : '❌'}</div>
            <div><strong>IndexedDB:</strong> ${info.storage.indexedDB ? '✅' : '❌'}</div>
            <div><strong>Cache API:</strong> ${info.storage.cacheAPI ? '✅' : '❌'}</div>
            <div><strong>Service Worker:</strong> ${info.storage.serviceWorker ? '✅' : '❌'}</div>

            <h3 style="color: #8ab8fd; margin-top: 20px;">Память</h3>
            <div><strong>Используется:</strong> ${esc(info.memory.used)}</div>
            <div><strong>Лимит:</strong> ${esc(info.memory.limit)}</div>

            <h3 style="color: #8ab8fd; margin-top: 20px;">Производительность</h3>
            <div><strong>Время загрузки:</strong> ${esc(info.performance.loadTime)}</div>
            <div><strong>DOM загружен:</strong> ${esc(info.performance.domContentLoaded)}</div>

            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #394866; text-align: center; font-size: 12px; color: #999;">
              Витрина Разбита © 2025
            </div>
          </div>
        `,
        onClose: () => { this.modal = null; }
      });

      // Асинхронная загрузка версии SW
      this.getSWVersion().then((ver) => {
        const placeholder = this.modal?.querySelector?.('#sw-version-placeholder');
        if (placeholder) {
          placeholder.innerHTML = `<strong>SW версия:</strong> ${esc(ver)}`;
        }
      });
    }

    collectSystemInfo() {
      const APP_CONFIG = window.APP_CONFIG || {};
      
      return {
        app: {
          version: APP_CONFIG.APP_VERSION || window.VERSION || 'unknown',
          buildDate: APP_CONFIG.BUILD_DATE || window.BUILD_DATE || 'unknown',
          isPWA: window.matchMedia('(display-mode: standalone)').matches
        },
        browser: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          online: navigator.onLine
        },
        device: {
          resolution: `${window.screen.width}×${window.screen.height}`,
          dpr: window.devicePixelRatio || 1,
          touch: 'ontouchstart' in window,
          platform: navigator.platform
        },
        player: {
          core: window.playerCore ? 'PlayerCore (Howler.js)' : 'Не загружен',
          howlerVersion: window.Howler ? Howler.version : 'N/A',
          webAudio: window.Howler ? Howler.usingWebAudio : false,
          html5: window.Howler ? !Howler.usingWebAudio : false
        },
        storage: {
          localStorage: this.checkLocalStorage(),
          indexedDB: 'indexedDB' in window,
          cacheAPI: 'caches' in window,
          serviceWorker: 'serviceWorker' in navigator
        },
        memory: this.getMemoryInfo(),
        performance: this.getPerformanceInfo()
      };
    }

    checkLocalStorage() {
      try {
        localStorage.setItem('test', '1');
        localStorage.removeItem('test');
        return true;
      } catch (e) {
        return false;
      }
    }

    getMemoryInfo() {
      if (performance.memory) {
        return {
          used: formatBytes(performance.memory.usedJSHeapSize),
          limit: formatBytes(performance.memory.jsHeapSizeLimit)
        };
      }
      return {
        used: 'N/A',
        limit: 'N/A'
      };
    }

    getPerformanceInfo() {
      const perf = performance.timing;
      const loadTime = perf.loadEventEnd - perf.navigationStart;
      const domTime = perf.domContentLoadedEventEnd - perf.navigationStart;

      return {
        loadTime: loadTime > 0 ? `${loadTime}ms` : 'N/A',
        domContentLoaded: domTime > 0 ? `${domTime}ms` : 'N/A'
      };
    }
    async getSWVersion() {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration || !registration.active) return 'N/A';

        return new Promise((resolve) => {
          const messageChannel = new MessageChannel();
          
          messageChannel.port1.onmessage = (event) => {
            resolve(event.data.version || 'N/A');
          };

          registration.active.postMessage(
            { type: 'GET_SW_VERSION' },
            [messageChannel.port2]
          );

          setTimeout(() => resolve('N/A'), 1000);
        });
      } catch {
        return 'N/A';
      }
    }

    hide() {
      if (this.modal) {
        this.modal.classList.remove('active');
        setTimeout(() => {
          if (this.modal && this.modal.parentNode) {
            this.modal.parentNode.removeChild(this.modal);
          }
          this.modal = null;
        }, 300);
      }
    }
  }

  // Инициализация при загрузке DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.SystemInfoManager = new SystemInfoManager();
    });
  } else {
    window.SystemInfoManager = new SystemInfoManager();
  }

  console.log('✅ System info manager initialized');
})();
