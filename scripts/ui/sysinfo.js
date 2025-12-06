// scripts/ui/sysinfo.js
// Модальное окно с информацией о системе и приложении

(function() {
  'use strict';

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
      if (this.modal) {
        this.modal.classList.add('active');
        return;
      }

      this.createModal();
    }

    createModal() {
      const modalBg = document.createElement('div');
      modalBg.className = 'modal-bg sysinfo-modal';
      
      const info = this.collectSystemInfo();

      modalBg.innerHTML = `
        <div class="modal-feedback" style="max-width: 500px; max-height: 80vh; overflow-y: auto;">
          <button class="bigclose" aria-label="Закрыть">
            <svg width="31" height="31" viewBox="0 0 31 31">
              <line x1="8" y1="8" x2="23" y2="23" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
              <line x1="23" y1="8" x2="8" y2="23" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
            </svg>
          </button>
          
          <h2 style="margin-top: 0; color: #4daaff;">О системе</h2>
          
          <div style="font-size: 14px; line-height: 1.6;">
            <h3 style="color: #8ab8fd; margin-top: 20px;">Приложение</h3>
            <div><strong>Версия:</strong> ${info.app.version}</div>
            <div><strong>Дата сборки:</strong> ${info.app.buildDate}</div>
            <div><strong>PWA:</strong> ${info.app.isPWA ? '✅ Да' : '❌ Нет'}</div>
            
            <h3 style="color: #8ab8fd; margin-top: 20px;">Браузер</h3>
            <div><strong>User Agent:</strong> ${info.browser.userAgent}</div>
            <div><strong>Язык:</strong> ${info.browser.language}</div>
            <div><strong>Online:</strong> ${info.browser.online ? '✅' : '❌'}</div>
            
            <h3 style="color: #8ab8fd; margin-top: 20px;">Устройство</h3>
            <div><strong>Разрешение:</strong> ${info.device.resolution}</div>
            <div><strong>DPR:</strong> ${info.device.dpr}</div>
            <div><strong>Touch:</strong> ${info.device.touch ? '✅' : '❌'}</div>
            <div><strong>Platform:</strong> ${info.device.platform}</div>
            
            <h3 style="color: #8ab8fd; margin-top: 20px;">Плеер</h3>
            <div><strong>Ядро:</strong> ${info.player.core}</div>
            <div><strong>Версия Howler:</strong> ${info.player.howlerVersion}</div>
            <div><strong>Поддержка Web Audio:</strong> ${info.player.webAudio ? '✅' : '❌'}</div>
            <div><strong>Поддержка HTML5:</strong> ${info.player.html5 ? '✅' : '❌'}</div>
            
            <h3 style="color: #8ab8fd; margin-top: 20px;">Хранилище</h3>
            <div><strong>LocalStorage:</strong> ${info.storage.localStorage ? '✅' : '❌'}</div>
            <div><strong>IndexedDB:</strong> ${info.storage.indexedDB ? '✅' : '❌'}</div>
            <div><strong>Cache API:</strong> ${info.storage.cacheAPI ? '✅' : '❌'}</div>
            <div><strong>Service Worker:</strong> ${info.storage.serviceWorker ? '✅' : '❌'}</div>
            
            <h3 style="color: #8ab8fd; margin-top: 20px;">Память</h3>
            <div><strong>Используется:</strong> ${info.memory.used}</div>
            <div><strong>Лимит:</strong> ${info.memory.limit}</div>
            
            <h3 style="color: #8ab8fd; margin-top: 20px;">Производительность</h3>
            <div><strong>Время загрузки:</strong> ${info.performance.loadTime}</div>
            <div><strong>DOM загружен:</strong> ${info.performance.domContentLoaded}</div>
          </div>
          
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #394866; text-align: center; font-size: 12px; color: #999;">
            Витрина Разбита © 2025
          </div>
        </div>
      `;

      // Закрытие
      const closeBtn = modalBg.querySelector('.bigclose');
      closeBtn?.addEventListener('click', () => this.hide());

      modalBg.addEventListener('click', (e) => {
        if (e.target === modalBg) {
          this.hide();
        }
      });

      document.getElementById('modals-container')?.appendChild(modalBg);
      this.modal = modalBg;

      requestAnimationFrame(() => {
        modalBg.classList.add('active');
      });
    }

    collectSystemInfo() {
      const APP_CONFIG = window.APP_CONFIG || {};
      
      return {
        app: {
          version: APP_CONFIG.VERSION || 'unknown',
          buildDate: APP_CONFIG.BUILD_DATE || 'unknown',
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
          used: this.formatBytes(performance.memory.usedJSHeapSize),
          limit: this.formatBytes(performance.memory.jsHeapSizeLimit)
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

    formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
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
