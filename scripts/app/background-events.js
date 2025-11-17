// scripts/app/background-events.js
// Фоновые события: visibilitychange/freeze/resume/pagehide/pageshow/focusout.
// Только безопасные операции: сохранить позицию, обновить UI/MediaSession, НЕ pause/stop.

(function BackgroundEvents() {
  function pc() { return (window.playerCore || null); }
  function isIOS() { try { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; } catch { return false; } }

  // freeze/resume: сохранить/восстановить позицию (без управления звуком)
  document.addEventListener('freeze', () => {
    try {
      const p = pc();
      if (p && typeof p.getSeek === 'function') {
        window.__savedResumePosition = p.getSeek() || 0;
        localStorage.setItem('freezePosition', String(window.__savedResumePosition));
      } else {
        // legacy пути больше нет — ветка оставлена для совместимости
        localStorage.setItem('freezePosition', String(window.__savedResumePosition || 0));
      }
    } catch {}
  });

  document.addEventListener('resume', () => {
    try {
      const raw = localStorage.getItem('freezePosition');
      localStorage.removeItem('freezePosition');
      if (!raw) return;
      const pos = parseFloat(raw);
      if (!Number.isFinite(pos)) return;

      const TOL = 0.75;
      const p = pc();
      if (p) {
        const cur = Number(p.getSeek?.() || 0);
        if (!Number.isFinite(cur) || cur < (pos - TOL)) p.seek(pos);
      }
      if (typeof window.syncUiFromPlayback === 'function') window.syncUiFromPlayback();
    } catch {}
  });

  // Потеря фокуса при скрытии — только сохранить позицию
  try {
    if ('onfocusout' in document) {
      document.addEventListener('focusout', () => {
        if (document.hidden) {
          try { window.__savedResumePosition = pc()?.getSeek?.() || 0; } catch {}
        }
      });
    }
  } catch {}

  // iOS BFCache: pagehide/pageshow — сохранить/восстановить позицию
  if (isIOS()) {
    window.addEventListener('pagehide', (e) => {
      if (!e.persisted) return;
      try {
        window.__savedResumePosition = pc()?.getSeek?.() || 0;
        localStorage.setItem('iosBackgroundPosition', String(window.__savedResumePosition));
      } catch {}
    });

    window.addEventListener('pageshow', (e) => {
      if (!e.persisted) return;
      try {
        const raw = localStorage.getItem('iosBackgroundPosition');
        localStorage.removeItem('iosBackgroundPosition');
        if (!raw) return;
        const pos = parseFloat(raw);
        if (!Number.isFinite(pos)) return;
        const TOL = 0.75;
        const p = pc();
        if (p) {
          const cur = Number(p.getSeek?.() || 0);
          if (!Number.isFinite(cur) || cur < (pos - TOL)) p.seek(pos);
        }
        if (typeof window.syncUiFromPlayback === 'function') window.syncUiFromPlayback();
      } catch {}
    });
  }

  // visibilitychange: без паузы/стопа — сохраняем позицию, ослабляем/возвращаем UI, обновляем MediaSession
  document.addEventListener('visibilitychange', async () => {
    try {
      const isHidden = document.hidden;
      const p = pc();
      if (isHidden) {
        // Сохраняем только для возможной подстраховки
        window.__wasPlayingBeforeHidden = p ? !!p.isPlaying?.() : false;
        window.__savedResumePosition = p ? (p.getSeek?.() || 0) : 0;

        // Облегчаем UI
        if (window.coverAutoplay) { clearInterval(window.coverAutoplay); window.coverAutoplay = null; }
        if (window.animationEnabled) { window.__savedAnimationState = window.animationEnabled; window.applyAnimationState && window.applyAnimationState(false); }
        if (window.bitEnabled) { window.__savedBitState = window.bitEnabled; window.stopLogoPulsation && window.stopLogoPulsation(); }
      } else {
        // Возврат: таймер сна, iOS resume аудиоконтекста (через фоновые хелперы)
        try { window.checkSleepTimer && window.checkSleepTimer(); } catch {}
        try { window.resumeAudioContextIfNeeded && window.resumeAudioContextIfNeeded(); } catch {}

        // Восстановление позиции — только если реально потерялась
        const TOL = 0.75;
        if (window.__wasPlayingBeforeHidden && !window.sleepTimerTarget && p) {
          const cur = Number(p.getSeek?.() || 0);
          const saved = window.__savedResumePosition;
          const needRestore = (typeof saved === 'number' && !isNaN(saved)) &&
                              (!Number.isFinite(cur) || cur < (saved - TOL));
          if (needRestore) { try { p.seek(saved); } catch {} }
        }

        // UI синхронизация
        try { window.syncUiFromPlayback && window.syncUiFromPlayback(); } catch {}
        if (window.__savedAnimationState != null && window.applyAnimationState) {
          window.applyAnimationState(window.__savedAnimationState); window.__savedAnimationState = null;
        }
        if (window.__savedBitState && window.startLogoPulsation) {
          try { window.initAudioContext && window.initAudioContext(); } catch {}
          window.startLogoPulsation(); window.__savedBitState = null;
        }
        if (!window.coverAutoplay && Array.isArray(window.coverGalleryArr) && window.coverGalleryArr.length > 1) {
          window.startCoverAutoPlay && window.startCoverAutoPlay();
        }
        window.__savedResumePosition = null;
      }

      // Обновляем Media Session позицию
      try { window.updateMediaSessionPosition && window.updateMediaSessionPosition(); } catch {}
    } catch {}
  });

})();
