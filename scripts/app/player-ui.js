// scripts/app/player-ui.js
(function (W, D) {
  'use strict';

  const U = W.Utils;
  const PlayerUI = {};

  const dom = {
    playerBlock: null,
    nowPlayingSlot: null,

    // player controls
    fill: null,
    bar: null,
    timeElapsed: null,
    timeRemaining: null,
    volFill: null,
    volHandle: null,
    volSlider: null,
    icon: null,
    pqBtn: null,
    pqLabel: null,
    favBtn: null,
    favIcon: null,

    // mini widgets
    miniHeader: null,
    nextUp: null,

    // misc
    jumpBtn: null
  };

  const st = {
    isMiniMode: false,
    isSeeking: false,
    miniSavedState: null,

    // visualizer
    bitEnabled: false,
    analyzer: null,
    rafId: 0
  };

  const $id = (id) => D.getElementById(id);

  function init() {
    if (!W.playerCore || !W.albumsIndex || !U) return setTimeout(init, 100);

    // Core events: строго UI-only
    W.playerCore.on({
      onTrackChange: handleTrackChange,
      onPlay: updatePlayPauseIcon,
      onPause: updatePlayPauseIcon,
      onStop: updatePlayPauseIcon,
      onEnd: updatePlayPauseIcon,
      onTick: handleTick
    });

    W.playerCore.onFavoritesChanged(() => {
      updateFavoritesBtn();
      updateMiniHeader();
      updatePlaylistFiltering();
    });

    // PQ button depends on network policy
    W.addEventListener('offline:uiChanged', updatePQButtonState);
    W.addEventListener('online', updatePQButtonState);
    W.addEventListener('offline', updatePQButtonState);

    // restore volume
    const savedVol = U.math.toInt(U.lsGet('playerVolume'), 100);
    W.playerCore.setVolume(savedVol);

    // visualizer state
    st.bitEnabled = U.lsGetBool01('bitEnabled');
    if (st.bitEnabled) startVisualizer();

    updateFavoritesBtn();
  }

  function ensurePlayerBlock(index, options) {
    if (!dom.playerBlock) {
      const tpl = $id('player-template');
      if (!tpl) return;

      dom.playerBlock = tpl.content.cloneNode(true).querySelector('#lyricsplayerblock');
      if (!dom.playerBlock) return;

      cacheDom(dom.playerBlock);
      bindPlayerEvents(dom.playerBlock);
    }

    dom.nowPlayingSlot = $id('now-playing');

    const newMiniMode = U.isBrowsingOtherAlbum();
    const modeChanged = st.isMiniMode !== newMiniMode;
    st.isMiniMode = newMiniMode;

    if (st.isMiniMode) mountMiniMode(modeChanged);
    else mountInlineMode(index, options);

    manageJumpButton();

    // One-pass UI refresh (без дублей)
    updatePQButtonState();
    updateFavoritesBtn();
    updatePlaylistFiltering();
    updateMiniHeader();
    updatePlayPauseIcon();
    updateDownloadState();
  }

  function cacheDom(blk) {
    const q = (s) => blk.querySelector(s);

    dom.fill = q('#player-progress-fill');
    dom.bar = q('#player-progress-bar');
    dom.timeElapsed = q('#time-elapsed');
    dom.timeRemaining = q('#time-remaining');

    dom.volFill = q('#volume-fill');
    dom.volHandle = q('#volume-handle');
    dom.volSlider = q('#volume-slider');

    dom.icon = q('#play-pause-icon');

    dom.pqBtn = q('#pq-btn');
    dom.pqLabel = q('#pq-btn-label');

    dom.favBtn = q('#favorites-btn');
    dom.favIcon = q('#favorites-btn-icon');
  }

  function mountMiniMode(modeChanged) {
    if (!dom.nowPlayingSlot) return;

    if (!dom.nowPlayingSlot.contains(dom.playerBlock) || modeChanged) {
      dom.nowPlayingSlot.innerHTML = '';
      dom.nowPlayingSlot.append(getMiniHeader(), dom.playerBlock, getNextUp());
    }

    if (W.LyricsController) {
      if (st.miniSavedState === null) st.miniSavedState = W.LyricsController.getMiniSaveState();
      W.LyricsController.applyMiniMode();
    }

    if (dom.miniHeader) dom.miniHeader.style.display = 'flex';
    if (dom.nextUp) dom.nextUp.style.display = 'flex';
  }

  function mountInlineMode(index, options) {
    const trackList = $id('track-list');

    if (trackList) {
      const cur = W.playerCore.getCurrentTrack();
      const sel = cur?.uid
        ? `.track[data-uid="${CSS.escape(cur.uid)}"]`
        : `.track[data-index="${index}"]`;

      const row = trackList.querySelector(sel);

      if (row) {
        if (row.nextSibling !== dom.playerBlock) row.after(dom.playerBlock);
        if (options?.userInitiated) {
          setTimeout(() => row.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        }
      } else {
        trackList.appendChild(dom.playerBlock);
      }
    }

    if (W.LyricsController) {
      W.LyricsController.restoreFromMiniMode(st.miniSavedState);
      st.miniSavedState = null;
    }

    if (dom.nowPlayingSlot) dom.nowPlayingSlot.innerHTML = '';
    if (dom.miniHeader) dom.miniHeader.style.display = 'none';
    if (dom.nextUp) dom.nextUp.style.display = 'none';
  }

  function getMiniHeader() {
    if (dom.miniHeader) return dom.miniHeader;

    const tpl = $id('mini-header-template');
    if (!tpl) return null;

    dom.miniHeader = tpl.content.cloneNode(true).querySelector('#mini-now');

    // open playing album when clicking mini header (but not star)
    dom.miniHeader.addEventListener('click', (e) => {
      if (e.target?.id !== 'mini-now-star') {
        const pk = W.AlbumsManager?.getPlayingAlbum?.();
        if (pk) W.AlbumsManager.loadAlbum(pk);
      }
    });

    dom.miniHeader.querySelector('#mini-now-star')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLikeCurrent();
    });

    return dom.miniHeader;
  }

  function getNextUp() {
    if (dom.nextUp) return dom.nextUp;
    const tpl = $id('next-up-template');
    dom.nextUp = tpl?.content?.cloneNode(true)?.querySelector?.('#next-up') || null;
    return dom.nextUp;
  }

  function bindPlayerEvents(root) {
    // Volume
    if (dom.volSlider) {
      dom.volSlider.addEventListener('input', (e) => {
        const val = U.math.toInt(e.target.value, 100);
        W.playerCore.setVolume(val);
        updateVolumeUI(val);
      });
      // initial UI reflect
      updateVolumeUI(W.playerCore.getVolume());
    }

    // Seek bar (pointer)
    if (dom.bar) {
      const move = (e) => {
        const rect = dom.bar.getBoundingClientRect();
        const x = e.touches ? e.touches[0].clientX : e.clientX;
        const p = U.math.clamp((x - rect.left) / rect.width, 0, 1);
        const d = W.playerCore.getDuration();
        if (d) W.playerCore.seek(d * p);
      };

      const up = () => {
        st.isSeeking = false;
        D.removeEventListener('pointermove', move);
        D.removeEventListener('pointerup', up);
      };

      dom.bar.addEventListener('pointerdown', (e) => {
        st.isSeeking = true;
        move(e);
        D.addEventListener('pointermove', move);
        D.addEventListener('pointerup', up);
      });
    }

    // Delegation ONLY inside player block.
    // Важно: не перехватываем клики по ссылкам/кнопкам по всему документу.
    root.addEventListener('click', (e) => {
      const t = e.target;

      // track download link: только предупреждение если href нет
      if (t?.closest?.('#track-download-btn')) {
        const a = t.closest('#track-download-btn');
        if (!a?.getAttribute('href')) {
          e.preventDefault();
          U.ui.toast('Скачивание недоступно', 'error');
        }
        return;
      }

      const btn = t?.closest?.('button');
      if (!btn) return;

      switch (btn.id) {
        case 'play-pause-btn':
          e.preventDefault();
          W.playerCore.isPlaying() ? W.playerCore.pause() : W.playerCore.play();
          break;

        case 'prev-btn':
          e.preventDefault();
          W.playerCore.prev();
          break;

        case 'next-btn':
          e.preventDefault();
          W.playerCore.next();
          break;

        case 'stop-btn':
          e.preventDefault();
          W.playerCore.stop();
          break;

        case 'shuffle-btn':
          e.preventDefault();
          W.playerCore.toggleShuffle();
          U.setBtnActive(btn.id, W.playerCore.isShuffle());
          updateMiniHeader();
          break;

        case 'repeat-btn':
          e.preventDefault();
          W.playerCore.toggleRepeat();
          U.setBtnActive(btn.id, W.playerCore.isRepeat());
          break;

        case 'mute-btn': {
          e.preventDefault();
          const m = !btn.classList.contains('active');
          if (W.playerCore.setMuted) W.playerCore.setMuted(m);
          U.setBtnActive(btn.id, m);
          break;
        }

        case 'pq-btn':
          e.preventDefault();
          onPQClick();
          break;

        case 'favorites-btn':
          e.preventDefault();
          toggleFavoritesOnly();
          break;

        case 'lyrics-toggle-btn':
          e.preventDefault();
          W.LyricsController?.toggleLyricsView?.();
          break;

        case 'animation-btn':
          e.preventDefault();
          W.LyricsController?.toggleAnimation?.();
          break;

        case 'lyrics-text-btn':
          e.preventDefault();
          W.LyricsModal?.show?.();
          break;

        case 'pulse-btn':
          e.preventDefault();
          togglePulse();
          break;

        case 'stats-btn':
          e.preventDefault();
          W.StatisticsModal?.openStatisticsModal?.();
          break;
      }
    }, { passive: false });
  }

  async function onPQClick() {
    // Если OfflineManager не поднялся — оставляем старый механизм Utils.pq.toggle()
    const mgr = W._offlineManagerInstance;
    if (!mgr) {
      const r = U.pq.toggle();
      if (!r.ok) {
        U.ui.toast(
          r.reason === 'trackNoLo'
            ? 'Низкое качество недоступно'
            : r.reason === 'offline'
              ? 'Нет доступа к сети'
              : 'Невозможно',
          'warning'
        );
      }
      updatePQButtonState();
      return;
    }

    const currentQ = mgr.getQuality();
    const newQ = currentQ === 'hi' ? 'lo' : 'hi';
    const needsReCache = await mgr.countNeedsReCache(newQ);

    if (needsReCache > 5) {
      const confirmFn = W.Modals?.confirm;
      if (confirmFn) {
        // styled confirm
        confirmFn({
          title: 'Смена качества',
          textHtml: `Смена качества затронет ${needsReCache} файлов. Перекачать?`,
          confirmText: 'Перекачать',
          cancelText: 'Отмена',
          onConfirm: () => {
            U.pq.toggle(); // вызывает playerCore.switchQuality(), который эмитит quality:changed
            updatePQButtonState();
          }
        });
      } else {
        // fallback native
        // eslint-disable-next-line no-alert
        if (confirm(`Смена качества затронет ${needsReCache} файлов. Перекачать?`)) {
          U.pq.toggle();
          updatePQButtonState();
        }
      }
      return;
    }

    const r = U.pq.toggle();
    if (!r.ok) {
      U.ui.toast(
        r.reason === 'trackNoLo'
          ? 'Низкое качество недоступно'
          : r.reason === 'offline'
            ? 'Нет доступа к сети'
            : 'Невозможно',
        'warning'
      );
    }
    updatePQButtonState();
  }

  function handleTrackChange(track, index) {
    W.__lastStatsSec = -1;

    // подсветка трека
    W.AlbumsManager?.highlightCurrentTrack?.(
      track?.uid ? -1 : index,
      track?.uid ? { uid: track.uid, albumKey: track.sourceAlbum } : {}
    );

    ensurePlayerBlock(index);
    W.LyricsController?.onTrackChange?.(track);

    updatePQButtonState();
    updateDownloadState();
  }

  function handleTick(pos, dur) {
    if (!st.isSeeking) {
      const p = dur > 0 ? (pos / dur) * 100 : 0;
      if (dom.fill) dom.fill.style.width = `${p}%`;
      if (dom.timeElapsed) dom.timeElapsed.textContent = U.fmt.time(pos);
      if (dom.timeRemaining) dom.timeRemaining.textContent = `-${U.fmt.time((dur || 0) - pos)}`;
    }
    W.LyricsController?.onTick?.(pos, { inMiniMode: st.isMiniMode });
  }

  function updatePlayPauseIcon() {
    if (!dom.icon) return;
    dom.icon.innerHTML = W.playerCore.isPlaying()
      ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>'
      : '<path d="M8 5v14l11-7z"/>';
  }

  function updateVolumeUI(v) {
    const val = U.math.clamp(v, 0, 100);
    if (dom.volFill) dom.volFill.style.width = `${val}%`;
    if (dom.volHandle) dom.volHandle.style.left = `${U.math.clamp(val, 2, 98)}%`;
    if (dom.volSlider) dom.volSlider.value = val;
  }

  function updatePQButtonState() {
    if (!dom.pqBtn) return;

    // v1.0: кнопка качества видна всегда (R0/R1).
    dom.pqBtn.style.display = '';

    const s = U.pq.getState();
    let cls = 'player-control-btn ';
    if (!s.netOk) {
      cls += 'disabled';
      dom.pqBtn.setAttribute('aria-disabled', 'true');
    } else {
      cls += `pq-${s.mode}`;
      dom.pqBtn.setAttribute('aria-disabled', String(!s.canToggle));
      if (!s.canToggle) cls += ' disabled-soft';
    }
    dom.pqBtn.className = cls;
    if (dom.pqLabel) dom.pqLabel.textContent = s.mode === 'lo' ? 'Lo' : 'Hi';
  }

  function updateFavoritesBtn() {
    const on = U.lsGetBool01('favoritesOnlyMode');
    if (dom.favBtn) dom.favBtn.className = `player-control-btn ${on ? 'favorites-active' : ''}`;
    if (dom.favIcon) dom.favIcon.src = on ? 'img/star.png' : 'img/star2.png';
  }

  function updateMiniHeader() {
    if (!st.isMiniMode) return;

    const trk = W.playerCore.getCurrentTrack();
    const snap = W.playerCore.getPlaylistSnapshot?.() || [];
    const nextIdx = W.playerCore.getNextIndex?.();
    const nxt = (typeof nextIdx === 'number') ? snap[nextIdx] : null;

    if (dom.miniHeader) {
      const tnum = dom.miniHeader.querySelector('#mini-now-num');
      const tit = dom.miniHeader.querySelector('#mini-now-title');
      const star = dom.miniHeader.querySelector('#mini-now-star');

      if (tnum) tnum.textContent = `${String((W.playerCore.getIndex() || 0) + 1).padStart(2, '0')}.`;
      if (tit) tit.textContent = trk ? trk.title : '—';

      if (star) {
        star.src = U.fav.isTrackLikedInContext({
          playingAlbum: W.AlbumsManager?.getPlayingAlbum?.(),
          track: trk
        })
          ? 'img/star.png'
          : 'img/star2.png';
      }
    }

    if (dom.nextUp) {
      const t = dom.nextUp.querySelector('.title');
      if (t) t.textContent = nxt ? nxt.title : '—';
    }
  }

  function updatePlaylistFiltering() {
    const lst = $id('track-list');
    if (!lst) return;

    const on = U.lsGetBool01('favoritesOnlyMode');
    const ca = W.AlbumsManager?.getCurrentAlbum?.();
    const pa = W.AlbumsManager?.getPlayingAlbum?.();

    const filter = on && ca === pa && !U.isSpecialAlbumKey(ca);
    lst.classList.toggle('favonly-filtered', filter);

    if (!filter) return;

    const liked = new Set(W.playerCore.getLikedUidsForAlbum(ca) || []);
    lst.querySelectorAll('.track').forEach((r) => {
      const u = r.dataset.uid;
      if (u && !liked.has(u)) r.setAttribute('data-hidden-by-favonly', '1');
      else r.removeAttribute('data-hidden-by-favonly');
    });
  }

  function updateDownloadState() {
    const btn = $id('track-download-btn');
    if (btn) U.download.applyDownloadLink(btn, W.playerCore.getCurrentTrack());
  }

  function toggleFavoritesOnly() {
    const next = !U.lsGetBool01('favoritesOnlyMode');
    const pa = W.AlbumsManager?.getPlayingAlbum?.();

    if (next && pa !== W.SPECIAL_FAVORITES_KEY) {
      const liked = W.playerCore.getLikedUidsForAlbum(pa);
      if (!liked?.length) return U.ui.toast('Отметьте понравившийся трек ⭐', 'info');
    }

    U.lsSetBool01('favoritesOnlyMode', next);
    updateFavoritesBtn();

    // PlaybackPolicy сам перестроит playing playlist, без stop().
    W.PlaybackPolicy?.apply?.({ reason: 'toggle' });

    PlayerUI.updateAvailableTracksForPlayback();
    updatePlaylistFiltering();

    U.ui.toast(next ? '⭐ Только избранные' : 'Играют все треки', next ? 'success' : 'info');
  }

  function toggleLikeCurrent() {
    const t = W.playerCore.getCurrentTrack();
    if (!t?.uid) return;

    const pa = W.AlbumsManager?.getPlayingAlbum?.();
    const aKey = t.sourceAlbum || (U.isSpecialAlbumKey(pa) ? null : pa);

    W.playerCore.toggleFavorite(t.uid, { fromAlbum: true, albumKey: aKey });
    updateMiniHeader();
  }

  function togglePulse() {
    st.bitEnabled = !st.bitEnabled;
    U.lsSetBool01('bitEnabled', st.bitEnabled);

    $id('pulse-btn')?.classList.toggle('active', st.bitEnabled);
    const heart = $id('pulse-heart');
    if (heart) heart.textContent = st.bitEnabled ? '❤️' : '🤍';

    st.bitEnabled ? startVisualizer() : stopVisualizer();
  }

  function startVisualizer() {
    if (W.Howler?.ctx && !st.analyzer) {
      const ctx = W.Howler.ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      try {
        st.analyzer = ctx.createAnalyser();
        st.analyzer.fftSize = 256;
        W.Howler.masterGain.connect(st.analyzer);
      } catch {
        st.analyzer = null;
      }
    }
    if (!st.analyzer) return;
    visualizerLoop();
  }

  function visualizerLoop() {
    if (!st.bitEnabled) return;

    if (st.analyzer) {
      const len = st.analyzer.frequencyBinCount;
      const arr = new Uint8Array(len);
      st.analyzer.getByteFrequencyData(arr);

      let sum = 0;
      const lim = Math.max(1, (len * 0.3) | 0);
      for (let i = 0; i < lim; i++) sum += arr[i];

      const scale = 1 + (sum / lim / 255) * 0.2;
      const l = $id('logo-bottom');
      if (l) l.style.transform = `scale(${scale})`;
    }

    st.rafId = requestAnimationFrame(visualizerLoop);
  }

  function stopVisualizer() {
    if (st.rafId) cancelAnimationFrame(st.rafId);
    st.rafId = 0;

    const l = $id('logo-bottom');
    if (l) l.style.transform = 'scale(1)';

    st.analyzer = null;
  }

  function manageJumpButton() {
    if (!dom.jumpBtn) {
      dom.jumpBtn = D.createElement('div');
      dom.jumpBtn.className = 'jump-to-playing';
      dom.jumpBtn.innerHTML = '<button>↑</button>';
      dom.jumpBtn.onclick = () => dom.playerBlock?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      D.body.appendChild(dom.jumpBtn);
    }

    if (!('IntersectionObserver' in W) || !dom.playerBlock) return;

    if (W.playerBlockObserver) W.playerBlockObserver.disconnect();
    W.playerBlockObserver = new IntersectionObserver(([e]) => {
      dom.jumpBtn.style.display = (!e.isIntersecting && !st.isMiniMode) ? 'flex' : 'none';
    }, { threshold: 0.1 });

    W.playerBlockObserver.observe(dom.playerBlock);
  }

  // Public API (то, что уже используется в проекте)
  PlayerUI.initialize = init;
  PlayerUI.ensurePlayerBlock = ensurePlayerBlock;
  PlayerUI.updateMiniHeader = updateMiniHeader;
  PlayerUI.updateNextUpLabel = updateMiniHeader;
  PlayerUI.togglePlayPause = () => (W.playerCore.isPlaying() ? W.playerCore.pause() : W.playerCore.play());
  PlayerUI.switchAlbumInstantly = () => {
    if (W.playerCore.getIndex() >= 0) {
      ensurePlayerBlock(W.playerCore.getIndex());
      updateMiniHeader();
    }
  };

  PlayerUI.updateAvailableTracksForPlayback = () => {
    const pa = W.AlbumsManager?.getPlayingAlbum?.();
    const on = U.lsGetBool01('favoritesOnlyMode');

    if (pa !== W.SPECIAL_FAVORITES_KEY && on) {
      const snap = W.playerCore.getPlaylistSnapshot() || [];
      W.availableFavoriteIndices = snap.reduce((acc, t, i) => {
        if (W.playerCore.isFavorite(t.uid)) acc.push(i);
        return acc;
      }, []);
    } else {
      W.availableFavoriteIndices = null;
    }
  };

  W.PlayerUI = PlayerUI;
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init);
  else init();

})(window, document);
