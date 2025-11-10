// scripts/ui/lyrics-runtime.js (ESM)
// Вынос функций лирики и состояния в отдельный модуль.
// Совместимость: все функции пробрасываются в window.*

(function(){
  // Состояние лирики (глобально)
  let currentLyrics = [];
  let lyricsViewMode = 'normal';

  // Троттлинг для подсветки
  let __lyricsLastIdx = -1;
  let __lyricsLastTs = 0;
  const __lyricsMinIntervalBase = 250; // мс

  function restoreLyricsViewMode() {
    try {
      const saved = localStorage.getItem('lyricsViewMode');
      if (saved && ['normal','hidden','expanded'].includes(saved)) {
        lyricsViewMode = saved;
      }
    } catch {}
  }
  function saveLyricsViewMode() {
    try { localStorage.setItem('lyricsViewMode', lyricsViewMode); } catch {}
  }
  restoreLyricsViewMode();

  function renderLyrics(time) {
    if (!Array.isArray(currentLyrics) || currentLyrics.length === 0) {
      const el = document.getElementById('lyrics');
      if (el) el.innerHTML = '';
      return;
    }
    const windowSize = (lyricsViewMode === 'expanded') ? 9 : 5;
    const centerLine = Math.floor(windowSize / 2);
    let active = 0;
    for (let i = 0; i < currentLyrics.length; i++) {
      if (time >= currentLyrics[i].time) active = i;
      else break;
    }
    const start = Math.max(0, active - centerLine);
    const padTop = Math.max(0, centerLine - active);
    const rows = [];
    for (let p = 0; p < padTop; ++p) rows.push('<div class="lyrics-window-line"></div>');
    for (let i = start; i < Math.min(currentLyrics.length, start + windowSize - padTop); i++) {
      const cls = (i === active) ? 'lyrics-window-line active' : 'lyrics-window-line';
      const line = (currentLyrics[i] && currentLyrics[i].line) ? currentLyrics[i].line : '';
      rows.push(`<div class="${cls}">${line}</div>`);
    }
    while (rows.length < windowSize) rows.push('<div class="lyrics-window-line"></div>');
    const lyricsEl = document.getElementById('lyrics');
    if (lyricsEl) lyricsEl.innerHTML = rows.join('');
  }

  function renderLyricsEnhanced(t) {
    if (lyricsViewMode === 'hidden' || !Array.isArray(currentLyrics) || currentLyrics.length === 0) return;

    const ecoIntervalMs = (window.ultraEcoEnabled || document.hidden)
      ? Math.max(500, window.__uiUpdateMinIntervalMs || 1000)
      : __lyricsMinIntervalBase;

    // определяем активную строку
    let idx = 0;
    for (let i = 0; i < currentLyrics.length; i++) {
      if (t >= currentLyrics[i].time) idx = i;
      else break;
    }
    const now = performance.now();
    if (idx === __lyricsLastIdx && (now - __lyricsLastTs) < ecoIntervalMs) return;

    __lyricsLastIdx = idx;
    __lyricsLastTs = now;
    renderLyrics(t);
  }

  function toggleLyricsView() {
    const modes = ['normal','hidden','expanded'];
    lyricsViewMode = modes[(modes.indexOf(lyricsViewMode) + 1) % modes.length];
    applyLyricsViewMode();
    saveLyricsViewMode();
    const msg = {
      normal: '📝 Обычный вид лирики',
      hidden: '🚫 Лирика скрыта',
      expanded: '📖 Расширенный вид лирики'
    }[lyricsViewMode];
    try { window.NotificationSystem && window.NotificationSystem.info(msg); } catch {}
  }

  function applyLyricsViewMode() {
    const w = document.getElementById('lyrics-window');
    const btn = document.querySelector('.lyrics-toggle-btn');
    if (!w || !btn) return;
    w.classList.remove('lyrics-normal','lyrics-hidden','lyrics-expanded');
    btn.classList.remove('lyrics-normal','lyrics-hidden','lyrics-expanded');
    w.classList.add(`lyrics-${lyricsViewMode}`);
    btn.classList.add(`lyrics-${lyricsViewMode}`);
    if (lyricsViewMode === 'hidden') {
      try { typeof window.applyAnimationState === 'function' && window.applyAnimationState(false); } catch {}
    }
  }

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  // Утилита: загрузка JSON-лирики (оставим тут для удобства)
  async function loadLyrics(file) {
    try {
      const r = await fetch(file);
      const js = await r.json();
      currentLyrics = Array.isArray(js) ? js : [];
      renderLyrics(0);
    } catch {
      currentLyrics = [];
    }
  }

  // Совместимость: экспорт в window.*
  window.currentLyrics = currentLyrics;
  Object.defineProperty(window, 'currentLyrics', {
    get(){ return currentLyrics; },
    set(v){ currentLyrics = Array.isArray(v) ? v : []; }
  });
  window.lyricsViewMode = lyricsViewMode;
  Object.defineProperty(window, 'lyricsViewMode', {
    get(){ return lyricsViewMode; },
    set(v){ if (['normal','hidden','expanded'].includes(v)) { lyricsViewMode = v; saveLyricsViewMode(); } }
  });

  window.renderLyrics = renderLyrics;
  window.renderLyricsEnhanced = renderLyricsEnhanced;
  window.toggleLyricsView = toggleLyricsView;
  window.applyLyricsViewMode = applyLyricsViewMode;
  window.formatTime = formatTime;
  window.loadLyrics = loadLyrics;
})();
