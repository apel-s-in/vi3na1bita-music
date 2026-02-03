//=================================================
// FILE: /scripts/app/player-ui.js
// scripts/app/player-ui.js
// Hyper-Optimized PlayerUI v3.0 (TЗ Compliant: PQ, Stats, Offline-Ready)
(function (W, D) {
  'use strict';

  const U = W.Utils;
  const LS = { FAV: 'favoritesOnlyMode', VOL: 'playerVolume', BIT: 'bitEnabled' };
  const $ = (id) => D.getElementById(id);
  const pc = () => W.playerCore; // Lazy getter

  // State & DOM Cache
  const st = { 
    mini: false, 
    seeking: false, 
    bit: false, 
    anl: null, 
    raf: null,
    miniSaved: null
  };
  
  const el = {}; // DOM cache
  const get = (k, sel, root = D) => (el[k] = el[k] || root.querySelector(sel));
  const refs = (blk) => {
    el.blk = blk; el.fill = get('fill', '#player-progress-fill', blk); el.bar = get('bar', '#player-progress-bar', blk);
    el.tm = get('tm', '#time-elapsed', blk); el.rem = get('rem', '#time-remaining', blk);
    el.vf = get('vf', '#volume-fill', blk); el.vh = get('vh', '#volume-handle', blk); el.vs = get('vs', '#volume-slider', blk);
    el.ico = get('ico', '#play-pause-icon', blk); el.pq = get('pq', '#pq-btn', blk); el.pql = get('pql', '#pq-btn-label', blk);
    el.fav = get('fav', '#favorites-btn', blk); el.favi = get('favi', '#favorites-btn-icon', blk);
    el.pl = get('pl', '#pulse-btn', blk); el.plh = get('plh', '#pulse-heart', blk);
  };

  // --- Core Integration ---
  function init() {
    if (!W.albumsIndex?.length) return setTimeout(init, 100);
    const core = pc();
    if (!core) return setTimeout(init, 100);

    // Bind Events
    core.on({
      onTrackChange: (t, i) => { 
        W.__lastStatsSec = -1;
        W.AlbumsManager?.highlightCurrentTrack(t?.uid ? -1 : i, t?.uid ? { uid: t.uid, albumKey: t.sourceAlbum } : {});
        render(i);
        W.LyricsController?.onTrackChange?.(t);
        updPQ();
      },
      onPlay: updIcon, onPause: updIcon, onStop: updIcon, onEnd: updIcon,
      onTick: (p, d) => { if(!st.seeking) updBar(p, d); W.LyricsController?.onTick?.(p, { inMiniMode: st.mini }); }
    });

    core.onFavoritesChanged(() => { 
      updMini(); W.PlaybackPolicy?.apply?.({ reason: 'favoritesChanged' }); updFav(); filter(); 
    });

    W.NetworkManager?.subscribe ? W.NetworkManager.subscribe(updPQ) : W.addEventListener('online', updPQ) || W.addEventListener('offline', updPQ);

    // Restore
    const v = U.toInt(U.lsGet(LS.VOL), 100);
    core.setVolume(v);
    
    st.bit = U.lsGetBool01(LS.BIT);
    if(st.bit) setTimeout(bitStart, 1000); // Lazy viz start
    
    W.LyricsController?.restoreSettingsIntoDom?.();
    updFav();
  }

  // --- UI Rendering ---
  function render(idx, opts) {
    let blk = $('lyricsplayerblock');
    if (!blk) {
      const t = $('player-template');
      if (!t) return;
      blk = t.content.cloneNode(true).querySelector('#lyricsplayerblock');
      bind(blk);
    }

    st.mini = U.isBrowsingOtherAlbum();
    const list = $('track-list');
    const slot = $('now-playing');

    if (st.mini) {
      // Mini Mode
      if (slot && !slot.contains(blk)) {
        slot.innerHTML = '';
        slot.append(mkMiniHead(), blk, mkNext());
      }
      if (st.miniSaved === null) st.miniSaved = W.LyricsController?.getMiniSaveState?.();
      W.LyricsController?.applyMiniMode?.();
      toggle('mini-now', 1); toggle('next-up', 1);
    } else {
      // Full Mode
      if (list) {
        const c = pc().getCurrentTrack(), u = c?.uid ? String(c.uid).trim() : null;
        const row = u ? list.querySelector(`.track[data-uid="${CSS.escape(u)}"]`) : list.querySelector(`.track[data-index="${idx}"]`);
        if (row?.nextSibling !== blk) row ? row.after(blk) : list.appendChild(blk);
        if (row && opts?.userInitiated) setTimeout(() => row.scrollIntoView({ behavior:'smooth', block:'center' }), 50);
      }
      W.LyricsController?.restoreFromMiniMode?.(st.miniSaved);
      st.miniSaved = null;
      toggle('mini-now', 0); toggle('next-up', 0);
    }

    el.blk = null; // Flush cache to re-bind
    refs(blk);
    updFav(); filter(); updMini(); updPQ(); updVol(pc().getVolume()); updIcon(); updDl();
    
    // Jump Button Logic
    if(!el.jump) {
      el.jump = D.createElement('div'); el.jump.className='jump-to-playing'; 
      el.jump.innerHTML='<button>↑</button>'; el.jump.onclick=()=>$('lyricsplayerblock')?.scrollIntoView({behavior:'smooth',block:'center'});
      D.body.appendChild(el.jump);
    }
    if('IntersectionObserver' in W) (new IntersectionObserver(([e])=>el.jump.style.display=(!e.isIntersecting && !st.mini)?'flex':'none')).observe(blk);
  }

  // --- Sub-Components ---
  const toggle = (id, s) => { const e=$(id); if(e) e.style.display=s?'flex':'none'; };
  const mkMiniHead = () => {
    let n = el.mh; if(n && D.contains(n)) return n;
    n = $('mini-header-template').content.cloneNode(true).querySelector('#mini-now');
    U.dom.on(n, 'click', (e) => {
      if(e.target.id!=='mini-now-star') W.AlbumsManager?.loadAlbum(W.AlbumsManager.getPlayingAlbum());
    });
    $('mini-now-star', n).onclick = (e) => { e.stopPropagation(); actLike(); };
    return (el.mh = n);
  };
  const mkNext = () => (el.nu && D.contains(el.nu)) ? el.nu : (el.nu = $('next-up-template').content.cloneNode(true).querySelector('#next-up'));

  // --- Interactions ---
  const acts = {
    'play-pause-btn': () => pc().isPlaying() ? pc().pause() : pc().play(),
    'prev-btn': () => pc().prev(), 'next-btn': () => pc().next(), 'stop-btn': () => pc().stop(),
    'shuffle-btn': (t) => { pc().toggleShuffle(); U.setBtnActive(t.id, pc().isShuffle()); updQ(); },
    'repeat-btn': (t) => { pc().toggleRepeat(); U.setBtnActive(t.id, pc().isRepeat()); },
    'mute-btn': (t) => { const m = !t.classList.contains('active'); pc().setMuted?.(m); U.setBtnActive(t.id, m); },
    'pq-btn': () => {
      const r = U.pq.toggle();
      if(!r.ok) W.NotificationSystem?.[r.reason==='trackNoLo'?'info':'warning'](r.reason==='offline'?'Нет сети':'Lo недоступно');
      updPQ();
    },
    'favorites-btn': () => actFav(),
    'lyrics-toggle-btn': () => W.LyricsController?.toggleLyricsView(),
    'animation-btn': () => W.LyricsController?.toggleAnimation(),
    'lyrics-text-btn': () => W.LyricsModal?.show(),
    'pulse-btn': () => actPulse(),
    'sleep-timer-btn': () => W.SleepTimer?.show(),
    'stats-btn': () => W.StatisticsModal?.show?.(),
    'track-download-btn': (t) => { if(!t.getAttribute('href')) { t.preventDefault(); W.NotificationSystem?.error('Недоступно'); } }
  };

  function bind(b) {
    b.onclick = (e) => { const t = e.target.closest('button,a'); if(t && acts[t.id]) acts[t.id](t); };
    b.querySelector('#volume-slider').oninput = (e) => {
      const v = U.toInt(e.target.value); pc().setVolume(v); U.lsSet(LS.VOL, v); requestAnimationFrame(()=>updVol(v));
    };
    // Seek
    const bar = b.querySelector('#player-progress-bar');
    const mv = (e) => { const r=bar.getBoundingClientRect(), x=(e.touches?e.touches[0].clientX:e.clientX); pc().seek(pc().getDuration()*U.clamp((x-r.left)/r.width,0,1)); };
    const up = () => { st.seeking=0; D.removeEventListener('pointermove',mv); D.removeEventListener('pointerup',up); };
    bar.onpointerdown = (e) => { st.seeking=1; mv(e); D.addEventListener('pointermove',mv); D.addEventListener('pointerup',up); };
  }

  // --- Updaters ---
  function updBar(p, d) {
    if(el.fill) el.fill.style.width = `${(d>0?p/d:0)*100}%`;
    if(el.tm) el.tm.textContent = U.formatTime(p);
    if(el.rem) el.rem.textContent = `-${U.formatTime((d||0)-p)}`;
  }
  function updIcon() { if(el.ico) el.ico.innerHTML = pc()?.isPlaying() ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M8 5v14l11-7z"/>'; }
  function updVol(v) {
    if(el.vf) el.vf.style.width = `${v}%`;
    if(el.vh) el.vh.style.left = `${U.clamp(v, 2, 98)}%`; // approximate handle pos
    if(el.vs) el.vs.value = v;
  }
  function updMini() {
    if (!st.mini) return;
    const t = pc()?.getCurrentTrack();
    const mn = $('mini-now'); if(mn) {
      $('mini-now-num', mn).textContent = `${String((pc()?.getIndex()||0)+1).padStart(2,'0')}.`;
      $('mini-now-title', mn).textContent = t?.title || '—';
      $('mini-now-star', mn).src = U.fav.isTrackLikedInContext({playingAlbum:W.AlbumsManager?.getPlayingAlbum(), track:t}) ? 'img/star.png' : 'img/star2.png';
    }
    const nu = $('next-up'); if(nu) {
      const nt = pc()?.getPlaylistSnapshot()?.[pc()?.getNextIndex()];
      $('.title', nu).textContent = nt?.title || '—';
    }
  }
  function updPQ() {
    if(!el.pq) return;
    const s = U.pq.getState();
    el.pq.className = `player-control-btn pq-${s.mode}`;
    U.setAriaDisabled(el.pq, !s.canToggle);
    if(el.pql) el.pql.textContent = s.mode==='lo'?'Lo':'Hi';
  }
  function updFav() {
    const on = U.lsGetBool01(LS.FAV);
    if(el.fav) el.fav.className = `player-control-btn ${on?'favorites-active':''}`;
    if(el.favi) el.favi.src = on ? 'img/star.png' : 'img/star2.png';
  }
  function updDl() { U.download.applyDownloadLink($('track-download-btn'), pc()?.getCurrentTrack()); }
  function filter() {
    const lst = $('track-list'); if(!lst) return;
    const on = U.lsGetBool01(LS.FAV), cur = W.AlbumsManager?.getCurrentAlbum(), play = W.AlbumsManager?.getPlayingAlbum();
    const f = on && cur===play && !U.isSpecialAlbumKey(cur);
    lst.classList.toggle('favonly-filtered', f);
    if(f) {
      const lk = new Set(pc().getLikedUidsForAlbum(cur)||[]);
      lst.querySelectorAll('.track').forEach(r => {
        const u = r.dataset.uid;
        if(u && !lk.has(u)) r.setAttribute('data-hidden-by-favonly','1'); else r.removeAttribute('data-hidden-by-favonly');
      });
    }
  }

  // --- Logic Actions ---
  function actLike() {
    const t = pc()?.getCurrentTrack(); if(!t?.uid) return;
    const k = t.sourceAlbum || (!U.isSpecialAlbumKey(W.AlbumsManager?.getPlayingAlbum()) ? W.AlbumsManager.getPlayingAlbum() : null);
    pc().toggleFavorite(t.uid, { fromAlbum: true, albumKey: k });
    updMini();
  }
  function actFav() {
    const next = !U.lsGetBool01(LS.FAV), pa = W.AlbumsManager?.getPlayingAlbum();
    if(next && pa !== W.SPECIAL_FAVORITES_KEY && !pc()?.getLikedUidsForAlbum(pa)?.length) return W.NotificationSystem?.info('Отметьте понравившийся трек ⭐');
    U.lsSetBool01(LS.FAV, next);
    updFav(); updQ(); filter();
    W.NotificationSystem?.[next?'success':'info'](next ? '⭐ Только избранные' : 'Играют все треки');
  }
  function updQ() { W.PlaybackPolicy?.apply?.({ reason: 'toggle' }); W.PlayerUI.updateAvailableTracksForPlayback(); }
  function actPulse() {
    st.bit = !st.bit; U.lsSetBool01(LS.BIT, st.bit);
    if(el.pl) el.pl.classList.toggle('active', st.bit);
    if(el.plh) el.plh.textContent = st.bit ? '❤️' : '🤍';
    st.bit ? bitStart() : bitStop();
  }

  // --- Visualizer (Bit) ---
  function bitStart() {
    try { pc()?.rebuildCurrentSound?.({preferWebAudio:1}); } catch{}
    if(W.Howler?.ctx && !st.anl) {
      const ctx = W.Howler.ctx; if(ctx.state==='suspended') ctx.resume();
      try { st.anl = ctx.createAnalyser(); st.anl.fftSize=256; W.Howler.masterGain.connect(st.anl); } catch{ st.anl=null; }
    }
    if(!st.anl) { st.bit=0; U.lsSetBool01(LS.BIT,0); return W.NotificationSystem?.warning('Визуализация недоступна'); }
    bitLoop();
  }
  function bitLoop() {
    if(!st.bit) return;
    if(st.anl) {
      const d = new Uint8Array(st.anl.frequencyBinCount); st.anl.getByteFrequencyData(d);
      let s = 0, l = Math.floor(d.length*0.3); for(let i=0;i<l;i++) s+=d[i];
      const lg = $('logo-bottom'); if(lg) lg.style.transform = `scale(${1 + ((s/l)/255)*0.2})`;
    }
    st.raf = requestAnimationFrame(bitLoop);
  }
  function bitStop() {
    cancelAnimationFrame(st.raf);
    const lg = $('logo-bottom'); if(lg) { lg.style.transform='scale(1)'; setTimeout(()=>lg.style.transition='',300); }
    st.anl = null;
  }

  // --- Exports ---
  W.PlayerUI = {
    initialize: init,
    ensurePlayerBlock: render,
    updateMiniHeader: updMini,
    updateNextUpLabel: updMini,
    togglePlayPause: acts['play-pause-btn'],
    toggleLikePlaying: actLike,
    switchAlbumInstantly: (k) => { if(pc()?.getIndex()>=0) render(pc().getIndex()); updMini(); },
    toggleFavoritesOnly: actFav,
    updateAvailableTracksForPlayback: () => {
      const pa = W.AlbumsManager?.getPlayingAlbum(), on = U.lsGetBool01(LS.FAV);
      W.availableFavoriteIndices = (pa!==W.SPECIAL_FAVORITES_KEY && on) 
        ? pc().getPlaylistSnapshot().reduce((a,t,i) => (pc().isFavorite(t.uid) ? [...a,i] : a), []) 
        : null;
    },
    get currentLyrics() { return W.LyricsController?.getCurrentLyrics() || []; },
    get currentLyricsLines() { return W.LyricsController?.getCurrentLyricsLines() || []; }
  };
  W.toggleFavoritesOnly = actFav;

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init); else init();
})(window, document);
