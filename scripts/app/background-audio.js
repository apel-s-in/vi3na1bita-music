// scripts/app/background-audio.js
// Поддержка фонового воспроизведения (Media Session API)

(function() {
  'use strict';

  class BackgroundAudioManager {
    constructor() {
      this.isSupported = 'mediaSession' in navigator;
      this.init();
    }

    init() {
      if (!this.isSupported) {
        console.warn('Media Session API not supported');
        return;
      }

      this.setupMediaSession();
      this.attachPlayerEvents();

      console.log('✅ Background audio initialized');
    }

    setupMediaSession() {
      // Обработчики действий
      const actionHandlers = {
        play: () => window.playerCore?.play(),
        pause: () => window.playerCore?.pause(),
        previoustrack: () => window.playerCore?.previous(),
        nexttrack: () => window.playerCore?.next(),
        seekto: (details) => {
          if (details.seekTime && window.playerCore) {
            window.playerCore.seek(details.seekTime);
          }
        }
      };

      for (const [action, handler] of Object.entries(actionHandlers)) {
        try {
          navigator.mediaSession.setActionHandler(action, handler);
        } catch (error) {
          console.warn(`Action ${action} not supported:`, error);
        }
      }
    }

    attachPlayerEvents() {
      if (!window.playerCore) {
        setTimeout(() => this.attachPlayerEvents(), 500);
        return;
      }

      // Обновление метаданных при смене трека
      window.playerCore.on('trackChanged', (data) => {
        this.updateMetadata(data.track);
      });

      // Обновление позиции воспроизведения
      window.playerCore.on('progress', (data) => {
        this.updatePositionState(data);
      });
    }

    updateMetadata(track) {
      if (!this.isSupported || !track) return;

      try {
        const albumInfo = window.albumsIndex?.find(a => a.key === track.album);
        const albumTitle = albumInfo?.title || 'Витрина Разбита';
        
        // Получить обложку
        let artworkUrl = 'icons/icon-512.png';
        if (albumInfo) {
          const albumData = window.AlbumsManager?.getAlbumData(track.album);
          if (albumData?.cover) {
            artworkUrl = `${albumInfo.base}${albumData.cover}`;
          }
        }

        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title || 'Неизвестный трек',
          artist: 'Витрина Разбита',
          album: albumTitle,
          artwork: [
            { src: artworkUrl, sizes: '512x512', type: 'image/png' }
          ]
        });

        console.log('🎵 Media metadata updated:', track.title);
      } catch (error) {
        console.error('Failed to update metadata:', error);
      }
    }

    updatePositionState(data) {
      if (!this.isSupported) return;

      try {
        if ('setPositionState' in navigator.mediaSession) {
          navigator.mediaSession.setPositionState({
            duration: data.duration || 0,
            playbackRate: 1.0,
            position: data.position || 0
          });
        }
      } catch (error) {
        console.error('Failed to update position state:', error);
      }
    }

    clearMetadata() {
      if (!this.isSupported) return;

      try {
        navigator.mediaSession.metadata = null;
      } catch (error) {
        console.error('Failed to clear metadata:', error);
      }
    }
  }

  // Инициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.BackgroundAudioManager = new BackgroundAudioManager();
    });
  } else {
    window.BackgroundAudioManager = new BackgroundAudioManager();
  }
})();
