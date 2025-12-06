// scripts/app.js
// Главная точка входа приложения

import { APP_CONFIG } from './core/config.js';
import AlbumsManager from './app/albums.js';
import NavigationManager from './app/navigation.js';
import DownloadsManager from './app/downloads.js';

class App {
  constructor() {
    this.initialized = false;
    this.promoUnlocked = false;
  }

  async initialize() {
    if (this.initialized) return;

    console.log(`🎵 Initializing Vitrina Razbita v${APP_CONFIG.APP_VERSION}`);

    try {
      // 1. Проверка промокода
      await this.checkPromocode();

      if (!this.promoUnlocked) {
        console.log('⏸️ Waiting for promocode...');
        return;
      }

      // 2. Инициализация UI системы
      this.initializeNotifications();

      // 3. Ждём загрузки плеера
      await this.waitForPlayer();

      // 4. Инициализация модулей
      await this.initializeModules();

      // 5. PWA функции
      this.initializePWA();

      // 6. Online/Offline индикатор
      this.initializeOnlineStatus();

      this.initialized = true;
      console.log('✅ App initialized successfully');

    } catch (error) {
      console.error('❌ App initialization failed:', error);
      window.NotificationSystem?.error('Ошибка инициализации приложения');
    }
  }

  async checkPromocode() {
    const promocodeBlock = document.getElementById('promocode-block');
    const mainBlock = document.getElementById('main-block');

    // Проверка сохранённого промокода
    const savedPromo = localStorage.getItem('promocode');
    if (savedPromo === APP_CONFIG.PROMOCODE) {
      this.unlockApp(promocodeBlock, mainBlock);
      return;
    }

    // Обработчик ввода промокода
    const promoInput = document.getElementById('promo-inp');
    const promoBtn = document.getElementById('promo-btn');
    const promoError = document.getElementById('promo-error');

    const checkPromo = () => {
      const value = promoInput.value.trim();

      if (value === APP_CONFIG.PROMOCODE) {
        localStorage.setItem('promocode', value);
        this.unlockApp(promocodeBlock, mainBlock);
      } else {
        promoError.textContent = '❌ Неверный промокод';
        promoInput.classList.add('error');
        setTimeout(() => {
          promoError.textContent = '';
          promoInput.classList.remove('error');
        }, 2000);
      }
    };

    promoBtn?.addEventListener('click', checkPromo);
    promoInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') checkPromo();
    });
  }

  unlockApp(promocodeBlock, mainBlock) {
    if (promocodeBlock) promocodeBlock.classList.add('hidden');
    if (mainBlock) mainBlock.classList.remove('hidden');
    
    this.promoUnlocked = true;
    console.log('🔓 App unlocked');

    // Продолжить инициализацию
    this.initialize();
  }

  initializeNotifications() {
    // NotificationSystem уже загружен через notify.js
    if (window.NotificationSystem) {
      console.log('✅ Notification system ready');
    }
  }

  async waitForPlayer() {
    return new Promise((resolve) => {
      if (window.playerCore) {
        console.log('✅ PlayerCore already loaded');
        resolve();
        return;
      }

      // Ждём загрузки плеера (максимум 5 секунд)
      let attempts = 0;
      const checkInterval = setInterval(() => {
        attempts++;
        
        if (window.playerCore) {
          clearInterval(checkInterval);
          console.log('✅ PlayerCore loaded');
          resolve();
        } else if (attempts > 50) {
          clearInterval(checkInterval);
          console.error('❌ PlayerCore loading timeout');
          resolve(); // Продолжить без плеера
        }
      }, 100);
    });
  }

  async initializeModules() {
    // Проверка загрузки альбомов из bootstrap.js
    if (!window.albumsIndex || window.albumsIndex.length === 0) {
      console.error('❌ Albums index not loaded');
      window.NotificationSystem?.error('Не удалось загрузить список альбомов');
      return;
    }

    console.log(`📀 Albums loaded: ${window.albumsIndex.length}`);

    // Инициализация модулей
    if (window.AlbumsManager) {
      await window.AlbumsManager.initialize();
    }

    if (window.NavigationManager) {
      window.NavigationManager.initialize();
    }

    if (window.FavoritesManager) {
      console.log('⭐ Favorites manager ready');
    }

    // Кнопка фильтрации избранного
    this.initializeFavoritesFilter();
  }

  initializeFavoritesFilter() {
    const filterBtn = document.getElementById('filter-favorites-btn');
    if (!filterBtn) return;

    let favoritesOnly = false;

    filterBtn.addEventListener('click', () => {
      favoritesOnly = !favoritesOnly;

      if (favoritesOnly) {
        filterBtn.textContent = 'Показать все песни';
        filterBtn.classList.add('active');
        this.filterTracksByFavorites(true);
      } else {
        filterBtn.textContent = 'Скрыть не отмеченные ⭐ песни';
        filterBtn.classList.remove('active');
        this.filterTracksByFavorites(false);
      }
    });
  }

  filterTracksByFavorites(showOnlyFavorites) {
    const currentAlbum = window.AlbumsManager?.getCurrentAlbum();
    if (!currentAlbum) return;

    const tracks = document.querySelectorAll('.track');
    
    tracks.forEach((trackEl) => {
      const albumKey = trackEl.dataset.album;
      const trackNum = parseInt(trackEl.querySelector('.like-star')?.dataset.num);

      if (!trackNum) return;

      const isFavorite = window.FavoritesManager?.isFavorite(albumKey, trackNum);

      if (showOnlyFavorites && !isFavorite) {
        trackEl.style.display = 'none';
      } else {
        trackEl.style.display = '';
      }
    });
  }

  initializePWA() {
    // Регистрация Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then((registration) => {
          console.log('✅ Service Worker registered:', registration.scope);
        })
        .catch((error) => {
          console.error('❌ Service Worker registration failed:', error);
        });
    }

    // Кнопка установки PWA
    let deferredPrompt;
    const installBtn = document.getElementById('install-pwa-btn');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      
      if (installBtn) {
        installBtn.style.display = 'block';
      }
    });

    installBtn?.addEventListener('click', async () => {
      if (!deferredPrompt) return;

      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      console.log(`PWA install outcome: ${outcome}`);
      deferredPrompt = null;
      installBtn.style.display = 'none';
    });

    window.addEventListener('appinstalled', () => {
      console.log('✅ PWA installed');
      window.NotificationSystem?.success('Приложение установлено!');
    });
  }

  initializeOnlineStatus() {
    const statusBtn = document.getElementById('offline-btn');
    if (!statusBtn) return;

    const updateStatus = () => {
      const isOnline = navigator.onLine;
      
      statusBtn.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
      statusBtn.className = isOnline ? 'offline-btn online' : 'offline-btn offline';
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    
    updateStatus();
  }
}

// Создание и инициализация приложения
const app = new App();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.initialize());
} else {
  app.initialize();
}

// Экспорт для отладки
window.app = app;

export default app;
