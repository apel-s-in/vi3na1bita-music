// scripts/app/player-ui/lyrics.js
// LyricsController — JSON-only timed lyrics.
// Инварианты: не трогает воспроизведение (no stop/play/seek), только UI и fetch/cache.

(function LyricsControllerModule() {
  'use strict';

  const w = window;

  const LS_VIEW = 'lyricsViewMode';
  const LS_ANIM = 'lyricsAnimationEnabled';

  const SS_404 = 'lyrics_404_cache:v1';
  const SS_CACHE_PREFIX = 'lyrics_cache_';

  const LYRICS_MIN_INTERVAL = 250;

  let currentLyrics = [];
  let hasTimedLyricsForCurrentTrack = false;

  let lyricsViewMode = readLyricsViewMode();
  let animationEnabled = readAnimationEnabled();

  let lastIdx = -1;
  let lastTs = 0;

  let prefetched = null;
  let prefetchedUrl = null;

  const esc = (s) => (w.Utils?.escapeHtml ? w.Utils.escapeHtml(String(s || '')) : String(s || ''));

  function readLyricsViewMode() {
    const saved = String(localStorage.getItem(LS_VIEW) || '');
    return (saved === 'normal' || saved === 'hidden' || saved === 'expanded') ? saved : 'normal';
  }

  function readAnimationEnabled() {
    return localStorage.getItem(LS_ANIM) === '1';
  }

  function writeLyricsViewMode(mode) {
    const m = (mode === 'hidden' || mode === 'expanded') ? mode : 'normal';
    try { localStorage.setItem(LS_VIEW, m); } catch {}
    return m;
  }

  function writeAnimationEnabled(on) {
    try { localStorage.setItem(LS_ANIM, on ? '1' : '0'); } catch {}
    return !!on;
  }

  function get404Map() {
    try {
      const raw = sessionStorage.getItem(SS_404);
      const j = raw ? JSON.parse(raw) : {};
      return (j && typeof j === 'object') ? j : {};
    } catch {
      return {};
    }
  }

  function mark404(url) {
    const u = String(url || '').trim();
    if (!u) return;
    try {
      const m = get404Map();
      m[u] = Date.now();

      const keys = Object.keys(m);
      if (keys.length > 100) {
        keys.sort((a, b) => m[a] - m[b]).slice(0, 50).forEach((k) => { delete m[k]; });
      }

      sessionStorage.setItem(SS_404, JSON.stringify(m));
    } catch {}
  }

  function is404(url) {
    const u = String(url || '').trim();
    if (!u) return true;
    try { return !!get404Map()[u]; } catch { return false; }
  }

  function cacheKey(url) {
    return `${SS_CACHE_PREFIX}${String(url || '').trim()}`;
  }

  function readSessionJson(url) {
    const key = cacheKey(url);
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return { ok: false };
      const parsed = JSON.parse(raw);
      return { ok: true, value: parsed };
    } catch {
      try { sessionStorage.removeItem(key); } catch {}
      return { ok: false };
    }
  }

  function writeSessionJson(url, value) {
    const key = cacheKey(url);
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function checkTrackHasLyrics(track) {
    if (!track) return false;
    if (track.hasLyrics === false) return false;
    if (track.hasLyrics === true) return true;
    return !!track.lyrics;
  }

  function isLyricsKnownMissingFast(lyricsUrl) {
    const url = String(lyricsUrl || '').trim();
    if (!url) return true;
    if (is404(url)) return true;

    const cached = readSessionJson(url);
    if (!cached.ok) return false;
    return cached.value === null || cached.value === '__NO_LYRICS__';
  }

  function parseJsonLyrics(arr) {
    const out = [];
    const list = Array.isArray(arr) ? arr : [];

    for (const it of list) {
      if (!it) continue;
      const time = Number(it.time);
      if (!Number.isFinite(time)) continue;
      const text = String(it.line || it.text || '').trim();
      if (!text) continue;
      out.push({ time, text });
    }

    out.sort((a, b) => a.time - b.time);
    currentLyrics = out;
    hasTimedLyricsForCurrentTrack = out.length > 0;
  }

  function setLyricsAvailability(enabled) {
    const playerBlock = document.getElementById('lyricsplayerblock');
    if (!playerBlock) return;

    const lyricsWindow = playerBlock.querySelector('#lyrics-window');
    const lyricsBtn = playerBlock.querySelector('#lyrics-toggle-btn');
    const animBtn = playerBlock.querySelector('#animation-btn');
    const karaokeBtn = playerBlock.querySelector('#lyrics-text-btn');
    const bg = playerBlock.querySelector('.lyrics-animated-bg');
    const container = document.getElementById('lyrics');

    if (lyricsWindow) lyricsWindow.style.display = enabled ? '' : 'none';

    const setDisabled = (el, disabled) => {
      if (!el) return;
      el.classList.toggle('disabled', !!disabled);
      el.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      el.setAttribute('tabindex', disabled ? '-1' : '0');
      el.style.pointerEvents = disabled ? 'none' : '';
    };

    setDisabled(lyricsBtn, !enabled);
    setDisabled(animBtn, !enabled);

    if (karaokeBtn) {
      const track = w.playerCore?.getCurrentTrack?.();
      const hasFulltext = !!track?.fulltext;
      const hasTimed = enabled && hasTimedLyricsForCurrentTrack && currentLyrics.length > 0;
      const karaokeEnabled = hasFulltext || hasTimed;

      karaokeBtn.classList.toggle('disabled', !karaokeEnabled);
      karaokeBtn.style.pointerEvents = karaokeEnabled ? '' : 'none';
      karaokeBtn.style.opacity = karaokeEnabled ? '' : '0.4';
    }

    if (!enabled) {
      animationEnabled = writeAnimationEnabled(false);
      if (bg) bg.classList.remove('active');
      if (animBtn) animBtn.classList.remove('active');

      lyricsViewMode = writeLyricsViewMode('hidden');
      if (container) container.innerHTML = '';
    } else {
      lyricsViewMode = readLyricsViewMode();
      animationEnabled = readAnimationEnabled();

      if (animBtn) animBtn.classList.toggle('active', animationEnabled);
      if (bg) bg.classList.toggle('active', animationEnabled && lyricsViewMode !== 'hidden');
    }

    renderLyricsViewMode();
  }

  function renderLyricsViewMode() {
    const playerBlock = document.getElementById('lyricsplayerblock');
    if (!playerBlock) return;

    const lyricsWindow = playerBlock.querySelector('#lyrics-window');
    const btn = playerBlock.querySelector('#lyrics-toggle-btn');
    if (!lyricsWindow || !btn) return;

    lyricsWindow.classList.remove('lyrics-normal', 'lyrics-hidden', 'lyrics-expanded');
    btn.classList.remove('lyrics-normal', 'lyrics-hidden', 'lyrics-expanded');

    const cls = `lyrics-${lyricsViewMode}`;
    lyricsWindow.classList.add(cls);
    btn.classList.add(cls);

    const bg = playerBlock.querySelector('.lyrics-animated-bg');
    const animBtn = playerBlock.querySelector('#animation-btn');

    if (lyricsViewMode === 'hidden') {
      bg?.classList.remove('active');
      animBtn?.classList.remove('active');
    } else if (animationEnabled) {
      bg?.classList.add('active');
      animBtn?.classList.add('active');
    }
  }

  function renderLyrics(position) {
    const container = document.getElementById('lyrics');
    if (!container) return;

    if (!Array.isArray(currentLyrics) || currentLyrics.length === 0) {
      container.innerHTML = '<div class="lyrics-placeholder">Текст не найден</div>';
      return;
    }

    const firstLineTime = currentLyrics[0]?.time || 0;
    const COUNTDOWN_THRESHOLD = 5;

    const windowSize = (lyricsViewMode === 'expanded') ? 9 : 5;
    const centerLine = Math.floor(windowSize / 2);

    if (position < firstLineTime && firstLineTime > COUNTDOWN_THRESHOLD) {
      const remaining = firstLineTime - position;
      const secondsLeft = Math.ceil(remaining);
      if (remaining < 1) {
        container.innerHTML = `<div class="lyrics-countdown fade-out" style="opacity:${remaining.toFixed(2)};">${secondsLeft}</div>`;
        return;
      }
      container.innerHTML = `<div class="lyrics-countdown">${secondsLeft}</div>`;
      return;
    }

    let activeIdx = -1;
    for (let i = 0; i < currentLyrics.length; i++) {
      if (position >= currentLyrics[i].time) activeIdx = i;
      else break;
    }

    const start = Math.max(0, activeIdx - centerLine);
    const padTop = Math.max(0, centerLine - activeIdx);

    const rows = [];
    for (let p = 0; p < padTop; p++) rows.push('<div class="lyrics-window-line"></div>');

    for (let i = start; i < Math.min(currentLyrics.length, start + windowSize - padTop); i++) {
      const cls = (i === activeIdx) ? 'lyrics-window-line active' : 'lyrics-window-line';
      rows.push(`<div class="${cls}">${esc(currentLyrics[i]?.text || '')}</div>`);
    }

    while (rows.length < windowSize) rows.push('<div class="lyrics-window-line"></div>');
    container.innerHTML = rows.join('');
  }

  function renderLyricsEnhanced(position, opts = {}) {
    if (lyricsViewMode === 'hidden') return;
    if (opts && opts.inMiniMode) return;
    if (!Array.isArray(currentLyrics) || currentLyrics.length === 0) return;

    let activeIdx = -1;
    for (let i = 0; i < currentLyrics.length; i++) {
      if (position >= currentLyrics[i].time) activeIdx = i;
      else break;
    }

    const now = Date.now();
    if (activeIdx === lastIdx && (now - lastTs) < LYRICS_MIN_INTERVAL) return;

    lastIdx = activeIdx;
    lastTs = now;

    renderLyrics(position);
  }

  async function fetchLyricsJson(url) {
    const u = String(url || '').trim();
    if (!u) return { ok: false, reason: 'noUrl' };
    if (is404(u)) return { ok: false, reason: '404cached' };

    // session cache
    const cached = readSessionJson(u);
    if (cached.ok) {
      if (cached.value === '__NO_LYRICS__' || cached.value === null) return { ok: false, reason: 'noLyricsCached' };
      if (Array.isArray(cached.value)) return { ok: true, data: cached.value, source: 'session' };
      // если структура сломана — сбросим
      writeSessionJson(u, '__NO_LYRICS__');
      return { ok: false, reason: 'badCache' };
    }

    try {
      const r = await fetch(u, { cache: 'force-cache', headers: { Accept: 'application/json' } });
      if (!r.ok) {
        if (r.status === 404) mark404(u);
        writeSessionJson(u, '__NO_LYRICS__');
        return { ok: false, reason: `http:${r.status}` };
      }

      const j = await r.json();
      if (!Array.isArray(j)) {
        writeSessionJson(u, '__NO_LYRICS__');
        return { ok: false, reason: 'notArray' };
      }

      writeSessionJson(u, j);
      return { ok: true, data: j, source: 'network' };
    } catch (e) {
      return { ok: false, reason: String(e?.message || e) };
    }
  }

  async function prefetchNextTrackLyrics() {
    prefetched = null;
    prefetchedUrl = null;

    const pc = w.playerCore;
    if (!pc) return;

    const nextIndex = pc.getNextIndex?.();
    if (!Number.isFinite(nextIndex) || nextIndex < 0) return;

    const playlist = pc.getPlaylistSnapshot?.() || [];
    const nextTrack = playlist[nextIndex];
    const url = String(nextTrack?.lyrics || '').trim();

    if (!url) return;
    if (isLyricsKnownMissingFast(url)) return;

    const r = await fetchLyricsJson(url);
    if (r.ok && Array.isArray(r.data)) {
      prefetched = r.data;
      prefetchedUrl = url;
    }
  }

  async function loadLyrics(url) {
    currentLyrics = [];
    hasTimedLyricsForCurrentTrack = false;
    lastIdx = -1;
    lastTs = 0;

    const container = document.getElementById('lyrics');
    if (!container) return;

    const u = String(url || '').trim();
    if (!u) return void setLyricsAvailability(false);
    if (is404(u)) return void setLyricsAvailability(false);

    // prefetched fast path
    if (prefetchedUrl === u && Array.isArray(prefetched)) {
      parseJsonLyrics(prefetched);
      prefetched = null;
      prefetchedUrl = null;

      setLyricsAvailability(hasTimedLyricsForCurrentTrack);
      renderLyricsViewMode();
      prefetchNextTrackLyrics();
      return;
    }

    container.innerHTML = '<div class="lyrics-spinner"></div>';

    const r = await fetchLyricsJson(u);
    if (!r.ok || !Array.isArray(r.data)) {
      setLyricsAvailability(false);
      prefetchNextTrackLyrics();
      return;
    }

    parseJsonLyrics(r.data);
    setLyricsAvailability(hasTimedLyricsForCurrentTrack);
    renderLyricsViewMode();
    prefetchNextTrackLyrics();
  }

  function onTrackChange(track) {
    try {
      const has = checkTrackHasLyrics(track);
      const knownMissing = (!track?.lyrics) ? true : isLyricsKnownMissingFast(track.lyrics);
      if (!has || knownMissing) {
        hasTimedLyricsForCurrentTrack = false;
        currentLyrics = [];
        setLyricsAvailability(false);
        return;
      }
    } catch {}

    loadLyrics(track?.lyrics).then(() => {
      if (hasTimedLyricsForCurrentTrack && lyricsViewMode !== 'hidden') renderLyrics(0);
    });
  }

  function toggleLyricsView() {
    const modes = ['normal', 'hidden', 'expanded'];
    const i = modes.indexOf(lyricsViewMode);
    lyricsViewMode = writeLyricsViewMode(modes[(i === -1 ? 0 : (i + 1) % modes.length)]);
    renderLyricsViewMode();

    const msgMap = {
      normal: '📝 Обычный вид лирики',
      hidden: '🚫 Лирика скрыта',
      expanded: '📖 Расширенный вид лирики'
    };
    w.NotificationSystem?.info?.(msgMap[lyricsViewMode] || '');
  }

  function toggleAnimation() {
    if (lyricsViewMode === 'hidden') return void w.NotificationSystem?.info?.('Лирика скрыта — анимация недоступна');

    animationEnabled = writeAnimationEnabled(!animationEnabled);

    const playerBlock = document.getElementById('lyricsplayerblock');
    const bg = playerBlock?.querySelector?.('.lyrics-animated-bg');
    const btn = document.getElementById('animation-btn');

    if (bg) bg.classList.toggle('active', animationEnabled);
    if (btn) btn.classList.toggle('active', animationEnabled);

    w.NotificationSystem?.info?.(animationEnabled ? '✨ Анимация лирики: ВКЛ' : '✨ Анимация лирики: ВЫКЛ');
  }

  function applyMiniMode() {
    const playerBlock = document.getElementById('lyricsplayerblock');
    if (!playerBlock) return;

    const lyricsWindow = playerBlock.querySelector('#lyrics-window');
    if (lyricsWindow) {
      lyricsWindow.style.transition = 'none';
      lyricsWindow.style.display = 'none';
      setTimeout(() => { if (lyricsWindow) lyricsWindow.style.transition = ''; }, 50);
    }

    const toggleBtn = playerBlock.querySelector('.lyrics-toggle-btn');
    if (toggleBtn && toggleBtn.style) toggleBtn.style.display = 'none';

    animationEnabled = writeAnimationEnabled(false);
    playerBlock.querySelector('.lyrics-animated-bg')?.classList.remove('active');
    document.getElementById('animation-btn')?.classList.remove('active');
  }

  function restoreFromMiniMode(saved) {
    const playerBlock = document.getElementById('lyricsplayerblock');
    if (!playerBlock) return;

    const lyricsWindow = playerBlock.querySelector('#lyrics-window');
    if (lyricsWindow) {
      lyricsWindow.style.transition = 'none';
      lyricsWindow.style.display = '';
      setTimeout(() => { if (lyricsWindow) lyricsWindow.style.transition = ''; }, 50);
    }

    const toggleBtn = playerBlock.querySelector('.lyrics-toggle-btn');
    if (toggleBtn) toggleBtn.style.display = '';

    if (!hasTimedLyricsForCurrentTrack) {
      lyricsViewMode = writeLyricsViewMode('hidden');
      animationEnabled = writeAnimationEnabled(false);
      setLyricsAvailability(false);
      return;
    }

    if (saved && (saved.viewMode === 'normal' || saved.viewMode === 'hidden' || saved.viewMode === 'expanded')) {
      lyricsViewMode = writeLyricsViewMode(saved.viewMode);
    } else {
      lyricsViewMode = readLyricsViewMode();
    }

    if (saved && typeof saved.animationEnabled === 'boolean') {
      animationEnabled = writeAnimationEnabled(saved.animationEnabled);
    } else {
      animationEnabled = readAnimationEnabled();
    }

    renderLyricsViewMode();
  }

  function restoreSettingsIntoDom() {
    lyricsViewMode = readLyricsViewMode();
    animationEnabled = readAnimationEnabled();
    renderLyricsViewMode();
  }

  function getState() {
    return { lyricsViewMode, animationEnabled, hasTimedLyricsForCurrentTrack };
  }

  function getMiniSaveState() {
    return {
      viewMode: (lyricsViewMode !== 'hidden') ? lyricsViewMode : 'normal',
      animationEnabled: !!animationEnabled
    };
  }

  w.LyricsController = {
    getState,
    getCurrentLyrics() { return currentLyrics; },
    getCurrentLyricsLines() { return Array.isArray(currentLyrics) ? currentLyrics.map(l => ({ line: l.text })) : []; },

    restoreSettingsIntoDom,
    onTrackChange,
    onTick: renderLyricsEnhanced,

    toggleLyricsView,
    toggleAnimation,

    getMiniSaveState,
    applyMiniMode,
    restoreFromMiniMode,

    checkTrackHasLyrics,
    isLyricsKnownMissingFast,
  };
})();
