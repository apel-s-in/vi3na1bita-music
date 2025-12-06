// scripts/player-adapter.js
// Адаптер для интеграции PlayerCore

import { PlayerCore } from './player/PlayerCore.js';  // ✅ ИСПРАВЛЕН ПУТЬ

(function initPlayerCoreAdapter() {
  if (window.playerCore) {
    console.log('PlayerCore already initialized');
    return;
  }

  console.log('Initializing PlayerCore...');

  const pc = new PlayerCore();

  // Подписка на события
  pc.on({
    onTrackChange: (track, index) => {
      console.log('Track changed:', track?.title, 'index:', index);
    },
    onPlay: (track, index) => {
      console.log('Playing:', track?.title);
    },
    onPause: (track, index) => {
      console.log('Paused:', track?.title);
    },
    onStop: (track, index) => {
      console.log('Stopped');
    },
    onEnd: (track, index) => {
      console.log('Track ended:', track?.title);
    }
  });

  // Восстановление настроек
  try {
    const volume = parseFloat(localStorage.getItem('playerVolume') || '1');
    if (Number.isFinite(volume)) {
      pc.setVolume(volume);
    }
  } catch (e) {
    console.error('Failed to restore volume:', e);
  }

  try {
    pc.setRepeat(localStorage.getItem('repeatMode') === '1');
  } catch (e) {}

  try {
    pc.setShuffle(localStorage.getItem('shuffleMode') === '1');
  } catch (e) {}

  // Экспорт в глобальную область
  window.playerCore = pc;

  console.log('✅ PlayerCore initialized');
})();
