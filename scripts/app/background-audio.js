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
    
    // Управление mediaSession (action handlers) делает только PlayerCore.updateMediaSession.
    // Здесь подписываемся только на события плеера и обновляем метаданные/позицию.
    this.attachPlayerEvents();
    console.log('✅ Background audio initialized');
    
    // iOS специфика
    this.setupIOSBackgroundAudio();
  }
  
  attachPlayerEvents() {
    if (!window.playerCore) {
      setTimeout(() => this.attachPlayerEvents(), 500);
      return;
    }
    
    // Здесь — только позиция (setPositionState). Метаданные и action handlers — в src/PlayerCore.js.
    window.playerCore.on({
      onTick: (position, duration) => {
        this.updatePositionState({ position, duration });
      }
    });
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
  
    if (!isIOS) return;
  
    console.log('📱 iOS detected - enabling background audio support');
  
    // Создаем AudioContext для фонового воспроизведения
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log('✅ AudioContext created for iOS background audio');
    
      // Обработчик для разблокировки аудио контекста
      const unlockAudio = () => {
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume().then(() => {
            console.log('🔊 iOS Audio Context resumed');
          });
        }
        document.removeEventListener('touchstart', unlockAudio);
        document.removeEventListener('touchend', unlockAudio);
      };
    
      document.addEventListener('touchstart', unlockAudio);
      document.addEventListener('touchend', unlockAudio);
    
    } catch (error) {
      console.warn('Failed to create AudioContext:', error);
    }
  
    // Обработчик для восстановления воспроизведения после блокировки экрана
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.audioContext) {
        console.log('📱 iOS page visible - checking audio state');
        try {
          if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(e => console.warn('Resume failed:', e));
          }
        
          // Проверяем состояние Howler
          if (window.Howler && window.Howler.ctx && window.Howler.ctx.state === 'suspended') {
            window.Howler.ctx.resume().catch(e => console.warn('Howler resume failed:', e));
          }
        
          // Если плеер должен играть - возобновляем
          if (window.playerCore && window.playerCore.isPlaying && window.playerCore.isPlaying()) {
            const currentTrack = window.playerCore.getCurrentTrack();
            if (currentTrack) {
              console.log('📱 Resuming playback:', currentTrack.title);
            }
          }
        } catch (error) {
          console.error('Failed to resume after iOS background:', error);
        }
      }
    });
  
    // Обработчик для webkitendfullscreen (старые iOS)
    document.addEventListener('webkitendfullscreen', () => {
      console.log('📱 iOS webkitendfullscreen event');
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
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
