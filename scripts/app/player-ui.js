// scripts/app/player-ui.js
// UI плеера на новой платформе PlayerCore
// Инвариант: UI не должен вызывать stop()/форсить play()/сбрасывать позицию/громкость из-за новых фич.
// Lyrics полностью вынесены в scripts/app/player-ui/lyrics.js (window.LyricsController).

(function PlayerUIModule() {
  'use strict';

  const w = window;
  const U = w.Utils;
  const $ = (id) => U?.dom?.byId ? U.dom.byId(id) : (U?.$ ? U.$(id) : document.getElementById(id));
  const on = (el, ev, fn, opts) => (U?.dom?.on ? U.dom.on(el, ev, fn, opts) : (el && el.addEventListener(ev, fn, opts)));
  const raf = (fn) => (U?.dom?.raf ? U.dom.raf(fn) : requestAnimationFrame(fn));

  const STAR_ON = 'img/star.png';
  const STAR_OFF = 'img/star2.png';

  const LS = {
    FAV_ONLY: 'favoritesOnlyMode',
    VOL: 'playerVolume',
    BIT: 'bitEnabled',
  };

  const st = {
    seeking: false,
    muted: false,

    inMiniMode: false,
    savedLyricsMini: null,

    ensureTimer: null,

    // jump-to-playing
    jumpObserver: null,
    lastNativeRow: null,

    // pulse
    bitEnabled: false,
    bitIntensity: 100,
    audioContext: null,
    analyser: null,
    animFrame: null,

    // seek listeners
    seekAbort: null,
  };

  // --------------------------
  // Init
  // --------------------------
  function initialize() {
    if (w.__playerUIInitialized) return;
    w.__playerUIInitialized = true;

    if (!Array.isArray(w.albumsIndex) || w.albumsIndex.length === 0) {
      w.__playerUIInitialized = false;
      setTimeout(initialize, 100);
      return;
    }

    restoreSettings();
    attachPlayerCoreEvents();
    attachFavoritesRealtimeSync();
    attachNetworkPQSync();

    console.log('✅ PlayerUI initialized');
  }

  function attachPlayerCoreEvents() {
    if (!w.playerCore) {
      setTimeout(attachPlayerCoreEvents, 100);
      return;
    }

    w.playerCore.on({
      onTrackChange: (track, index) => {
        if (!track) return;

        w.__lastStatsSec = -1;

        try { w.AlbumsManager?.highlightCurrentTrack?.(index); } catch {}
        ensurePlayerBlock(index);
        try { w.LyricsController?.onTrackChange?.(track); } catch {}

        const fulltextBtn = $('lyrics-text-btn');
        if (fulltextBtn) {
          const has = !!track.fulltext;
          U?.setAriaDisabled ? U.setAriaDisabled(fulltextBtn, !has) : fulltextBtn.classList.toggle('disabled', !has);
          fulltextBtn.style.pointerEvents = has ? '' : 'none';
          fulltextBtn.style.opacity = has ? '' : '0.4';
        }

        // download + pq
        try { U?.download?.applyDownloadLink?.($('track-download-btn'), track); } catch {}
        updatePQButton();
      },

      onPlay: updatePlayPauseIcon,
      onPause: updatePlayPauseIcon,
      onStop: updatePlayPauseIcon,

      onTick: (pos, dur) => {
        updateProgress(pos, dur);
        try { w.LyricsController?.onTick?.(pos, { inMiniMode: st.inMiniMode }); } catch {}
      },

      onEnd: updatePlayPauseIcon,
    });
  }

  function attachFavoritesRealtimeSync() {
    if (w.__favoritesChangedBound) return;
    w.__favoritesChangedBound = true;

    window.addEventListener('favorites:changed', (e) => {
      try {
        updateMiniHeader();
        updateNextUpLabel();

        w.PlaybackPolicy?.apply?.({
          reason: 'favoritesChanged',
          changed: e?.detail || {},
        });

        updateAvailableTracksForPlayback();
      } catch (err) {
        console.warn('favorites:changed handler failed:', err);
      }
    });
  }

  function attachNetworkPQSync() {
    try {
      if (w.NetworkManager?.subscribe) {
        w.NetworkManager.subscribe(() => { try { updatePQButton(); } catch {} });
      } else {
        window.addEventListener('online', () => { try { updatePQButton(); } catch {} });
        window.addEventListener('offline', () => { try { updatePQButton(); } catch {} });
      }
    } catch {}
  }

  // --------------------------
  // Jump-to-playing
  // --------------------------
  function ensureJumpButton() {
    let wrap = document.querySelector('.jump-to-playing');
    if (wrap) return wrap;

    wrap = document.createElement('div');
    wrap.className = 'jump-to-playing';
    wrap.innerHTML = `<button type="button" aria-label="Перейти к текущему треку">↑</button>`;

    on(wrap, 'click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const block = $('lyricsplayerblock');
      const target = st.lastNativeRow || block;
      if (!target) return;
      try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    });

    document.body.appendChild(wrap);
    return wrap;
  }

  function setJumpVisible(onOff) {
    ensureJumpButton().style.display = onOff ? 'flex' : 'none';
  }

  function ensureJumpObserver() {
    const playerBlock = $('lyricsplayerblock');

    if (!playerBlock || U?.isBrowsingOtherAlbum?.() || !('IntersectionObserver' in window)) {
      setJumpVisible(false);
      if (st.jumpObserver) {
        try { st.jumpObserver.disconnect(); } catch {}
      }
      return;
    }

    if (!st.jumpObserver) {
      st.jumpObserver = new IntersectionObserver((entries) => {
        const entry = entries && entries[0];
        if (!entry) return;
        setJumpVisible(entry.intersectionRatio === 0 && !U.isBrowsingOtherAlbum());
      }, { threshold: [0] });
    }

    try { st.jumpObserver.disconnect(); } catch {}
    st.jumpObserver.observe(playerBlock);
  }

  // --------------------------
  // Player block placement
  // --------------------------
  function ensurePlayerBlock(trackIndex, options = {}) {
    if (!Number.isFinite(trackIndex) || trackIndex < 0) return;

    if (st.ensureTimer) clearTimeout(st.ensureTimer);
    st.ensureTimer = setTimeout(() => {
      st.ensureTimer = null;
      doEnsurePlayerBlock(trackIndex, options && typeof options === 'object' ? options : {});
    }, 50);
  }

  function doEnsurePlayerBlock(trackIndex, options = {}) {
    let block = $('lyricsplayerblock');
    if (!block) block = createPlayerBlock();

    const inMini = !!U?.isBrowsingOtherAlbum?.();
    st.inMiniMode = inMini;

    if (inMini) {
      const nowPlaying = $('now-playing');
      if (!nowPlaying) return;

      if (!nowPlaying.contains(block)) {
        nowPlaying.innerHTML = '';
        nowPlaying.appendChild(createMiniHeader());
        nowPlaying.appendChild(block);
        nowPlaying.appendChild(createNextUpElement());
      }

      if (st.savedLyricsMini == null) {
        st.savedLyricsMini = w.LyricsController?.getMiniSaveState?.() || null;
      }
      try { w.LyricsController?.applyMiniMode?.(); } catch {}

      const mh = $('mini-now');
      const nu = $('next-up');
      if (mh) { mh.style.display = 'flex'; mh.style.transition = 'none'; }
      if (nu) { nu.style.display = 'flex'; nu.style.transition = 'none'; }
    } else {
      const list = $('track-list');
      if (!list) return;

      const row = list.querySelector(`.track[data-index="${trackIndex}"]`);
      st.lastNativeRow = row || null;

      if (!row) {
        if (!block.parentNode) list.appendChild(block);
      } else if (row.nextSibling !== block) {
        row.nextSibling ? row.parentNode.insertBefore(block, row.nextSibling) : row.parentNode.appendChild(block);
      }

      if (row && options.userInitiated) {
        setTimeout(() => { try { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {} }, 50);
      }

      try { w.LyricsController?.restoreFromMiniMode?.(st.savedLyricsMini); } catch {}
      st.savedLyricsMini = null;

      const mh = $('mini-now');
      const nu = $('next-up');
      if (mh) { mh.style.display = 'none'; mh.style.transition = 'none'; }
      if (nu) { nu.style.display = 'none'; nu.style.transition = 'none'; }
    }

    updateMiniHeader();
    updateNextUpLabel();
    ensureJumpObserver();
  }

  function createPlayerBlock() {
    const tpl = document.getElementById('player-template');

    const fallback = () => {
      const d = document.createElement('div');
      d.className = 'lyrics-player-block';
      d.id = 'lyricsplayerblock';
      bindPlayerEvents(d);
      return d;
    };

    if (!tpl || !('content' in tpl)) {
      console.error('❌ #player-template not found');
      return fallback();
    }

    const node = tpl.content.cloneNode(true);
    const block = node.querySelector('#lyricsplayerblock');
    if (!block) {
      console.error('❌ #player-template has no #lyricsplayerblock');
      return fallback();
    }

    const ls = w.LyricsController?.getState?.() || { lyricsViewMode: 'normal', animationEnabled: false };

    const lw = block.querySelector('#lyrics-window');
    if (lw) {
      lw.classList.remove('lyrics-normal', 'lyrics-hidden', 'lyrics-expanded');
      lw.classList.add(`lyrics-${ls.lyricsViewMode}`);
    }

    const bg = block.querySelector('.lyrics-animated-bg');
    if (bg) bg.classList.toggle('active', !!ls.animationEnabled);

    const lt = block.querySelector('#lyrics-toggle-btn');
    if (lt) {
      lt.classList.remove('lyrics-normal', 'lyrics-hidden', 'lyrics-expanded');
      lt.classList.add(`lyrics-${ls.lyricsViewMode}`);
    }

    bindPlayerEvents(block);
    return block;
  }

  function createMiniHeader() {
    const tpl = document.getElementById('mini-header-template');
    const header = (tpl && 'content' in tpl)
      ? (tpl.content.cloneNode(true).querySelector('#mini-now') || null)
      : null;

    const el = header || (() => {
      const d = document.createElement('div');
      d.className = 'mini-now';
      d.id = 'mini-now';
      d.innerHTML = `
        <span class="tnum" id="mini-now-num">--.</span>
        <span class="track-title" id="mini-now-title">—</span>
        <img src="img/star2.png" class="like-star" id="mini-now-star" alt="звезда">
      `;
      return d;
    })();

    on(el, 'click', (e) => {
      if (e.target && e.target.id === 'mini-now-star') return;
      const playingKey = w.AlbumsManager?.getPlayingAlbum?.();
      if (playingKey && playingKey !== w.SPECIAL_RELIZ_KEY) w.AlbumsManager?.loadAlbum?.(playingKey);
    });

    on(el.querySelector('#mini-now-star'), 'click', (e) => {
      e.stopPropagation();
      toggleLikePlaying();
    });

    return el;
  }

  function createNextUpElement() {
    const tpl = document.getElementById('next-up-template');
    return (tpl && 'content' in tpl)
      ? (tpl.content.cloneNode(true).querySelector('#next-up') || document.createElement('div'))
      : (() => {
          const d = document.createElement('div');
          d.className = 'next-up';
          d.id = 'next-up';
          d.innerHTML = `<span class="label">Далее:</span><span class="title" title="">—</span>`;
          return d;
        })();
  }

  // --------------------------
  // Mini header / Next up
  // --------------------------
  function updateMiniHeader() {
    const header = $('mini-now');
    if (!header) return;

    if (!U?.isBrowsingOtherAlbum?.()) {
      header.style.display = 'none';
      return;
    }

    const track = w.playerCore?.getCurrentTrack?.();
    const index = w.playerCore?.getIndex?.();

    if (!track || !Number.isFinite(index) || index < 0) {
      header.style.display = 'none';
      return;
    }

    header.style.display = 'flex';

    const num = header.querySelector('#mini-now-num');
    const title = header.querySelector('#mini-now-title');
    if (num) num.textContent = `${String(index + 1).padStart(2, '0')}.`;
    if (title) title.textContent = track.title || '—';

    const star = header.querySelector('#mini-now-star');
    if (star) {
      const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.();
      const liked = U?.fav?.isTrackLikedInContext
        ? U.fav.isTrackLikedInContext({ playingAlbum, track })
        : false;
      star.src = liked ? STAR_ON : STAR_OFF;
    }
  }

  function updateNextUpLabel() {
    const nextUp = $('next-up');
    if (!nextUp) return;

    if (!U?.isBrowsingOtherAlbum?.()) {
      nextUp.style.display = 'none';
      return;
    }

    const nextIndex = w.playerCore?.getNextIndex?.();
    if (!Number.isFinite(nextIndex) || nextIndex < 0) {
      nextUp.style.display = 'none';
      return;
    }

    const snap = w.playerCore?.getPlaylistSnapshot?.() || [];
    const nextTrack = snap[nextIndex];
    if (!nextTrack) {
      nextUp.style.display = 'none';
      return;
    }

    nextUp.style.display = 'flex';
    const t = nextUp.querySelector('.title');
    if (t) {
      t.textContent = nextTrack.title || '—';
      t.title = nextTrack.title || '—';
    }
  }

  function switchAlbumInstantly() {
    const idx = w.playerCore?.getIndex?.();
    if (Number.isFinite(idx) && idx >= 0) ensurePlayerBlock(idx);
    updateMiniHeader();
    updateNextUpLabel();
    w.PlayerState?.save?.();
  }

  // --------------------------
  // Events binding
  // --------------------------
  function bindPlayerEvents(block) {
    if (!block || block.__eventsBound) return;
    block.__eventsBound = true;

    on(block, 'click', (e) => {
      const el = e.target?.closest?.('button, a');
      if (!el || !block.contains(el)) return;

      switch (el.id) {
        case 'play-pause-btn': togglePlayPause(); return;
        case 'prev-btn': w.playerCore?.prev?.(); return;
        case 'next-btn': w.playerCore?.next?.(); return;
        case 'stop-btn': w.playerCore?.stop?.(); return;

        case 'repeat-btn': toggleRepeat(); return;
        case 'shuffle-btn': toggleShuffle(); return;

        case 'pq-btn':
          e.preventDefault();
          e.stopPropagation();
          togglePQ();
          return;

        case 'mute-btn': toggleMute(); return;

        case 'lyrics-toggle-btn': w.LyricsController?.toggleLyricsView?.(); return;
        case 'animation-btn': w.LyricsController?.toggleAnimation?.(); return;

        case 'pulse-btn': togglePulse(); return;

        case 'favorites-btn':
          e.preventDefault();
          e.stopPropagation();
          toggleFavoritesOnly();
          return;

        case 'sleep-timer-btn': w.SleepTimer?.show?.(); return;
        case 'lyrics-text-btn': w.LyricsModal?.show?.(); return;
        case 'stats-btn': w.StatisticsModal?.show?.(); return;

        case 'track-download-btn': {
          const track = w.playerCore?.getCurrentTrack?.();
          if (!track || !track.src) {
            e.preventDefault();
            w.NotificationSystem?.error?.('Трек недоступен для скачивания');
          }
          return;
        }
      }
    });

    const volumeSlider = block.querySelector('#volume-slider');
    on(volumeSlider, 'input', onVolumeChange);

    const volumeWrap = block.querySelector('.volume-control-wrapper');
    if (volumeWrap && !volumeWrap.__bound) {
      volumeWrap.__bound = true;

      const setFromX = (clientX) => {
        const slider = block.querySelector('#volume-slider');
        const track = block.querySelector('.volume-track');
        if (!slider || !track) return;

        const rect = track.getBoundingClientRect();
        if (!rect.width) return;

        const p = U.clamp((clientX - rect.left) / rect.width, 0, 1);
        slider.value = String(Math.round(p * 100));
        onVolumeChange({ target: slider });
      };

      on(volumeWrap, 'pointerdown', (e) => { if (typeof e.clientX === 'number') setFromX(e.clientX); });
      on(volumeWrap, 'pointermove', (e) => { if (e && e.buttons === 1 && typeof e.clientX === 'number') setFromX(e.clientX); });
    }

    const bar = block.querySelector('#player-progress-bar');
    if (bar && !bar.__seekBound) {
      bar.__seekBound = true;
      on(bar, 'pointerdown', (ev) => {
        try { ev.preventDefault(); } catch {}
        st.seeking = true;
        attachSeekDocListeners();
        handleSeeking(ev);
      });
    }
  }

  function attachSeekDocListeners() {
    if (st.seekAbort) return;

    const ctrl = new AbortController();
    st.seekAbort = ctrl;

    const end = () => {
      st.seeking = false;
      detachSeekDocListeners();
    };

    const opts = { signal: ctrl.signal, passive: false };
    document.addEventListener('pointermove', handleSeeking, opts);
    document.addEventListener('pointerup', end, opts);
    document.addEventListener('pointercancel', end, opts);
  }

  function detachSeekDocListeners() {
    const ctrl = st.seekAbort;
    if (!ctrl) return;
    try { ctrl.abort(); } catch {}
    st.seekAbort = null;
  }

  // --------------------------
  // Playback controls
  // --------------------------
  function togglePlayPause() {
    if (!w.playerCore) return;
    if (w.playerCore.isPlaying?.()) w.playerCore.pause?.();
    else w.playerCore.play?.();
  }

  function updatePlayPauseIcon() {
    const icon = $('play-pause-icon');
    if (!icon || !w.playerCore) return;
    icon.innerHTML = w.playerCore.isPlaying?.()
      ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>'
      : '<path d="M8 5v14l11-7z"/>';
  }

  // --------------------------
  // Seek + Progress
  // --------------------------
  function handleSeeking(e) {
    if (!st.seeking || !w.playerCore) return;

    const bar = $('player-progress-bar');
    if (!bar) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const rect = bar.getBoundingClientRect();
    const p = rect.width ? U.clamp((clientX - rect.left) / rect.width, 0, 1) : 0;

    const dur = w.playerCore.getDuration?.() || 0;
    w.playerCore.seek?.(dur * p);
  }

  function updateProgress(pos, dur) {
    if (st.seeking) return;

    const fill = $('player-progress-fill');
    const elapsed = $('time-elapsed');
    const remaining = $('time-remaining');

    const duration = (typeof dur === 'number' && dur > 0) ? dur : 0;
    const percent = duration ? (pos / duration) * 100 : 0;

    if (fill) fill.style.width = `${U.clamp(percent, 0, 100)}%`;
    if (elapsed) elapsed.textContent = U.formatTime ? U.formatTime(pos) : '--:--';
    if (remaining) remaining.textContent = `-${U.formatTime ? U.formatTime((duration || 0) - (pos || 0)) : '--:--'}`;
  }

  // --------------------------
  // Volume
  // --------------------------
  function renderVolumeUI(value) {
    const v = U.clamp(Number(value) || 0, 0, 100);
    const p = v / 100;

    const fill = $('volume-fill');
    const handle = $('volume-handle');
    const track = $('volume-track');

    if (fill) fill.style.width = `${p * 100}%`;

    if (handle && track) {
      const rect = track.getBoundingClientRect();
      const half = 7;
      const x = U.clamp(rect.width * p, half, Math.max(half, rect.width - half));
      handle.style.left = `${x}px`;
    }
  }

  function onVolumeChange(e) {
    const v = U.clamp(U.toInt(e?.target?.value, 0), 0, 100);
    w.playerCore?.setVolume?.(v);
    raf(() => renderVolumeUI(v));
    U?.lsSet?.(LS.VOL, v);
  }

  // --------------------------
  // PQ (Hi/Lo)
  // --------------------------
  function updatePQButton() {
    const btn = $('pq-btn');
    const label = $('pq-btn-label');
    if (!btn || !label) return;

    const stt = U?.pq?.getState ? U.pq.getState() : { mode: 'hi', canToggle: false };
    const mode = stt.mode;

    btn.classList.toggle('pq-hi', mode === 'hi');
    btn.classList.toggle('pq-lo', mode === 'lo');

    if (U?.setAriaDisabled) U.setAriaDisabled(btn, !stt.canToggle);
    else btn.classList.toggle('disabled', !stt.canToggle);

    btn.style.pointerEvents = ''; // оставляем тосты по клику
    label.textContent = mode === 'lo' ? 'Lo' : 'Hi';
  }

  function togglePQ() {
    if (!w.playerCore) return;

    const r = U?.pq?.toggle ? U.pq.toggle() : { ok: false, reason: 'noUtilsPQ' };

    if (!r.ok) {
      if (r.reason === 'offline') w.NotificationSystem?.warning?.('Нет доступа к сети');
      else if (r.reason === 'trackNoLo') w.NotificationSystem?.info?.('Для этого трека Lo недоступно');
      updatePQButton();
      return;
    }

    updatePQButton();
  }

  // --------------------------
  // Repeat / Shuffle / Mute
  // --------------------------
  function toggleMute() {
    if (!w.playerCore) return;
    st.muted = !st.muted;
    w.playerCore.setMuted?.(st.muted);
    U?.setBtnActive ? U.setBtnActive('mute-btn', st.muted) : $('mute-btn')?.classList.toggle('active', st.muted);
  }

  function toggleRepeat() {
    if (!w.playerCore) return;
    w.playerCore.toggleRepeat?.();
    U?.setBtnActive ? U.setBtnActive('repeat-btn', !!w.playerCore.isRepeat?.()) : $('repeat-btn')?.classList.toggle('active', !!w.playerCore.isRepeat?.());
  }

  function toggleShuffle() {
    if (!w.playerCore) return;
    w.playerCore.toggleShuffle?.();
    U?.setBtnActive ? U.setBtnActive('shuffle-btn', !!w.playerCore.isShuffle?.()) : $('shuffle-btn')?.classList.toggle('active', !!w.playerCore.isShuffle?.());

    w.PlaybackPolicy?.apply?.({ reason: 'toggle' });
    updateAvailableTracksForPlayback();
  }

  // --------------------------
  // Pulse (bit)
  // --------------------------
  function togglePulse() {
    st.bitEnabled = !st.bitEnabled;
    U?.lsSetBool01 ? U.lsSetBool01(LS.BIT, st.bitEnabled) : (function() { try { localStorage.setItem(LS.BIT, st.bitEnabled ? '1' : '0'); } catch {} })();

    const btn = $('pulse-btn');
    const heart = $('pulse-heart');
    if (btn) btn.classList.toggle('active', st.bitEnabled);
    if (heart) heart.textContent = st.bitEnabled ? '❤️' : '🤍';

    if (st.bitEnabled) startBitEffect();
    else stopBitEffect();
  }

  function startBitEffect() {
    try { w.playerCore?.rebuildCurrentSound?.({ preferWebAudio: true }); } catch {}

    try {
      if (w.Howler && w.Howler.ctx && w.Howler.masterGain) {
        st.audioContext = st.audioContext || w.Howler.ctx;

        if (st.audioContext && st.audioContext.state === 'suspended') {
          try { st.audioContext.resume(); } catch {}
        }

        if (!st.analyser) {
          const a = st.audioContext.createAnalyser();
          a.fftSize = 256;
          a.smoothingTimeConstant = 0.85;
          try {
            w.Howler.masterGain.connect(a);
            st.analyser = a;
          } catch {
            st.analyser = null;
          }
        }
      }
    } catch {
      st.analyser = null;
    }

    if (!st.analyser) {
      st.bitEnabled = false;
      try { localStorage.setItem(LS.BIT, '0'); } catch {}
      $('pulse-btn')?.classList.remove('active');
      const heart = $('pulse-heart');
      if (heart) heart.textContent = '🤍';
      w.NotificationSystem?.warning?.('Пульсация недоступна: браузер/режим не даёт Web Audio анализ');
      return;
    }

    animateBit();
  }

  function animateBit() {
    if (!st.bitEnabled) return;

    let intensity = 0;

    if (st.analyser && st.audioContext && st.audioContext.state === 'running') {
      try {
        const data = new Uint8Array(st.analyser.frequencyBinCount);
        st.analyser.getByteFrequencyData(data);

        const bassRange = Math.floor(data.length * 0.3);
        let sum = 0;
        for (let i = 0; i < bassRange; i++) sum += data[i];
        intensity = ((sum / bassRange) / 255) * (st.bitIntensity / 100);
      } catch {}
    }

    const logo = $('logo-bottom');
    if (logo) logo.style.transform = `scale(${1 + intensity * 0.2})`;

    st.animFrame = requestAnimationFrame(animateBit);
  }

  function stopBitEffect() {
    if (st.animFrame) {
      cancelAnimationFrame(st.animFrame);
      st.animFrame = null;
    }

    const logo = $('logo-bottom');
    if (logo) {
      logo.style.transition = 'transform 0.3s ease-out';
      logo.style.transform = 'scale(1)';
      setTimeout(() => { if (logo) logo.style.transition = ''; }, 300);
    }

    st.analyser = null;
  }

  // --------------------------
  // Favorites-only (F)
  // --------------------------
  function setFavoritesOnlyUI(onOff) {
    const btn = $('favorites-btn');
    const icon = $('favorites-btn-icon');
    if (!btn || !icon) return;
    btn.classList.toggle('favorites-active', !!onOff);
    icon.src = onOff ? STAR_ON : STAR_OFF;
  }

  function toggleFavoritesOnly() {
    const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.() || null;
    const nextOn = !(U?.lsGetBool01 ? U.lsGetBool01(LS.FAV_ONLY, false) : (localStorage.getItem(LS.FAV_ONLY) === '1'));

    if (nextOn) {
      if (playingAlbum === w.SPECIAL_FAVORITES_KEY) {
        const model = Array.isArray(w.favoritesRefsModel) ? w.favoritesRefsModel : [];
        if (!model.some(it => it && it.__active && it.audio)) {
          w.NotificationSystem?.info?.('Отметьте понравившийся трек ⭐');
          U?.lsSetBool01 ? U.lsSetBool01(LS.FAV_ONLY, false) : (function() { try { localStorage.setItem(LS.FAV_ONLY, '0'); } catch {} })();
          setFavoritesOnlyUI(false);
          return;
        }
      } else if (playingAlbum && !String(playingAlbum).startsWith('__')) {
        const liked = w.FavoritesManager?.getLikedUidsForAlbum?.(playingAlbum) || [];
        if (!Array.isArray(liked) || liked.length === 0) {
          w.NotificationSystem?.info?.('Отметьте понравившийся трек ⭐');
          U?.lsSetBool01 ? U.lsSetBool01(LS.FAV_ONLY, false) : (function() { try { localStorage.setItem(LS.FAV_ONLY, '0'); } catch {} })();
          setFavoritesOnlyUI(false);
          return;
        }
      } else {
        w.NotificationSystem?.info?.('Отметьте понравившийся трек ⭐');
        U?.lsSetBool01 ? U.lsSetBool01(LS.FAV_ONLY, false) : (function() { try { localStorage.setItem(LS.FAV_ONLY, '0'); } catch {} })();
        setFavoritesOnlyUI(false);
        return;
      }
    }

    U?.lsSetBool01 ? U.lsSetBool01(LS.FAV_ONLY, nextOn) : (function() { try { localStorage.setItem(LS.FAV_ONLY, nextOn ? '1' : '0'); } catch {} })();
    setFavoritesOnlyUI(nextOn);

    if (nextOn) w.NotificationSystem?.success?.('⭐ Только избранные треки');
    else w.NotificationSystem?.info?.('Играют все треки');

    updateAvailableTracksForPlayback();
    w.PlaybackPolicy?.apply?.({ reason: 'toggle' });
  }

  function toggleLikePlaying() {
    const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.();
    const track = w.playerCore?.getCurrentTrack?.();
    if (!playingAlbum || !track || !w.FavoritesManager) return;

    const uid = String(track?.uid || '').trim();
    if (!uid) return;

    if (playingAlbum !== w.SPECIAL_FAVORITES_KEY) {
      const isLiked = !!w.FavoritesManager.isFavorite?.(playingAlbum, uid);
      w.FavoritesManager.toggleLike?.(playingAlbum, uid, !isLiked, { source: 'mini' });
    } else {
      const srcAlbum = String(track?.sourceAlbum || '').trim();
      if (!srcAlbum) return;
      const isLiked = !!w.FavoritesManager.isFavorite?.(srcAlbum, uid);
      w.FavoritesManager.toggleLike?.(srcAlbum, uid, !isLiked, { source: 'mini' });
    }

    updateMiniHeader();
  }

  // --------------------------
  // Legacy availableFavoriteIndices
  // --------------------------
  function updateAvailableTracksForPlayback() {
    const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.();
    const snap = w.playerCore?.getPlaylistSnapshot?.() || [];
    if (!playingAlbum || snap.length === 0) return;

    if (playingAlbum === w.SPECIAL_FAVORITES_KEY) {
      w.availableFavoriteIndices = null;
      return;
    }

    const favOnly = U?.lsGetBool01 ? U.lsGetBool01(LS.FAV_ONLY, false) : (localStorage.getItem(LS.FAV_ONLY) === '1');
    if (!favOnly) {
      w.availableFavoriteIndices = null;
      return;
    }

    const likedUids = w.FavoritesManager?.getLikedUidsForAlbum?.(playingAlbum) || [];
    if (!likedUids.length) {
      w.availableFavoriteIndices = null;
      return;
    }

    const set = new Set(likedUids.map(x => String(x || '').trim()).filter(Boolean));
    w.availableFavoriteIndices = [];
    snap.forEach((t, idx) => {
      const uid = String(t?.uid || '').trim();
      if (uid && set.has(uid)) w.availableFavoriteIndices.push(idx);
    });
  }

  // --------------------------
  // Restore settings
  // --------------------------
  function restoreSettings() {
    const favOnly = U?.lsGetBool01 ? U.lsGetBool01(LS.FAV_ONLY, false) : (localStorage.getItem(LS.FAV_ONLY) === '1');
    setFavoritesOnlyUI(favOnly);

    let volume = 50;
    const saved = U?.lsGet ? U.lsGet(LS.VOL, null) : localStorage.getItem(LS.VOL);
    if (saved !== null) volume = U.toInt(saved, 50);
    else U?.lsSet ? U.lsSet(LS.VOL, volume) : (function() { try { localStorage.setItem(LS.VOL, String(volume)); } catch {} })();

    w.playerCore?.setVolume?.(volume);
    const slider = $('volume-slider');
    if (slider) slider.value = String(volume);
    renderVolumeUI(volume);

    try { w.LyricsController?.restoreSettingsIntoDom?.(); } catch {}

    st.bitEnabled = U?.lsGetBool01 ? U.lsGetBool01(LS.BIT, false) : (localStorage.getItem(LS.BIT) === '1');
    const heart = $('pulse-heart');
    if (heart) heart.textContent = st.bitEnabled ? '❤️' : '🤍';
    if (st.bitEnabled) setTimeout(startBitEffect, 1000);

    try {
      if (favOnly && U?.waitFor) {
        U.waitFor(() => !!w.playerCore, 2000, 50).then(() => {
          try { w.PlaybackPolicy?.apply?.({ reason: 'init' }); } catch (e) {
            console.warn('PlaybackPolicy.apply(init) failed:', e);
          }
        });
      }
    } catch {}

    try { updatePQButton(); } catch {}

    console.log('✅ Settings restored');
  }

  // --------------------------
  // Public API
  // --------------------------
  w.PlayerUI = {
    initialize,
    ensurePlayerBlock,
    updateMiniHeader,
    updateNextUpLabel,
    togglePlayPause,
    toggleLikePlaying,
    switchAlbumInstantly,
    toggleFavoritesOnly,
    updateAvailableTracksForPlayback,

    get currentLyrics() { return w.LyricsController?.getCurrentLyrics?.() || []; },
    get currentLyricsLines() { return w.LyricsController?.getCurrentLyricsLines?.() || []; },
  };

  w.toggleFavoritesOnly = toggleFavoritesOnly;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
