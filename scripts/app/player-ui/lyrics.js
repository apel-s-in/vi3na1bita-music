// scripts/app/player-ui/lyrics.js
// LyricsController — Ultra-Optimized (v4.0)
(function () {
  'use strict';

  const W = window, D = document, U = W.Utils;
  const LS = { V: 'lyricsViewMode', A: 'lyricsAnimationEnabled' }, PRE = 'lyr_';
  const sess = (k, v) => v === undefined ? JSON.parse(sessionStorage.getItem(k) || 'null') : sessionStorage.setItem(k, JSON.stringify(v));
  const esc = s => U?.escapeHtml?.(String(s||'')) || String(s||'');

  let st = { list: [], has: false, mode: 'normal', anim: false, lIdx: -100 }, dom = {};

  const initDom = () => {
    if (dom.blk) return true;
    if (!(dom.blk = D.getElementById('lyricsplayerblock'))) return false;
    const q = s => dom.blk.querySelector(s);
    Object.assign(dom, { win: q('#lyrics-window'), lyr: q('#lyrics'), bg: q('.lyrics-animated-bg'), btnT: q('#lyrics-toggle-btn'), btnA: q('#animation-btn'), btnK: q('#lyrics-text-btn') });
    return true;
  };

  const _pend = new Map();
  const fetchL = async (u) => {
    if (!(u = String(u || '').trim()) || sess('404_'+u)) return null;
    const k = PRE + u, c = sess(k);
    if (c) return c === 'NO' ? null : c;
    if (_pend.has(u)) return _pend.get(u);
    
    const p = (async () => {
      try {
        const r = await fetch(u, { cache: 'force-cache', headers: { Accept: 'application/json' } });
        if (!r.ok) throw r.status;
        const j = await r.json();
        if (Array.isArray(j)) { sess(k, j); return j; }
      } catch (e) {
        if (e === 404) sess('404_'+u, 1);
        else if (!(W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return null;
      }
      sess(k, 'NO'); return null;
    })();
    _pend.set(u, p);
    const res = await p;
    _pend.delete(u);
    return res;
  };

  const updateUI = () => {
    if (!initDom() || !dom.win) return;
    const ok = st.has && st.mode !== 'hidden', { win, btnT, btnA, bg, btnK, lyr } = dom;
    
    win.style.display = st.has ? '' : 'none';
    win.className = `lyrics-${st.mode}`;
    
    if (btnT) { btnT.className = `lyrics-toggle-btn lyrics-${st.mode} ${st.has ? '' : 'disabled'}`; U?.setAriaDisabled?.(btnT, !st.has); }
    if (btnA) { btnA.classList.toggle('active', st.anim && ok); btnA.classList.toggle('disabled', !st.has); }
    if (bg) bg.classList.toggle('active', st.anim && ok);
    
    if (btnK) {
      const can = ok || !!W.playerCore?.getCurrentTrack?.()?.fulltext;
      btnK.classList.toggle('disabled', !can);
      Object.assign(btnK.style, { pointerEvents: can ? '' : 'none', opacity: can ? '' : '0.4' });
    }
    if (!st.has && lyr) lyr.innerHTML = '<div class="lyrics-placeholder">Текст не найден</div>';
  };

  const render = (pos) => {
    if (!initDom() || !dom.lyr || !st.has) return;
    const lst = st.list, fT = lst[0].time;
    
    if (pos < fT && fT > 5) {
      const rem = fT - pos, sec = Math.ceil(rem);
      if (st.lIdx === -sec && rem >= 1) return;
      dom.lyr.innerHTML = `<div class="lyrics-countdown${rem<1?' fade-out':''}"${rem<1?` style="opacity:${rem.toFixed(2)}"`:''}>${sec}</div>`;
      st.lIdx = -sec;
      return;
    }

    let idx = -1;
    for (let i = 0; i < lst.length && pos >= lst[i].time; i++) idx = i;
    if (idx === st.lIdx) return;
    st.lIdx = idx;

    const sz = st.mode === 'expanded' ? 9 : 5, hf = (sz-1)/2, s = Math.max(0, idx-hf), pT = Math.max(0, hf-idx);
    const html = Array(sz).fill('<div class="lyrics-window-line"></div>');
    for(let i=0, end=Math.min(lst.length-s, sz-pT); i<end; i++) html[pT+i] = `<div class="lyrics-window-line${(s+i)===idx?' active':''}">${esc(lst[s+i].text)}</div>`;
    dom.lyr.innerHTML = html.join('');
  };

  W.LyricsController = {
    getState: () => ({ lyricsViewMode: st.mode, animationEnabled: st.anim, hasTimedLyricsForCurrentTrack: st.has }),
    getCurrentLyrics: () => st.list,
    getCurrentLyricsLines: () => st.list.map(l => ({ line: l.text })),
    restoreSettingsIntoDom: () => { 
      st.mode = ['normal','hidden','expanded'].includes(localStorage.getItem(LS.V)) ? localStorage.getItem(LS.V) : 'normal';
      st.anim = localStorage.getItem(LS.A) === '1';
      updateUI(); 
    },
    onTrackChange: async (t) => {
      st.has = false; st.list = []; st.lIdx = -100;
      if (!t?.lyrics || t.hasLyrics === false || sess('404_'+t.lyrics)) return updateUI();
      
      if (initDom() && dom.lyr) dom.lyr.innerHTML = '<div class="lyrics-spinner"></div>';
      const d = await fetchL(t.lyrics);
      if (d) {
        st.list = (Array.isArray(d) ? d : []).map(i => ({ time: Number(i?.time), text: String(i?.line || i?.text || '').trim() })).filter(i => Number.isFinite(i.time) && i.text).sort((a,b) => a.time - b.time);
        st.has = st.list.length > 0;
      }
      updateUI();
    },
    onTick: (pos, opts) => { if (st.mode !== 'hidden' && !opts?.inMiniMode && st.has) render(pos); },
    toggleLyricsView: () => {
      const m = ['normal', 'hidden', 'expanded'];
      localStorage.setItem(LS.V, st.mode = m[(m.indexOf(st.mode) + 1) % 3]);
      if (st.mode === 'hidden') st.anim = false;
      updateUI();
      W.NotificationSystem?.info?.({ normal: '📝 Обычный вид лирики', hidden: '🚫 Лирика скрыта', expanded: '📖 Расширенный вид лирики' }[st.mode]);
    },
    toggleAnimation: () => {
      if (st.mode === 'hidden') return W.NotificationSystem?.info?.('Лирика скрыта — анимация недоступна');
      localStorage.setItem(LS.A, (st.anim = !st.anim) ? '1' : '0'); updateUI();
      W.NotificationSystem?.info?.(st.anim ? '✨ Анимация: ВКЛ' : '✨ Анимация: ВЫКЛ');
    },
    getMiniSaveState: () => ({ viewMode: st.mode === 'hidden' ? 'normal' : st.mode, animationEnabled: st.anim }),
    applyMiniMode: () => {
      if (!initDom() || !dom.win) return;
      Object.assign(dom.win.style, { transition: 'none', display: 'none' });
      if (dom.btnT) dom.btnT.style.display = 'none';
      if (dom.bg) dom.bg.classList.remove('active');
    },
    restoreFromMiniMode: (sv) => {
      if (!initDom() || !dom.win) return;
      dom.win.style.display = ''; setTimeout(() => dom.win.style.transition = '', 50);
      if (dom.btnT) dom.btnT.style.display = '';
      if (sv) { st.mode = sv.viewMode || 'normal'; st.anim = !!sv.animationEnabled; }
      updateUI();
    },
    checkTrackHasLyrics: () => st.has
  };
  
  W.LyricsController.restoreSettingsIntoDom();
})();
