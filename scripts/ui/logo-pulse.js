// scripts/ui/logo-pulse.js
// Универсальный Visual FX Engine (Логотип, Фон, Частицы 3D, Тряска).

(function(W, D) {
  'use strict';
  
  let st = {
    active: localStorage.getItem('logoPulseEnabled') === '1',
    intensity: parseFloat(localStorage.getItem('logoPulseIntensity') || '0.15'),
    glitch: localStorage.getItem('logoPulseGlitch') === '1',
    shake: localStorage.getItem('fxShakeEnabled') !== '0',
    bg: localStorage.getItem('fxBgEnabled') !== '0',
    particles: localStorage.getItem('fxParticlesEnabled') !== '0'
  };

  let animId = 0, analyser = null, dataArray = null, isFallback = false;

  let cachedTargets = [], previewLogo = null, playerBlock = null, globalBg = null, particlesContainer = null;
  let activeProfile = null, beatIdx = 0, secIdx = -1;

  const MAX_PARTICLES = 60;
  let pPool = [], pActive = [];

  const updateSettings = () => {
    st.intensity = parseFloat(localStorage.getItem('logoPulseIntensity') || '0.15');
    st.glitch = localStorage.getItem('logoPulseGlitch') === '1';
    st.shake = localStorage.getItem('fxShakeEnabled') !== '0';
    st.bg = localStorage.getItem('fxBgEnabled') !== '0';
    st.particles = localStorage.getItem('fxParticlesEnabled') !== '0';
    syncUi();
  };

  const initStyles = () => {
    W.Utils?.dom?.createStyleOnce?.('logo-pulse-styles', `
      .logo-pulse-target { transition: transform 0.05s linear, filter 0.05s linear !important; will-change: transform, filter; }
      .lp-active { transform: scale(calc(1 + var(--p) * var(--lp-int, 0.15))) var(--lp-skew, skewX(0deg)) !important; filter: drop-shadow(0 0 calc(var(--p) * 15px) var(--primary-color)) brightness(calc(1 + var(--p) * 0.5)) var(--lp-glitch, drop-shadow(0 0 0 transparent)) !important; }
      .lp-glitch-fx { animation: lpGlitch 0.3s cubic-bezier(.25, .46, .45, .94) both !important; }
      @keyframes lpGlitch { 0% { transform: scale(calc(1 + var(--p) * var(--lp-int))) translate(0) skew(0deg); filter: drop-shadow(0 0 0 transparent); } 20% { transform: scale(calc(1 + var(--p) * var(--lp-int))) translate(-5px, 3px) skew(-8deg); filter: drop-shadow(6px 0 0 #0ff) drop-shadow(-6px 0 0 #f00); } 40% { transform: scale(calc(1 + var(--p) * var(--lp-int))) translate(5px, -3px) skew(8deg); filter: drop-shadow(-6px 0 0 #0ff) drop-shadow(6px 0 0 #f00); } 100% { transform: scale(calc(1 + var(--p) * var(--lp-int))) translate(0) skew(0deg); filter: drop-shadow(0 0 0 transparent); } }
      .lp-shake-fx { animation: lpShake 0.35s cubic-bezier(.36,.07,.19,.97) both; }
      @keyframes lpShake { 10%, 90% { transform: translate3d(-2px, 0, 0); } 20%, 80% { transform: translate3d(4px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-8px, 0, 0); } 40%, 60% { transform: translate3d(8px, 0, 0); } }
    `);
  };

  const setupAudio = () => {
    if (analyser || !W.Howler?.ctx) return;
    try {
      if (W.Howler.ctx.state === 'suspended') W.Howler.ctx.resume().catch(()=>{});
      analyser = W.Howler.ctx.createAnalyser(); analyser.fftSize = 64; 
      W.Howler.masterGain.connect(analyser); dataArray = new Uint8Array(analyser.frequencyBinCount); isFallback = false;
    } catch (e) { isFallback = true; }
  };

  const initParticlePool = () => {
    particlesContainer = D.getElementById('global-particles'); if (!particlesContainer) return;
    for(let i=0; i<MAX_PARTICLES; i++) {
      let el = D.createElement('div'); el.className = 'fx-particle'; particlesContainer.appendChild(el);
      pPool.push({ el, x:0, y:0, z:0, speed:0, active:false });
    }
  };

  const resetParticle = (p) => {
    // Вылет из центра (3D)
    p.x = (Math.random() - 0.5) * 100; // -50 to 50
    p.y = (Math.random() - 0.5) * 100;
    p.z = 0; // Начало далеко
    p.speed = (0.5 + Math.random()) * 2;
    p.el.style.opacity = 0;
  };

  const setParticlesTarget = (targetAmount, speedMult) => {
    if (!st.particles || targetAmount === 0 || !st.active) {
      while(pActive.length > 0) { let p = pActive.pop(); p.active = false; p.el.style.opacity = 0; pPool.push(p); }
      return;
    }
    while(pActive.length < targetAmount && pPool.length > 0) {
      let p = pPool.pop(); p.active = true; resetParticle(p); p.speed *= speedMult;
      const s = (2 + Math.random() * 3); p.el.style.width = p.el.style.height = `${s}px`; pActive.push(p);
    }
    while(pActive.length > targetAmount) { let p = pActive.pop(); p.active = false; p.el.style.opacity = 0; pPool.push(p); }
  };

  const loop = () => {
    const forcePreview = previewLogo && previewLogo.offsetParent !== null;
    
    // МАСТЕР ВЫКЛЮЧАТЕЛЬ: Если общая кнопка эффектов выключена
    if (!st.active && !forcePreview) {
      if (globalBg) globalBg.classList.remove('fx-active');
      if (particlesContainer) particlesContainer.classList.remove('fx-active');
      animId = requestAnimationFrame(loop);
      return;
    }

    // Если включена - активируем слои согласно настройкам пользователя
    if (globalBg) globalBg.classList.toggle('fx-active', st.bg);
    if (particlesContainer) particlesContainer.classList.toggle('fx-active', st.particles);

    if (!cachedTargets.length) { animId = requestAnimationFrame(loop); return; }

    let p = 0;
    const isPlaying = W.playerCore?.isPlaying?.();
    const time = isPlaying ? (W.playerCore?.getPosition?.() || 0) : (Date.now() / 1000);

    if (isPlaying && activeProfile) {
      if (activeProfile.beatmap && st.active) {
        const beats = activeProfile.beatmap;
        if (beatIdx > 0 && time < beats[beatIdx - 1].t) beatIdx = 0;
        while (beatIdx < beats.length && beats[beatIdx].t < time - 0.05) beatIdx++;

        if (beatIdx < beats.length) {
          const dist = Math.abs(time - beats[beatIdx].t);
          if (dist < 0.08) p = beats[beatIdx].i * (1 - (dist / 0.08)); 
        }
      }

      ifPulseEnabled') === '1';
    state.intensity = parseFloat(localStorage.getItem('logoPulseIntensity') || '0.12');
    syncUi();
  };

  const toggle = () => {
    state.active = !state.active;
    localStorage.setItem('logoPulseEnabled', state.active ? '1' : '0');
    syncUi();
  };

  const init = () => {
    initStyles();
    syncUi();
    W.addEventListener('player:play', setupAudio);
  };

  W.LogoPulse = { init, toggle, updateSettings };
  D.readyState === 'loading' ? D.addEventListener('DOMContentLoaded', init) : init();
})(window, document);
