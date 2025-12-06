// scripts/player/player-adapter.js
// ⭐ ИСПРАВЛЕНО: корректный относительный путь

import { PlayerCore } from '../../src/PlayerCore.js';

(function initPlayerAdapter() {
  if (window.playerCore) {
    console.warn('⚠️ PlayerCore already exists');
    return;
  }

  console.log('🎵 Initializing PlayerCore adapter...');

  const playerCore = new PlayerCore();

  // Подписка на события
  playerCore.on({
    onTrackChange: (track, index) => {
      console.log('🎵 Track changed:', track?.title);
      
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

  // Публичные хелперы для совместимости со старым кодом
  window.playTrack = (index) => playerCore.play(index);
  window.pauseTrack = () => playerCore.pause();
  window.nextTrack = () => playerCore.next();
  window.previousTrack = () => playerCore.prev();
  window.stopTrack = () => playerCore.stop();

  console.log('✅ PlayerCore adapter initialized');
})();

