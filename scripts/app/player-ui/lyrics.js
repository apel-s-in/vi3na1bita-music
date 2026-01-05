// scripts/app/player-ui/lyrics.js
// LyricsController — единый модуль лирики для PlayerUI.
// Инварианты: не трогает воспроизведение (no stop/play/seek), только UI и fetch/cache.

(function LyricsControllerModule() {
  'use strict';

  const w = window;

  const LYRICS_404_CACHE_KEY = 'lyrics_404_cache:v1';
  const LYRICS_MIN_INTERVAL = 250;

  let currentLyrics = [];
  let hasTimedLyricsForCurrentTrack = false;

  // view state хранится в localStorage, но модуль держит текущие значения,
  // чтобы PlayerUI мог быстро рендерить.
  let lyricsViewMode = 'normal'; // 'normal' | 'hidden' | 'expanded'
  let animationEnabled = false;

  // throttling
  let lyricsLastIdx = -1;
  let lyricsLastTs = 0;

  // prefetch cache
  let prefetchedLyrics = null;
  let prefetchedLyricsUrl = null;

  function escapeHtml(s) {
    return w.Utils?.escapeHtml ? w.Utils.escapeHtml(String(s || '')) : String(s || '');
  }

  function readLyricsViewMode() {
    const saved = localStorage.getItem('lyricsViewMode');
    if (saved && (saved === 'normal' || saved === 'hidden' || saved === 'expanded')) return saved;
    return 'normal';
  }

  function readAnimationEnabled() {
    return localStorage.getItem('lyricsAnimationEnabled') === '1';
  }

  function writeLyricsViewMode(mode) {
    const m = (mode === 'hidden' || mode === 'expanded') ? mode : 'normal';
    try { localStorage.setItem('lyricsViewMode', m); } catch {}
    return m;
  }

  function writeAnimationEnabled(on) {
    try { localStorage.setItem('lyricsAnimationEnabled', on ? '1' : '0'); } catch {}
    return !!on;
  }

  function getLyrics404Cache() {
    try {
      const raw = sessionStorage.getItem(LYRICS_404_CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function setLyrics404Cache(url) {
    try {
      const cache = getLyrics404Cache();
      cache[url] = Date.now();

      // ограничим размер
      const keys = Object.keys(cache);
      if (keys.length > 100) {
        const oldest = keys.sort((a, b) => cache[a] - cache[b]).slice(0, 50);
        oldest.forEach(k => delete cache[k]);
      }

      sessionStorage.setItem(LYRICS_404_CACHE_KEY, JSON.stringify(cache));
    } catch {}
  }

  function isLyrics404Cached(url) {
    const cache = getLyrics404Cache();
    return !!cache[url];
  }

  function isLyricsKnownMissingFast(lyricsUrl) {
    const url = String(lyricsUrl || '').trim();
    if (!url) return true;

    if (isLyrics404Cached(url)) return true;

    // sessionStorage marker
    try {
      const cacheKey = `lyrics_cache_${url}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (!cached) return false;
      const parsed = JSON.parse(cached);
      return (parsed === null || parsed === '__NO_LYRICS__');
    } catch {
      return false;
    }
  }

  function checkTrackHasLyrics(track) {
    if (!track) return false;
    if (track.hasLyrics === false) return false;
    if (track.hasLyrics === true) return true;
    return !!track.lyrics;
  }

  function detectLyricsFormat(url, content) {
    if (url) {
      const lower = String(url).toLowerCase();
      if (lower.endsWith('.lrc')) return 'lrc';
      if (lower.endsWith('.json')) return 'json';
      if (lower.endsWith('.txt')) return 'lrc';
    }

    const trimmed = String(content || '').trim();
    if (!trimmed) return 'unknown';

    // JSON: начинается с [ или {
    if (trimmed[0] === '[' || trimmed[0] === '{') {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch {}
    }

    // LRC: есть таймкоды [mm:ss...]
    if (/$$\d{1,2}:\d{2}([.:]\d{1,3})?$$/.test(trimmed)) return 'lrc';

    return 'unknown';
  }

  function parseLyricsInto(source, targetArray) {
    targetArray.length = 0;

    if (Array.isArray(source)) {
      for (const item of source) {
        if (!item) continue;
        const time = Number(item.time);
        if (!Number.isFinite(time)) continue;
        const text = String(item.line || item.text || '').trim();
        if (!text) continue;
        targetArray.push({ time, text });
      }
      targetArray.sort((a, b) => a.time - b.time);
      return;
    }

    const text = String(source || '');
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // метаданные [ar:], [ti:], etc.
      if (/^$$[a-z]{2}:(.*)$$$/i.test(trimmed)) continue;

      // [mm:ss.xx]text  OR [mm:ss]text
      const m = trimmed.match(/^$$(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$$(.*)$/);
      if (!m) continue;

      const mm = parseInt(m[1], 10);
      const ss = parseInt(m[2], 10);
      const fracRaw = m[3];
      const tail = String(m[4] || '').trim();

      if (!Number.isFinite(mm) || !Number.isFinite(ss)) continue;
      if (!tail) continue;

      let t = mm * 60 + ss;
      if (fracRaw) {
        const fracNum = parseInt(fracRaw, 10);
        if (Number.isFinite(fracNum)) {
          t += (fracRaw.length === 3) ? (fracNum / 1000) : (fracNum / 100);
        }
      }

      targetArray.push({ time: t, text: tail });
    }

    targetArray.sort((a, b) => a.time - b.time);
  }

  function parseLyrics(source) {
    const out = [];
    parseLyricsInto(source, out);
    currentLyrics = out;
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

    if (lyricsBtn) {
      lyricsBtn.classList.toggle('disabled', !enabled);
      lyricsBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
      lyricsBtn.setAttribute('tabindex', enabled ? '0' : '-1');
      lyricsBtn.style.pointerEvents = enabled ? '' : 'none';
    }

    if (animBtn) {
      animBtn.classList.toggle('disabled', !enabled);
      animBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
      animBtn.setAttribute('tabindex', enabled ? '0' : '-1');
      animBtn.style.pointerEvents = enabled ? '' : 'none';
    }

    if (karaokeBtn) {
      const track = w.playerCore?.getCurrentTrack?.();
      const hasFulltext = !!(track && track.fulltext);
      const hasTimedLyrics = enabled && hasTimedLyricsForCurrentTrack && currentLyrics.length > 0;
      const karaokeEnabled = hasFulltext || hasTimedLyrics;

      karaokeBtn.classList.toggle('disabled', !karaokeEnabled);
      karaokeBtn.style.pointerEvents = karaokeEnabled ? '' : 'none';
      karaokeBtn.style.opacity = karaokeEnabled ? '' : '0.4';
    }

    if (!enabled) {
      animationEnabled = false;
      if (bg) bg.classList.remove('active');
      if (animBtn) animBtn.classList.remove('active');

      lyricsViewMode = 'hidden';
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
        container.innerHTML = `
          <div class="lyrics-countdown fade-out" style="opacity: ${remaining.toFixed(2)};">
            ${secondsLeft}
          </div>
        `;
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
      const text = currentLyrics[i]?.text || '';
      rows.push(`<div class="${cls}">${escapeHtml(text)}</div>`);
    }

    while (rows.length < windowSize) rows.push('<div class="lyrics-window-line"></div>');

    container.innerHTML = rows.join('');
  }

  function renderLyricsEnhanced(position, opts = {}) {
    const isHidden = (lyricsViewMode === 'hidden');
    if (isHidden) return;
    if (!!opts.inMiniMode) return;
    if (!Array.isArray(currentLyrics) || currentLyrics.length === 0) return;

    let activeIdx = -1;
    for (let i = 0; i < currentLyrics.length; i++) {
      if (position >= currentLyrics[i].time) activeIdx = i;
      else break;
    }

    const now = Date.now();
    if (activeIdx === lyricsLastIdx && (now - lyricsLastTs) < LYRICS_MIN_INTERVAL) return;

    lyricsLastIdx = activeIdx;
    lyricsLastTs = now;

    renderLyrics(position);
  }

  async function prefetchNextTrackLyrics() {
    prefetchedLyrics = null;
    prefetchedLyricsUrl = null;

    const pc = w.playerCore;
    if (!pc) return;

    const nextIndex = pc.getNextIndex?.();
    if (!Number.isFinite(nextIndex) || nextIndex < 0) return;

    const playlist = pc.getPlaylistSnapshot?.() || [];
    const nextTrack = playlist[nextIndex];
    if (!nextTrack || !nextTrack.lyrics) return;

    const lyricsUrl = String(nextTrack.lyrics || '').trim();
    if (!lyricsUrl) return;

    if (isLyrics404Cached(lyricsUrl)) return;

    const cacheKey = `lyrics_cache_${lyricsUrl}`;
    const cached = sessionStorage.getItem(cacheKey);

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed !== '__NO_LYRICS__') {
          const temp = [];
          parseLyricsInto(parsed, temp);
          if (temp.length > 0) {
            prefetchedLyrics = temp;
            prefetchedLyricsUrl = lyricsUrl;
          }
        }
      } catch {}
      return;
    }

    try {
      const response = await fetch(lyricsUrl, {
        cache: 'force-cache',
        headers: { Accept: 'application/json, text/plain, */*' }
      });

      if (!response.ok) {
        if (response.status === 404) setLyrics404Cache(lyricsUrl);
        return;
      }

      const bodyText = await response.text();
      const format = detectLyricsFormat(lyricsUrl, bodyText);

      let dataToCache = bodyText;
      const tempLyrics = [];

      if (format === 'json') {
        try {
          const asJson = JSON.parse(bodyText);
          if (Array.isArray(asJson)) {
            dataToCache = asJson;
            parseLyricsInto(asJson, tempLyrics);
          }
        } catch {}
      } else {
        parseLyricsInto(bodyText, tempLyrics);
      }

      try { sessionStorage.setItem(cacheKey, JSON.stringify(dataToCache)); } catch {}

      if (tempLyrics.length > 0) {
        prefetchedLyrics = tempLyrics;
        prefetchedLyricsUrl = lyricsUrl;
      }
    } catch {}
  }

  async function loadLyrics(lyricsUrl) {
    currentLyrics = [];
    lyricsLastIdx = -1;

    hasTimedLyricsForCurrentTrack = false;

    const container = document.getElementById('lyrics');
    if (!container) return;

    if (!lyricsUrl) {
      const track = w.playerCore?.getCurrentTrack?.();
      if (!checkTrackHasLyrics(track)) {
        setLyricsAvailability(false);
        return;
      }
    }

    const url = String(lyricsUrl || '').trim();
    if (!url) {
      setLyricsAvailability(false);
      return;
    }

    if (isLyrics404Cached(url)) {
      setLyricsAvailability(false);
      return;
    }

    // prefetched
    if (prefetchedLyricsUrl === url && prefetchedLyrics !== null) {
      currentLyrics = prefetchedLyrics;
      prefetchedLyrics = null;
      prefetchedLyricsUrl = null;

      if (currentLyrics.length > 0) {
        hasTimedLyricsForCurrentTrack = true;
        setLyricsAvailability(true);
        renderLyricsViewMode();
      } else {
        setLyricsAvailability(false);
      }

      prefetchNextTrackLyrics();
      return;
    }

    // sessionStorage cache
    const cacheKey = `lyrics_cache_${url}`;
    const cached = sessionStorage.getItem(cacheKey);

    if (cached) {
      try {
        const parsed = JSON.parse(cached);

        if (parsed === null || parsed === '__NO_LYRICS__') {
          setLyricsAvailability(false);
          prefetchNextTrackLyrics();
          return;
        }

        parseLyrics(parsed);

        if (!Array.isArray(currentLyrics) || currentLyrics.length === 0) {
          setLyricsAvailability(false);
          prefetchNextTrackLyrics();
          return;
        }

        hasTimedLyricsForCurrentTrack = true;
        setLyricsAvailability(true);
        renderLyricsViewMode();
        prefetchNextTrackLyrics();
        return;
      } catch {
        try { sessionStorage.removeItem(cacheKey); } catch {}
      }
    }

    container.innerHTML = '<div class="lyrics-spinner"></div>';

    try {
      const response = await fetch(url, {
        cache: 'force-cache',
        headers: { Accept: 'application/json, text/plain, */*' }
      });

      if (!response.ok) {
        if (response.status === 404) setLyrics404Cache(url);
        setLyricsAvailability(false);
        prefetchNextTrackLyrics();
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      const bodyText = await response.text();
      const format = detectLyricsFormat(url, bodyText);

      if (format === 'json' || contentType.includes('application/json')) {
        try {
          const asJson = JSON.parse(bodyText);
          if (!Array.isArray(asJson)) {
            try { sessionStorage.setItem(cacheKey, JSON.stringify('__NO_LYRICS__')); } catch {}
            setLyricsAvailability(false);
            prefetchNextTrackLyrics();
            return;
          }

          try { sessionStorage.setItem(cacheKey, JSON.stringify(asJson)); } catch {}
          parseLyrics(asJson);
        } catch {
          try { sessionStorage.setItem(cacheKey, JSON.stringify('__NO_LYRICS__')); } catch {}
          setLyricsAvailability(false);
          prefetchNextTrackLyrics();
          return;
        }
      } else {
        try { sessionStorage.setItem(cacheKey, JSON.stringify(bodyText)); } catch {}
        parseLyrics(bodyText);
      }

      if (!currentLyrics.length) {
        setLyricsAvailability(false);
        prefetchNextTrackLyrics();
        return;
      }

      hasTimedLyricsForCurrentTrack = true;
      setLyricsAvailability(true);
      renderLyricsViewMode();
      prefetchNextTrackLyrics();
    } catch {
      setLyricsAvailability(false);
      prefetchNextTrackLyrics();
    }
  }

  function onTrackChange(track) {
    // до fetch: быстро выставляем availability (чтобы не мигало)
    try {
      const has = checkTrackHasLyrics(track);
      const knownMissing = (!track?.lyrics) ? true : isLyricsKnownMissingFast(track.lyrics);

      if (!has || knownMissing) {
        hasTimedLyricsForCurrentTrack = false;
        setLyricsAvailability(false);
        return;
      }
    } catch {
      // если что-то упало — не блокируем, попробуем загрузить
    }

    loadLyrics(track?.lyrics).then(() => {
      if (hasTimedLyricsForCurrentTrack && lyricsViewMode !== 'hidden') {
        renderLyrics(0);
      }
    });
  }

  function toggleLyricsView() {
    const modes = ['normal', 'hidden', 'expanded'];
    const currentIndex = modes.indexOf(lyricsViewMode);
    const nextIndex = (currentIndex === -1 ? 0 : (currentIndex + 1) % modes.length);
    lyricsViewMode = writeLyricsViewMode(modes[nextIndex]);

    renderLyricsViewMode();

    const msgMap = {
      normal: '📝 Обычный вид лирики',
      hidden: '🚫 Лирика скрыта',
      expanded: '📖 Расширенный вид лирики'
    };
    const msg = msgMap[lyricsViewMode];
    if (msg && w.NotificationSystem?.info) w.NotificationSystem.info(msg);
  }

  function toggleAnimation() {
    if (lyricsViewMode === 'hidden') {
      w.NotificationSystem?.info('Лирика скрыта — анимация недоступна');
      return;
    }

    animationEnabled = writeAnimationEnabled(!animationEnabled);

    const playerBlock = document.getElementById('lyricsplayerblock');
    const bg = playerBlock?.querySelector('.lyrics-animated-bg');
    const btn = document.getElementById('animation-btn');

    if (bg) bg.classList.toggle('active', animationEnabled);
    if (btn) btn.classList.toggle('active', animationEnabled);

    w.NotificationSystem?.info(animationEnabled ? '✨ Анимация лирики: ВКЛ' : '✨ Анимация лирики: ВЫКЛ');
  }

  function applyMiniMode() {
    // mini-mode по дизайну скрывает lyrics UI и отключает анимацию
    const playerBlock = document.getElementById('lyricsplayerblock');
    if (!playerBlock) return;

    const lyricsWindow = playerBlock.querySelector('#lyrics-window');
    if (lyricsWindow) {
      lyricsWindow.style.transition = 'none';
      lyricsWindow.style.display = 'none';
      setTimeout(() => {
        if (lyricsWindow) lyricsWindow.style.transition = '';
      }, 50);
    }

    const lyricsToggle = playerBlock.querySelector('.lyrics-toggle-btn');
    if (lyricsToggle) lyricsToggle.style.display = 'none';

    animationEnabled = false;
    const bg = playerBlock.querySelector('.lyrics-animated-bg');
    bg?.classList.remove('active');
    const animBtn = document.getElementById('animation-btn');
    if (animBtn) animBtn.classList.remove('active');
  }

  function restoreFromMiniMode(saved) {
    const playerBlock = document.getElementById('lyricsplayerblock');
    if (!playerBlock) return;

    const lyricsWindow = playerBlock.querySelector('#lyrics-window');
    if (lyricsWindow) {
      lyricsWindow.style.transition = 'none';
      lyricsWindow.style.display = '';
      setTimeout(() => {
        if (lyricsWindow) lyricsWindow.style.transition = '';
      }, 50);
    }

    const lyricsToggle = playerBlock.querySelector('.lyrics-toggle-btn');
    if (lyricsToggle) lyricsToggle.style.display = '';

    // Если у текущего трека нет таймкод-лирики — оставляем hidden и disabled
    if (!hasTimedLyricsForCurrentTrack) {
      lyricsViewMode = writeLyricsViewMode('hidden');
      animationEnabled = writeAnimationEnabled(false);
      setLyricsAvailability(false);
      return;
    }

    if (saved && saved.viewMode && (saved.viewMode === 'normal' || saved.viewMode === 'hidden' || saved.viewMode === 'expanded')) {
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
    return {
      lyricsViewMode,
      animationEnabled,
      hasTimedLyricsForCurrentTrack
    };
  }

  function getMiniSaveState() {
    // что сохранять при уходе в mini-mode
    return {
      viewMode: (lyricsViewMode !== 'hidden') ? lyricsViewMode : 'normal',
      animationEnabled: !!animationEnabled
    };
  }

  w.LyricsController = {
    // state + getters
    getState,
    getCurrentLyrics() { return currentLyrics; },
    getCurrentLyricsLines() {
      return Array.isArray(currentLyrics)
        ? currentLyrics.map(l => ({ line: l.text }))
        : [];
    },

    // lifecycle
    restoreSettingsIntoDom,
    onTrackChange,
    onTick: renderLyricsEnhanced,

    // ui actions
    toggleLyricsView,
    toggleAnimation,

    // mini-mode helpers
    getMiniSaveState,
    applyMiniMode,
    restoreFromMiniMode,

    // util exposed for PlayerUI pre-check
    checkTrackHasLyrics,
    isLyricsKnownMissingFast,
  };
})();
