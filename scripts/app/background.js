// scripts/app/background.js
// Объединённый модуль фонового воспроизведения и событий

(function BackgroundModule() {
  'use strict';

  const w = window;

  class BackgroundManager {
    constructor() {
      this.isSupported = 'mediaSession' in navigator;
      this.audioContext = null;
      this.wasPlaying = false;
      this.isOnline = navigator.onLine;
    }

    init() {
      this.setupMediaSession();
      this.setupVisibility();
      this.setupNetwork();
      this.setupIOSAudio();
      this.setupBeforeUnload();
      console.log('✅ Background manager initialized');
    }

    setupMediaSession() {
      if (!this.isSupported) return;
      if (!w.playerCore) {
        setTimeout(() => this.setupMediaSession(), 500);
        return;
      }
      w.playerCore.on({
        onTick: (pos, dur) => {
          try {
            if ('setPositionState' in navigator.mediaSession) {
              navigator.mediaSession.setPositionState({ duration: dur || 0, playbackRate: 1.0, position: pos || 0 });
            }
          } catch {}
        }
      });
    }

    setupVisibility() {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.wasPlaying = w.playerCore?.isPlaying?.() || false;
        }
        // Правило: ничто не прерывает музыку
      });
    }

    setupNetwork() {
      const updateBtn = () => {
        const btn = document.getElementById('offline-btn');
        if (btn) {
          btn.className = `offline-btn ${this.isOnline ? 'online' : 'offline'}`;
          btn.textContent = this.isOnline ? 'ONLINE' : 'OFFLINE';
        }
      };
      window.addEventListener('online', () => {
        this.isOnline = true;
        w.NotificationSystem?.success('Соединение восстановлено');
        updateBtn();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
        w.NotificationSystem?.offline('Нет подключения к интернету');
        updateBtn();
      });
    }

    setupIOSAudio() {
      if (!w.Utils?.isIOS?.()) return;
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const unlock = () => {
          if (this.audioContext.state === 'suspended') this.audioContext.resume();
          document.removeEventListener('touchstart', unlock);
        };
        document.addEventListener('touchstart', unlock);
      } catch {}

      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.audioContext?.state === 'suspended') {
          this.audioContext.resume();
        }
      });
    }

    setupBeforeUnload() {
      window.addEventListener('beforeunload', () => {
        w.PlayerState?.save?.();
      });
      window.addEventListener('popstate', (e) => {
        if (e.state?.albumKey) w.AlbumsManager?.loadAlbum(e.state.albumKey);
      });
    }

    getNetworkStatus() { return this.isOnline; }
  }

  const mgr = new BackgroundManager();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mgr.init());
  } else {
    mgr.init();
  }
  w.BackgroundManager = mgr;
})();
