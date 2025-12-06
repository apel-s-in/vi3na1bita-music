// scripts/core/bootstrap.js
// ⭐ ИСПРАВЛЕНО: асинхронная загрузка albums.json (XMLHttpRequest sync DEPRECATED!)

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

    async init() {
      console.log('🚀 Bootstrapping application...');

      // 1. Проверка совместимости
      if (!this.checkCompatibility()) {
        console.error('❌ Browser compatibility check failed');
        return;
      }

      // 2. Детектирование платформы
      this.detectIOS();
      this.detectStandalone();

      // 3. Предотвращение нежелательного поведения
      this.preventDefaultBehaviors();

      // 4. Обработка ошибок
      this.setupErrorHandling();

      // 5. ⭐ КРИТИЧНО: Асинхронная загрузка albums.json
      await this.loadAlbumsIndex();

      console.log('✅ Bootstrap complete');
    }

    async loadAlbumsIndex() {
      try {
        console.log('📀 Loading albums index...');
        
        const response = await fetch('./albums.json', { 
          cache: 'no-cache',
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        if (!data || !Array.isArray(data.albums)) {
          throw new Error('Invalid albums.json format');
        }

        // ⭐ Публикуем в глобальную область
        window.albumsIndex = data.albums;

        console.log(`✅ Albums index loaded: ${data.albums.length} albums`);
      } catch (error) {
        console.error('❌ Failed to load albums.json:', error);
        window.albumsIndex = [];
        
        // Показать ошибку пользователю
        if (window.NotificationSystem) {
          window.NotificationSystem.error('Не удалось загрузить список альбомов');
        }
      }
    }

    checkCompatibility() {
      const missing = [];

      if (!this.checkLocalStorage()) {
        missing.push('LocalStorage');
      }

      if (typeof fetch === 'undefined') {
        missing.push('Fetch API');
      }

      if (typeof Promise === 'undefined') {
        missing.push('Promises');
      }

      if (!document.addEventListener) {
        missing.push('Event Listeners');
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
            <p style="margin-bottom: 15px;">Для работы требуются:</p>
            <ul style="list-style: none; padding: 0; margin-bottom: 20px;">
              ${missing.map(f => `<li style="margin: 5px 0;">❌ ${f}</li>`).join('')}
            </ul>
            <p style="color: #999;">Обновите браузер до последней версии.</p>
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
      document.body.addEventListener('touchstart', (e) => {
        if (e.touches.length > 1) {
          e.preventDefault();
        }
      }, { passive: false });

      let lastTouchEnd = 0;
      document.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
          e.preventDefault();
        }
        lastTouchEnd = now;
      }, false);

      document.addEventListener('contextmenu', (e) => {
        if (e.target.tagName === 'IMG' || e.target.closest('#cover-slot')) {
          e.preventDefault();
        }
      });
    }

    setupErrorHandling() {
      window.addEventListener('error', (e) => {
        console.error('Global error:', e.error);
      });

      window.addEventListener('unhandledrejection', (e) => {
        console.error('Unhandled promise rejection:', e.reason);
      });
    }
  }

  // ⭐ Запуск при загрузке DOM (асинхронно)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      const bootstrap = new AppBootstrap();
      await bootstrap.init();
    });
  } else {
    const bootstrap = new AppBootstrap();
    bootstrap.init();
  }
})();
