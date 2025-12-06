// scripts/player/player-adapter.js
// ⭐ ИСПРАВЛЕНО: правильный путь к PlayerCore

import { PlayerCore } from '../../src/PlayerCore.js';  // ✅ ПРАВИЛЬНЫЙ ПУТЬ!

(function initPlayerAdapter() {
  if (window.playerCore) {
    console.warn('⚠️ PlayerCore already exists');
    return;
  }

  console.log('🎵 Initializing PlayerCore adapter...');

  // Создаём экземпляр плеера
  const playerCore = new PlayerCore();

  // Подписка на события
  playerCore.on({
    onTrackChange: (track, index) => {
      console.log('🎵 Track changed:', track?.title);
      
      // Обновляем UI
      if (window.PlayerControls) {
        window.PlayerControls.updateNowPlaying({ track, index });
      }
    },
    
    onPlay: (track, index) => {
      console.log('▶️ Playing:', track?.title);
      if (window.PlayerControls) {
        window.PlayerControls.updatePlayPauseButton(true);
      }
    },
    
    onPause: (track, index) => {
      console.log('⏸️ Paused');
      if (window.PlayerControls) {
        window.PlayerControls.updatePlayPauseButton(false);
      }
    },
    
    onStop: (track, index) => {
      console.log('⏹️ Stopped');
      if (window.PlayerControls) {
        window.PlayerControls.updatePlayPauseButton(false);
      }
    },
    
    onEnd: (track, index) => {
      console.log('⏭️ Track ended');
    },
    
    onTick: (position, duration) => {
      if (window.PlayerControls) {
        window.PlayerControls.updateProgress(position, duration);
      }
    }
  });

  // Восстановление настроек
  try {
    const volume = parseFloat(localStorage.getItem('playerVolume') || '1');
    if (Number.isFinite(volume)) {
      playerCore.setVolume(volume);
    }
  } catch (e) {
    console.error('Failed to restore volume:', e);
  }

  try {
    playerCore.setRepeat(localStorage.getItem('repeatMode') === '1');
    playerCore.setShuffle(localStorage.getItem('shuffleMode') === '1');
  } catch (e) {}

  // Экспорт в глобальную область
  window.playerCore = playerCore;

  console.log('✅ PlayerCore adapter initialized');
})();
