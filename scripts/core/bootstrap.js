// scripts/core/bootstrap.js
// Начальная загрузка и проверка совместимости

(function() {
  'use strict';

  class AppBootstrap {
    constructor() {
      this.requiredFeatures = [
        'localStorage',
        'fetch',
        'Promise',
        'addEventListener'
      ];
    }

    checkCompatibility() {
      const missing = [];

      // LocalStorage
      if (!this.checkLocalStorage()) {
        missing.push('LocalStorage');
      }

      // Fetch API
      if (typeof fetch === 'undefined') {
        missing.push('Fetch API');
      }

      // Promises
      if (typeof Promise === 'undefined') {
        missing.push('Promises');
      }

      // Event Listeners
      if (!document.addEventListener) {
        missing.push('Event Listeners');
      }

      // Web Audio API (желательно)
      if (!window.AudioContext && !window.webkitAudioContext) {
        console.warn('Web Audio API not supported, falling back to HTML5 Audio');
      }

      if (missing.length > 0) {
        this.showCompatibilityError(missing);
        return false;
      }

      return true;
    }

    checkLocalStorage() {
      try {
        localStorage.setItem('__test', '1');
        localStorage.removeItem('__test');
        return true;
      } catch (e) {
        return false;
      }
    }

    showCompatibilityError(missing) {
      const errorHtml = `
        <div style="
          position: fixed;
          inset: 0;
          background: #181818;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: sans-serif;
          padding: 20px;
          text-align: center;
          z-index: 99999;
        ">
          <div>
            <h1 style="color: #E80100; margin-bottom: 20px;">⚠️ Браузер не поддерживается</h1>
            <p style="margin-bottom: 15px;">Для работы приложения требуются следующие функции:</p>
            <ul style="list-style: none; padding: 0; margin-bottom: 20px;">
              ${missing.map(f => `<li style="margin: 5px 0;">❌ ${f}</li>`).join('')}
            </ul>
            <p style="color: #999;">Пожалуйста, обновите браузер до последней версии.</p>
            <p style="margin-top: 15px; font-size: 14px; color: #666;">
              Рекомендуем: Chrome, Firefox, Safari, Edge (последние версии)
            </p>
          </div>
        </div>
      `;

      document.body.innerHTML = errorHtml;
    }

    detectIOS() {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      if (isIOS) {
        document.body.classList.add('ios');
        console.log('📱 iOS detected');
      }
      return isIOS;
    }

    detectStandalone() {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                          window.navigator.standalone === true;
      
      if (isStandalone) {
        document.body.classList.add('standalone');
        console.log('📲 PWA mode detected');
      }
      
      return isStandalone;
    }

    preventDefaultBehaviors() {
      // Отключить pull-to-refresh на мобильных
      document.body.addEventListener('touchstart', (e) => {
        if (e.touches.length > 1) {
          e.preventDefault();
        }
      }, { passive: false });

      // Отключить двойной тап для зума
      let lastTouchEnd = 0;
      document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
          e.preventDefault();
        }
        lastTouchEnd = now;
      }, false);

      // Предотвратить контекстное меню на обложках
      document.addEventListener('contextmenu', (e) => {
        if (e.target.tagName === 'IMG' || e.target.closest('#cover-slot')) {
          e.preventDefault();
        }
      });
    }

    setupErrorHandling() {
      window.addEventListener('error', (e) => {
        console.error('Global error:', e.error);
        // Можно отправить на сервер аналитики
      });

      window.addEventListener('unhandledrejection', (e) => {
        console.error('Unhandled promise rejection:', e.reason);
        // Можно отправить на сервер аналитики
      });
    }

    init() {
      console.log('🚀 Bootstrapping application...');

      // Проверка совместимости
      if (!this.checkCompatibility()) {
        console.error('❌ Browser compatibility check failed');
        return;
      }

      // Детектирование платформы
      this.detectIOS();
      this.detectStandalone();

      // Предотвращение нежелательного поведения
      this.preventDefaultBehaviors();

      // Обработка ошибок
      this.setupErrorHandling();

      console.log('✅ Bootstrap complete');
    }
  }

  // Запуск при загрузке DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const bootstrap = new AppBootstrap();
      bootstrap.init();
    });
  } else {
    const bootstrap = new AppBootstrap();
    bootstrap.init();
  }
})();
