(function () {
  'use strict';
  const W = window, D = document, U = W.Utils, LS = { V: 'lyricsViewMode', A: 'lyricsAnimationEnabled' }, PRE = 'lyr_', fc = U?.fetchCache, esc = s => U?.escapeHtml?.(String(s||'')) || String(s||''), uiSuspended = () => !!W.PlaybackClock?.getPlaybackClock?.()?.uiBackgroundSuspend;
  let st = { list: [], has: false, mode: 'normal', anim: true, showBtn: false, lIdx: -100, mini: false }, dom = {}, _pend = new Map();

  const initDom = () => {
    if (dom.blk) return true;
    if (!(dom.blk = D.getElementById('lyricsplayerblock'))) return false;
    const q = s => dom.blk.querySelector(s);
    Object.assign(dom, { win: q('#lyrics-window'), lyr: q('#lyrics'), bg: q('.lyrics-animated-bg'), btnT: q('#lyrics-toggle-btn'), btnA: q('#animation-btn'), btnK: q('#lyrics-text-btn') });
    return true;
  };

  const badKey = u => `lyrics:bad-url:${String(u || '').trim()}`;
  const isBadUrl = u => { try { return sessionStorage.getItem(badKey(u)) === '1'; } catch { return false; } };
  const markBadUrl = u => { try { sessionStorage.setItem(badKey(u), '1'); } catch {} };

  const fetchL = async (u) => {
    if (!(u = String(u || '').trim())) return null;
    if (isBadUrl(u)) return null;
    const k = PRE + u, rec = fc?.get?.(k, 43200000, 'session'); if (rec && typeof rec === 'object') return rec.ok ? rec.data : null;
    if (_pend.has(u)) return _pend.get(u);
    const p = (async () => {
      const t = W.playerCore?.getCurrentTrack(), urls = [];
      if (t?.uid) { try { const smart = await W.TrackRegistry?.getSmartUrlInfo?.(t.uid, 'lyrics'); if (smart?.url) urls.push(smart.url); } catch {} }
      if (u && !urls.includes(u)) urls.push(u);
      for (const url of urls) {
        try {
          const r = await fetch(url, { cache: 'force-cache', headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); const j = await r.json();
          if (Array.isArray(j)) { fc?.set?.(k, { ok: 1, data: j }, 'session'); return j; }
        } catch (e) { if (String(e?.message || e || '').includes('404')) markBadUrl(url); else if (!(W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return null; }
      }
      fc?.set?.(k, { ok: 0 }, 'session'); return null;
    })();
    _pend.set(u, p); const res = await p; _pend.delete(u); return res;
  };

  const updateUI = () => {
    if (!initDom() || !dom.win) return;
    const ok = st.has && st.mode !== 'hidden', { win, btnT, btnA, bg, btnK, lyr } = dom;
    if (st.mini) {
      win.style.display = 'none'; win.className = `lyrics-${st.mode}`;
      if (btnT) btnT.style.display = 'none';
      if (btnA) { btnA.style.display = 'none'; btnA.classList.toggle('active', false); btnA.classList.toggle('disabled', !st.has); }
      if (bg) bg.classList.remove('active');
      if (btnK) { const can = !!W.playerCore?.getCurrentTrack?.()?.fulltext || !!st.has; btnK.classList.toggle('disabled', !can); Object.assign(btnK.style, { pointerEvents: can ? '' : 'none', opacity: can ? '' : '0.4' }); }
      if (!st.has && lyr) lyr.innerHTML = '<div class="lyrics-placeholder">Текст не найден</div>';
      return;
    }
    win.style.display = st.has ? '' : 'none'; win.className = `lyrics-${st.mode}`;
    if (btnT) { btnT.style.display = st.has ? '' : 'none'; btnT.className = `lyrics-toggle-btn lyrics-${st.mode}`; U?.setAriaDisabled?.(btnT, !st.has); }
    if (btnA) { btnA.style.display = st.showBtn ? '' : 'none'; btnA.classList.toggle('active', st.anim && ok); btnA.classList.toggle('disabled', !st.has); }
    if (bg) bg.classList.toggle('active', st.anim && ok);
    if (btnK) { const can = ok || !!W.playerCore?.getCurrentTrack?.()?.fulltext; btnK.classList.toggle('disabled', !can); Object.assign(btnK.style, { pointerEvents: can ? '' : 'none', opacity: can ? '' : '0.4' }); }
    if (!st.has && lyr) lyr.innerHTML = '<div class="lyrics-placeholder">Текст не найден</div>';
  };

  const render = (pos) => {
    if (!initDom() || !dom.lyr || !st.has) return;
    const lst = st.list;
    let idx = -1; for (let i = 0; i < lst.length && pos >= lst[i].time; i++) idx = i;
    
    const curLine = idx >= 0 ? lst[idx] : null;
    const nextLine = idx + 1 < lst.length ? lst[idx + 1] : null;
    const inGap = !curLine || pos >= curLine.end;
    
    if (inGap) {
      const gapStart = curLine ? curLine.end : 0;
      const gapEnd = nextLine ? nextLine.time : (W.playerCore?.getDuration?.() || gapStart + 10);
      if (gapEnd - gapStart > 5 && pos >= gapStart && pos < gapEnd) {
        const rem = gapEnd - pos, sec = Math.ceil(rem);
        if (st.lIdx === -sec && rem >= 1) return;
        dom.lyr.innerHTML = `<div class="lyrics-countdown${rem<1?' fade-out':''}"${rem<1?` style="opacity:${rem.toFixed(2)}"`:''}>${sec}</div>`;
        st.lIdx = -sec; return;
      }
    }
    
    const stateKey = inGap ? 'gap_' + idx : idx;
    if (stateKey === st.lIdx) return;
    st.lIdx = stateKey;
    
    const sz = st.mode === 'expanded' ? 9 : 5, hf = (sz-1)/2, s = Math.max(0, idx-hf), pT = Math.max(0, hf-idx), html = Array(sz).fill('<div class="lyrics-window-line"></div>');
    for(let i=0, end=Math.min(lst.length-s, sz-pT); i<end; i++) {
      const isActive = !inGap && (s+i) === idx;
      html[pT+i] = `<div class="lyrics-window-line${isActive?' active':''}">${esc(lst[s+i].text)}</div>`;
    }
    dom.lyr.innerHTML = html.join('');
  };

  W.LyricsController = {
    getState: () => ({ lyricsViewMode: st.mode, animationEnabled: st.anim, hasTimedLyricsForCurrentTrack: st.has }),
    getCurrentLyrics: () => st.list, getCurrentLyricsLines: () => st.list.map(l => ({ line: l.text })),
    restoreSettingsIntoDom: () => { st.mode = ['normal','hidden','expanded'].includes(localStorage.getItem(LS.V)) ? localStorage.getItem(LS.V) : 'normal'; st.anim = localStorage.getItem(LS.A) !== '0'; st.showBtn = localStorage.getItem('lyricsShowAnimBtn') === '1'; updateUI(); },
    onTrackChange: async (t) => {
      st.has = false; st.list = []; st.lIdx = -100;
      if (!t?.lyrics || t.hasLyrics === false) return updateUI();
      if (initDom() && dom.lyr) dom.lyr.innerHTML = '<div class="lyrics-spinner"></div>';
      const d = await fetchL(t.lyrics);
      if (d) {
        st.list = (Array.isArray(d) ? d : []).map(i => ({ time: Number(i?.time ?? i?.start), end: Number(i?.end ?? 0), text: String(i?.line || i?.text || '').trim() })).filter(i => Number.isFinite(i.time) && i.text).sort((a,b) => a.time - b.time);
        for (let j = 0; j < st.list.length; j++) if (!st.list[j].end) st.list[j].end = st.list[j+1] ? st.list[j+1].time : st.list[j].time + 5;
        st.has = st.list.length > 0;
      }
      updateUI();
    },
    onTick: (pos, opts) => { if (!uiSuspended() && st.mode !== 'hidden' && !opts?.inMiniMode && st.has) render(pos); },
    toggleLyricsView: () => { const m = ['normal', 'hidden', 'expanded']; localStorage.setItem(LS.V, st.mode = m[(m.indexOf(st.mode) + 1) % 3]); updateUI(); W.NotificationSystem?.info?.({ normal: '📝 Обычный вид лирики', hidden: '🚫 Лирика скрыта', expanded: '📖 Расширенный вид лирики' }[st.mode]); },
    toggleAnimation: () => { if (st.mode === 'hidden') return W.NotificationSystem?.info?.('Лирика скрыта — анимация недоступна'); localStorage.setItem(LS.A, (st.anim = !st.anim) ? '1' : '0'); updateUI(); W.NotificationSystem?.info?.(st.anim ? '✨ Анимация: ВКЛ' : '✨ Анимация: ВЫКЛ'); },
    getMiniSaveState: () => ({ viewMode: st.mode === 'hidden' ? 'normal' : st.mode, animationEnabled: st.anim }),
    applyMiniMode: () => { st.mini = true; if (!initDom() || !dom.win) return; Object.assign(dom.win.style, { transition: 'none', display: 'none' }); if (dom.btnT) dom.btnT.style.display = 'none'; if (dom.bg) dom.bg.classList.remove('active'); updateUI(); },
    restoreFromMiniMode: (sv) => { st.mini = false; if (!initDom() || !dom.win) return; dom.win.style.display = ''; setTimeout(() => dom.win.style.transition = '', 50); if (dom.btnT) dom.btnT.style.display = ''; if (sv) { st.mode = sv.viewMode || 'normal'; st.anim = !!sv.animationEnabled; } updateUI(); },
    checkTrackHasLyrics: () => st.has
  };
  W.LyricsController.restoreSettingsIntoDom();
})();
