// scripts/app/player-ui.js
// Optimized PlayerUI v2.0: DOM Caching, Event Delegation, Performance Boost
(function () {
  'use strict';

  const W = window, D = document, U = W.Utils;
  const LS = { FAV: 'favoritesOnlyMode', VOL: 'playerVolume', BIT: 'bitEnabled' };
  
  // Cache for rapid DOM access (prevents querySelector layout thrashing)
  const refs = {
    block: null,
    playIcon: null,
    fill: null,
    bar: null,
    elapsed: null,
    rem: null,
    volFill: null,
    volHandle: null,
    volSlider: null,
    miniNow: null,
    miniTitle: null,
    miniNum: null,
    miniStar: null,
    nextUp: null,
    nextUpTitle: null,
    jumpBtn: null
  };

  const st = {
    seeking: false,
    inMini: false,
    savedMini: null,
    ensureTimer: null,
    bitActive: false,
    audioCtx: null,
    analyser: null,
    animId: null
  };

  function init() {
    if (W.__pUI_init) return;
    W.__pUI_init = true;

    if (!Array.isArray(W.albumsIndex) || !W.albumsIndex.length) {
      W.__pUI_init = false;
      return setTimeout(init, 100);
    }

    restoreConfig();
    bindCore();
    bindFavSync();
    bindNetSync();
  }

  // --- Core Integration ---

  function bindCore() {
    const pc = W.playerCore;
    if (!pc) return setTimeout(bindCore, 100);

    pc.on({
      onTrackChange: (t, i) => {
        if (!t) return;
        W.__lastStatsSec = -1; // Stats reset
        
        // Highlight logic
        const am = W.AlbumsManager;
        const uid = String(t.uid || '').trim();
        if (uid) {
          // Special case for Favorites playlist to ensure correct album context
          const pAlb = am?.getPlayingAlbum();
          const opts = (pAlb === W.SPECIAL_FAVORITES_KEY) ? { uid, albumKey: String(t.sourceAlbum||'') } : { uid };
          am?.highlightCurrentTrack(-1, opts);
        } else {
          am?.highlightCurrentTrack(i);
        }

        ensureUI(i);
        W.LyricsController?.onTrackChange?.(t);
        updateDownloadBtn(t);
        updatePQState();
        
        // Visual sync for F-mode
        syncFavModeUI(); 
      },
      onPlay: updatePlayState,
      onPause: updatePlayState,
      onStop: updatePlayState,
      onEnd: updatePlayState,
      onTick: (pos, dur) => {
        if (!st.seeking) updateProgressUI(pos, dur);
        W.LyricsController?.onTick?.(pos, { inMiniMode: st.inMini });
      }
    });
  }

  function bindFavSync() {
    if (W.__favBound) return;
    W.__favBound = true;
    
    const pc = W.playerCore;
    if (!pc?.onFavoritesChanged) return setTimeout(bindFavSync, 100);

    pc.onFavoritesChanged((ch) => {
      updateMiniInfo();
      W.PlaybackPolicy?.apply?.({ reason: 'favoritesChanged', changed: ch || {} });
      updateAvailable();
      filterTrackListUI();
    });
  }

  function bindNetSync() {
    const sub = W.NetworkManager?.subscribe || ((cb) => W.addEventListener('online', cb) || W.addEventListener('offline', cb));
    sub(() => updatePQState());
  }

  // --- UI Construction & Caching ---

  function $(id) { return D.getElementById(id); }

  function cacheRefs(block) {
    if (!block) return;
    refs.block = block;
    refs.playIcon = block.querySelector('#play-pause-icon');
    refs.fill = block.querySelector('#player-progress-fill');
    refs.bar = block.querySelector('#player-progress-bar');
    refs.elapsed = block.querySelector('#time-elapsed');
    refs.rem = block.querySelector('#time-remaining');
    refs.volFill = block.querySelector('#volume-fill');
    refs.volHandle = block.querySelector('#volume-handle');
    refs.volSlider = block.querySelector('#volume-slider');
  }

  function ensureUI(idx, opts = {}) {
    if (st.ensureTimer) clearTimeout(st.ensureTimer);
    st.ensureTimer = setTimeout(() => {
      renderPlayerBlock(idx, opts);
      st.ensureTimer = null;
    }, 50);
  }

  function renderPlayerBlock(idx, opts) {
    let blk = $('lyricsplayerblock');
    if (!blk) {
      const tpl = $('player-template');
      if (tpl) {
        blk = tpl.content.cloneNode(true).querySelector('#lyricsplayerblock');
        bindBlockEvents(blk);
      } else {
        return; // Critical error: no template
      }
    }

    const am = W.AlbumsManager;
    st.inMini = U.isBrowsingOtherAlbum();

    if (st.inMini) {
      // Mini Player Mode
      const slot = $('now-playing');
      if (slot && !slot.contains(blk)) {
        slot.innerHTML = '';
        slot.appendChild(createMiniHead());
        slot.appendChild(blk);
        slot.appendChild(createNextUp());
      }
      
      if (st.savedMini === null) st.savedMini = W.LyricsController?.getMiniSaveState?.();
      W.LyricsController?.applyMiniMode?.();
      
      toggleDisplay('mini-now', true);
      toggleDisplay('next-up', true);
    } else {
      // Full Player Mode
      const list = $('track-list');
      if (list) {
        const cur = W.playerCore?.getCurrentTrack();
        const uid = String(cur?.uid || '').trim();
        
        // Find injection point
        let row = uid 
          ? list.querySelector(`.track[data-uid="${CSS.escape(uid)}"]`) 
          : list.querySelector(`.track[data-index="${idx}"]`);

        // Correct row for Favorites view (prevent duplicate uid confusion)
        if (uid && !row && cur?.sourceAlbum) {
           row = list.querySelector(`.track[data-uid="${CSS.escape(uid)}"][data-album="${CSS.escape(cur.sourceAlbum)}"]`);
        }

        if (!row) {
          if (!blk.parentNode) list.appendChild(blk);
        } else if (row.nextSibling !== blk) {
          row.after(blk);
        }

        if (row && opts.userInitiated) {
          setTimeout(() => row.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        }
      }

      W.LyricsController?.restoreFromMiniMode?.(st.savedMini);
      st.savedMini = null;
      
      toggleDisplay('mini-now', false);
      toggleDisplay('next-up', false);
    }

    // Refresh references and state
    cacheRefs(blk);
    syncFavModeUI();
    filterTrackListUI();
    updateMiniInfo();
    checkJumpBtn();
  }

  function createMiniHead() {
    if (refs.miniNow && D.contains(refs.miniNow)) return refs.miniNow;
    const tpl = $('mini-header-template');
    const el = tpl ? tpl.content.cloneNode(true).querySelector('#mini-now') : D.createElement('div');
    
    refs.miniNow = el;
    refs.miniNum = el.querySelector('#mini-now-num');
    refs.miniTitle = el.querySelector('#mini-now-title');
    refs.miniStar = el.querySelector('#mini-now-star');

    U.dom.on(el, 'click', (e) => {
      if (e.target.id === 'mini-now-star') return;
      const k = W.AlbumsManager?.getPlayingAlbum();
      if (k) W.AlbumsManager.loadAlbum(k);
    });

    U.dom.on(refs.miniStar, 'click', (e) => {
      e.stopPropagation();
      toggleLike();
    });

    return el;
  }

  function createNextUp() {
    if (refs.nextUp && D.contains(refs.nextUp)) return refs.nextUp;
    const tpl = $('next-up-template');
    const el = tpl ? tpl.content.cloneNode(true).querySelector('#next-up') : D.createElement('div');
    refs.nextUp = el;
    refs.nextUpTitle = el.querySelector('.title');
    return el;
  }

  function toggleDisplay(id, show) {
    const el = $(id);
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  // --- High Frequency UI Updates ---

  function updateProgressUI(pos, dur) {
    const p = (dur > 0) ? (pos / dur) * 100 : 0;
    if (refs.fill) refs.fill.style.width = `${U.clamp(p, 0, 100)}%`;
    if (refs.elapsed) refs.elapsed.textContent = U.formatTime(pos);
    if (refs.rem) refs.rem.textContent = `-${U.formatTime((dur||0) - pos)}`;
  }

  function updatePlayState() {
    if (!refs.playIcon) return;
    const p = W.playerCore?.isPlaying();
    refs.playIcon.innerHTML = p 
      ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' 
      : '<path d="M8 5v14l11-7z"/>';
  }

  function updateVolumeUI(v) {
    const val = U.clamp(v, 0, 100);
    const p = val / 100;
    if (refs.volFill) refs.volFill.style.width = `${p * 100}%`;
    if (refs.volHandle) {
      // 7px is half handle width
      const trackW = refs.volFill.parentElement?.clientWidth || 100; 
      const x = U.clamp(trackW * p, 7, trackW - 7);
      refs.volHandle.style.left = `${x}px`;
    }
    if (refs.volSlider) refs.volSlider.value = val;
  }

  function updateMiniInfo() {
    if (!st.inMini) return;
    const pc = W.playerCore;
    const t = pc?.getCurrentTrack();
    
    if (refs.miniNum) refs.miniNum.textContent = `${String((pc?.getIndex()||0) + 1).padStart(2,'0')}.`;
    if (refs.miniTitle) refs.miniTitle.textContent = t?.title || '—';
    
    if (refs.miniStar) {
      const pa = W.AlbumsManager?.getPlayingAlbum();
      const liked = U.fav.isTrackLikedInContext({ playingAlbum: pa, track: t });
      refs.miniStar.src = liked ? 'img/star.png' : 'img/star2.png';
    }

    const nIdx = pc?.getNextIndex();
    const nt = pc?.getPlaylistSnapshot()?.[nIdx];
    if (refs.nextUpTitle) {
      const txt = nt?.title || '—';
      refs.nextUpTitle.textContent = txt;
      refs.nextUpTitle.title = txt;
    }
  }

  function updateDownloadBtn(t) {
    const btn = $('track-download-btn');
    if (!btn) return;
    U.download.applyDownloadLink(btn, t);
  }

  function updatePQState() {
    const btn = $('pq-btn');
    const lbl = $('pq-btn-label');
    if (!btn || !lbl) return;

    const s = U.pq.getState();
    btn.className = `player-control-btn pq-${s.mode}`;
    U.setAriaDisabled(btn, !s.canToggle);
    lbl.textContent = s.mode === 'lo' ? 'Lo' : 'Hi';
  }

  // --- Interaction Handlers ---

  function bindBlockEvents(b) {
    if (b.__bound) return;
    b.__bound = true;

    // Buttons delegation
    b.addEventListener('click', (e) => {
      const t = e.target.closest('button, a');
      if (!t) return;
      const pc = W.playerCore;
      const id = t.id;

      if (id === 'play-pause-btn') return pc.isPlaying() ? pc.pause() : pc.play();
      if (id === 'prev-btn') return pc.prev();
      if (id === 'next-btn') return pc.next();
      if (id === 'stop-btn') return pc.stop();
      
      if (id === 'shuffle-btn') { pc.toggleShuffle(); U.setBtnActive(id, pc.isShuffle()); return updateQueue(); }
      if (id === 'repeat-btn') { pc.toggleRepeat(); U.setBtnActive(id, pc.isRepeat()); return; }
      if (id === 'mute-btn') { st.muted = !st.muted; pc.setMuted?.(st.muted); U.setBtnActive(id, st.muted); return; }
      
      if (id === 'pq-btn') return togglePQ();
      if (id === 'favorites-btn') return toggleFavMode();
      
      if (id === 'lyrics-toggle-btn') return W.LyricsController?.toggleLyricsView();
      if (id === 'animation-btn') return W.LyricsController?.toggleAnimation();
      if (id === 'lyrics-text-btn') return W.LyricsModal?.show();
      
      if (id === 'pulse-btn') return togglePulse();
      if (id === 'sleep-timer-btn') return W.SleepTimer?.show();
      if (id === 'stats-btn') return W.StatisticsModal?.show?.();
      
      if (id === 'track-download-btn' && !t.getAttribute('href')) {
        e.preventDefault();
        W.NotificationSystem?.error('Трек недоступен для скачивания');
      }
    });

    // Volume input
    const vSl = b.querySelector('#volume-slider');
    U.dom.on(vSl, 'input', (e) => {
      const v = U.toInt(e.target.value);
      W.playerCore?.setVolume(v);
      U.lsSet(LS.VOL, v);
      U.dom.raf(() => updateVolumeUI(v));
    });

    // Seek interaction
    const pBar = b.querySelector('#player-progress-bar');
    if (pBar) {
      const onSeek = (ev) => {
        const pc = W.playerCore;
        if (!pc) return;
        const rect = pBar.getBoundingClientRect();
        const x = (ev.touches ? ev.touches[0].clientX : ev.clientX);
        const p = U.clamp((x - rect.left) / rect.width, 0, 1);
        pc.seek(pc.getDuration() * p);
      };
      
      const endSeek = () => { st.seeking = false; D.removeEventListener('pointermove', onSeek); D.removeEventListener('pointerup', endSeek); };
      
      U.dom.on(pBar, 'pointerdown', (ev) => {
        st.seeking = true;
        onSeek(ev);
        D.addEventListener('pointermove', onSeek);
        D.addEventListener('pointerup', endSeek);
        D.addEventListener('pointercancel', endSeek);
      });
    }
  }

  // --- Logic Implementations ---

  function togglePQ() {
    const r = U.pq.toggle();
    if (!r.ok) {
      const msg = r.reason === 'offline' ? 'Нет сети' : 'Lo недоступно';
      W.NotificationSystem?.[r.reason === 'trackNoLo' ? 'info' : 'warning'](msg);
    }
    updatePQState();
  }

  function toggleLike() {
    const pc = W.playerCore;
    const t = pc?.getCurrentTrack();
    if (!t?.uid) return;

    const src = t.sourceAlbum || '';
    const pa = W.AlbumsManager?.getPlayingAlbum();
    // Use playing album key if not browsing specials
    const key = src || (!U.isSpecialAlbumKey(pa) ? pa : null);
    
    pc.toggleFavorite(t.uid, { fromAlbum: true, albumKey: key });
    updateMiniInfo();
  }

  function toggleFavMode() {
    const pa = W.AlbumsManager?.getPlayingAlbum();
    const next = !U.lsGetBool01(LS.FAV, false);
    const pc = W.playerCore;

    // Validation: Don't enable if no favorites
    if (next && pa !== W.SPECIAL_FAVORITES_KEY) {
      const uids = pc?.getLikedUidsForAlbum(pa);
      if (!uids || !uids.length) {
        W.NotificationSystem?.info('Отметьте понравившийся трек ⭐');
        return setFavOnlyUI(false);
      }
    }

    U.lsSetBool01(LS.FAV, next);
    setFavOnlyUI(next);
    W.NotificationSystem?.[next?'success':'info'](next ? '⭐ Только избранные' : 'Играют все треки');
    
    W.PlaybackPolicy?.apply?.({ reason: 'toggle' });
    updateAvailable();
    filterTrackListUI();
  }

  function setFavOnlyUI(on) {
    const btn = $('favorites-btn');
    const ico = $('favorites-btn-icon');
    if (btn) btn.classList.toggle('favorites-active', on);
    if (ico) ico.src = on ? 'img/star.png' : 'img/star2.png';
  }

  function syncFavModeUI() {
    setFavOnlyUI(U.lsGetBool01(LS.FAV, false));
  }

  function updateQueue() {
    W.PlaybackPolicy?.apply?.({ reason: 'toggle' });
    updateAvailable();
  }

  function updateAvailable() {
    // Back-compat for legacy components relying on global indices
    const pc = W.playerCore;
    const pa = W.AlbumsManager?.getPlayingAlbum();
    
    if (pa === W.SPECIAL_FAVORITES_KEY || !U.lsGetBool01(LS.FAV, false)) {
      W.availableFavoriteIndices = null;
      return;
    }

    const liked = new Set(pc?.getLikedUidsForAlbum(pa) || []);
    if (!liked.size) {
      W.availableFavoriteIndices = null;
      return;
    }

    W.availableFavoriteIndices = (pc.getPlaylistSnapshot()||[]).reduce((acc, t, i) => {
      if (t.uid && liked.has(String(t.uid))) acc.push(i);
      return acc;
    }, []);
  }

  function filterTrackListUI() {
    const list = $('track-list');
    if (!list) return;

    const on = U.lsGetBool01(LS.FAV, false);
    const cur = W.AlbumsManager?.getCurrentAlbum();
    const play = W.AlbumsManager?.getPlayingAlbum();
    
    // Only filter if looking at the playing regular album
    const shouldFilter = on && cur && play && cur === play && !U.isSpecialAlbumKey(cur);
    list.classList.toggle('favonly-filtered', shouldFilter);

    if (shouldFilter) {
      const pc = W.playerCore;
      const liked = new Set(pc?.getLikedUidsForAlbum(cur) || []);
      
      list.querySelectorAll('.track').forEach(row => {
        const uid = String(row.dataset.uid || '').trim();
        // Keep current track visible even if unliked temporarily
        if (uid && !liked.has(uid)) row.setAttribute('data-hidden-by-favonly', '1');
        else row.removeAttribute('data-hidden-by-favonly');
      });
    }
  }

  // --- Visual Effects ---

  function togglePulse() {
    st.bitActive = !st.bitActive;
    U.lsSetBool01(LS.BIT, st.bitActive);
    
    const btn = $('pulse-btn');
    const h = $('pulse-heart');
    if (btn) btn.classList.toggle('active', st.bitActive);
    if (h) h.textContent = st.bitActive ? '❤️' : '🤍';

    if (st.bitActive) startBit();
    else stopBit();
  }

  function startBit() {
    // Attempt WebAudio hookup
    try { W.playerCore?.rebuildCurrentSound?.({ preferWebAudio: true }); } catch {}
    
    if (W.Howler?.ctx && !st.analyser) {
      st.audioCtx = W.Howler.ctx;
      if (st.audioCtx.state === 'suspended') st.audioCtx.resume().catch(()=>{});
      
      try {
        const a = st.audioCtx.createAnalyser();
        a.fftSize = 256;
        W.Howler.masterGain.connect(a);
        st.analyser = a;
      } catch (e) {
        st.analyser = null;
      }
    }

    if (!st.analyser) {
      // Fallback or error
      st.bitActive = false;
      U.lsSetBool01(LS.BIT, false);
      $('pulse-btn')?.classList.remove('active');
      W.NotificationSystem?.warning('Пульсация недоступна (браузер)');
      return;
    }
    
    drawBit();
  }

  function drawBit() {
    if (!st.bitActive) return;
    if (st.analyser) {
      const arr = new Uint8Array(st.analyser.frequencyBinCount);
      st.analyser.getByteFrequencyData(arr);
      // Simple bass calculation
      let sum = 0;
      const low = Math.floor(arr.length * 0.3);
      for(let i=0; i<low; i++) sum += arr[i];
      const s = 1 + ((sum/low)/255)*0.2;
      const logo = $('logo-bottom');
      if (logo) logo.style.transform = `scale(${s})`;
    }
    st.animId = requestAnimationFrame(drawBit);
  }

  function stopBit() {
    if (st.animId) cancelAnimationFrame(st.animId);
    const logo = $('logo-bottom');
    if (logo) {
      logo.style.transform = 'scale(1)';
      logo.style.transition = 'transform 0.3s ease-out';
      setTimeout(() => logo.style.transition = '', 300);
    }
    st.analyser = null; // Reset to allow re-hook
  }

  // --- Jump Button ---

  function checkJumpBtn() {
    if (!refs.jumpBtn) {
      const div = D.createElement('div');
      div.className = 'jump-to-playing';
      div.innerHTML = '<button>↑</button>';
      div.onclick = () => $('lyricsplayerblock')?.scrollIntoView({behavior:'smooth',block:'center'});
      D.body.appendChild(div);
      refs.jumpBtn = div;
    }
    
    if (!('IntersectionObserver' in W)) return;
    
    // Observer logic embedded
    const obs = new IntersectionObserver(([e]) => {
      const visible = !e.isIntersecting && !U.isBrowsingOtherAlbum();
      refs.jumpBtn.style.display = visible ? 'flex' : 'none';
    });
    
    const blk = $('lyricsplayerblock');
    if (blk) obs.observe(blk);
  }

  // --- Restoration ---

  function restoreConfig() {
    syncFavModeUI();
    
    const v = U.toInt(U.lsGet(LS.VOL), 50);
    W.playerCore?.setVolume(v);
    updateVolumeUI(v);

    W.LyricsController?.restoreSettingsIntoDom?.();
    updatePQState();

    st.bitActive = U.lsGetBool01(LS.BIT, false);
    if (st.bitActive) {
      const h = $('pulse-heart');
      if (h) h.textContent = '❤️';
      setTimeout(startBit, 1000);
    }
  }

  // --- Exports ---

  W.PlayerUI = {
    initialize: init,
    ensurePlayerBlock: ensureUI,
    updateMiniHeader: updateMiniInfo,
    updateNextUpLabel: updateMiniInfo, // Merged
    togglePlayPause: () => $('play-pause-btn')?.click(),
    toggleLikePlaying: toggleLike,
    switchAlbumInstantly: (key) => {
        const i = W.playerCore?.getIndex();
        if (i >= 0) ensureUI(i);
        updateMiniInfo();
    },
    toggleFavoritesOnly: toggleFavMode,
    updateAvailableTracksForPlayback: updateAvailable,
    get currentLyrics() { return W.LyricsController?.getCurrentLyrics() || []; },
    get currentLyricsLines() { return W.LyricsController?.getCurrentLyricsLines() || []; }
  };

  // Global toggle shortcut
  W.toggleFavoritesOnly = toggleFavMode;

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init);
  else init();

})();
