// scripts/ui/logo-pulse.js
// Изолированный модуль пульсации логотипа с поддержкой WYSIWYG настроек.

(function(W, D) {
  'use strict';
  
  let isActive = localStorage.getItem('logoPulseEnabled') === '1';
  let intensity = parseFloat(localStorage.getItem('logoPulseIntensity') || '0.15');
  let glitch = localStorage.getItem('logoPulseGlitch') === '1';
  let animId = 0, analyser = null, dataArray = null, isFallback = false;

  const updateSettings = () => {
    intensity = parseFloat(localStorage.getItem('logoPulseIntensity') || '0.15');
    glitch = localStorage.getItem('logoPulseGlitch') === '1';
    syncUi();
  };

  const initStyles = () => {
    W.Utils?.dom?.createStyleOnce?.('logo-pulse-styles', `
      .logo-pulse-target { transition: transform 0.05s linear, filter 0.05s linear !important; will-change: transform, filter; }
      .lp-active { 
        transform: scale(calc(1 + var(--p) * var(--lp-int, 0.15))) var(--lp-skew, skewX(0deg)) !important; 
        filter: drop-shadow(0 0 calc(var(--p) * 15px) var(--primary-color)) brightness(calc(1 + var(--p) * 0.5)) var(--lp-glitch, drop-shadow(0 0 0 transparent)) !important; 
      }
    `);
  };

  const setupAudio = () => {
    if (analyser || !W.Howler?.ctx) return;
    try {
      if (W.Howler.ctx.state === 'suspended') W.Howler.ctx.resume().catch(()=>{});
      analyser = W.Howler.ctx.createAnalyser();
      analyser.fftSize = 64; 
      W.Howler.masterGain.connect(analyser);
      dataArray = new Uint8Array(analyser.frequencyBinCount);
      isFallback = false;
    } catch (e) {
      isFallback = true;
    }
  };

  const loop = () => {
    const targets = D.querySelectorAll('.logo-pulse-target');
    const preview = D.getElementById('lp-preview-logo');
    const forcePreview = preview && preview.offsetParent !== null;
    
    // Если глобально выключено, но открыты настройки пульсации — разрешаем цикл только для превью
    if (!isActive && !forcePreview) {
        animId = requestAnimationFrame(loop);
        return;
    }
    if (!targets.length) { animId = requestAnimationFrame(loop); return; }

    let p = 0;
    const isPlaying = W.playerCore?.isPlaying?.();

    if (isPlaying || forcePreview) {
      if (isPlaying && analyser && !isFallback) {
        analyser.getByteFrequencyData(dataArray);
        const bass = (dataArray[0] + dataArray[1] + dataArray[2]) / 3;
        p = bass / 255;
        if (p === 0 && dataArray[0] === 0 && dataArray[10] === 0) isFallback = true;
      }
      if (isFallback || !analyser || (!isPlaying && forcePreview)) {
        const time = isPlaying ? (W.playerCore?.getPosition?.() || 0) : (Date.now() / 1000);
        p = Math.pow(Math.abs(Math.sin(time * Math.PI * 2.13)), 4);
      }
    }

    targets.forEach(el => {
      if (!isActive && el.id === 'logo-bottom') return; // Основной логотип не бьется, если выключен
      
      el.style.setProperty('--p', p.toFixed(3));
      el.style.setProperty('--lp-int', intensity);
      
      if (glitch) {
        el.style.setProperty('--lp-skew', `skewX(calc(var(--p) * -8deg))`);
        el.style.setProperty('--lp-glitch', `drop-shadow(calc(var(--p) * 6px) 0 0 rgba(255,0,0,0.7)) drop-shadow(calc(var(--p) * -6px) 0 0 rgba(0,255,255,0.7))`);
      } else {
        el.style.setProperty('--lp-skew', `skewX(0deg)`);
        el.style.setProperty('--lp-glitch', `drop-shadow(0 0 0 transparent)`);
      }
    });
    
    animId = requestAnimationFrame(loop);
  };

  const syncUi = () => {
    const h = D.getElementById('pulse-heart'), b = D.getElementById('pulse-btn'), targets = D.querySelectorAll('.logo-pulse-target');
    if (h) h.textContent = isActive ? '❤️' : '🤍';
    if (b) b.classList.toggle('active', isActive);
    
    targets.forEach(l => {
      // Превью бьется всегда, когда открыто
      if (isActive || l.id === 'lp-preview-logo') {
        l.classList.add('lp-active');
      } else {
        l.classList.remove('lp-active');
        l.style.removeProperty('--p');
      }
    });
    
    if (!animId) { setupAudio(); loop(); }
  };

  const toggle = () => {
    isActive = !isActive;
    localStorage.setItem('logoPulseEnabled', isActive ? '1' : '0');
    syncUi();
    if (isActive) W.NotificationSystem?.info?.('Пульсация включена');
  };

  const init = () => {
    initStyles();
    syncUi();
  };

  W.LogoPulse = { init, toggle, updateSettings };
  D.readyState === 'loading' ? D.addEventListener('DOMContentLoaded', init) : init();

})(window, document);
