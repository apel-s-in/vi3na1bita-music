// scripts/app/player-ui.js
// Optimized v3.0: Concise, efficient DOM updates, Event delegation
(function () {
  'use strict';

  const W = window, D = document, U = W.Utils;
  const LS = { VOL: 'playerVolume', BIT: 'bitEnabled', FAV: 'favoritesOnlyMode' };
  
  // State & DOM Cache
  const S = {
    mini: false,
    seeking: false,
    bit: false,
    analyser: null,
    animId: 0,
    dom: {} // Cached elements: block, playIcon, bar, fill, time, vol, etc.
  };

  const PC = () => W.playerCore;
  const $ = (id) => D.getElementById(id);

  // --- Actions Map (Event Delegation) ---
  const ACTIONS = {
    'play-pause-btn': () => PC().isPlaying() ? PC().pause() : PC().play(),
    'prev-btn': () => PC().prev(),
    'next-btn': () => PC().next(),
    'stop-btn': () => PC().stop(),
    'shuffle-btn': () => { PC().toggleShuffle(); updateBtn('shuffle-btn', PC().isShuffle()); W.PlaybackPolicy?.apply?.({reason:'toggle'}); updateAvail(); },
    'repeat-btn': () => { PC().toggleRepeat(); updateBtn('repeat-btn', PC().isRepeat()); },
    'mute-btn': () => { const m = !PC().sound?.mute(); PC().sound?.mute(m); updateBtn('mute-btn', m); },
    'favorites-btn': () => toggleFavMode(),
    'pq-btn': () => { const r = U.pq.toggle(); updatePQ(); if(!r.ok) W.NotificationSystem?.[r.reason==='offline'?'warning':'info'](r.reason); },
    'lyrics-toggle-btn': () => W.LyricsController?.toggleLyricsView(),
    'animation-btn': () => W.LyricsController?.toggleAnimation(),
    'lyrics-text-btn': () => W.LyricsModal?.show(),
    'pulse-btn': () => toggleBit(),
    'sleep-timer-btn': () => W.SleepTimer?.show(),
    'stats-btn': () => W.SystemInfoManager?.show?.() || W.StatisticsModal?.show?.(), // Fallback if StatisticsModal not ready
    'mini-now': () => { const k = W.AlbumsManager?.getPlayingAlbum(); if(k) W.AlbumsManager.loadAlbum(k); },
    'mini-now-star': (e) => { e.stopPropagation(); toggleLike(); }
  };

  // --- Initialization ---
  function init() {
    if (!W.albumsIndex?.length) return setTimeout(init, 100);
    
    // Core Bindings
    const pc = PC();
    if (!pc) return setTimeout(init, 100);

    pc.on({
      onTrackChange: (t, i) => { 
        W.__lastStatsSec = -1; // Stats reset
        W.AlbumsManager?.highlightCurrentTrack(i, { uid: t?.uid, albumKey: t?.sourceAlbum });
        render(i);
        W.LyricsController?.onTrackChange?.(t);
        updateMeta(t);
        syncFavUI();
      },
      onPlay: updatePlayBtn, onPause: updatePlayBtn, onStop: updatePlayBtn, onEnd: updatePlayBtn,
      onTick: (pos, dur) => {
        if (!S.seeking) updateProgress(pos, dur);
        W.LyricsController?.onTick?.(pos, { inMiniMode: S.mini });
      }
    });

    // Subscriptions
    pc.onFavoritesChanged?.(() => { 
      updateMeta(pc.getCurrentTrack()); 
      W.PlaybackPolicy?.apply?.({reason:'favoritesChanged'});
      updateAvail();
      filterList();
    });
    
    const netSub = W.NetworkManager?.subscribe || ((cb) => W.addEventListener('online', cb) || W.addEventListener('offline', cb));
    netSub(() => updatePQ());

    restore();
  }

  // --- Rendering & Layout ---
  function render(idx, force) {
    const isMini = U.isBrowsingOtherAlbum();
    if (!force && S.dom.block && S.mini === isMini && document.contains(S.dom.block)) return;

    S.mini = isMini;
    
    // Get/Create Block
    let blk = $('lyricsplayerblock');
    if (!blk) {
      const tpl = $('player-template');
      if (!tpl) return;
      blk = tpl.content.cloneNode(true).querySelector('#lyricsplayerblock');
      bindBlock(blk);
    }

    // Place Block
    if (isMini) {
      const slot = $('now-playing');
      if (slot) {
        slot.innerHTML = ''; 
        slot.append(getMiniHead(), blk, getNextUp());
      }
      W.LyricsController?.applyMiniMode?.();
      toggleEl('mini-now', true); toggleEl('next-up', true);
    } else {
      const row = findRow(idx);
      if (row) row.after(blk);
      else $('track-list')?.appendChild(blk);
      
      W.LyricsController?.restoreFromMiniMode?.();
      toggleEl('mini-now', false); toggleEl('next-up', false);
    }

    // Cache Refs
    S.dom = {
      block: blk,
      fill: blk.querySelector('#player-progress-fill'),
      bar: blk.querySelector('#player-progress-bar'),
      time: blk.querySelector('#time-elapsed'),
      rem: blk.querySelector('#time-remaining'),
      vFill: blk.querySelector('#volume-fill'),
      vHand: blk.querySelector('#volume-handle'),
      playIcon: blk.querySelector('#play-pause-icon')
    };

    updatePlayBtn();
    updatePQ();
    syncFavUI();
    filterList();
    checkJump();
  }

  function findRow(idx) {
    const pc = PC(), t = pc?.getCurrentTrack();
    const uid = String(t?.uid||'').trim();
    const list = $('track-list');
    if (!list) return null;
    return uid 
      ? list.querySelector(`.track[data-uid="${CSS.escape(uid)}"][data-album="${CSS.escape(t?.sourceAlbum||'')}"]`) 
        || list.querySelector(`.track[data-uid="${CSS.escape(uid)}"]`)
      : list.querySelector(`.track[data-index="${idx}"]`);
  }

  function getMiniHead() {
    const tpl = $('mini-header-template');
    const el = tpl ? tpl.content.cloneNode(true).querySelector('#mini-now') : D.createElement('div');
    el.id = 'mini-now';
    el.onclick = ACTIONS['mini-now'];
    el.querySelector('#mini-now-star').onclick = ACTIONS['mini-now-star'];
    return el;
  }

  function getNextUp() {
    const tpl = $('next-up-template');
    return tpl ? tpl.content.cloneNode(true).querySelector('#next-up') : D.createElement('div');
  }

  function bindBlock(blk) {
    blk.addEventListener('click', (e) => {
      const t = e.target.closest('button, a');
      if (t && ACTIONS[t.id]) ACTIONS[t.id](e);
    });

    const vSl = blk.querySelector('#volume-slider');
    U.dom.on(vSl, 'input', (e) => {
      const v = U.toInt(e.target.value);
      PC()?.setVolume(v);
      U.lsSet(LS.VOL, v);
      updateVol(v);
    });

    const bar = blk.querySelector('#player-progress-bar');
    const onSeek = (e) => {
      const rect = bar.getBoundingClientRect();
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      PC()?.seek(PC().getDuration() * U.clamp((x - rect.left) / rect.width, 0, 1));
    };
    U.dom.on(bar, 'pointerdown', (e) => {
      S.seeking = true; onSeek(e);
      const end = () => { S.seeking = false; D.removeEventListener('pointermove', onSeek); D.removeEventListener('pointerup', end); };
      D.addEventListener('pointermove', onSeek); D.addEventListener('pointerup', end);
    });
  }

  // --- Updates ---
  function updateProgress(pos, dur) {
    if (!S.dom.fill) return;
    const p = dur ? (pos / dur) * 100 : 0;
    S.dom.fill.style.width = `${p}%`;
    if (S.dom.time) S.dom.time.textContent = U.formatTime(pos);
    if (S.dom.rem) S.dom.rem.textContent = `-${U.formatTime(dur - pos)}`;
  }

  function updateVol(v) {
    if (!S.dom.vFill) return;
    S.dom.vFill.style.width = `${v}%`;
    const w = S.dom.vFill.parentElement?.clientWidth || 100;
    if (S.dom.vHand) S.dom.vHand.style.left = `${U.clamp(w * (v/100), 7, w-7)}px`;
  }

  function updatePlayBtn() {
    if (S.dom.playIcon) S.dom.playIcon.innerHTML = PC()?.isPlaying() ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
  }

  function updateMeta(t) {
    t = t || PC()?.getCurrentTrack();
    U.download.applyDownloadLink($('track-download-btn'), t);
    
    if (S.mini) {
      const num = String((PC()?.getIndex()||0) + 1).padStart(2,'0');
      const pa = W.AlbumsManager?.getPlayingAlbum();
      const liked = U.fav.isTrackLikedInContext({ playingAlbum: pa, track: t });
      
      const setTxt = (id, txt) => { const el = $(id); if(el) el.textContent = txt; };
      setTxt('mini-now-num', `${num}.`);
      setTxt('mini-now-title', t?.title || '—');
      const star = $('mini-now-star');
      if (star) star.src = liked ? 'img/star.png' : 'img/star2.png';

      const nt = PC()?.getPlaylistSnapshot()?.[PC().getNextIndex()];
      const nextTitle = nt?.title || '—';
      const nu = $('next-up');
      if (nu) nu.querySelector('.title').textContent = nextTitle;
    }
  }

  function updatePQ() {
    const s = U.pq.getState(), btn = $('pq-btn');
    if (!btn) return;
    btn.className = `player-control-btn pq-${s.mode}`;
    U.setAriaDisabled(btn, !s.canToggle);
    const lbl = $('pq-btn-label'); if(lbl) lbl.textContent = s.mode==='lo'?'Lo':'Hi';
  }

  // --- Favorites & Filtering ---
  function toggleLike() {
    const t = PC()?.getCurrentTrack(), pa = W.AlbumsManager?.getPlayingAlbum();
    if (t?.uid) PC().toggleFavorite(t.uid, { fromAlbum: true, albumKey: (!U.isSpecialAlbumKey(pa) ? pa : null) });
  }

  function toggleFavMode() {
    const next = !U.lsGetBool01(LS.FAV);
    const pa = W.AlbumsManager?.getPlayingAlbum();
    if (next && pa !== W.SPECIAL_FAVORITES_KEY && !PC()?.getLikedUidsForAlbum(pa)?.length) {
      W.NotificationSystem?.info('Отметьте понравившийся трек ⭐'); return syncFavUI();
    }
    U.lsSetBool01(LS.FAV, next);
    W.NotificationSystem?.[next?'success':'info'](next ? '⭐ Только избранные' : 'Играют все треки');
    W.PlaybackPolicy?.apply?.({reason:'toggle'});
    updateAvail(); filterList(); syncFavUI();
  }

  function syncFavUI() {
    const on = U.lsGetBool01(LS.FAV);
    updateBtn('favorites-btn', on);
    const ico = $('favorites-btn-icon'); if(ico) ico.src = on ? 'img/star.png' : 'img/star2.png';
  }

  function filterList() {
    const list = $('track-list'), on = U.lsGetBool01(LS.FAV);
    const cur = W.AlbumsManager?.getCurrentAlbum(), play = W.AlbumsManager?.getPlayingAlbum();
    if (!list) return;
    
    const filter = on && cur && play && cur === play && !U.isSpecialAlbumKey(cur);
    list.classList.toggle('favonly-filtered', filter);
    if (filter) {
      const liked = new Set(PC()?.getLikedUidsForAlbum(cur));
      list.querySelectorAll('.track').forEach(r => {
        const u = r.dataset.uid || '';
        if (u && !liked.has(u)) r.dataset.hiddenByFavonly = '1'; else delete r.dataset.hiddenByFavonly;
      });
    }
  }

  function updateAvail() {
    const pa = W.AlbumsManager?.getPlayingAlbum();
    if (pa === W.SPECIAL_FAVORITES_KEY || !U.lsGetBool01(LS.FAV)) return W.availableFavoriteIndices = null;
    const liked = new Set(PC()?.getLikedUidsForAlbum(pa));
    W.availableFavoriteIndices = PC().getPlaylistSnapshot().reduce((a,t,i) => (t.uid && liked.has(t.uid) ? [...a, i] : a), []);
  }

  // --- Visuals (Bit) ---
  function toggleBit() {
    S.bit = !S.bit;
    U.lsSetBool01(LS.BIT, S.bit);
    updateBtn('pulse-btn', S.bit);
    const h = $('pulse-heart'); if(h) h.textContent = S.bit ? '❤️' : '🤍';
    
    if (S.bit) {
      try {
        if (!S.analyser && W.Howler?.ctx) {
          const ctx = W.Howler.ctx, a = ctx.createAnalyser();
          a.fftSize = 256; W.Howler.masterGain.connect(a); S.analyser = a;
        }
      } catch {}
      if (!S.analyser) { S.bit = false; return W.NotificationSystem?.warning('Пульсация недоступна'); }
      drawBit();
    } else {
      cancelAnimationFrame(S.animId);
      const l = $('logo-bottom'); if(l) l.style.transform = '';
    }
  }

  function drawBit() {
    if (!S.bit) return;
    if (S.analyser) {
      const d = new Uint8Array(S.analyser.frequencyBinCount);
      S.analyser.getByteFrequencyData(d);
      let s = 0, l = Math.floor(d.length * 0.3);
      for(let i=0; i<l; i++) s += d[i];
      const sc = 1 + ((s/l)/255)*0.2, el = $('logo-bottom');
      if (el) el.style.transform = `scale(${sc})`;
    }
    S.animId = requestAnimationFrame(drawBit);
  }

  // --- Helpers ---
  function updateBtn(id, act) { const b = $(id); if(b) b.classList.toggle('active', !!act); }
  function toggleEl(id, show) { const e = $(id); if(e) e.style.display = show ? 'flex' : 'none'; }
  function restore() {
    const v = U.toInt(U.lsGet(LS.VOL), 50);
    PC()?.setVolume(v); updateVol(v);
    if (U.lsGetBool01(LS.BIT)) setTimeout(toggleBit, 1000);
    updatePQ();
  }
  function checkJump() {
    if (!('IntersectionObserver' in W)) return;
    let btn = D.querySelector('.jump-to-playing');
    if (!btn) {
      btn = D.createElement('div'); btn.className='jump-to-playing'; btn.innerHTML='<button>↑</button>';
      btn.onclick = () => $('lyricsplayerblock')?.scrollIntoView({behavior:'smooth',block:'center'});
      D.body.appendChild(btn);
    }
    new IntersectionObserver(([e]) => btn.style.display = (!e.isIntersecting && !U.isBrowsingOtherAlbum()) ? 'flex' : 'none')
      .observe($('lyricsplayerblock') || D.body);
  }

  // --- Export ---
  W.PlayerUI = {
    initialize: init,
    ensurePlayerBlock: (i, o) => render(i, true), // force render
    updateMiniHeader: () => updateMeta(),
    updateNextUpLabel: () => updateMeta(),
    togglePlayPause: ACTIONS['play-pause-btn'],
    toggleLikePlaying: toggleLike,
    switchAlbumInstantly: (k) => { if(PC()?.getIndex() >= 0) render(PC().getIndex(), true); },
    toggleFavoritesOnly: toggleFavMode,
    updateAvailableTracksForPlayback: updateAvail,
    get currentLyrics() { return W.LyricsController?.getCurrentLyrics() || []; },
    get currentLyricsLines() { return W.LyricsController?.getCurrentLyricsLines() || []; }
  };
  W.toggleFavoritesOnly = toggleFavMode;

  D.readyState === 'loading' ? D.addEventListener('DOMContentLoaded', init) : init();
})();
