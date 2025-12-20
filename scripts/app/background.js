// scripts/app/background.js — Фоновое воспроизведение
(function() {
  'use strict';

  let silentAudio = null;
  let wakeLock = null;
  let isBackgroundMode = false;

  // ==================== SILENT AUDIO (iOS) ====================
  function initSilentAudio() {
    if (!/iPad|iPhone|iPod/.test(navigator.userAgent)) return;

    silentAudio = document.createElement('audio');
    silentAudio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNbPH/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNbPH/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    silentAudio.loop = true;
    silentAudio.volume = 0.001;
    silentAudio.muted = false;
    silentAudio.playsInline = true;
    silentAudio.setAttribute('playsinline', '');
  }

  function playSilentAudio() {
    if (!silentAudio) return;
    silentAudio.play().catch(() => {});
  }

  function pauseSilentAudio() {
    if (!silentAudio) return;
    silentAudio.pause();
  }

  // ==================== WAKE LOCK ====================
  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;

    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } catch (e) {
      console.warn('Wake Lock failed:', e);
    }
  }

  function releaseWakeLock() {
    wakeLock?.release();
    wakeLock = null;
  }

  // ==================== VISIBILITY HANDLING ====================
  function handleVisibilityChange() {
    isBackgroundMode = document.hidden;

    if (document.hidden) {
      // Ушли в фон
      if (window.playerCore?.isPlaying?.()) {
        playSilentAudio();
        requestWakeLock();
      }
    } else {
      // Вернулись
      pauseSilentAudio();
      releaseWakeLock();
    }
  }

  // ==================== PLAYER EVENTS ====================
  function subscribeToPlayer() {
    const pc = window.playerCore;
    if (!pc?.on) return;

    pc.on({
      onPlay: () => {
        if (isBackgroundMode) {
          playSilentAudio();
          requestWakeLock();
        }
      },
      onPause: () => {
        pauseSilentAudio();
        releaseWakeLock();
      },
      onStop: () => {
        pauseSilentAudio();
        releaseWakeLock();
      }
    });
  }

  // ==================== AUDIO INTERRUPTION (iOS) ====================
  function handleAudioInterruption() {
    if (!window.Howler) return;

    // iOS audio session interruption
    document.addEventListener('pause', () => {
      // Приложение приостановлено
    }, false);

    document.addEventListener('resume', () => {
      // Приложение возобновлено — пытаемся возобновить аудио
      if (window.Howler.ctx?.state === 'interrupted') {
        window.Howler.ctx.resume();
      }
    }, false);

    // Обработка телефонных звонков и других прерываний
    if (window.Howler.ctx) {
      window.Howler.ctx.addEventListener('statechange', () => {
        if (window.Howler.ctx.state === 'interrupted') {
          // AudioContext был прерван
          console.log('AudioContext interrupted');
        } else if (window.Howler.ctx.state === 'running') {
          // AudioContext возобновлён
          console.log('AudioContext resumed');
        }
      });
    }
  }

  // ==================== ИНИЦИАЛИЗАЦИЯ ====================
  function initialize() {
    initSilentAudio();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Подписка с ожиданием
    const trySubscribe = () => {
      if (window.playerCore) {
        subscribeToPlayer();
        handleAudioInterruption();
      } else {
        setTimeout(trySubscribe, 100);
      }
    };
    trySubscribe();

    // Освобождаем ресурсы при закрытии
    window.addEventListener('beforeunload', () => {
      releaseWakeLock();
      pauseSilentAudio();
    });

    console.log('✅ BackgroundManager initialized');
  }

  // ==================== ЭКСПОРТ ====================
  window.BackgroundManager = {
    initialize,
    requestWakeLock,
    releaseWakeLock,
    get isBackgroundMode() { return isBackgroundMode; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
