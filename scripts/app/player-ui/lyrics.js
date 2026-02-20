// scripts/app/player-ui/lyrics.js
// LyricsController — Optimized JSON-only timed lyrics (v3.0)
// FIXES:
// 1. SyntaxError: Restored missing file endings (IIFE closure).
// 2. CPU Spikes: Eliminated the forced 250ms DOM rebuild. Updates DOM strictly on line change.
// 3. Offline Bug: Fixed permanent 'No Lyrics' caching when network is blocked by NetPolicy.
// 4. Memory & GC: Cached DOM references, removed redundant string/array allocations.

(function () {
  'use strict';

  const W = window, D = document, U = W.Utils;
  const LS = { VIEW: 'lyricsViewMode', ANIM: 'lyricsAnimationEnabled' };
  const SS = { C404: 'lyrics_404_cache:v2', PRE: 'lyrics_cache_' };
  const NO_LYR = '__NO_LYRICS__';

  let st = { list: [], has: false, mode: 'normal', anim: false, lIdx: -100, pref: null, prefUrl: null };
  const dom = { blk: null, win: null, lyr: null, bg: null, btnT: null, btnA: null, btnK: null };

  const esc = (s) => U?.escapeHtml ? U.escapeHtml(String(s||'')) : String(s||'');
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch {} };
  const sess = (k, v) => { try { if (v === undefined) { const r = sessionStorage.getItem(k); return r ? JSON.parse(r) : null; } sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };

  const c404 = {
    get: () => sess(SS.C404) || {},
    has: (u) => !!c404.get()[u],
    add: (u) => {
      const m = c404.get(); m[u] = Date.now();
      const k = Object.keys(m);
      if (k.length > 50) k.sort((a,b) => m[a]-m[b]).slice(0, 20).forEach(x => delete m[x]);
      sess(SS.C404, m);
    }
  };

  function initDom() {
    if (dom.blk) return true;
    dom.blk = D.getElementById('lyricsplayerblock');
    if (!dom.blk) return false;
    dom.win = dom.blk.querySelector('#lyrics-window');
    dom.lyr = dom.blk.querySelector('#lyrics');
    dom.bg = dom.blk.querySelector('.lyrics-animated-bg');
    dom.btnT = dom.blk.querySelector('#lyrics-toggle-btn');
    dom.btnA = dom.blk.querySelector('#animation-btn');
    dom.btnK = dom.blk.querySelector('#lyrics-text-btn');
    return true;
  }

  function init() {
    st.mode = ['normal','hidden','expanded'].includes(store(LS.VIEW)) ? store(LS.VIEW) : 'normal';
    st.anim = store(LS.ANIM) === '1';
  }

  function parse(arr) {
    st.list = (Array.isArray(arr) ? arr : [])
      .map(i => ({ time: Number(i?.time), text: String(i?.line || i?.text || '').trim() }))
      .filter(i => Number.isFinite(i.time) && i.text)
      .sort((a,b) => a.time - b.time);
    st.has = st.list.length > 0;
  }

  const _pending = new Map();

  async function fetchL(url) {
    const u = String(url || '').trim();
    if (!u || c404.has(u)) return null;

    const k = SS.PRE + u;
    const cached = sess(k);
    if (cached) return (cached === NO_LYR) ? null : cached;

    // Дедупликация запросов (убирает двойные 404 ошибки в консоли при инициализации трека)
    if (_pending.has(u)) return _pending.get(u);

    const p = (async () => {
      try {
        const r = await fetch(u, { cache: 'force-cache', headers: { Accept: 'application/json' } });
        if (!r.ok) { if (r.status === 404) c404.add(u); throw new Error(); }
        const j = await r.json();
        if (Array.isArray(j)) { sess(k, j); return j; }
      } catch {
        const netOk = W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine;
        if (!netOk) return null;
      }
      sess(k, NO_LYR);
      return null;
    })();

    _pending.set(u, p);
    const res = await p;
    _pending.delete(u);
    return res;
  }

  function updateUI() {
    if (!initDom() || !dom.win) return;
    const ok = st.has && st.mode !== 'hidden';

    dom.win.style.display = st.has ? '' : 'none';
    dom.win.className = `lyrics-${st.mode}`;

    if (dom.btnT) {
      dom.btnT.className = `lyrics-toggle-btn lyrics-${st.mode} ${st.has ? '' : 'disabled'}`;
      U.setAriaDisabled(dom.btnT, !st.has);
    }

    const anim = st.anim && ok;
    if (dom.btnA) {
      dom.btnA.classList.toggle('active', anim);
      dom.btnA.classList.toggle('disabled', !st.has);
    }
    if (dom.bg) dom.bg.classList.toggle('active', anim);

    if (dom.btnK) {
      const t = W.playerCore?.getCurrentTrack?.();
      const canText = ok || !!t?.fulltext;
      dom.btnK.classList.toggle('disabled', !canText);
      dom.btnK.style.pointerEvents = canText ? '' : 'none';
      dom.btnK.style.opacity = canText ? '' : '0.4';
    }

    if (!st.has && dom.lyr) dom.lyr.innerHTML = '<div class="lyrics-placeholder">Текст не найден</div>';
  }

  function render(pos) {
    if (!initDom() || !dom.lyr || !st.has) return;
    const first = st.list[0].time;

    if (pos < first && first > 5) {
      const rem = first - pos, sec = Math.ceil(rem);
      // Only re-render countdown if second changed or we need fade animation
      if (st.lIdx === -sec && rem >= 1) return;
      st.lIdx = -sec;
      const style = rem < 1 ? ` style="opacity:${rem.toFixed(2)}"` : '';
      const cls = rem < 1 ? ' fade-out' : '';
      dom.lyr.innerHTML = `<div class="lyrics-countdown${cls}"${style}>${sec}</div>`;
      return;
    }

    let idx = -1;
    for (let i = 0; i < st.list.length; i++) {
      if (pos >= st.list[i].time) idx = i; else break;
    }

    // CRITICAL FIX: Update DOM ONLY if the active line physically changed (Saves massive CPU loops)
    if (idx === st.lIdx) return;
    st.lIdx = idx;

    const winSz = (st.mode === 'expanded') ? 9 : 5;
    const half = (winSz - 1) / 2;
    const start = Math.max(0, idx - half);
    const padTop = Math.max(0, half - idx);
    
    let html = '';
    for (let i = 0; i < padTop; i++) html += '<div class="lyrics-window-line"></div>';
    const end = Math.min(st.list.length, start + winSz - padTop);
    for (let i = start; i < end; i++) {
      html += `<div class="lyrics-window-line${i === idx ? ' active' : ''}">${esc(st.list[i].text)}</div>`;
    }
    const drawn = padTop + (end - start);
    for (let i = drawn; i < winSz; i++) html += '<div class="lyrics-window-line"></div>';

    dom.lyr.innerHTML = html;
  }

  async function onTrackChange(t) {
    st.has = false; st.list = []; st.lIdx = -100;
    
    // Если явно указано что лирики нет (hasLyrics === false), даже не пытаемся качать
    if (!t?.lyrics || t.hasLyrics === false || c404.has(t.lyrics)) return updateUI();

    if (st.prefUrl === t.lyrics && st.pref) {
      parse(st.pref); st.pref = null;
    } else {
      initDom() && dom.lyr && (dom.lyr.innerHTML = '<div class="lyrics-spinner"></div>');
      const data = await fetchL(t.lyrics);
      if (data) parse(data);
    }
    
    updateUI();
    // prefetchNext удален для минимизации 404 логов для неиграющих треков
  }

  W.LyricsController = {
    getState: () => ({ lyricsViewMode: st.mode, animationEnabled: st.anim, hasTimedLyricsForCurrentTrack: st.has }),
    getCurrentLyrics: () => st.list,
    getCurrentLyricsLines: () => st.list.map(l => ({ line: l.text })),
    restoreSettingsIntoDom: () => { init(); updateUI(); },
    onTrackChange,
    onTick: (pos, opts) => {
      if (st.mode === 'hidden' || opts?.inMiniMode) return;
      if (st.has) render(pos);
    },
    toggleLyricsView: () => {
      const modes = ['normal', 'hidden', 'expanded'];
      st.mode = modes[(modes.indexOf(st.mode) + 1) % 3];
      store(LS.VIEW, st.mode);
      if (st.mode === 'hidden') st.anim = false;
      updateUI();
      W.NotificationSystem?.info?.({ normal: '📝 Обычный вид лирики', hidden: '🚫 Лирика скрыта', expanded: '📖 Расширенный вид лирики' }[st.mode]);
    },
    toggleAnimation: () => {
      if (st.mode === 'hidden') return W.NotificationSystem?.info?.('Лирика скрыта — анимация недоступна');
      st.anim = !st.anim; store(LS.ANIM, st.anim ? '1' : '0'); updateUI();
      W.NotificationSystem?.info?.(st.anim ? '✨ Анимация: ВКЛ' : '✨ Анимация: ВЫКЛ');
    },
    getMiniSaveState: () => ({ viewMode: st.mode === 'hidden' ? 'normal' : st.mode, animationEnabled: st.anim }),
    applyMiniMode: () => {
      initDom();
      if (dom.win) { dom.win.style.transition = 'none'; dom.win.style.display = 'none'; }
      if (dom.btnT) dom.btnT.style.display = 'none';
      if (dom.bg) dom.bg.classList.remove('active');
    },
    restoreFromMiniMode: (saved) => {
      initDom();
      if (dom.win) { dom.win.style.display = ''; setTimeout(() => dom.win.style.transition = '', 50); }
      if (dom.btnT) dom.btnT.style.display = '';
      if (saved) { st.mode = saved.viewMode || 'normal'; st.anim = !!saved.animationEnabled; }
      updateUI();
    },
    checkTrackHasLyrics: () => st.has
  };

  init();
})();
