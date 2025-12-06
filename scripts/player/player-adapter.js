// scripts/player/player-adapter.js
// Адаптер для PlayerCore
import { PlayerCore } from '../../src/PlayerCore.js';

class PlayerAdapter {
  constructor() {
    this.player = null;
    this.initialized = false;
    this.init();
  }

  init() {
    if (this.initialized || window.playerCore) return;
    
    console.log('🎵 Initializing PlayerCore adapter...');
    
    // Создаем экземпляр PlayerCore
    this.player = new PlayerCore({
      events: {
        onTrackChange: (track, index) => this.handleTrackChange(track, index),
        onPlay: (track, index) => this.handlePlay(track, index),
        onPause: (track, index) => this.handlePause(track, index),
        onStop: (track, index) => this.handleStop(track, index),
        onEnd: (track, index) => this.handleEnd(track, index),
        onTick: (position, duration) => this.handleTick(position, duration),
        onSleepTriggered: (track, index) => this.handleSleepTriggered(track, index)
      }
    });
    
    // Восстановление настроек
    this.restoreSettings();
    
    // Экспорт в глобальную область
    window.playerCore = this.player;
    this.initialized = true;
    console.log('✅ PlayerCore adapter initialized');
  }

  handleTrackChange(track, index) {
    console.log('🎵 Track changed:', track?.title);
    if (window.PlayerControls) {
      window.PlayerControls.updateNowPlaying({ track, index });
    }
    // Обновление медиа-сессии
    if (window.BackgroundAudioManager) {
      window.BackgroundAudioManager.updateMetadata(track);
    }
  }

  handlePlay(track, index) {
    console.log('▶️ Playing:', track?.title);
    if (window.PlayerControls) {
      window.PlayerControls.updatePlayPauseButton(true);
    }
    // Обновление состояния фонового воспроизведения
    if (window.BackgroundEventsManager) {
      window.BackgroundEventsManager.setPlaybackLocks(true);
    }
  }

  handlePause(track, index) {
    console.log('⏸️ Paused');
    if (window.PlayerControls) {
      window.PlayerControls.updatePlayPauseButton(false);
    }
    if (window.BackgroundEventsManager) {
      window.BackgroundEventsManager.setPlaybackLocks(false);
    }
  }

  handleStop(track, index) {
    console.log('⏹️ Stopped');
    if (window.PlayerControls) {
      window.PlayerControls.updatePlayPauseButton(false);
    }
    if (window.BackgroundEventsManager) {
      window.BackgroundEventsManager.setPlaybackLocks(false);
    }
  }

  handleEnd(track, index) {
    console.log('⏭️ Track ended');
    // Автопереход на следующий трек
    if (!window.autoNextDisabled) {
      this.player.next();
    }
  }

  handleTick(position, duration) {
    if (window.PlayerControls) {
      window.PlayerControls.updateProgress(position, duration);
    }
    // Обновление позиции в медиа-сессии
    if (window.BackgroundAudioManager) {
      window.BackgroundAudioManager.updatePositionState({
        position,
        duration
      });
    }
  }

  handleSleepTriggered(track, index) {
    console.log('😴 Sleep timer triggered');
    if (window.NotificationSystem) {
      window.NotificationSystem.info('Таймер сна: воспроизведение остановлено');
    }
  }

  restoreSettings() {
    try {
      // Громкость
      const volume = parseFloat(localStorage.getItem('playerVolume') || '1');
      if (Number.isFinite(volume)) {
        this.player.setVolume(volume);
      }
      
      // Режимы воспроизведения
      this.player.setRepeat(localStorage.getItem('repeatMode') === '1');
      this.player.setShuffle(localStorage.getItem('shuffleMode') === '1');
      
      // Избранные треки
      const favoritesOnly = localStorage.getItem('favoritesOnlyMode') === '1';
      if (favoritesOnly && window.getLikedForAlbum) {
        const currentAlbum = window.AlbumsManager?.getCurrentAlbum();
        const liked = currentAlbum ? window.getLikedForAlbum(currentAlbum) : [];
        this.player.setFavoritesOnly(true, liked);
      }
    } catch (e) {
      console.error('Failed to restore player settings:', e);
    }
  }
}

// Инициализация при загрузке
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new PlayerAdapter();
  });
} else {
  new PlayerAdapter();
}
