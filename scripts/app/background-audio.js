// scripts/app/background-audio.js
// Поддержка фонового воспроизведения
class BackgroundAudioManager {
  constructor() {
    this.isSupported = 'mediaSession' in navigator;
    this.audioContext = null;
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
    
    // iOS специфика
    this.setupIOSBackgroundAudio();
  }
  
  setupMediaSession() {
    // Обработчики действий
    const actionHandlers = {
      play: () => window.playerCore?.play(),
      pause: () => window.playerCore?.pause(),
      previoustrack: () => window.playerCore?.prev(),
      nexttrack: () => window.playerCore?.next(),
      seekbackward: (details) => {
        if (window.playerCore) {
          const current = window.playerCore.getSeek() || 0;
          window.playerCore.seek(Math.max(0, current - (details.seekOffset || 10)));
        }
      },
      seekforward: (details) => {
        if (window.playerCore) {
          const current = window.playerCore.getSeek() || 0;
          const duration = window.playerCore.getDuration() || 0;
          window.playerCore.seek(Math.min(duration, current + (details.seekOffset || 10)));
        }
      },
      seekto: (details) => {
        if (details.seekTime && window.playerCore) {
          window.playerCore.seek(details.seekTime);
        }
      },
      stop: () => window.playerCore?.stop()
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
    window.playerCore.on({
      onTrackChange: (track) => {
        this.updateMetadata(track);
      },
      onTick: (position, duration) => {
        this.updatePositionState({ position, duration });
      }
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
      
      // Создаем несколько размеров обложки для разных платформ
      const artwork = [
        { src: artworkUrl, sizes: '96x96', type: 'image/png' },
        { src: artworkUrl, sizes: '128x128', type: 'image/png' },
        { src: artworkUrl, sizes: '192x192', type: 'image/png' },
        { src: artworkUrl, sizes: '256x256', type: 'image/png' },
        { src: artworkUrl, sizes: '384x384', type: 'image/png' },
        { src: artworkUrl, sizes: '512x512', type: 'image/png' }
      ];
      
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Неизвестный трек',
        artist: track.artist || 'Витрина Разбита',
        album: albumTitle,
        artwork: artwork
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
  
  setupIOSBackgroundAudio() {
    // Для iOS в Standalone режиме
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    
    if (!isIOS || !isStandalone) return;
    
    console.log('📱 iOS Standalone detected - enabling background audio');
    
    // Создаем AudioContext для фонового воспроизведения
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log('✅ AudioContext created for iOS background audio');
    } catch (error) {
      console.warn('Failed to create AudioContext:', error);
    }
    
    // Обработчик для восстановления воспроизведения после блокировки экрана
    document.addEventListener('webkitendfullscreen', () => {
      console.log('📱 iOS webkitendfullscreen - attempting to resume playback');
      try {
        if (this.audioContext && this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }
        
        const audio = document.getElementById('audio');
        if (audio && audio.paused) {
          audio.play().catch(e => console.warn('Resume playback failed:', e));
        }
      } catch (error) {
        console.error('Failed to resume after iOS background:', error);
      }
    });
  }
  
  getAudioContext() {
    return this.audioContext;
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
