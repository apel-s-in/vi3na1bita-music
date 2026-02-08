// scripts/app/player-ui.js
// Optimized PlayerUI v3.0 (Strict R1/Offline Logic)
(function (W, D) {
  'use strict';

  const U = W.Utils, PC = () => W.playerCore;
  const $ = (i) => D.getElementById(i);
  const qs = (s, p = D) => p?.querySelector(s);
  const cls = (e, c, v) => e?.classList.toggle(c, !!v);
  const txt = (e, t) => { if(e) e.textContent = t; };
  const on = (e, t, f) => e?.addEventListener(t, f, { passive: false });

  // DOM Cache
  const el = {};
  const S = { mini: false, seek: false, miniSave: null, vis: false, raf: 0, an: null };

  const init = () => {
    if (!PC() || !W.albumsIndex || !U) return setTimeout(init, 50);

    // Event Bindings
    const c = PC();
    c.on({
      onTrackChange: (t, i) => { W.__lastStatsSec = -1; hl(t, i); render(i); updPQ(); updDL(); },
      onPlay: updIcon, onPause: updIcon, onStop: updIcon, onEnd: updIcon,
      onTick: onTick
    });

    c.onFavoritesChanged(() => { updFav(); updMini(); updFilt(); });

    const evs = ['offline:uiChanged', 'online', 'offline', 'netPolicy:changed'];
    evs.forEach(e => W.addEventListener(e, updPQ));

    // Restore State
    c.setVolume(U.math.toInt(U.lsGet('playerVolume'), 100));
    S.vis = U.lsGetBool01('bitEnabled');
    if (S.vis) visRun();

    updFav();
  };

  // --- Rendering & Layout ---

  const cacheDOM = (root) => {
    el.root = root;
    el.bar = qs('#player-progress-bar', root);
    el.fill = qs('#player-progress-fill', root);
    el.elap = qs('#time-elapsed', root);
    el.rem = qs('#time-remaining', root);
    el.vFill = qs('#volume-fill', root);
    el.vHand = qs('#volume-handle', root);
    el.vSld = qs('#volume-slider', root);
    el.icon = qs('#play-pause-icon', root);
    el.pq = qs('#pq-btn', root);
    el.pqLbl = qs('#pq-btn-label', root);
    el.fav = qs('#favorites-btn', root);
    el.favIcon = qs('#favorites-btn-icon', root);
    
    // Bind Seek
    if (el.bar) {
      const move = (e) => {
        const r = el.bar.getBoundingClientRect();
        const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
        PC().seek(PC().getDuration() * U.math.clamp(x / r.width, 0, 1));
      };
      const up = () => { S.seek = false; D.removeEventListener('pointermove', move); D.removeEventListener('pointerup', up); };
      on(el.bar, 'pointerdown', (e) => { S.seek = true; move(e); D.addEventListener('pointermove', move); D.addEventListener('pointerup', up); });
    }

    // Bind Volume
    if (el.vSld) on(el.vSld, 'input', (e) => {
      const v = U.math.toInt(e.target.value, 100);
      PC().setVolume(v); updVol(v);
    });
    updVol(PC().getVolume());
  };

  const render = (idx, opts) => {
    if (!el.root) {
      const t = $('player-template');
      if (!t) return;
      cacheDOM(t.content.cloneNode(true).querySelector('#lyricsplayerblock'));
      bindClicks(el.root);
    }

    const slot = $('now-playing');
    const isM = U.isBrowsingOtherAlbum();
    const chg = S.mini !== isM;
    S.mini = isM;

    if (isM) { // Mini Mode
      if (!slot.contains(el.root) || chg) {
        slot.innerHTML = '';
        slot.append(getMiniH(), el.root, getNextH());
      }
      if (W.LyricsController && S.miniSave === null) {
        S.miniSave = W.LyricsController.getMiniSaveState();
        W.LyricsController.applyMiniMode();
      }
      if (el.miniH) el.miniH.style.display = 'flex';
      if (el.nextH) el.nextH.style.display = 'flex';
    } else { // Inline Mode
      const row = qs(PC().getCurrentTrack()?.uid ? `.track[data-uid="${CSS.escape(PC().getCurrentTrack().uid)}"]` : `.track[data-index="${idx}"]`, $('track-list'));
      if (row) {
        if (row.nextSibling !== el.root) row.after(el.root);
        if (opts?.userInitiated) setTimeout(() => row.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      } else $('track-list')?.appendChild(el.root);

      if (W.LyricsController) {
        W.LyricsController.restoreFromMiniMode(S.miniSave);
        S.miniSave = null;
      }
      if (slot) slot.innerHTML = '';
      if (el.miniH) el.miniH.style.display = 'none';
      if (el.nextH) el.nextH.style.display = 'none';
    }

    chkJump();
    // Batch updates
    updPQ(); updFav(); updFilt(); updMini(); updIcon(); updDL();
  };

  const getMiniH = () => {
    if (el.miniH) return el.miniH;
    el.miniH = $('mini-header-template').content.cloneNode(true).querySelector('#mini-now');
    on(el.miniH, 'click', (e) => {
      if (e.target.id !== 'mini-now-star') {
        const k = W.AlbumsManager?.getPlayingAlbum?.();
        if (k) W.AlbumsManager.loadAlbum(k);
      } else {
        e.stopPropagation();
        const t = PC().getCurrentTrack();
        if (t?.uid) PC().toggleFavorite(t.uid, { fromAlbum: true, albumKey: t.sourceAlbum });
        updMini();
      }
    });
    return el.miniH;
  };

  const getNextH = () => (el.nextH = el.nextH || $('next-up-template')?.content.cloneNode(true).querySelector('#next-up'));

  const bindClicks = (root) => {
    on(root, 'click', (e) => {
      const b = e.target.closest('button');
      if (!b) return; // Ignore non-buttons (links handled natively)
      
      e.preventDefault();
      const id = b.id;
      const core = PC();

      const acts = {
        'play-pause-btn': () => core.isPlaying() ? core.pause() : core.play(),
        'prev-btn': () => core.prev(),
        'next-btn': () => core.next(),
        'stop-btn': () => core.stop(),
        'shuffle-btn': () => { core.toggleShuffle(); U.setBtnActive(id, core.isShuffle()); updMini(); },
        'repeat-btn': () => { core.toggleRepeat(); U.setBtnActive(id, core.isRepeat()); },
        'mute-btn': () => { const m = !b.classList.contains('active'); core.setMuted(m); U.setBtnActive(id, m); },
        'pq-btn': onPQ,
        'favorites-btn': toggleFavMode,
        'lyrics-toggle-btn': () => W.LyricsController?.toggleLyricsView?.(),
        'animation-btn': () => W.LyricsController?.toggleAnimation?.(),
        'lyrics-text-btn': () => W.LyricsModal?.show?.(),
        'pulse-btn': () => { 
          S.vis = !S.vis; 
          U.lsSetBool01('bitEnabled', S.vis); 
          cls(b, 'active', S.vis); 
          $('pulse-heart').textContent = S.vis ? '❤️' : '🤍';
          S.vis ? visRun() : visStop(); 
        },
        'stats-btn': () => W.StatisticsModal?.openStatisticsModal?.()
      };
      acts[id]?.();
    });
  };

  // --- Logic ---

  const onTick = (pos, dur) => {
    if (!S.seek && el.fill) {
      el.fill.style.width = dur > 0 ? `${(pos/dur)*100}%` : '0%';
      if (el.elap) el.elap.textContent = U.fmt.time(pos);
      if (el.rem) el.rem.textContent = `-${U.fmt.time((dur||0)-pos)}`;
    }
    W.LyricsController?.onTick?.(pos, { inMiniMode: S.mini });
  };

  const updIcon = () => {
    if (el.icon) el.icon.innerHTML = PC().isPlaying() 
      ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' 
      : '<path d="M8 5v14l11-7z"/>';
  };

  const updVol = (v) => {
    const p = U.math.clamp(v, 0, 100);
    if (el.vFill) el.vFill.style.width = `${p}%`;
    if (el.vHand) el.vHand.style.left = `${U.math.clamp(p, 2, 98)}%`;
    if (el.vSld) el.vSld.value = p;
  };

  const updPQ = () => {
    if (!el.pq) return;
    el.pq.style.display = '';
    const st = U.pq.getState();
    let c = 'player-control-btn ';
    if (!st.netOk) { c += 'disabled'; el.pq.setAttribute('aria-disabled', 'true'); }
    else {
      c += `pq-${st.mode}`;
      el.pq.setAttribute('aria-disabled', String(!st.canToggle));
      if (!st.canToggle) c += ' disabled-soft';
    }
    el.pq.className = c;
    txt(el.pqLbl, st.mode === 'lo' ? 'Lo' : 'Hi');
  };

  const onPQ = async () => {
    const mgr = W._offlineManagerInstance;
    if (!mgr) {
      const r = U.pq.toggle();
      if (!r.ok) U.ui.toast(r.reason === 'trackNoLo' ? 'Нет Lo качества' : 'Нет сети', 'warning');
      return updPQ();
    }
    const q = mgr.getQuality() === 'hi' ? 'lo' : 'hi';
    const n = await mgr.countNeedsReCache(q);
    
    const go = () => { U.pq.toggle(); updPQ(); };
    
    if (n > 5) {
      W.Modals?.confirm?.({
        title: 'Смена качества',
        textHtml: `Затронет ${n} файлов. Перекачать?`,
        confirmText: 'Да', onConfirm: go
      }) || (confirm(`Затронет ${n} файлов. Перекачать?`) && go());
    } else go();
  };

  const toggleFavMode = () => {
    const on = !U.lsGetBool01('favoritesOnlyMode');
    const pa = W.AlbumsManager?.getPlayingAlbum?.();
    
    if (on && pa !== W.SPECIAL_FAVORITES_KEY) {
      if (!PC().getLikedUidsForAlbum(pa)?.length) return U.ui.toast('Отметьте ⭐ трек', 'info');
    }
    U.lsSetBool01('favoritesOnlyMode', on);
    updFav();
    W.PlaybackPolicy?.apply?.({ reason: 'toggle' });
    PlayerUI.updateAvailableTracksForPlayback();
    updFilt();
    U.ui.toast(on ? '⭐ Только избранные' : 'Играют все треки', on ? 'success' : 'info');
  };

  const updFav = () => {
    const on = U.lsGetBool01('favoritesOnlyMode');
    if (el.fav) el.fav.className = `player-control-btn ${on ? 'favorites-active' : ''}`;
    if (el.favIcon) el.favIcon.src = on ? 'img/star.png' : 'img/star2.png';
  };

  const updFilt = () => {
    const l = $('track-list');
    if (!l) return;
    const on = U.lsGetBool01('favoritesOnlyMode');
    const same = W.AlbumsManager?.getCurrentAlbum?.() === W.AlbumsManager?.getPlayingAlbum?.();
    const spec = U.isSpecialAlbumKey(W.AlbumsManager?.getCurrentAlbum?.());
    
    const act = on && same && !spec;
    cls(l, 'favonly-filtered', act);
    
    if (act) {
      const uids = new Set(PC().getLikedUidsForAlbum(W.AlbumsManager.getCurrentAlbum()) || []);
      l.querySelectorAll('.track').forEach(r => {
        r.dataset.hiddenByFavonly = uids.has(r.dataset.uid) ? null : '1';
      });
    } else {
      l.querySelectorAll('.track').forEach(r => r.removeAttribute('data-hidden-by-favonly'));
    }
  };

  const updMini = () => {
    if (!S.mini || !el.miniH) return;
    const t = PC().getCurrentTrack();
    const nxt = PC().getPlaylistSnapshot()?.[PC().getNextIndex()];
    
    txt(el.miniH.querySelector('#mini-now-num'), `${String((PC().getIndex()||0)+1).padStart(2,'0')}.`);
    txt(el.miniH.querySelector('#mini-now-title'), t ? t.title : '—');
    
    const star = el.miniH.querySelector('#mini-now-star');
    if (star) star.src = U.fav.isTrackLikedInContext({ playingAlbum: W.AlbumsManager?.getPlayingAlbum?.(), track: t }) ? 'img/star.png' : 'img/star2.png';
    
    if (el.nextH) txt(el.nextH.querySelector('.title'), nxt ? nxt.title : '—');
  };

  const updDL = () => U.download.applyDownloadLink($('track-download-btn'), PC().getCurrentTrack());

  const hl = (t, i) => W.AlbumsManager?.highlightCurrentTrack?.(t?.uid ? -1 : i, t?.uid ? { uid: t.uid, albumKey: t.sourceAlbum } : {});

  // --- Visualizer (Optimized) ---
  const visRun = () => {
    if (W.Howler?.ctx && !S.an) {
      const c = W.Howler.ctx;
      if (c.state === 'suspended') c.resume();
      try { S.an = c.createAnalyser(); S.an.fftSize = 256; W.Howler.masterGain.connect(S.an); } catch { S.an = null; }
    }
    if (!S.an || !S.vis) return;
    
    const loop = () => {
      if (!S.vis) return;
      const arr = new Uint8Array(S.an.frequencyBinCount);
      S.an.getByteFrequencyData(arr);
      let sum = 0, lim = (arr.length * 0.3) | 0;
      for (let i = 0; i < lim; i++) sum += arr[i];
      const s = 1 + (sum / lim / 255) * 0.2;
      const l = $('logo-bottom');
      if (l) l.style.transform = `scale(${s})`;
      S.raf = requestAnimationFrame(loop);
    };
    S.raf = requestAnimationFrame(loop);
  };

  const visStop = () => {
    if (S.raf) cancelAnimationFrame(S.raf);
    const l = $('logo-bottom'); if (l) l.style.transform = 'scale(1)';
    S.an = null;
  };

  // --- Jump Button ---
  const chkJump = () => {
    if (!el.jump) {
      el.jump = D.createElement('div');
      el.jump.className = 'jump-to-playing';
      el.jump.innerHTML = '<button>↑</button>';
      el.jump.onclick = () => el.root?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      D.body.appendChild(el.jump);
    }
    if (!W.IntersectionObserver || !el.root) return;
    if (W._obs) W._obs.disconnect();
    W._obs = new IntersectionObserver(([e]) => {
      el.jump.style.display = (!e.isIntersecting && !S.mini) ? 'flex' : 'none';
    }, { threshold: 0.1 });
    W._obs.observe(el.root);
  };

  // --- Exports ---
  W.PlayerUI = {
    initialize: init,
    ensurePlayerBlock: render,
    updateMiniHeader: updMini,
    updateNextUpLabel: updMini,
    updatePlaylistFiltering: updFilt,
    updateFavoritesBtn: updFav,
    updateAvailableTracksForPlayback: () => {
      const pa = W.AlbumsManager?.getPlayingAlbum?.();
      if (pa !== W.SPECIAL_FAVORITES_KEY && U.lsGetBool01('favoritesOnlyMode')) {
        W.availableFavoriteIndices = PC().getPlaylistSnapshot().reduce((a, t, i) => {
          if (PC().isFavorite(t.uid)) a.push(i);
          return a;
        }, []);
      } else W.availableFavoriteIndices = null;
    },
    togglePlayPause: () => PC().isPlaying() ? PC().pause() : PC().play(),
    switchAlbumInstantly: (k) => { if (PC().getIndex() >= 0) { render(PC().getIndex()); updMini(); } }
  };

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init); else init();

})(window, document);
