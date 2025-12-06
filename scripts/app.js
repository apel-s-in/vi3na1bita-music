// scripts/app.js
// Основной файл приложения
import { APP_CONFIG } from './core/config.js';
import AlbumsManager from './app/albums.js';
import NavigationManager from './app/navigation.js';
import DownloadsManager from './app/downloads.js';
import FavoritesManager from '../ui/favorites.js';

class App {
  constructor() {
    this.initialized = false;
    this.promoUnlocked = false;
    this.offlineMode = false;
    this.sleepTimer = null;
    this.sleepTimerTarget = null;
  }
  
  async initialize() {
    if (this.initialized) return;
    console.log(`🎵 Initializing Vitrina Razbita v${APP_CONFIG.APP_VERSION}`);
    
    try {
      // 1. Ждём загрузки albumsIndex
      await this.waitForAlbumsIndex();
      
      // 2. Проверка промокода
      await this.checkPromocode();
      if (!this.promoUnlocked) {
        console.log('⏸️ Waiting for promocode...');
        return;
      }
      
      // 3. Инициализация UI системы
      this.initializeNotifications();
      
      // 4. Ждём загрузки плеера
      await this.waitForPlayer();
      
      // 5. Инициализация модулей
      await this.initializeModules();
      
      // 6. PWA функции
      this.initializePWA();
      
      // 7. Online/Offline индикатор
      this.initializeOnlineStatus();
      
      // 8. Фоновые события
      this.initializeBackgroundEvents();
      
      // 9. Горячие клавиши
      this.initializeHotkeys();
      
      this.initialized = true;
      console.log('✅ App initialized successfully');
    } catch (error) {
      console.error('❌ App initialization failed:', error);
      if (window.NotificationSystem) {
        window.NotificationSystem.error('Ошибка инициализации приложения');
      }
    }
  }
  
