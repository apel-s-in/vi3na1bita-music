// scripts/energy.js (ESM)
// Управление режимом энергосбережения ("молния").

(function(){
  const ECO_MODE_KEY = 'ecoModeActive';
  let isEcoMode = false;

  function applyEcoMode(isActive) {
    document.body.classList.toggle('eco-mode', isActive);
    const btn = document.querySelector('.eco-btn');
    if (btn) btn.classList.toggle('eco-active', isActive);

    // Здесь можно добавить логику для остановки/возобновления анимаций
    if(isActive) {
        if(typeof window.stopCoverAutoPlay === 'function') window.stopCoverAutoPlay();
        // Остановить другие анимации...
    } else {
        if(typeof window.startCoverAutoPlay === 'function') window.startCoverAutoPlay();
    }
  }

  function toggleEcoMode() {
    isEcoMode = !isEcoMode;
    try {
      localStorage.setItem(ECO_MODE_KEY, isEcoMode ? '1' : '0');
    } catch {}
    applyEcoMode(isEcoMode);
    window.NotificationSystem?.info(isEcoMode ? '⚡ Эко-режим включен' : 'Эко-режим выключен');
  }

  function restoreEcoMode() {
    try {
      isEcoMode = localStorage.getItem(ECO_MODE_KEY) === '1';
    } catch {
      isEcoMode = false;
    }
    applyEcoMode(isEcoMode);
  }

  // Export
  window.toggleEcoMode = toggleEcoMode;
  window.restoreEcoMode = restoreEcoMode;
})();
