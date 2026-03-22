// scripts/ui/logo-pulse.js
// Изолированный модуль пульсации логотипа. Безопасен для AudioContext и CORS.

(function(W, D) {
  'use strict';
  
  let isActive = localStorage.getItem('logoPulseEnabled') === '1';
  let mode = parseInt(localStorage.getItem('logoPulseMode') || '1', 10);
  let animId = 0, analyser = null, dataArray = null, isFallback = false;

  const initStyles = () => {
    W.Utils?.dom?.createStyleOnce?.('logo-pulse-styles', `
      #logo-bottom { transition: transform 0.05s linear, filter 0.05s linear !important; will-change: transform, filter; }
      /* Режим 1: Классика (только scale) */
      .lp-mode-1 { transform: scale(calc(1 + var(--p) * 0.25)) !important; }
      /* Режим 2: Глитч (scale + skew + хроматическая аберрация) */
      .lp-mode-2 { 
        transform: scale(calc(1 + var(--p) * 0.15)) skewX(calc(var(--p) * -8deg)) !important; 
        filter: drop-shadow(calc(var(--p) * 6px) 0 0 rgba(255,0,0,0.7)) drop-shadow(calc(var(--p) * -6px) 0 0 rgba(0,255,255,0.7)) !important; 
      }
      /* Режим 3: Энергия (scale + неоновое свечение) */
      .lp-mode-3 { 
        transform: scale(calc(1 + var(--p) * 0.3)) !important; 
        filter: drop-shadow(0 0 calc(var(--p) * 15px) var(--primary-color)) brightness(calc(1 + var(--p) * 0.5)) !important; 
      }
    `);
  };

  const setupAudio = () => {
    if (analyser || !W.Howler?.ctx) return;
    try {
      if (W.Howler.ctx.state === 'suspended') W.Howler.ctx.resume().catch(()=>{});
      analyser = W.Howler.ctx.createAnalyser();
      analyser.fftSize = 64; // Минимальный размер для скорости
      W.Howler.masterGain.connect(analyser);
      dataArray = new Uint8Array(analyser.frequencyBinCount);
      isFallback = false;
    } catch (e) {
      isFallback = true; // Если CORS или другая ошибка заблокировала WebAudio
    }
  };

  const loop = () => {
    if (!isActive) return;
    const logo = D.getElementById('logo-bottom');
    if (!logo) { animId = requestAnimationFrame(loop); return; }

    let p = 0;
    const isPlaying = W.playerCore?.isPlaying?.();

    if (isPlaying) {
      if (analyser && !isFallback) {
        analyser.getByteFrequencyData(dataArray);
        // Берем басовые частоты (первые 3 бина)
        const bass = (dataArray[0] + dataArray[1] + dataArray[2]) / 3;
        p = bass / 255;
        
        // Если массив из одних нулей (CORS заблокировал чтение), переходим на фолбэк
        if (p === 0 && dataArray[0] === 0 && dataArray[10] === 0) isFallback = true;
      }

      if (isFallback || !analyser) {
        // Математическая симуляция бита (прим. 128 BPM), опирается на время трека
        const time = W.playerCore?.getPosition?.() || 0;
        // Острая кривая для имитации удара бочки (Math.pow(sin, 4))
        p = Math.pow(Math.abs(Math.sin(time * Math.PI * 2.13)), 4);
      }
    }

    // Применяем значение пульсации (0.0 - 1.0) в CSS переменную
    logo.style.setProperty('--p', p.toFixed(3));
    animId = requestAnimationFrame(loop);
  };

  const syncUi = () => {
    const h = D.getElementById('pulse-heart'), b = D.getElementById('pulse-btn'), l = D.getElementById('logo-bottom');
    if (h) h.textContent = isActive ? '❤️' : '🤍';
    if (b) b.classList.toggle('active', isActive);
    
    if (l) {
      l.classList.remove('lp-mode-1', 'lp-mode-2', 'lp-mode-3');
      if (isActive) {
        l.classList.add(`lp-mode-${mode}`);
        if (!animId) { setupAudio(); loop(); }
      } else {
        cancelAnimationFrame(animId); animId = 0;
        l.style.removeProperty('--p');
      }
    }
  };

  const toggle = () => {
    isActive = !isActive;
    localStorage.setItem('logoPulseEnabled', isActive ? '1' : '0');
    syncUi();
    if (isActive) W.NotificationSystem?.info?.(`Пульсация включена (Режим ${mode})`);
  };

  const cycleMode = () => {
    if (!isActive) return toggle();
    mode = (mode % 3) + 1;
    localStorage.setItem('logoPulseMode', String(mode));
    syncUi();
    W.NotificationSystem?.info?.(`Режим пульсации: ${mode}`);
  };

  const init = () => {
    initStyles();
    syncUi();
    // Обработчик тапа по логотипу
    const l = D.getElementById('logo-bottom');
    if (l) l.addEventListener('click', (e) => { e.preventDefault(); cycleMode(); });
  };

  W.LogoPulse = { init, toggle, cycleMode };
  D.readyState === 'loading' ? D.addEventListener('DOMContentLoaded', init) : init();

})(window, document);
