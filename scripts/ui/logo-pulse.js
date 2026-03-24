// scripts/ui/logo-pulse.js
// Лёгкая realtime-пульсация логотипа без профилей, FX-сценариев и сетевых зависимостей.

(function (W, D) {
  'use strict';

  const PRESETS = {
    bass: { fftSize: 256, binStart: 1, binEnd: 5, attack: 0.38, release: 0.11, gain: 1.18 },
    balanced: { fftSize: 256, binStart: 1, binEnd: 7, attack: 0.32, release: 0.10, gain: 1.0 },
    aggressive: { fftSize: 512, binStart: 1, binEnd: 10, attack: 0.46, release: 0.14, gain: 1.28 }
  };

  const ls = (k, d) => localStorage.getItem(k) ?? d;
  const clamp = (n, a, b) => Math.min(Math.max(Number(n) || 0, a), b);

  const state = {
    active: ls('logoPulseEnabled', '0') === '1',
    intensity: clamp(ls('logoPulseIntensity', '0.12'), 0.05, 0.3),
    preset: PRESETS[ls('logoPulsePreset', 'balanced')] ? ls('logoPulsePreset', 'balanced') : 'balanced',
    debug: ls('logoPulseDebug', '0') === '1',
    noiseGate: 0.035,
    glowBase: 4,
    glowBoost: 18,
    brightBoost: 0.18,
    pulse: 0,
    raf: 0,
    analyser: null,
    sink: null,
    data: null,
    targets: [],
    previewLogo: null,
    debugEl: null,
    connected: false
  };

  const isLowPowerDevice = () => {
    const mem = Number(navigator.deviceMemory || 0);
    const cores = Number(navigator.hardwareConcurrency || 0);
    return (mem > 0 && mem <= 4) || (cores > 0 && cores <= 4);
  };

  const getPresetConfig = () => {
    const base = PRESETS[state.preset] || PRESETS.balanced;
    if (!isLowPowerDevice()) return base;
    return { ...base, fftSize: 256, gain: base.gain * 0.82 };
  };

  const ensureStyles = () => {
    W.Utils?.dom?.createStyleOnce?.('logo-pulse-styles', `
      .logo-pulse-target{transition:transform .05s linear,filter .05s linear!important;will-change:transform,filter}
      .lp-active{transform:scale(calc(1 + var(--p,0) * var(--lp-int,0.12)))!important;filter:drop-shadow(0 0 calc(var(--lp-glow-base,4px) + var(--p,0) * var(--lp-glow-boost,18px)) var(--primary-color)) brightness(calc(1 + var(--p,0) * var(--lp-bright,0.18)))!important}
      .logo-pulse-debug{position:fixed;right:10px;bottom:10px;z-index:10030;padding:6px 8px;border-radius:8px;background:rgba(8,12,18,.86);border:1px solid rgba(77,170,255,.25);color:#d8ecff;font:11px/1.35 monospace;pointer-events:none;white-space:pre;backdrop-filter:blur(4px);box-shadow:0 8px 20px rgba(0,0,0,.35)}
    `);
  };

  const ensureDebugEl = () => {
    if (!state.debug) {
      state.debugEl?.remove();
      state.debugEl = null;
      return;
    }
    if (state.debugEl?.isConnected) return;
    state.debugEl = D.createElement('div');
    state.debugEl.className = 'logo-pulse-debug';
    D.body.appendChild(state.debugEl);
  };

  const updateDebug = (raw, pulse) => {
    if (!state.debug) return ensureDebugEl();
    ensureDebugEl();
    if (!state.debugEl) return;
    state.debugEl.textContent = [
      `preset: ${state.preset}`,
      `raw: ${raw.toFixed(3)}`,
      `pulse: ${pulse.toFixed(3)}`,
      `int: ${state.intensity.toFixed(2)}`,
      `fft: ${state.analyser?.fftSize || 0}`,
      `ctx: ${W.Howler?.ctx?.state || 'na'}`,
      `conn: ${state.connected ? '1' : '0'}`,
      `lowPower: ${isLowPowerDevice() ? '1' : '0'}`
    ].join('\n');
  };

  const disconnectAudio = () => {
    try { if (state.analyser) W.Howler?.masterGain?.disconnect?.(state.analyser); } catch {}
    try { if (state.analyser) state.analyser.disconnect(); } catch {}
    try { if (state.sink) state.sink.disconnect(); } catch {}
    state.connected = false;
  };

  const setupAudio = () => {
    const cfg = getPresetConfig();
    if (!W.Howler?.ctx || !W.Howler?.masterGain) return false;
    try {
      if (W.Howler.ctx.state === 'suspended') W.Howler.ctx.resume().catch(() => {});
      if (!state.analyser || state.analyser.fftSize !== cfg.fftSize) {
        disconnectAudio();
        state.analyser = W.Howler.ctx.createAnalyser();
        state.analyser.fftSize = cfg.fftSize;
        state.analyser.smoothingTimeConstant = 0;
        state.sink = W.Howler.ctx.createGain();
        state.sink.gain.value = 0.0001;
        state.data = new Uint8Array(state.analyser.frequencyBinCount);
      }
      try { W.Howler.masterGain.connect(state.analyser); } catch {}
      try { state.analyser.connect(state.sink); } catch {}
      try { state.sink.connect(W.Howler.ctx.destination); } catch {}
      state.connected = true;
      return true;
    } catch {
      state.connected = false;
      return false;
    }
  };

  const samplePulse = (forcePreview) => {
    if (!state.active && !forcePreview) return { raw: 0, pulse: 0 };
    if (!state.analyser || !state.data || !state.connected) {
      return { raw: 0, pulse: forcePreview ? 0.28 : 0 };
    }

    const cfg = getPresetConfig();
    if (state.analyser.fftSize !== cfg.fftSize && !setupAudio()) {
      return { raw: 0, pulse: 0 };
    }

    state.analyser.getByteFrequencyData(state.data);

    let sum = 0;
    let count = 0;
    for (let i = cfg.binStart; i <= cfg.binEnd && i < state.data.length; i++) {
      sum += state.data[i];
      count++;
    }

    let raw = count ? (sum / count) / 255 : 0;
    raw = Math.max(0, (raw - state.noiseGate) / (1 - state.noiseGate));
    raw = clamp(raw * cfg.gain, 0, 1);

    const k = raw > state.pulse ? cfg.attack : cfg.release;
    state.pulse += (raw - state.pulse) * k;
    return { raw, pulse: clamp(state.pulse, 0, 1) };
  };

  const renderPulse = (p, forcePreview) => {
    state.targets.forEach(el => {
      if (!state.active && !forcePreview && el.id !== 'lp-preview-logo') {
        el.classList.remove('lp-active');
        el.style.removeProperty('--p');
        return;
      }
      el.classList.add('lp-active');
      el.style.setProperty('--p', p.toFixed(3));
      el.style.setProperty('--lp-int', String(state.intensity));
      el.style.setProperty('--lp-glow-base', `${state.glowBase}px`);
      el.style.setProperty('--lp-glow-boost', `${state.glowBoost}px`);
      el.style.setProperty('--lp-bright', String(state.brightBoost));
    });
  };

  const frame = () => {
    const forcePreview = !!(state.previewLogo && state.previewLogo.offsetParent !== null);
    if (D.visibilityState === 'hidden') {
      renderPulse(0, false);
      state.raf = requestAnimationFrame(frame);
      return;
    }

    const sampled = samplePulse(forcePreview);
    renderPulse(sampled.pulse, forcePreview);
    updateDebug(sampled.raw, sampled.pulse);
    state.raf = requestAnimationFrame(frame);
  };

  const syncUi = () => {
    state.targets = Array.from(D.querySelectorAll('.logo-pulse-target'));
    state.previewLogo = D.getElementById('lp-preview-logo');

    const heart = D.getElementById('pulse-heart');
    const btn = D.getElementById('pulse-btn');
    if (heart) heart.textContent = state.active ? '❤️' : '🤍';
    if (btn) btn.classList.toggle('active', state.active);

    if (!state.raf) {
      setupAudio();
      frame();
    }
  };

  const updateSettings = () => {
    state.active = ls('logoPulseEnabled', '0') === '1';
    state.intensity = clamp(ls('logoPulseIntensity', '0.12'), 0.05, 0.3);
    state.preset = PRESETS[ls('logoPulsePreset', 'balanced')] ? ls('logoPulsePreset', 'balanced') : 'balanced';
    state.debug = ls('logoPulseDebug', '0') === '1';
    state.pulse = 0;
    setupAudio();
    syncUi();
  };

  const toggle = () => {
    state.active = !state.active;
    localStorage.setItem('logoPulseEnabled', state.active ? '1' : '0');
    syncUi();
  };

  const init = () => {
    ensureStyles();
    syncUi();
    W.addEventListener('player:play', () => { setupAudio(); });
    W.addEventListener('player:trackChanged', () => { state.pulse = 0; setupAudio(); });
    W.addEventListener('player:stop', () => { state.pulse = 0; });
    D.addEventListener('visibilitychange', () => {
      if (D.visibilityState === 'hidden') state.pulse = 0;
    });
  };

  W.LogoPulse = { init, toggle, updateSettings };
  D.readyState === 'loading' ? D.addEventListener('DOMContentLoaded', init) : init();
})(window, document);