  async waitForAlbumsIndex() {
    return new Promise((resolve) => {
      // Если уже загружен - сразу resolve
      if (window.albumsIndex && window.albumsIndex.length > 0) {
        console.log('✅ Albums index already loaded');
        resolve();
        return;
      }
      
      // Ждём максимум 5 секунд
      let attempts = 0;
      const checkInterval = setInterval(() => {
        attempts++;
        if (window.albumsIndex && window.albumsIndex.length > 0) {
          clearInterval(checkInterval);
          console.log('✅ Albums index loaded');
          resolve();
        } else if (attempts > 50) { // 50 * 100ms = 5 секунд
          clearInterval(checkInterval);
          console.error('❌ Albums index loading timeout');
          window.albumsIndex = []; // Инициализируем пустым массивом
          resolve();
        }
      }, 100);
    });
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
          resolve();
        }
      }, 100);
    });
  }
  
  async initializeModules() {
    if (!window.albumsIndex || window.albumsIndex.length === 0) {
      console.error('❌ Albums index not loaded');
      if (window.NotificationSystem) {
        window.NotificationSystem.error('Не удалось загрузить список альбомов');
      }
      return;
    }
    
    console.log(`📀 Albums loaded: ${window.albumsIndex.length}`);
    
    if (window.AlbumsManager) {
      await window.AlbumsManager.initialize();
    }
    
    if (window.NavigationManager) {
      window.NavigationManager.initialize();
    }
    
    // Инициализация избранных
    if (window.FavoritesManager) {
      await window.FavoritesManager.updateRefsModel();
      console.log('⭐ Favorites manager ready');
    }
    
    // Фильтр избранных
    this.initializeFavoritesFilter();
  }
  
  initializeFavoritesFilter() {
    const filterBtn = document.getElementById('filter-favorites-btn');
    if (!filterBtn) return;
    
    let favoritesOnly = false;
    filterBtn.addEventListener('click', () => {
      favoritesOnly = !favoritesOnly;
      
      if (window.playerCore && typeof window.playerCore.setFavoritesOnly === 'function') {
        const currentAlbum = window.AlbumsManager?.getCurrentAlbum();
        const liked = currentAlbum ? window.FavoritesManager?.getLikedForAlbum(currentAlbum) : [];
        window.playerCore.setFavoritesOnly(favoritesOnly, liked);
      }
      
      if (favoritesOnly) {
        filterBtn.textContent = 'Показать все песни';
        filterBtn.classList.add('active');
        this.filterTracksByFavorites(true);
      } else {
        filterBtn.textContent = 'Скрыть не отмеченные ⭐ песни';
        filterBtn.classList.remove('active');
        this.filterTracksByFavorites(false);
      }
      
      if (window.NotificationSystem) {
        window.NotificationSystem.info(favoritesOnly ? '⭐ Показаны только избранные треки' : 'Показаны все треки');
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
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js')
        .then((registration) => {
          console.log('✅ Service Worker registered:', registration.scope);
          this.setupServiceWorkerListeners(registration);
        })
        .catch((error) => {
          console.error('❌ Service Worker registration failed:', error);
          if (window.NotificationSystem) {
            window.NotificationSystem.error('Ошибка регистрации Service Worker');
          }
        });
    }
    
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
      
      if (window.NotificationSystem) {
        if (outcome === 'accepted') {
          window.NotificationSystem.success('Приложение будет установлено!');
        } else {
          window.NotificationSystem.info('Установка отменена');
        }
      }
    });
    
    window.addEventListener('appinstalled', () => {
      console.log('✅ PWA installed');
      if (window.NotificationSystem) {
        window.NotificationSystem.success('Приложение установлено!');
      }
    });
  }
  
  setupServiceWorkerListeners(registration) {
    // Периодическая проверка обновлений
    setInterval(async () => {
      try {
        const r = await navigator.serviceWorker.getRegistration();
        if (r) r.update();
      } catch (e) {
        console.warn('SW update check failed:', e);
      }
    }, 60 * 60 * 1000); // Каждый час
    
    // Обработчик сообщений от SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      const msg = event.data || {};
      
      if (msg.type === 'SW_VERSION') {
        const swVer = String(msg.version || '');
        if (swVer && swVer !== APP_CONFIG.APP_VERSION) {
          this.handleAppUpdate(swVer);
        }
      }
      
      if (msg.type === 'OFFLINE_STATE') {
        this.offlineMode = !!msg.value;
        this.updateOfflineUI();
      }
      
      if (msg.type === 'OFFLINE_PROGRESS') {
        this.updateOfflineProgress(msg.percent);
      }
      
      if (msg.type === 'OFFLINE_DONE') {
        if (window.NotificationSystem) {
          window.NotificationSystem.success('Офлайн-кэш готов!');
        }
      }
      
      if (msg.type === 'OFFLINE_ERROR') {
        if (window.NotificationSystem) {
          window.NotificationSystem.error('Ошибка кэширования офлайн');
        }
      }
    });
    
    // Запрашиваем текущее состояние офлайна
    try {
      registration.active?.postMessage({ type: 'REQUEST_OFFLINE_STATE' });
    } catch (e) {
      console.warn('Failed to request offline state:', e);
    }
  }
  
  handleAppUpdate(swVer) {
    if (window.NotificationSystem) {
      window.NotificationSystem.info(`Доступна новая версия (${swVer}). Перезагрузите страницу для обновления.`);
    }
    
    const updateBtn = document.createElement('button');
    updateBtn.id = 'update-app-btn';
    updateBtn.textContent = 'ОБНОВИТЬ ПРИЛОЖЕНИЕ';
    updateBtn.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      background: #4daaff;
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: bold;
      cursor: pointer;
      z-index: 9999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    
    updateBtn.addEventListener('click', async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration && registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          
          // Перезагрузка после активации нового SW
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
          });
        }
      } catch (e) {
        console.error('Update failed:', e);
        if (window.NotificationSystem) {
          window.NotificationSystem.error('Ошибка обновления. Попробуйте перезагрузить страницу вручную.');
        }
      }
      
      updateBtn.style.display = 'none';
    });
    
    document.body.appendChild(updateBtn);
  }
  
  updateOfflineUI() {
    const offlineBtn = document.getElementById('offline-btn');
    if (!offlineBtn) return;
    
    offlineBtn.textContent = this.offlineMode ? 'OFFLINE' : 'ONLINE';
    offlineBtn.className = this.offlineMode ? 'offline-btn offline' : 'offline-btn online';
    
    if (window.NotificationSystem) {
      window.NotificationSystem.info(this.offlineMode ? '📱 Режим офлайн активирован' : '🌐 Онлайн режим');
    }
  }
  
  updateOfflineProgress(percent) {
    const progressBar = document.getElementById('offline-progress-bar');
    if (progressBar) {
      progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    }
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
  
  initializeBackgroundEvents() {
    // Обработка видимости страницы
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.handlePageHidden();
      } else {
        this.handlePageVisible();
      }
    });
    
    // Обработка батареи (опционально)
    if ('getBattery' in navigator) {
      navigator.getBattery().then(battery => {
        battery.addEventListener('levelchange', () => {
          this.handleBatteryLevelChange(battery);
        });
        battery.addEventListener('chargingchange', () => {
          this.handleChargingChange(battery);
        });
      });
    }
  }
  
  handlePageHidden() {
    console.log('📱 Page hidden');
    // Сохраняем позицию воспроизведения
    if (window.playerCore) {
      const position = window.playerCore.getSeek();
      localStorage.setItem('lastTrackPosition', position.toString());
    }
  }
  
  handlePageVisible() {
    console.log('📱 Page visible');
    // Восстанавливаем позицию
    const savedPosition = localStorage.getItem('lastTrackPosition');
    if (savedPosition && window.playerCore) {
      const position = parseFloat(savedPosition);
      if (!isNaN(position)) {
        window.playerCore.seek(position);
      }
    }
  }
  
  handleBatteryLevelChange(battery) {
    const level = Math.round(battery.level * 100);
    if (level < 15 && !battery.charging && window.NotificationSystem) {
      window.NotificationSystem.warning(`Низкий заряд батареи: ${level}%`);
    }
  }
  
  handleChargingChange(battery) {
    if (battery.charging && window.NotificationSystem) {
      window.NotificationSystem.info('🔋 Зарядка подключена');
    }
  }
  
  initializeHotkeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      // Закрытие модальных окон по Escape
      if (e.key === 'Escape') {
        const modals = document.querySelectorAll('.modal-bg.active');
        if (modals.length > 0) {
          modals.forEach(modal => modal.classList.remove('active'));
          e.preventDefault();
          return;
        }
      }
      
      // Вызов справки по горячим клавишам
      if (e.key === '?' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        this.showHotkeysModal();
        return;
      }
      
      // Остальные горячие клавиши обрабатываются в player-adapter.js
    });
  }
  
  showHotkeysModal() {
    const modal = document.getElementById('hotkeys-modal');
    if (modal) {
      modal.classList.add('active');
    }
  }
}

// Создание и инициализация приложения
const app = new App();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.initialize());
} else {
  app.initialize();
}

window.app = app;
export default app;
