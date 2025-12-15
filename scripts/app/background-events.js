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
      this.setupPopstateHandler();

      console.log('✅ Background events initialized');
    }

    // Обработка навигации браузера (Back/Forward)
    setupPopstateHandler() {
      window.addEventListener('popstate', (event) => {
        console.log('📍 Popstate event:', event.state);

        // Восстановить состояние приложения (не трогаем плеер!)
        if (event.state && event.state.albumKey) {
          window.AlbumsManager?.loadAlbum(event.state.albumKey);
        }
      });
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

      // Сохранить состояние воспроизведения (НИЧЕГО не останавливаем)
      if (window.playerCore) {
        this.wasPlaying = window.playerCore.isPlaying();
      }
    }

    onPageVisible() {
      console.log('📱 Page visible');

      // Ничего не делаем: правило "ничто не прерывает музыку"
      // и возобновление тоже не форсим (пользователь/система сами решают).
    }

    // Обработка онлайн/офлайн
    setupNetworkHandlers() {
      window.addEventListener('online', () => this.onOnline());
      window.addEventListener('offline', () => this.onOffline());
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

        this.onBatteryLevelChange(battery);
      } catch (error) {
        console.warn('Battery API error:', error);
      }
    }

    onBatteryLevelChange(battery) {
      const level = Math.round(battery.level * 100);
      console.log(`🔋 Battery level: ${level}%`);

      if (level < 15 && !battery.charging) {
        window.NotificationSystem?.warning(`Низкий заряд батареи: ${level}%`, 4000);
      }
    }

    onChargingChange(battery) {
      if (battery.charging) {
        console.log('🔌 Charging');
      } else {
        console.log('🔋 Not charging');
      }
    }

    // Сохранение состояния перед закрытием (НЕ трогаем воспроизведение)
    setupBeforeUnloadHandler() {
      window.addEventListener('beforeunload', () => {
        this.saveState();
      });
    }

    saveState() {
      try {
        // Основной источник истины — PlayerState.save (если есть).
        if (window.PlayerState && typeof window.PlayerState.save === 'function') {
          window.PlayerState.save();
        }

        // Дополнительные маркеры (не обязательны)
        const currentAlbum = window.AlbumsManager?.getCurrentAlbum?.();
        if (currentAlbum) {
          localStorage.setItem('currentAlbum', currentAlbum);
        }

        // Исправлено: getSeek() не существует, используем getPosition()
        if (window.playerCore) {
          const currentTrack = window.playerCore.getIndex();
          const position = window.playerCore.getPosition();

          if (Number.isFinite(currentTrack)) {
            localStorage.setItem('lastTrackIndex', String(currentTrack));
          }
          if (Number.isFinite(position)) {
            localStorage.setItem('lastTrackPosition', String(Math.floor(position)));
          }
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.BackgroundEventsManager = new BackgroundEventsManager();
    });
  } else {
    window.BackgroundEventsManager = new BackgroundEventsManager();
  }
})();
