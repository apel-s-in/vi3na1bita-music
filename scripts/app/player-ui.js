// scripts/app/player-ui.js
// Optimized Player UI v3.0 (Single Sync Loop, Spec Compliant, Zero Leak)

(function (W, D) {
  'use strict';

  const U = W.Utils;
  const PC = () => W.playerCore;
  
  const st = { isMini: false, seeking: false };
  const viz = { on: U.lsGetBool01('bitEnabled'), ctx: null, id: 0 };
  
  const dom = { blk: null, now: null, mini: null, nUp: null, jump: null };
  const q = s => dom.blk?.querySelector(s);

  // 1. Unified State Synchronization
  function syncUI() {
    const pc = PC(); if (!pc || !dom.blk) return;
    const t = pc.getCurrentTrack(), isP = pc.isPlaying();
    const isFavOnly = U.lsGetBool01('favoritesOnlyMode');
    const pq = U.pq.getState(), mgr = W.OfflineManager;

    // Icons & Toggles
    if (dom.icon) dom.icon.innerHTML = isP ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
    U.setBtnActive('shuffle-btn', pc.isShuffle());
    U.setBtnActive('repeat-btn', pc.isRepeat());
    U.setBtnActive('mute-btn', pc.isMuted());
    
    if (dom.favBtn) dom.favBtn.className = `player-control-btn ${isFavOnly ? 'favorites-active' : ''}`;
    if (dom.favIcon) dom.favIcon.src = isFavOnly ? 'img/star.png' : 'img/star2.png';

    // Volume
    const v = pc.getVolume();
    if (dom.vFill) dom.vFill.style.width = `${v}%`;
    if (dom.vHandle) dom.vHandle.style.left = `${Math.max(2, Math.min(98, v))}%`;
    if (dom.vSlider) dom.vSlider.value = v;

    // Quality button behavior:
    // - R0/R1: PQ (qualityMode:v1)
    // - R2:   CQ (offline:cacheQuality:v1), click opens OFFLINE modal (Q.4.3)
    if (dom.pqBtn) {
      dom.pqBtn.style.display = '';

      const isR2 = mgr?.getMode?.() === 'R2';
      const effQ = isR2 ? (mgr?.getCQ?.() || 'hi') : pq.mode;

      const ariaDisabled = isR2 ? false : (!pq.netOk || !pq.canToggleByTrack);
      dom.pqBtn.className = `player-control-btn ${ariaDisabled ? 'disabled' : `pq-${effQ}`}`;
      dom.pqBtn.setAttribute('aria-disabled', ariaDisabled);

      if (dom.pqLbl) dom.pqLbl.textContent = effQ === 'lo' ? 'Lo' : 'Hi';
    }

    // Mini Header & Download
    U.download.applyDownloadLink(D.getElementById('track-download-btn'), t);
    updateMiniHeader(t);
    updateFavFilter();
  }

  // 2. Playback Quality Logic (Strict R1/R2 Spec)
  async function onPQClick() {
    const mgr = W.OfflineManager;
    const c = PC();
    const isR2 = mgr?.getMode?.() === 'R2';

    // R2: PQ button is CQ entrypoint (Q.4.3)
    if (isR2) {
      return W.Modals?.openOfflineModal?.();
    }

    const r = U.pq.getState();
    if (!r.netOk) return U.ui.toast('Нет доступа к сети', 'warning');
    if (!r.canToggleByTrack) return U.ui.toast('Низкое качество недоступно', 'warning');

    const nq = r.mode === 'hi' ? 'lo' : 'hi';
    const needs = mgr ? await mgr.countNeedsReCache(nq) : 0;
    const apply = () => c.switchQuality(nq);

    if (needs > 5) {
      W.Modals?.confirm?.({
        title: 'Смена качества',
        textHtml: `Смена затронет ${needs} файлов. Перекачать?`,
        confirmText: 'Перекачать',
        onConfirm: apply
      }) || (confirm(`Смена затронет ${needs} файлов. Перекачать?`) && apply());
    } else apply();
  }

  // 3. UI Helpers
  const updateMiniHeader = (t) => {
    if (!st.isMini || !dom.mini) return;
    const nextT = PC().getPlaylistSnapshot()?.[PC().getNextIndex()];
    const [num, tit, star, ul] = ['#mini-now-num', '#mini-now-title', '#mini-now-star', '.title'].map(s => dom.mini.querySelector(s) || dom.nUp?.querySelector(s));
    
    if (num) num.textContent = `${String((PC().getIndex()||0)+1).padStart(2, '0')}.`;
    if (tit) tit.textContent = t ? t.title : '—';
    if (star) star.src = U.fav.isTrackLikedInContext({ playingAlbum: W.AlbumsManager?.getPlayingAlbum?.(), track: t }) ? 'img/star.png' : 'img/star2.png';
    if (ul) ul.textContent = nextT ? nextT.title : '—';
  };

  const updateFavFilter = () => {
    const lst = D.getElementById('track-list'); if (!lst) return;
    const ca = W.AlbumsManager?.getCurrentAlbum?.(), pa = W.AlbumsManager?.getPlayingAlbum?.();
    const on = U.lsGetBool01('favoritesOnlyMode') && ca === pa && !U.isSpecialAlbumKey(ca);
    lst.classList.toggle('favonly-filtered', on);
    
    if (on) {
      const liked = new Set(PC().getLikedUidsForAlbum(ca) || []);
      lst.querySelectorAll('.track[data-uid]').forEach(r => r.toggleAttribute('data-hidden-by-favonly', !liked.has(r.dataset.uid)));
    }
  };

  const togglePulse = (force = false) => {
    if (!force) { viz.on = !viz.on; U.lsSetBool01('bitEnabled', viz.on); }
    const h = D.getElementById('pulse-heart'), b = D.getElementById('pulse-btn');
    if (h) h.textContent = viz.on ? '❤️' : '🤍';
    if (b) b.classList.toggle('active', viz.on);

    if (viz.on) {
      if (!viz.ctx && W.Howler?.ctx) {
        if (W.Howler.ctx.state === 'suspended') W.Howler.ctx.resume().catch(()=>{});
        try { viz.ctx = W.Howler.ctx.createAnalyser(); viz.ctx.fftSize = 256; W.Howler.masterGain.connect(viz.ctx); } catch {}
      }
      if (viz.ctx && !viz.id) loopVisualizer();
    } else {
      cancelAnimationFrame(viz.id); viz.id = 0;
      const l = D.getElementById('logo-bottom'); if (l) l.style.transform = 'scale(1)';
    }
  };

  const loopVisualizer = () => {
    if (!viz.on || !viz.ctx) return;
    const d = new Uint8Array(viz.ctx.frequencyBinCount);
    viz.ctx.getByteFrequencyData(d);
    const lim = Math.max(1, d.length * 0.3) | 0;
    const sum = d.slice(0, lim).reduce((a, b) => a + b, 0);
    const l = D.getElementById('logo-bottom');
    if (l) l.style.transform = `scale(${1 + (sum / lim / 255) * 0.2})`;
    viz.id = requestAnimationFrame(loopVisualizer);
  };

  // 4. Component Mounting & Bootstrapping
  function ensurePlayerBlock(idx, userInit) {
    if (!dom.blk) {
      dom.blk = D.getElementById('player-template').content.cloneNode(true).querySelector('#lyricsplayerblock');
      dom.now = D.getElementById('now-playing');
      
      Object.assign(dom, {
        fill: q('#player-progress-fill'), bar: q('#player-progress-bar'), tEl: q('#time-elapsed'), tRem: q('#time-remaining'),
        vFill: q('#volume-fill'), vHandle: q('#volume-handle'), vSlider: q('#volume-slider'),
        icon: q('#play-pause-icon'), pqBtn: q('#pq-btn'), pqLbl: q('#pq-btn-label'), favBtn: q('#favorites-btn'), favIcon: q('#favorites-btn-icon')
      });
      bindEvents();
    }

    st.isMini = U.isBrowsingOtherAlbum();
    
    if (st.isMini) {
      if (!dom.mini) {
        dom.mini = D.getElementById('mini-header-template').content.cloneNode(true).querySelector('#mini-now');
        dom.mini.onclick = e => {
                  if (e.target.id === 'mini-now-star') { e.stopPropagation();
                  const t = PC().getCurrentTrack(); 
                  if(t?.uid) {
                    const isFav = W.AlbumsManager?.getPlayingAlbum?.() === W.SPECIAL_FAVORITES_KEY;
                    PC().toggleFavorite(t.uid, { source: isFav ? 'favorites' : 'album', albumKey: t.sourceAlbum });
                  }
                  syncUI();
                }
          else { const pk = W.AlbumsManager?.getPlayingAlbum?.(); if(pk) W.AlbumsManager.loadAlbum(pk); }
        };
        dom.nUp = D.getElementById('next-up-template').content.cloneNode(true).querySelector('#next-up');
      }
      if (!dom.now.contains(dom.blk)) dom.now.append(dom.mini, dom.blk, dom.nUp);
      W.LyricsController?.applyMiniMode?.();
      dom.mini.style.display = 'flex'; dom.nUp.style.display = 'flex';
    } else {
      const lst = D.getElementById('track-list');
      const t = PC().getCurrentTrack();
      const uidSel = t?.uid ? CSS.escape(t.uid) : '';

      // Showcase использует .showcase-track, обычные альбомы — .track
      const r =
        (uidSel && lst?.querySelector(`.track[data-uid="${uidSel}"]`)) ||
        (uidSel && lst?.querySelector(`.showcase-track[data-uid="${uidSel}"]`)) ||
        (idx != null && lst?.querySelector(`.track[data-index="${idx}"]`)) ||
        null;

      if (r) {
        r.after(dom.blk);
        if (userInit) setTimeout(() => r.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      } else if (lst) {
        lst.appendChild(dom.blk);
      }

      W.LyricsController?.restoreFromMiniMode?.();
      dom.now.innerHTML = '';
      if (dom.mini) dom.mini.style.display = 'none';
      if (dom.nUp) dom.nUp.style.display = 'none';
    }
    
    // Jump observer
    if (!dom.jump) {
      dom.jump = D.createElement('div'); dom.jump.className = 'jump-to-playing'; dom.jump.innerHTML = '<button>↑</button>';
      dom.jump.onclick = () => dom.blk?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      D.body.appendChild(dom.jump);
    }
    if (W.IntersectionObserver) {
      W.playerBlockObserver?.disconnect();
      W.playerBlockObserver = new IntersectionObserver(([e]) => dom.jump.style.display = (!e.isIntersecting && !st.isMini) ? 'flex' : 'none', { threshold: 0.1 });
      W.playerBlockObserver.observe(dom.blk);
    }
    syncUI();
  }

  function bindEvents() {
    // Delegation mapping
    dom.blk.addEventListener('click', e => {
      const b = e.target.closest('button, a'); if (!b) return;
      if (b.id === 'track-download-btn' && !b.getAttribute('href')) return e.preventDefault(), U.ui.toast('Скачивание недоступно', 'error');
      if (b.tagName === 'A') return;
      e.preventDefault();
      
      ({
        'play-pause-btn': () => PC().isPlaying() ? PC().pause() : PC().play(),
        'prev-btn': () => PC().prev(),
        'next-btn': () => PC().next(),
        'stop-btn': () => PC().stop(),
        'shuffle-btn': () => { PC().toggleShuffle(); syncUI(); },
        'repeat-btn': () => { PC().toggleRepeat(); syncUI(); },
        'mute-btn': () => { PC().setMuted(!PC().isMuted()); syncUI(); },
        'pq-btn': onPQClick,
        'lyrics-toggle-btn': () => { W.LyricsController?.toggleLyricsView?.(); W.eventLogger?.log('FEATURE_USED', PC().getCurrentTrackUid(), { feature: 'lyrics' }); },
        'animation-btn': () => W.LyricsController?.toggleAnimation?.(),
        'lyrics-text-btn': () => W.LyricsModal?.show?.(),
        'pulse-btn': togglePulse,
        'stats-btn': () => W.StatisticsModal?.openStatisticsModal?.(),
        'favorites-btn': () => {
                  const nxt = !U.lsGetBool01('favoritesOnlyMode'), pa = W.AlbumsManager?.getPlayingAlbum?.();
                  if (nxt) {
                    if (pa === W.SPECIAL_FAVORITES_KEY && !PC().getFavoritesState().active.length) {
                      return U.ui.toast('Отметьте понравившийся трек ⭐', 'info');
                    } else if (pa !== W.SPECIAL_FAVORITES_KEY && !PC().getLikedUidsForAlbum(pa)?.length) {
                      return U.ui.toast('Отметьте понравившийся трек ⭐', 'info');
                    }
                  }
                  U.lsSetBool01('favoritesOnlyMode', nxt);
                  PC().applyFavoritesOnlyFilter?.();
                  W.PlayerUI.updateAvailableTracksForPlayback();
                  syncUI(); U.ui.toast(nxt ? '⭐ Только избранные' : 'Играют все треки', nxt ? 'success' : 'info');
                }
      })[b.id]?.();
    });

    // Seeker & Volume
    const move = e => PC().seek(PC().getDuration() * U.math.clamp(((e.touches ? e.touches[0].clientX : e.clientX) - dom.bar.getBoundingClientRect().left) / dom.bar.getBoundingClientRect().width, 0, 1));
    const up = () => { st.seeking = false; D.removeEventListener('pointermove', move); D.removeEventListener('pointerup', up); };
    dom.bar?.addEventListener('pointerdown', e => { st.seeking = true; move(e); D.addEventListener('pointermove', move); D.addEventListener('pointerup', up); });
    dom.vSlider?.addEventListener('input', e => { PC().setVolume(e.target.value); syncUI(); });
  }

  // 5. Entry point
  function init() {
    if (!W.playerCore || !W.albumsIndex || !U) return setTimeout(init, 100);

    PC().on({
      onPlay: syncUI, onPause: syncUI, onStop: syncUI, onEnd: syncUI,
      onTrackChange: (t, i) => { W.AlbumsManager?.highlightCurrentTrack?.(t?.uid ? -1 : i, t?.uid ? { uid: t.uid, albumKey: t.sourceAlbum } : {}); ensurePlayerBlock(i); W.LyricsController?.onTrackChange?.(t); syncUI(); },
      onTick: (pos, dur) => { 
        if (!st.seeking) {
          if(dom.fill) dom.fill.style.width = `${dur > 0 ? (pos/dur)*100 : 0}%`;
          if(dom.tEl) dom.tEl.textContent = U.fmt.time(pos);
          if(dom.tRem) dom.tRem.textContent = `-${U.fmt.time((dur||0)-pos)}`;
        }
        W.LyricsController?.onTick?.(pos, { inMiniMode: st.isMini });
      }
    });

    PC().onFavoritesChanged(() => {
          const pAlbum = W.AlbumsManager?.getPlayingAlbum?.();
          if (pAlbum === W.SPECIAL_FAVORITES_KEY || U.lsGetBool01('favoritesOnlyMode')) {
            PC().applyFavoritesOnlyFilter?.();
            W.PlayerUI?.updateAvailableTracksForPlayback?.();
          }
          syncUI();
        });
        W.addEventListener('playlist:changed', () => {
          const pAlbum = W.AlbumsManager?.getPlayingAlbum?.();
          if (pAlbum === W.SPECIAL_FAVORITES_KEY || U.lsGetBool01('favoritesOnlyMode')) {
            PC().applyFavoritesOnlyFilter?.();
          }
        });
        ['offline:uiChanged', 'online', 'offline'].forEach(e => W.addEventListener(e, syncUI));
    
    PC().setVolume(U.math.toInt(U.lsGet('playerVolume'), 100));
    if (viz.on) togglePulse(true);
    syncUI();
  }

  // Exports
  W.PlayerUI = {
    initialize: init,
    ensurePlayerBlock: (idx, opts) => ensurePlayerBlock(idx, opts?.userInitiated),
    updateMiniHeader: syncUI, updateNextUpLabel: syncUI, updatePlaylistFiltering: updateFavFilter,
    togglePlayPause: () => PC().isPlaying() ? PC().pause() : PC().play(),
    switchAlbumInstantly: () => { if (PC().getIndex() >= 0) ensurePlayerBlock(PC().getIndex()); },
    updateAvailableTracksForPlayback: () => {
      PC().applyFavoritesOnlyFilter?.();
      syncUI();
    }
  };

  D.readyState === 'loading' ? D.addEventListener('DOMContentLoaded', init) : init();
})(window, document);
