// scripts/app/background-audio.js
// Фоновые iOS/Android аудио-хелперы, сохранение глобальных имён.
// Логика идентична ранее находившейся в index.html.

(function BackgroundAudioModule() {
  function isIOSUA() {
    try { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; }
    catch { return false; }
  }

  function initAudioContextForBackground() {
    try {
      // Создаем AudioContext с правильными параметрами для iOS
      window.__audioContext = new (window.AudioContext || window.webkitAudioContext)({
        latencyHint: 'playback',
        sampleRate: 44100
      });

      // Гарантируем, что контекст не будет приостановлен
      window.__audioContext.onstatechange = () => {
        if (window.__audioContext.state === 'suspended') {
          window.__audioContext.resume().catch(console.warn);
        }
      };

      // Создаем "тихий" осциллятор для удержания аудио в фоне
      const oscillator = window.__audioContext.createOscillator();
      const gainNode = window.__audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(window.__audioContext.destination);
      gainNode.gain.value = 0.00001; // почти бесшумный
      oscillator.start(0);

      // Сохраняем ссылки для управления
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
      gainNode.gain.value = 0.00001; // почти бесшумный

      oscillator.start(0);

      // Сохраняем для очистки
      window.__silentOscillator = oscillator;
      window.__silentAudioContext = audioContext;

      // Очищаем через 2 секунды
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

  // Глобальные алиасы для совместимости с существующими вызовами в index.html
  window.initAudioContextForBackground = initAudioContextForBackground;
  window.resumeAudioContextIfNeeded = resumeAudioContextIfNeeded;
  window.initSilentAudioPlayback = initSilentAudioPlayback;
})();
