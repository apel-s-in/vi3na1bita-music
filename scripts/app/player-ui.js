// scripts/app/player-ui.js
// Optimized Player UI v4.0 (Unified State, DOM Caching, 100% Spec Compliant)
(function (W, D) {
  'use strict';

  const U = W.Utils, PC = () => W.playerCore;
  const st = { isMini: false, seeking: false, vizOn: U.lsGetBool01('bitEnabled'), vizId: 0, ctx: null, provider: 'unknown' };
  const dom = { blk: null, now: null, mini: null, nUp: null, jump: null, el: {} };

  // 1. Unified & Cached State Synchronization
  const syncUI = () => {
    const c = PC(); if (!c || !dom.blk) return;
    const t = c.getCurrentTrack(), p = c.isPlaying(), e = dom.el, f = U.lsGetBool01('favoritesOnlyMode');
    const oM = W.OfflineManager, isR2 = oM?.getMode?.() === 'R2';
    const q = isR2 ? (oM?.getCQ() || 'hi') : U.pq.getState().mode;

    e.ico.innerHTML = p ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
    
    ['shuffle', 'repeat', 'mute'].forEach(k => 
      U.setBtnActive(`${k}-btn`, c[`is${k.charAt(0).toUpperCase() + k.slice(1)}`]?.())
    );
    
    e.fav.className = `player-control-btn ${f ? 'favorites-active' : ''}`;
    e.favI.src = f ? 'img/star.png' : 'img/star2.png';

    const v = c.getVolume();
    e.vF.style.width = `${v}%`; 
    e.vH.style.left = `${Math.max(2, Math.min(98, v))}%`; 
    e.vS.value = v;

    if (e.pq) {
      const netDis = !isR2 && !U.pq.getState().netOk;
      e.pq.className = `player-control-btn ${(!isR2 && (!U.pq.getState().canToggleByTrack || netDis)) ? 'disabled' : `pq-${q}`}`;
      U.setAriaDisabled(e.pq, netDis);
      if (e.pqL) e.pqL.textContent = q === 'lo' ? 'Lo' : 'Hi';
    }

    U.download.applyDownloadLink(e.dl, t);

    if (e.srcInd) {
        e.srcInd.className = 'source-indicator';
        if (st.provider === 'yandex') { e.srcInd.classList.add('si-yandex'); e.srcInd.title = 'Источник: Yandex Cloud'; }
        else if (st.provider === 'github') { e.srcInd.classList.add('si-github'); e.srcInd.title = 'Источник: GitHub Pages'; }
        else if (st.provider === 'cache') { e.srcInd.classList.add('si-cache'); e.srcInd.title = 'Источник: Офлайн Кэш'; }
        else { e.srcInd.style.opacity = '0'; }
    }

    // Mini Header sync
    if (st.isMini && dom.mini) {
      const nt = c.getPlaylistSnapshot()?.[c.getNextIndex()];
      const qs = (s, r = dom.mini) => r.querySelector(s);
      const n = qs('#mini-now-num'), ti = qs('#mini-now-title'), sr = qs('#mini-now-star'), nti = qs('.title', dom.nUp);
      
      if (n) n.textContent = `${String((c.getIndex() || 0) + 1).padStart(2, '0')}.`;
      if (ti) ti.textContent = t?.title || '—';
      if (sr) sr.src = U.fav.isTrackLikedInContext({ playingAlbum: W.AlbumsManager?.getPlayingAlbum?.(), track: t }) ? 'img/star.png' : 'img/star2.png';
      if (nti) nti.textContent = nt?.title || '—';
    }

    // Fav Filter sync
    const lst = D.getElementById('track-list'), cA = W.AlbumsManager?.getCurrentAlbum?.();
    if (lst) {
      const active = f && cA === W.AlbumsManager?.getPlayingAlbum?.() && !U.isSpecialAlbumKey(cA);
      lst.classList.toggle('favonly-filtered', active);
      if (active) {
        const lkd = new Set(c.getLikedUidsForAlbum(cA));
        lst.querySelectorAll('.track[data-uid]').forEach(r => r.toggleAttribute('data-hidden-by-favonly', !lkd.has(r.dataset.uid)));
      }
    }
  };

  // 2. Playback Quality Logic (Strict Playback Safety)
  const onPQClick = async () => {
    const m = W.OfflineManager, c = PC();
    if (m?.getMode?.() === 'R2') return W.Modals?.openOfflineModal?.();
    
    const r = U.pq.getState();
    if (!r.netOk) return U.ui.toast('Нет доступа к сети', 'warning');
    if (!r.canToggleByTrack) return U.ui.toast('Низкое качество недоступно', 'warning');
    
    const nq = r.mode === 'hi' ? 'lo' : 'hi', nds = m ? await m.countNeedsReCache(nq) : 0;
    const apply = () => { c.switchQuality(nq); syncUI(); };
    
    nds > 5 
      ? (W.Modals?.confirm?.({ title: 'Смена качества', textHtml: `Затронет ${nds} файлов. Перекачать?`, confirmText: 'Перекачать', onConfirm: apply }) || (confirm(`Затронет ${nds} файлов. Перекачать?`) && apply())) 
      : apply();
  };

  // 3. Audio Visualizer
  const loopViz = () => {
    if (!st.vizOn || !st.ctx) return;
    const d = new Uint8Array(st.ctx.frequencyBinCount); 
    st.ctx.getByteFrequencyData(d);
    
    const lim = Math.max(1, d.length * 0.3) | 0, logo = D.getElementById('logo-bottom');
    if (logo) logo.style.transform = `scale(${1 + (d.slice(0, lim).reduce((a, b) => a + b, 0) / lim / 255) * 0.2})`;
    st.vizId = requestAnimationFrame(loopViz);
  };

  const togViz = (f = false) => {
    if (!f) U.lsSetBool01('bitEnabled', st.vizOn = !st.vizOn);
    
    const h = D.getElementById('pulse-heart'), b = D.getElementById('pulse-btn'), l = D.getElementById('logo-bottom');
    if (h) h.textContent = st.vizOn ? '❤️' : '🤍';
    if (b) b.classList.toggle('active', st.vizOn);
    
    if (st.vizOn) {
      if (!st.ctx && W.Howler?.ctx) {
        W.Howler.ctx.state === 'suspended' && W.Howler.ctx.resume().catch(()=>{});
        try { st.ctx = W.Howler.ctx.createAnalyser(); st.ctx.fftSize = 256; W.Howler.masterGain.connect(st.ctx); } catch {}
      }
      if (st.ctx && !st.vizId) loopViz();
    } else {
      cancelAnimationFrame(st.vizId); st.vizId = 0; 
      if (l) l.style.transform = ''; 
    }
  };

  // 4. Player Block Mounting
  const ensureBlock = (idx, userInit) => {
    if (!dom.blk) {
      dom.blk = D.getElementById('player-template').content.cloneNode(true).querySelector('#lyricsplayerblock');
      dom.now = D.getElementById('now-playing');
      const q = s => dom.blk.querySelector(s);
      
      dom.el = { 
        srcInd: q('#source-indicator'),
        fill: q('#player-progress-fill'), bar: q('#player-progress-bar'), tE: q('#time-elapsed'), tR: q('#time-remaining'), 
        vF: q('#volume-fill'), vH: q('#volume-handle'), vS: q('#volume-slider'), ico: q('#play-pause-icon'), 
        pq: q('#pq-btn'), pqL: q('#pq-btn-label'), fav: q('#favorites-btn'), favI: q('#favorites-btn-icon'), dl: q('#track-download-btn') 
      };
      bindEvs();
    }

    st.isMini = U.isBrowsingOtherAlbum();
    
    if (st.isMini) {
      if (!dom.mini) {
        dom.mini = D.getElementById('mini-header-template').content.cloneNode(true).querySelector('#mini-now');
        dom.mini.onclick = e => {
          if (e.target.id === 'mini-now-star') { 
            e.stopPropagation(); 
            const t = PC().getCurrentTrack(); 
            if(t?.uid) PC().toggleFavorite(t.uid, { source: W.AlbumsManager?.getPlayingAlbum?.() === W.SPECIAL_FAVORITES_KEY ? 'favorites' : 'album', albumKey: t.sourceAlbum }); 
            syncUI(); 
          } else { 
            const p = W.AlbumsManager?.getPlayingAlbum?.(); 
            if(p) W.AlbumsManager.loadAlbum(p); 
          }
        };
        dom.nUp = D.getElementById('next-up-template').content.cloneNode(true).querySelector('#next-up');
      }
      if (!dom.now.contains(dom.blk)) dom.now.append(dom.mini, dom.blk, dom.nUp);
      W.LyricsController?.applyMiniMode?.();
      dom.mini.style.display = dom.nUp.style.display = 'flex';
    } else {
      const l = D.getElementById('track-list'), t = PC().getCurrentTrack(), u = t?.uid ? CSS.escape(t.uid) : '';
      const r = (u && l?.querySelector(`.track[data-uid="${u}"], .showcase-track[data-uid="${u}"]`)) || (idx != null && l?.querySelector(`.track[data-index="${idx}"]`));
      
      r ? (r.after(dom.blk), userInit && setTimeout(() => r.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)) : l?.appendChild(dom.blk);
      W.LyricsController?.restoreFromMiniMode?.();
      dom.now.innerHTML = ''; 
      if (dom.mini) dom.mini.style.display = dom.nUp.style.display = 'none';
    }

    if (!dom.jump) {
      dom.jump = D.createElement('div'); dom.jump.className = 'jump-to-playing'; dom.jump.innerHTML = '<button>↑</button>';
      dom.jump.onclick = () => dom.blk?.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
      D.body.appendChild(dom.jump);
    }
    
    if (W.IntersectionObserver) {
      W.pBlockObs?.disconnect();
      W.pBlockObs = new IntersectionObserver(([e]) => dom.jump.style.display = (!e.isIntersecting && !st.isMini) ? 'flex' : 'none', { threshold: 0.1 });
      W.pBlockObs.observe(dom.blk);
    }
    syncUI();
  };

  // 5. Delegation & Event Binding
  const bindEvs = () => {
    dom.blk.addEventListener('click', e => {
      const b = e.target.closest('button, a'); 
      if (!b || b.tagName === 'A') return;
      if (b.id === 'track-download-btn' && !b.getAttribute('href')) return e.preventDefault(), U.ui.toast('Скачивание недоступно', 'error');
      
      e.preventDefault(); 
      const c = PC();
      
      const acts = {
        'play-pause-btn': () => c.isPlaying() ? c.pause() : c.play(),
        'prev-btn': () => c.prev(), 
        'next-btn': () => c.next(), 
        'stop-btn': () => c.stop(),
        'shuffle-btn': () => { c.toggleShuffle(); syncUI(); },
        'repeat-btn': () => { c.toggleRepeat(); syncUI(); },
        'mute-btn': () => { c.setMuted(!c.isMuted()); syncUI(); },
        'pq-btn': onPQClick,
        'lyrics-toggle-btn': () => { W.LyricsController?.toggleLyricsView?.(); W.eventLogger?.log('FEATURE_USED', c.getCurrentTrackUid(), { feature: 'lyrics' }); },
        'animation-btn': () => W.LyricsController?.toggleAnimation?.(),
        'lyrics-text-btn': () => W.LyricsModal?.show?.(),
        'pulse-btn': () => togViz(),
        'stats-btn': () => W.StatisticsModal?.openStatisticsModal?.(),
        'favorites-btn': () => {
          const nx = !U.lsGetBool01('favoritesOnlyMode'), pa = W.AlbumsManager?.getPlayingAlbum?.();
          if (nx && (!c.getLikedUidsForAlbum(pa)?.length && (!pa || pa !== W.SPECIAL_FAVORITES_KEY || !c.getFavoritesState().active.length))) {
            return U.ui.toast('Отметьте понравившийся трек ⭐', 'info');
          }
          U.lsSetBool01('favoritesOnlyMode', nx); 
          c.applyFavoritesOnlyFilter?.();
          W.PlayerUI.updateAvailableTracksForPlayback(); 
          syncUI(); 
          U.ui.toast(nx ? '⭐ Только избранные' : 'Играют все треки', nx ? 'success' : 'info');
        }
      };
      acts[b.id]?.();
    });

    const m = e => PC().seek(PC().getDuration() * U.math.clamp(((e.touches ? e.touches[0].clientX : e.clientX) - dom.el.bar.getBoundingClientRect().left) / dom.el.bar.getBoundingClientRect().width, 0, 1));
    const up = () => { st.seeking = false; D.removeEventListener('pointermove', m); D.removeEventListener('pointerup', up); };
    
    dom.el.bar?.addEventListener('pointerdown', e => { st.seeking = true; m(e); D.addEventListener('pointermove', m); D.addEventListener('pointerup', up); });
    dom.el.vS?.addEventListener('input', e => { PC().setVolume(e.target.value); syncUI(); });
  };

  // 6. Entry Point
  const init = () => {
    if (!W.playerCore || !W.albumsIndex || !U) return setTimeout(init, 100);
    
    PC().on({
      onPlay: syncUI, onPause: syncUI, onStop: syncUI, onEnd: syncUI,
      onTrackChange: (t, i) => { 
        W.AlbumsManager?.highlightCurrentTrack?.(t?.uid ? -1 : i, t?.uid ? { uid: t.uid, albumKey: t.sourceAlbum } : {}); 
        ensureBlock(i); 
        W.LyricsController?.onTrackChange?.(t); 
        syncUI(); 
      },
      onTick: (p, d) => {
        if (!st.seeking && dom.el.fill) { 
          dom.el.fill.style.width = `${d > 0 ? (p / d) * 100 : 0}%`; 
          dom.el.tE.textContent = U.fmt.time(p); 
          dom.el.tR.textContent = `-${U.fmt.time((d || 0) - p)}`; 
        }
        W.LyricsController?.onTick?.(p, { inMiniMode: st.isMini });
      }
    });

    PC().onFavoritesChanged(() => { 
      const p = W.AlbumsManager?.getPlayingAlbum?.(); 
      if (p === W.SPECIAL_FAVORITES_KEY || U.lsGetBool01('favoritesOnlyMode')) { 
        PC().applyFavoritesOnlyFilter?.(); 
        W.PlayerUI?.updateAvailableTracksForPlayback?.(); 
      } 
      syncUI(); 
    });

    W.addEventListener('playlist:changed', () => { 
      const p = W.AlbumsManager?.getPlayingAlbum?.(); 
      if (p === W.SPECIAL_FAVORITES_KEY || U.lsGetBool01('favoritesOnlyMode')) PC().applyFavoritesOnlyFilter?.(); 
    });

    W.addEventListener('player:providerChanged', (e) => { st.provider = e.detail?.provider; syncUI(); });
    ['offline:uiChanged', 'online', 'offline'].forEach(e => W.addEventListener(e, syncUI));
    
    PC().setVolume(U.math.toInt(U.lsGet('playerVolume'), 100));
    if (st.vizOn) togViz(true); 
    syncUI();
  };

  // Exports
  W.PlayerUI = {
    initialize: init, 
    ensurePlayerBlock: (i, o) => ensureBlock(i, o?.userInitiated),
    updateMiniHeader: syncUI, 
    updateNextUpLabel: syncUI, 
    updatePlaylistFiltering: () => syncUI(),
    togglePlayPause: () => PC().isPlaying() ? PC().pause() : PC().play(),
    switchAlbumInstantly: () => { if (PC().getIndex() >= 0) ensureBlock(PC().getIndex()); },
    updateAvailableTracksForPlayback: () => { PC().applyFavoritesOnlyFilter?.(); syncUI(); }
  };
  
  D.readyState === 'loading' ? D.addEventListener('DOMContentLoaded', init) : init();
})(window, document);
