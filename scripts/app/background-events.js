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
      this.setupBeforeUnloadHandler();

      console.log('✅ Background events initialized');
    }

    // Обработка навигации браузера (Back/Forward)
    // Пока отключено по дизайну (не используем history state в приложении).

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

    // Battery API пока отключён (лишние permissions/разнобой поддержки браузеров).

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
