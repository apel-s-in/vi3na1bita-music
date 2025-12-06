// scripts/player/player-adapter.js
// Адаптер для интеграции PlayerCore с приложением

import { PlayerCore } from './PlayerCore.js';  // ✅ ПРАВИЛЬНЫЙ ПУТЬ

(function initPlayerAdapter() {
  if (window.playerCore) {
    console.log('⚠️ PlayerCore already exists');
    return;
  }

  console.log('🎵 Initializing PlayerCore adapter...');

  // Создаём экземпляр плеера
  const playerCore = new PlayerCore();

  // Подписка на события
  playerCore.on({
    trackChanged: (data) => {
      console.log('🎵 Track changed:', data.track?.title);
      
      // Обновляем UI
      if (window.PlayerControls) {
        window.PlayerControls.updateNowPlaying(data);
      }
    },
    
    play: (data) => {
      console.log('▶️ Playing:', data.track?.title);
    },
    
    pause: (data) => {
      console.log('⏸️ Paused');
    },
    
    stop: (data) => {
      console.log('⏹️ Stopped');
    },
    
    end: (data) => {
      console.log('⏭️ Track ended');
    },
    
    error: (data) => {
      console.error('❌ Player error:', data.error);
      if (window.NotificationSystem) {
        window.NotificationSystem.error('Ошибка воспроизведения');
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
