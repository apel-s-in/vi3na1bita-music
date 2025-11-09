// scripts/energy.js (ESM)
// Единый модуль энергосбережения и Wake Lock/Web Locks.
// Функции работают поверх window.* переменных/утилит, объявленных в index.html.

(function(){
  function detectEnergySaver() {
    try {
      const nc = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      const saveData = !!(nc && nc.saveData);
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      return saveData || reduced;
    } catch { return false; }
  }

  async function setPlaybackLocks(active) {
    try {
      if (active) {
        if (navigator.locks && typeof navigator.locks.request === 'function' && !window.__playbackLockReleaser) {
          navigator.locks.request('audio-playback', { mode: 'shared' }, async () => {
            await new Promise(resolve => { window.__playbackLockReleaser = resolve; });
          }).catch(()=>{});
        }
        if ('wakeLock' in navigator && !document.hidden && !window.__wakeLock) {
          try {
            window.__wakeLock = await navigator.wakeLock.request('screen');
            window.__wakeLock.addEventListener('release', () => { window.__wakeLock = null; }, { once: true });
          } catch {}
        }
      } else {
        if (window.__playbackLockReleaser) { try { window.__playbackLockReleaser(); } catch {} window.__playbackLockReleaser = null; }
        if (window.__wakeLock) { try { await window.__wakeLock.release(); } catch {} window.__wakeLock = null; }
      }
    } catch {}
  }

  function applyEcoState(on, { silent = false } = {}) {
    window.ultraEcoEnabled = !!on;
    const ecoSec = Math.max(2, Math.min(60, parseInt(localStorage.getItem('ecoUiIntervalSec') || '5', 10)));
    window.__uiUpdateMinIntervalMs = window.ultraEcoEnabled ? (ecoSec * 1000) : 1000;
    window.__progressThrottleMs    = window.ultraEcoEnabled ? (ecoSec * 1000) : 1000;

    if (window.ultraEcoEnabled) {
      if (window.__savedAnimationBeforeEco == null) window.__savedAnimationBeforeEco = window.animationEnabled;
      if (window.__savedBitBeforeEco == null) window.__savedBitBeforeEco = window.bitEnabled;
      if (window.animationEnabled && typeof window.applyAnimationState === 'function') window.applyAnimationState(false);
      if (window.bitEnabled && typeof window.stopLogoPulsation === 'function') window.stopLogoPulsation();
      if (window.coverAutoplay) { try { clearInterval(window.coverAutoplay); } catch {} window.coverAutoplay = null; }
    } else {
      if (window.__savedAnimationBeforeEco != null && typeof window.applyAnimationState === 'function') window.applyAnimationState(window.__savedAnimationBeforeEco);
      window.__savedAnimationBeforeEco = null;
      if (window.__savedBitBeforeEco) {
        try { window.initAudioContext && window.initAudioContext(); window.startLogoPulsation && window.startLogoPulsation(); } catch {}
      }
      window.__savedBitBeforeEco = null;
      if (!window.coverAutoplay && Array.isArray(window.coverGalleryArr) && window.coverGalleryArr.length > 1 && !document.hidden && !window.energySaver) {
        window.startCoverAutoPlay && window.startCoverAutoPlay();
      }
    }

    try { localStorage.setItem('ultraEco', window.ultraEcoEnabled ? '1' : '0'); } catch {}
    if (!silent && window.NotificationSystem) {
      window.NotificationSystem.info(window.ultraEcoEnabled ? '⚡ Ультра‑эконом: ВКЛ' : '⚡ Ультра‑эконом: ВЫКЛ');
    }
    if (!document.hidden && typeof window.updateUiFromCoreOnce === 'function') window.updateUiFromCoreOnce();
  }

  function applyEnergySaver(on) {
    window.energySaver = !!on;
    if (window.energySaver) {
      if (window.__savedAnimationBeforeEnergy == null) window.__savedAnimationBeforeEnergy = window.animationEnabled;
      if (window.__savedBitBeforeEnergy == null) window.__savedBitBeforeEnergy = window.bitEnabled;
      if (window.animationEnabled && typeof window.applyAnimationState === 'function') window.applyAnimationState(false);
      if (window.bitEnabled && typeof window.stopLogoPulsation === 'function') window.stopLogoPulsation();
      if (window.coverAutoplay) { try { clearInterval(window.coverAutoplay); } catch {} window.coverAutoplay = null; }
      if (!window.ultraEcoEnabled) { window.__ecoAutoFromEnergy = true; applyEcoState(true, { silent: true }); }
    } else {
      if (window.__savedAnimationBeforeEnergy != null && typeof window.applyAnimationState === 'function') window.applyAnimationState(window.__savedAnimationBeforeEnergy);
      window.__savedAnimationBeforeEnergy = null;
      if (window.__savedBitBeforeEnergy) { try { window.initAudioContext && window.initAudioContext(); window.startLogoPulsation && window.startLogoPulsation(); } catch {} }
      window.__savedBitBeforeEnergy = null;
      if (!window.coverAutoplay && Array.isArray(window.coverGalleryArr) && window.coverGalleryArr.length > 1 && !document.hidden) {
        window.startCoverAutoPlay && window.startCoverAutoPlay();
      }
      if (window.__ecoAutoFromEnergy) {
        window.__ecoAutoFromEnergy = false;
        if (localStorage.getItem('ultraEco') !== '1') applyEcoState(false, { silent: true });
      }
    }
  }

  // Экспорт в глобал
  window.Energy = {
    detectEnergySaver,
    setPlaybackLocks,
    applyEcoState,
    applyEnergySaver
  };
  // Бэкенды совместимости (индекс вызывает эти имена напрямую)
  window.detectEnergySaver = detectEnergySaver;
  window.applyEnergySaver = applyEnergySaver;
  window.applyEcoState = applyEcoState;
  window.setPlaybackLocks = setPlaybackLocks;
})();
