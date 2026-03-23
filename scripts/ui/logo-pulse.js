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

      if (activeProfile.impactEvents && st.active) {
        activeProfile.impactEvents.forEach(ev => {
          if (!ev._fired && time >= ev.time && time < ev.time + 0.1) {
            ev._fired = true;
            if (ev.type === 'glitch') cachedTargets.forEach(t => t.classList.add('lp-glitch-fx'));
            if (ev.uiEffect === 'shake_lyrics' && st.shake && playerBlock) playerBlock.classList.add('lp-shake-fx');
            setTimeout(() => { cachedTargets.forEach(t => t.classList.remove('lp-glitch-fx')); if (playerBlock) playerBlock.classList.remove('lp-shake-fx'); }, 350);
          } else if (time < ev.time || time > ev.time + 0.5) ev._fired = false;
        });
      }

      if (activeProfile.structure && st.active) {
        let sI = -1;
        for (let i = 0; i < activeProfile.structure.length; i++) if (time >= activeProfile.structure[i].time) sI = i;
        if (sI !== -1) {
          const sec = activeProfile.structure[sI];
          const baseP = (sec.baseIntensity || 0) * Math.pow(Math.abs(Math.sin(time * Math.PI * ((activeProfile.bpm||120)/60))), 4);
          p = Math.max(p, baseP * 0.6);

          if (secIdx !== sI) {
            secIdx = sI;
            if (st.bg && globalBg && sec.colorHint) globalBg.style.setProperty('--fx-color', `${sec.colorHint}55`);
            if (st.particles && sec.particles) setParticlesTarget(sec.particles.amount || 0, sec.particles.speed || 0.2);
          }
        }
      }
    } else if (isPlaying || forcePreview) {
      if (isPlaying && analyser && !isFallback) {
        analyser.getByteFrequencyData(dataArray);
        p = ((dataArray[0] + dataArray[1] + dataArray[2]) / 3) / 255;
        if (p === 0 && dataArray[0] === 0 && dataArray[10] === 0) isFallback = true;
      }
      if (isFallback || !analyser || (!isPlaying && forcePreview)) p = Math.pow(Math.abs(Math.sin(time * Math.PI * 2.13)), 4);
    }

    // ДВИЖЕНИЕ ЧАСТИЦ 3D (Летят на нас)
    if (st.particles && st.active && pActive.length > 0) {
      pActive.forEach(part => {
        part.z += part.speed * 8; // Приближаются
        if (part.z > 800) resetParticle(part);
        
        let op = part.z > 600 ? 1 - ((part.z-600)/200) : (part.z < 100 ? part.z/100 : 1);
        part.el.style.transform = `translate3d(${part.x}vw, ${part.y}vh, ${part.z}px)`;
        part.el.style.opacity = op * 0.6; // Мягкое свечение
      });
    }

    cachedTargets.forEach(el => {
      if (!st.active && el.id === 'logo-bottom') return;
      el.style.setProperty('--p', p.toFixed(3));
      el.style.setProperty('--lp-int', st.intensity);
      if (st.glitch && !activeProfile) {
        el.style.setProperty('--lp-skew', `skewX(calc(var(--p) * -8deg))`);
        el.style.setProperty('--lp-glitch', `drop-shadow(calc(var(--p) * 6px) 0 0 rgba(255,0,0,0.7)) drop-shadow(calc(var(--p) * -6px) 0 0 rgba(0,255,255,0.7))`);
      } else { el.style.setProperty('--lp-skew', `skewX(0deg)`); el.style.setProperty('--lp-glitch', `drop-shadow(0 0 0 transparent)`); }
    });
    
    animId = requestAnimationFrame(loop);
  };

  const syncUi = () => {
    cachedTargets = Array.from(D.querySelectorAll('.logo-pulse-target'));
    previewLogo = D.getElementById('lp-preview-logo');
    playerBlock = D.getElementById('lyricsplayerblock');
    globalBg = D.getElementById('global-fx-bg');

    const h = D.getElementById('pulse-heart'), b = D.getElementById('pulse-btn');
    if (h) h.textContent = st.active ? '❤️' : '🤍';
    if (b) b.classList.toggle('active', st.active);
    
    cachedTargets.forEach(l => {
      if (st.active || l.id === 'lp-preview-logo') l.classList.add('lp-active');
      else { l.classList.remove('lp-active'); l.style.removeProperty('--p'); }
    });
    
    if (!animId) { setupAudio(); loop(); }
  };

  const toggle = () => {
    st.active = !st.active;
    localStorage.setItem('logoPulseEnabled', st.active ? '1' : '0');
    syncUi();
  };

  const init = () => {
    initStyles(); initParticlePool(); syncUi();
    
    W.addEventListener('player:trackChanged', async (e) => {
      activeProfile = null; beatIdx = 0; secIdx = -1;
      if (globalBg) globalBg.style.setProperty('--fx-color', 'transparent');
      setParticlesTarget(0, 0); 
      
      const uid = e.detail?.uid;
      if (uid && W.TrackRegistry?.getProfile) {
        try {
          const profile = await W.TrackRegistry.getProfile(uid);
          if (profile && profile.beatmap) {
            activeProfile = profile;
            if (activeProfile.impactEvents) activeProfile.impactEvents.forEach(ev => ev._fired = false);
          }
        } catch {}
      }
    });
    W.addEventListener('player:stop', () => { activeProfile = null; if (globalBg) globalBg.style.setProperty('--fx-color', 'transparent'); setParticlesTarget(0, 0); });
  };

  W.LogoPulse = { init, toggle, updateSettings };
  D.readyState === 'loading' ? D.addEventListener('DOMContentLoaded', init) : init();

})(window, document);
