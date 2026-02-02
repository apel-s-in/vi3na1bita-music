// scripts/app/player-ui/lyrics.js
// LyricsController — Optimized JSON-only timed lyrics (v2.0)
// Инварианты: не трогает воспроизведение (no stop/play/seek), только UI/fetch/cache.

(function () {
  'use strict';

  const W = window, D = document;
  const U = W.Utils;
  
  // Config & Keys
  const LS = { VIEW: 'lyricsViewMode', ANIM: 'lyricsAnimationEnabled' };
  const SS = { C404: 'lyrics_404_cache:v1', PRE: 'lyrics_cache_' };
  const MIN_INT = 250;
  const NO_LYR = '__NO_LYRICS__';

  // State
  let st = {
    list: [],       // current parsed lyrics
    has: false,     // has timed lyrics
    mode: 'normal', // normal | hidden | expanded
    anim: false,    // animation enabled
    lIdx: -1,       // last rendered index
    lTs: 0,         // last render timestamp
    pref: null,     // prefetched data
    prefUrl: null   // prefetched url
  };

  // --- Helpers ---
  const $ = (id) => D.getElementById(id);
  const qs = (s, p=D) => p?.querySelector(s);
  const esc = (s) => U?.escapeHtml ? U.escapeHtml(String(s||'')) : String(s||'');
  
  // Unified Storage Access (Safe)
  const store = (k, v) => {
    try { if(v===undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch {}
  };
  const sess = (k, v) => {
    try { 
      if(v===undefined) { const r=sessionStorage.getItem(k); return r?JSON.parse(r):null; }
      sessionStorage.setItem(k, JSON.stringify(v));
    } catch {}
  };

  // 404 Cache Logic (LRU 50 items)
  const c404 = {
    get: () => sess(SS.C404) || {},
    has: (u) => !!c404.get()[u],
    add: (u) => {
      const m = c404.get();
      m[u] = Date.now();
      const k = Object.keys(m);
      if(k.length > 100) k.sort((a,b)=>m[a]-m[b]).slice(0,50).forEach(x=>delete m[x]);
      sess(SS.C404, m);
    }
  };

  // --- Core Logic ---

  function init() {
    st.mode = ['normal','hidden','expanded'].includes(store(LS.VIEW)) ? store(LS.VIEW) : 'normal';
    st.anim = store(LS.ANIM) === '1';
  }

  function parse(arr) {
    st.list = (Array.isArray(arr) ? arr : [])
      .map(i => ({ time: Number(i?.time), text: String(i?.line||i?.text||'').trim() }))
      .filter(i => Number.isFinite(i.time) && i.text)
      .sort((a,b) => a.time - b.time);
    st.has = st.list.length > 0;
  }

  // Unified fetch with session cache
  async function fetchL(url) {
    const u = String(url||'').trim();
    if (!u || c404.has(u)) return null;

    const k = SS.PRE + u;
    const cached = sess(k);
    if (cached) return (cached === NO_LYR) ? null : cached;

    try {
      const r = await fetch(u, { cache: 'force-cache', headers: { Accept: 'application/json' } });
      if (!r.ok) { if (r.status === 404) c404.add(u); throw 0; }
      const j = await r.json();
      if (Array.isArray(j)) { sess(k, j); return j; }
    } catch {}
    
    sess(k, NO_LYR);
    return null;
  }

  // --- UI Rendering ---

  function updateUI(force = false) {
    const blk = $('lyricsplayerblock');
    if (!blk) return;

    const win = qs('#lyrics-window', blk);
    const bg = qs('.lyrics-animated-bg', blk);
    const btns = {
      t: qs('#lyrics-toggle-btn', blk),
      a: qs('#animation-btn', blk),
      k: qs('#lyrics-text-btn', blk)
    };

    if (!win) return;

    // Visibility & Mode
    const enabled = st.has && st.mode !== 'hidden';
    win.style.display = st.has ? '' : 'none';
    
    win.className = `lyrics-${st.mode}`;
    if (btns.t) {
      btns.t.className = `lyrics-toggle-btn lyrics-${st.mode} ${st.has?'':'disabled'}`;
      U.setAriaDisabled(btns.t, !st.has);
    }

    // Animation state
    const anim = st.anim && enabled;
    if (btns.a) {
      btns.a.classList.toggle('active', anim);
      btns.a.classList.toggle('disabled', !st.has);
    }
    if (bg) bg.classList.toggle('active', anim);

    // Karaoke button
    if (btns.k) {
      const trk = W.playerCore?.getCurrentTrack?.();
      const ok = (st.has && enabled) || !!trk?.fulltext;
      btns.k.classList.toggle('disabled', !ok);
      btns.k.style.pointerEvents = ok ? '' : 'none';
      btns.k.style.opacity = ok ? '' : '0.4';
    }

    if (!st.has && $('lyrics')) $('lyrics').innerHTML = '';
  }

  function render(pos) {
    const ctr = $('lyrics');
    if (!ctr || !st.has) {
      if (ctr && !st.has) ctr.innerHTML = '<div class="lyrics-placeholder">Текст не найден</div>';
      return;
    }

    // Countdown logic
    const first = st.list[0].time;
    if (pos < first && first > 5) {
      const rem = first - pos;
      const sec = Math.ceil(rem);
      const style = rem < 1 ? ` style="opacity:${rem.toFixed(2)}"` : '';
      const cls = rem < 1 ? ' fade-out' : '';
      ctr.innerHTML = `<div class="lyrics-countdown${cls}"${style}>${sec}</div>`;
      return;
    }

    // Find active line
    let idx = -1;
    for (let i = 0; i < st.list.length; i++) {
      if (pos >= st.list[i].time) idx = i; else break;
    }

    // Throttling
    const now = Date.now();
    if (idx === st.lIdx && (now - st.lTs) < MIN_INT) return;
    st.lIdx = idx; st.lTs = now;

    // Build Window (5 or 9 lines)
    const winSz = (st.mode === 'expanded') ? 9 : 5;
    const half = (winSz - 1) / 2;
    const start = Math.max(0, idx - half);
    const padTop = Math.max(0, half - idx);
    const lines = [];

    for (let i = 0; i < padTop; i++) lines.push('<div class="lyrics-window-line"></div>');
    
    const end = Math.min(st.list.length, start + winSz - padTop);
    for (let i = start; i < end; i++) {
      const cls = (i === idx) ? ' active' : '';
      lines.push(`<div class="lyrics-window-line${cls}">${esc(st.list[i].text)}</div>`);
    }

    while (lines.length < winSz) lines.push('<div class="lyrics-window-line"></div>');
    ctr.innerHTML = lines.join('');
  }

  // --- Methods ---

  async function onTrackChange(t) {
    st.has = false;
    st.list = [];
    st.lIdx = -1;
    
    if (!t?.lyrics) return updateUI();
    if (c404.has(t.lyrics)) return updateUI();

    // Fast path: prefetch
    if (st.prefUrl === t.lyrics && st.pref) {
      parse(st.pref);
      st.pref = null;
    } else {
      $('lyrics') && ($('lyrics').innerHTML = '<div class="lyrics-spinner"></div>');
      const data = await fetchL(t.lyrics);
      if (data) parse(data);
    }
    
    updateUI();
    prefetchNext(); // Trigger next
  }

  async function prefetchNext() {
    st.pref = null; st.prefUrl = null;
    const pc = W.playerCore;
    const nIdx = pc?.getNextIndex?.();
    const t = pc?.getPlaylistSnapshot?.()?.[nIdx];
    if (t?.lyrics) {
      const d = await fetchL(t.lyrics);
      if (d) { st.pref = d; st.prefUrl = t.lyrics; }
    }
  }

  // --- Public API ---

  W.LyricsController = {
    getState: () => ({ lyricsViewMode: st.mode, animationEnabled: st.anim, hasTimedLyricsForCurrentTrack: st.has }),
    getCurrentLyrics: () => st.list,
    getCurrentLyricsLines: () => st.list.map(l => ({ line: l.text })), // Back-compat

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
      if (st.mode === 'hidden') st.anim = false; // Disable anim if hidden
      updateUI();
      W.NotificationSystem?.info?.({
        normal: '📝 Обычный вид лирики',
        hidden: '🚫 Лирика скрыта',
        expanded: '📖 Расширенный вид лирики'
      }[st.mode]);
    },

    toggleAnimation: () => {
      if (st.mode === 'hidden') return W.NotificationSystem?.info?.('Лирика скрыта — анимация недоступна');
      st.anim = !st.anim;
      store(LS.ANIM, st.anim ? '1' : '0');
      updateUI();
      W.NotificationSystem?.info?.(st.anim ? '✨ Анимация: ВКЛ' : '✨ Анимация: ВЫКЛ');
    },

    // Mini Mode handling
    getMiniSaveState: () => ({ viewMode: st.mode === 'hidden' ? 'normal' : st.mode, animationEnabled: st.anim }),
    
    applyMiniMode: () => {
      // Force hidden visual state without saving to LS
      const win = $('lyrics-window');
      if (win) { win.style.transition = 'none'; win.style.display = 'none'; }
      const tBtn = qs('.lyrics-toggle-btn', $('lyricsplayerblock'));
      if (tBtn) tBtn.style.display = 'none';
      qs('.lyrics-animated-bg', $('lyricsplayerblock'))?.classList.remove('active');
    },

    restoreFromMiniMode: (saved) => {
      const win = $('lyrics-window');
      if (win) { 
        win.style.display = ''; 
        setTimeout(() => win.style.transition = '', 50); 
      }
      const tBtn = qs('.lyrics-toggle-btn', $('lyricsplayerblock'));
      if (tBtn) tBtn.style.display = '';

      if (saved) {
        st.mode = saved.viewMode || 'normal';
        st.anim = !!saved.animationEnabled;
      }
      updateUI();
    },

    // Utilities for external use
    checkTrackHasLyrics: (t) => t?.hasLyrics !== false && (t?.hasLyrics === true || !!t?.lyrics),
    isLyricsKnownMissingFast: (u) => !u || c404.has(u) || sess(SS.PRE + u) === NO_LYR
  };

  init(); // Load initial config
})();
