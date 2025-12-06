// scripts/app/background-events.js
// Обработка фоновых событий (visibility, online/offline, battery)

(function() {
  'use strict';

  class BackgroundEventsManager {
    constructor() {
      this.wasPlaying = false;
      this.isOnline = navigator.onLine;
      this.init();
    }

    init() {
      this.setupVisibilityHandler();
      this.setupNetworkHandlers();
      this.setupBatteryHandler();
      this.setupBeforeUnloadHandler();

      console.log('✅ Background events initialized');
    }

    // Обработка изменения видимости страницы
    setupVisibilityHandler() {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.onPageHidden();
        } else {
          this.onPageVisible();
        }
      });
    }

    onPageHidden() {
      console.log('📱 Page hidden');
      
      // Сохранить состояние воспроизведения
      if (window.playerCore) {
        this.wasPlaying = window.playerCore.isPlaying();
      }

      // Можно приостановить воспроизведение на мобильных устройствах для экономии батареи
      // (опционально, зависит от требований)
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile && this.wasPlaying) {
        // window.playerCore?.pause();
        // Закомментировано - пусть играет в фоне
      }
    }

    onPageVisible() {
      console.log('📱 Page visible');
      
      // Возобновить воспроизведение если было активно
      if (this.wasPlaying && window.playerCore) {
        // window.playerCore.play();
        // Закомментировано - ручное управление пользователем предпочтительнее
      }
    }

    // Обработка онлайн/офлайн
    setupNetworkHandlers() {
      window.addEventListener('online', () => {
        this.onOnline();
      });

      window.addEventListener('offline', () => {
        this.onOffline();
      });
    }

    onOnline() {
      console.log('🌐 Online');
      this.isOnline = true;
      
      window.NotificationSystem?.success('Соединение восстановлено');
      
      const offlineBtn = document.getElementById('offline-btn');
      if (offlineBtn) {
        offlineBtn.className = 'offline-btn online';
        offlineBtn.textContent = 'ONLINE';
      }
    }

    onOffline() {
      console.log('📴 Offline');
      this.isOnline = false;
      
      window.NotificationSystem?.offline('Нет подключения к интернету');
      
      const offlineBtn = document.getElementById('offline-btn');
      if (offlineBtn) {
        offlineBtn.className = 'offline-btn offline';
        offlineBtn.textContent = 'OFFLINE';
      }
    }

    // Обработка батареи (опционально)
    async setupBatteryHandler() {
      if (!('getBattery' in navigator)) {
        console.warn('Battery API not supported');
        return;
      }

      try {
        const battery = await navigator.getBattery();
        
        battery.addEventListener('levelchange', () => {
          this.onBatteryLevelChange(battery);
        });

        battery.addEventListener('chargingchange', () => {
          this.onChargingChange(battery);
        });

        // Начальное состояние
        this.onBatteryLevelChange(battery);
      } catch (error) {
        console.warn('Battery API error:', error);
      }
    }

    onBatteryLevelChange(battery) {
      const level = Math.round(battery.level * 100);
      console.log(`🔋 Battery level: ${level}%`);

      // Предупреждение при низком заряде
      if (level < 15 && !battery.charging) {
        window.NotificationSystem?.warning(
          `Низкий заряд батареи: ${level}%`,
          4000
        );
      }
    }

    onChargingChange(battery) {
      if (battery.charging) {
        console.log('🔌 Charging');
      } else {
        console.log('🔋 Not charging');
      }
    }

    // Сохранение состояния перед закрытием
    setupBeforeUnloadHandler() {
      window.addEventListener('beforeunload', () => {
        this.saveState();
      });
    }

    saveState() {
      try {
        if (window.playerCore) {
          const currentTrack = window.playerCore.getCurrentTrackIndex();
          const position = window.playerCore.getCurrentPosition();
          
          localStorage.setItem('lastTrackIndex', currentTrack.toString());
          localStorage.setItem('lastTrackPosition', position.toString());
        }

        const currentAlbum = window.AlbumsManager?.getCurrentAlbum();
        if (currentAlbum) {
          localStorage.setItem('currentAlbum', currentAlbum);
        }

        console.log('💾 State saved');
      } catch (error) {
        console.error('Failed to save state:', error);
      }
    }

    // Публичные методы
    getNetworkStatus() {
      return this.isOnline;
    }
  }

  // Инициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.BackgroundEventsManager = new BackgroundEventsManager();
    });
  } else {
    window.BackgroundEventsManager = new BackgroundEventsManager();
  }
})();
