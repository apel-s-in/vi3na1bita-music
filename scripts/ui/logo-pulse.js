// scripts/ui/logo-pulse.js // Лёгкая realtime-пульсация логотипа без сети. С fallback на реальный media element Howler.
(function(W, D) {
  'use strict';
  const PRESETS = { bass: { fftSize: 256, binStart: 1, binEnd: 3, attack: 0.55, release: 0.08, gain: 2.4 }, balanced: { fftSize: 256, binStart: 1, binEnd: 5, attack: 0.45, release: 0.10, gain: 1.8 }, aggressive: { fftSize: 256, binStart: 1, binEnd: 8, attack: 0.60, release: 0.12, gain: 2.8 } };
  const ls = (k, d) => localStorage.getItem(k) ?? d, clamp = (n, a, b) => Math.min(Math.max(Number(n) || 0, a), b);
  const st = { active: ls('logoPulseEnabled', '0') === '1', intensity: clamp(ls('logoPulseIntensity', '0.12'), 0.05, 0.3), preset: PRESETS[ls('logoPulsePreset', 'balanced')] ? ls('logoPulsePreset', 'balanced') : 'balanced', debug: ls('logoPulseDebug', '0') === '1', noiseGate: 0.035, glowBase: 4, glowBoost: 18, brightBoost: 0.18, pulse: 0, raf: 0, analyser: null, sourceKind: 'none', data: null, targets: [], previewLogo: null, debugEl: null, connected: false };
  const isLowPow = () => (Number(navigator.deviceMemory || 0) > 0 && Number(navigator.deviceMemory || 0) <= 4) || (Number(navigator.hardwareConcurrency || 0) > 0 && Number(navigator.hardwareConcurrency || 0) <= 4);
  const getCfg = () => { const b = PRESETS[st.preset] || PRESETS.balanced; return isLowPow() ? { ...b, fftSize: 256, gain: b.gain * 0.82 } : b; };
  const uiSusp = () => !!W.PlaybackClock?.getPlaybackClock?.()?.uiBackgroundSuspend;
  const updDbg = (r, p) => { if (!st.debug) { st.debugEl?.remove(); st.debugEl = null; return; } if (!st.debugEl?.isConnected) { st.debugEl = Object.assign(D.createElement('div'), { className: 'logo-pulse-debug' }); D.body.appendChild(st.debugEl); } st.debugEl.textContent = `preset: ${st.preset}\nraw: ${r.toFixed(3)}\npulse: ${p.toFixed(3)}\nint: ${st.intensity.toFixed(2)}\nfft: ${st.analyser?.fftSize || 0}\nctx: ${W.Howler?.ctx?.state || 'na'}\nconn: ${st.connected ? '1' : '0'}\nsrc: ${st.sourceKind}\nuiSuspend: ${uiSusp() ? '1' : '0'}`; };
  const setAud = () => { const c = getCfg(), cx = W.Howler?.ctx; if (!cx || !W.Howler?.masterGain) return (st.connected = false, st.sourceKind = 'none', false); try { if (cx.state === 'suspended') cx.resume().catch(()=>{}); if (!st.analyser || st.analyser.fftSize !== c.fftSize) { if (st.analyser) try { W.Howler.masterGain.disconnect(st.analyser); } catch {} st.analyser = cx.createAnalyser(); st.analyser.fftSize = c.fftSize; st.analyser.smoothingTimeConstant = 0; W.Howler.masterGain.connect(st.analyser); st.data = new Uint8Array(st.analyser.frequencyBinCount); } return (st.connected = true, st.sourceKind = 'masterGain', true); } catch { return (st.connected = false, st.sourceKind = 'none', false); } };
  const smpl = (fP) => { if (!st.active && !fP) { st.pulse = 0; return { raw: 0, pulse: 0 }; } if (!st.analyser || !st.data || !st.connected) return { raw: 0, pulse: fP ? 0.28 : 0 }; const c = getCfg(); if (st.analyser.fftSize !== c.fftSize && !setAud()) return { raw: 0, pulse: 0 }; st.analyser.getByteFrequencyData(st.data); let s = 0, cnt = 0; for (let i = c.binStart; i <= c.binEnd && i < st.data.length; i++) { s += st.data[i]; cnt++; } let r = cnt ? (s / cnt) / 255 : 0; r = clamp(Math.max(0, (r - st.noiseGate) / (1 - st.noiseGate)) * c.gain, 0, 1); if (W.playerCore?.isPlaying?.() && r <= 0.005) { r = Math.pow(Math.abs(Math.sin((W.playerCore?.getPosition?.() || 0) * Math.PI * 2)), 6) * 0.8; st.sourceKind = 'mathFallback'; } else if (r > 0.005) st.sourceKind = 'analyser'; st.pulse += (r - st.pulse) * (r > st.pulse ? c.attack : c.release); return { raw: r, pulse: clamp(st.pulse, 0, 1) }; };
  const rndr = (p, fP) => st.targets.forEach(el => {
    const isPreview = el.id === 'lp-preview-logo';
    const shouldAnimate = isPreview ? fP : st.active;
    if (!shouldAnimate || uiSusp()) {
      el.classList.remove('lp-active');
      el.style.removeProperty('--p');
      return;
    }
    el.classList.add('lp-active');
    el.style.setProperty('--p', p.toFixed(3));
    el.style.setProperty('--lp-int', String(st.intensity));
    el.style.setProperty('--lp-glow-base', `${st.glowBase}px`);
    el.style.setProperty('--lp-glow-boost', `${st.glowBoost}px`);
    el.style.setProperty('--lp-bright', String(st.brightBoost));
  });
  const frame = () => { const fP = !!(st.previewLogo?.offsetParent !== null); if (uiSusp()) { rndr(0, false); updDbg(0, 0); } else { const s = smpl(fP); rndr(s.pulse, fP); updDbg(s.raw, s.pulse); } st.raf = requestAnimationFrame(frame); };
  const syncUi = () => { st.targets = Array.from(D.querySelectorAll('.logo-pulse-target')); st.previewLogo = D.getElementById('lp-preview-logo'); const h = D.getElementById('pulse-heart'), b = D.getElementById('pulse-btn'); if (h) h.textContent = st.active ? '❤️' : '🤍'; if (b) b.classList.toggle('active', st.active); if (!st.raf) { setAud(); frame(); } };
  const updateSettings = () => { st.active = ls('logoPulseEnabled', '0') === '1'; st.intensity = clamp(ls('logoPulseIntensity', '0.12'), 0.05, 0.3); st.preset = PRESETS[ls('logoPulsePreset', 'balanced')] ? ls('logoPulsePreset', 'balanced') : 'balanced'; st.debug = ls('logoPulseDebug', '0') === '1'; st.pulse = 0; setAud(); syncUi(); };
  const toggle = () => { localStorage.setItem('logoPulseEnabled', (st.active = !st.active) ? '1' : '0'); syncUi(); };
  const init = () => {
    st.pulse = 0;
    syncUi();
    // Если выключена — снять lp-active со всех таргетов сразу
    if (!st.active) {
      Array.from(D.querySelectorAll('.logo-pulse-target')).forEach(el => {
        el.classList.remove('lp-active');
        el.style.removeProperty('--p');
      });
    }
    W.addEventListener('player:play', setAud);
    W.addEventListener('player:trackChanged', () => { st.pulse = 0; setAud(); });
    W.addEventListener('player:stop', () => { st.pulse = 0; });
  };
  W.LogoPulse = { init, toggle, updateSettings };
  D.readyState === 'loading' ? D.addEventListener('DOMContentLoaded', init) : init();
})(window, document);
