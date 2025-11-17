// scripts/app/background-audio.js
// Фоновые iOS/Android аудио-хелперы + адаптер к PlayerCore для автозапуска на iOS.

(function BackgroundAudioModule() {
  function isIOSUA() {
    try { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; }
    catch { return false; }
  }

  function initAudioContextForBackground() {
    try {
      window.__audioContext = new (window.AudioContext || window.webkitAudioContext)({
        latencyHint: 'playback',
        sampleRate: 44100
      });
      window.__audioContext.onstatechange = () => {
        if (window.__audioContext.state === 'suspended') {
          window.__audioContext.resume().catch(console.warn);
        }
      };
      const oscillator = window.__audioContext.createOscillator();
      const gainNode = window.__audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(window.__audioContext.destination);
      gainNode.gain.value = 0.00001;
      oscillator.start(0);
      window.__backgroundOscillator = oscillator;
      window.__backgroundGainNode = gainNode;
      console.log('iOS AudioContext initialized for background playback');
    } catch (e) {
      console.warn('Failed to initialize iOS AudioContext', e);
    }
  }

  function resumeAudioContextIfNeeded() {
    try {
      if (window.__audioContext && window.__audioContext.state === 'suspended') {
        window.__audioContext.resume().catch(console.warn);
      }
    } catch (e) {
      console.warn('Failed to resume audio context', e);
    }
  }

  function initSilentAudioPlayback() {
    if (!isIOSUA()) return;
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      gainNode.gain.value = 0.00001;
      oscillator.start(0);
      window.__silentOscillator = oscillator;
      window.__silentAudioContext = audioContext;
      setTimeout(() => {
        try {
          oscillator.stop();
          audioContext.close().catch(console.warn);
          delete window.__silentOscillator;
          delete window.__silentAudioContext;
        } catch (e) {
          console.warn('Failed to clean silent audio', e);
        }
      }, 2000);
      console.log('Silent audio playback initialized for iOS background mode');
    } catch (e) {
      console.warn('Failed to initialize silent audio playback', e);
    }
  }

  // Глобальные алиасы
  window.initAudioContextForBackground = initAudioContextForBackground;
  window.resumeAudioContextIfNeeded = resumeAudioContextIfNeeded;
  window.initSilentAudioPlayback = initSilentAudioPlayback;

  // Адаптер к PlayerCore: на iOS один раз запускаем initAudioContextForBackground при первом play()
  (function hookPlayerCoreOnce() {
    if (!isIOSUA()) return;
    let hooked = false;
    function bindIfReady() {
      try {
        if (hooked) return;
        const pc = window.playerCore;
        if (!pc || typeof pc.on !== 'function') return;
        pc.on({
          onPlay: () => {
            if (hooked) return;
            hooked = true;
            try { initAudioContextForBackground(); } catch {}
          }
        });
      } catch {}
    }
    // Пытаемся сразу и при первом user-gesture/ленивой загрузке адаптера
    bindIfReady();
    const id = setInterval(() => { if (hooked) { clearInterval(id); } else { bindIfReady(); } }, 300);
    // Остановим опрос через 10 сек
    setTimeout(() => clearInterval(id), 10000);
  })();

})();
