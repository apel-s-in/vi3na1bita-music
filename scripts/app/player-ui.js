// scripts/app/player-ui.js
// UI плеера на новой платформе PlayerCore
// Инвариант: UI не должен вызывать stop()/форсить play()/сбрасывать позицию/громкость из-за новых фич.
// Lyrics полностью вынесены в scripts/app/player-ui/lyrics.js (window.LyricsController).

(function PlayerUIModule() {
  'use strict';

  const w = window;

  // =========================
  // Small utils (локальные, без зависимостей)
  // =========================
  const $ = (id) => document.getElementById(id);
  const on = (el, ev, fn, opts) => { if (el) el.addEventListener(ev, fn, opts); };
  const raf = (fn) => requestAnimationFrame(fn);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const toInt = (v, d = 0) => {
    const n = parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) ? n : d;
  };

  const fmtTime = (s) => (w.Utils?.formatTime ? w.Utils.formatTime(s) : '--:--');

  // =========================
  // UI state (только UI, без влияния на playback)
  // =========================
  const state = {
    seeking: false,
    muted: false,

    // favorites-only (кнопка F) — UI хранит флаг (источник правды: localStorage)
    favoritesOnlyMode: false,

    // context mini-mode
    inMiniMode: false,
    savedLyricsForMini: null,

    // jump-to-playing
    jumpWrap: null,
    jumpObserver: null,
    lastNativeRow: null,

    // ensurePlayerBlock debounce
    ensureTimer: null,

    // progress dom cache
    progress: { fill: null, elapsed: null, remaining: null },

    // pulse (bit)
    bitEnabled: false,
    bitIntensity: 100,
    audioContext: null,
    analyser: null,
    animFrame: null,

    // seek listeners guard
    seekAbort: null,
  };

  // =========================
  // Init
  // =========================
  function initialize() {
    if (w.__playerUIInitialized) return;
    w.__playerUIInitialized = true;

    // albumsIndex может быть не готов из-за bootstrap async — подождём
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
        // legacy marker used elsewhere sometimes
        w.__lastStatsSec = -1;

        try { w.AlbumsManager?.highlightCurrentTrack?.(index); } catch {}
        ensurePlayerBlock(index);
        try { w.LyricsController?.onTrackChange?.(track); } catch {}

        // 📝 button availability: fulltext is immediate; timed lyrics handled by LyricsController
        const fulltextBtn = $('lyrics-text-btn');
        if (fulltextBtn) {
          const hasFulltext = !!track.fulltext;
          if (!hasFulltext) {
            fulltextBtn.classList.add('disabled');
            fulltextBtn.style.pointerEvents = 'none';
            fulltextBtn.style.opacity = '0.4';
          } else {
            fulltextBtn.classList.remove('disabled');
            fulltextBtn.style.pointerEvents = '';
            fulltextBtn.style.opacity = '';
          }
        }

        // download link
        updateDownloadLink(track);

        // PQ depends on track + network
        updatePQButton();
      },

      onPlay: updatePlayPauseIcon,
      onPause: updatePlayPauseIcon,
      onStop: updatePlayPauseIcon,

      onTick: (pos, dur) => {
        updateProgress(pos, dur);
        try { w.LyricsController?.onTick?.(pos, { inMiniMode: state.inMiniMode }); } catch {}
        // статистика — только в PlayerCore (не дублируем)
      },

      onEnd: () => {
        // full listen считает PlayerCore
        updatePlayPauseIcon();
      }
    });
  }

  function attachFavoritesRealtimeSync() {
    if (w.__favoritesChangedBound) return;
    w.__favoritesChangedBound = true;

    window.addEventListener('favorites:changed', (e) => {
      try {
        updateMiniHeader();
        updateNextUpLabel();

        // Единая политика очереди/режимов (favoritesOnly + shuffle) — без stop/play
        w.PlaybackPolicy?.apply?.({
          reason: 'favoritesChanged',
          changed: e?.detail || {}
        });

        // legacy fallback
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

  // =========================
  // Helpers: context / network
  // =========================
  function isBrowsingOtherAlbum() {
    const playing = w.AlbumsManager?.getPlayingAlbum?.();
    const current = w.AlbumsManager?.getCurrentAlbum?.();
    if (!playing) return false;
    if (playing === '__favorites__' && current === '__favorites__') return false;
    return playing !== current;
  }

  function isNetworkAvailable() {
    try {
      if (w.NetworkManager?.getStatus) return !!w.NetworkManager.getStatus().online;
    } catch {}
    return navigator.onLine !== false;
  }

  // =========================
  // Jump-to-playing
  // =========================
  function ensureJumpButton() {
    if (state.jumpWrap) return state.jumpWrap;

    const wrap = document.createElement('div');
    wrap.className = 'jump-to-playing';
    wrap.innerHTML = `<button type="button" aria-label="Перейти к текущему треку">↑</button>`;

    on(wrap, 'click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const playerBlock = $('lyricsplayerblock');
      const target = state.lastNativeRow || playerBlock;
      if (!target) return;

      try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
    });

    document.body.appendChild(wrap);
    state.jumpWrap = wrap;
    return wrap;
  }

  function setJumpVisible(visible) {
    const el = ensureJumpButton();
    el.style.display = visible ? 'flex' : 'none';
  }

  function updateJumpObserver() {
    const inMini = isBrowsingOtherAlbum();
    const playerBlock = $('lyricsplayerblock');

    if (inMini || !playerBlock) {
      setJumpVisible(false);
      if (state.jumpObserver) {
        try { state.jumpObserver.disconnect(); } catch {}
        state.jumpObserver = null;
      }
      return;
    }

    if (!('IntersectionObserver' in window)) {
      setJumpVisible(false);
      return;
    }

    if (!state.jumpObserver) {
      state.jumpObserver = new IntersectionObserver((entries) => {
        const entry = entries && entries[0];
        if (!entry) return;
        const out = entry.intersectionRatio === 0;
        const stillNative = !isBrowsingOtherAlbum();
        setJumpVisible(out && stillNative);
      }, { threshold: [0] });
    }

    try { state.jumpObserver.disconnect(); } catch {}
    state.jumpObserver.observe(playerBlock);
  }

  // =========================
  // Player block placement
  // =========================
  function ensurePlayerBlock(trackIndex, options = {}) {
    if (!Number.isFinite(trackIndex) || trackIndex < 0) {
      console.warn('⚠️ ensurePlayerBlock called with invalid trackIndex:', trackIndex);
      return;
    }

    if (state.ensureTimer) clearTimeout(state.ensureTimer);
    const opts = (options && typeof options === 'object') ? options : {};

    state.ensureTimer = setTimeout(() => {
      state.ensureTimer = null;
      doEnsurePlayerBlock(trackIndex, opts);
    }, 50);
  }

  function doEnsurePlayerBlock(trackIndex, options = {}) {
    if (!Number.isFinite(trackIndex) || trackIndex < 0) {
      console.warn('⚠️ doEnsurePlayerBlock: invalid trackIndex', trackIndex);
      return;
    }

    let block = $('lyricsplayerblock');
    if (!block) block = createPlayerBlock();

    const inMini = isBrowsingOtherAlbum();
    state.inMiniMode = inMini;

    if (inMini) {
      const nowPlaying = $('now-playing');
      if (!nowPlaying) {
        console.error('❌ #now-playing not found!');
        return;
      }

      if (!nowPlaying.contains(block)) {
        nowPlaying.innerHTML = '';
        nowPlaying.appendChild(createMiniHeader());
        nowPlaying.appendChild(block);
        nowPlaying.appendChild(createNextUpElement());
      }

      if (state.savedLyricsForMini === null) {
        state.savedLyricsForMini = w.LyricsController?.getMiniSaveState?.() || null;
      }
      try { w.LyricsController?.applyMiniMode?.(); } catch {}

      const miniHeaderEl = $('mini-now');
      const nextUpEl = $('next-up');
      if (miniHeaderEl) { miniHeaderEl.style.display = 'flex'; miniHeaderEl.style.transition = 'none'; }
      if (nextUpEl) { nextUpEl.style.display = 'flex'; nextUpEl.style.transition = 'none'; }
    } else {
      const trackList = $('track-list');
      if (!trackList) {
        console.error('❌ #track-list not found!');
        return;
      }

      const row = trackList.querySelector(`.track[data-index="${trackIndex}"]`);
      state.lastNativeRow = row || null;

      if (!row) {
        console.warn(`⚠️ Track row [data-index="${trackIndex}"] not found!`);
        if (!block.parentNode) trackList.appendChild(block);
      } else if (row.nextSibling !== block) {
        if (row.nextSibling) row.parentNode.insertBefore(block, row.nextSibling);
        else row.parentNode.appendChild(block);
      }

      if (row && options?.userInitiated) {
        setTimeout(() => { try { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {} }, 50);
      }

      try { w.LyricsController?.restoreFromMiniMode?.(state.savedLyricsForMini); } catch {}
      state.savedLyricsForMini = null;

      const miniHeaderEl = $('mini-now');
      const nextUpEl = $('next-up');
      if (miniHeaderEl) { miniHeaderEl.style.display = 'none'; miniHeaderEl.style.transition = 'none'; }
      if (nextUpEl) { nextUpEl.style.display = 'none'; nextUpEl.style.transition = 'none'; }
    }

    updateMiniHeader();
    updateNextUpLabel();
    updateJumpObserver();
  }

  // =========================
  // DOM creation
  // =========================
  function createPlayerBlock() {
    const block = document.createElement('div');
    block.className = 'lyrics-player-block';
    block.id = 'lyricsplayerblock';

    const ls = w.LyricsController?.getState?.() || { lyricsViewMode: 'normal', animationEnabled: false };

    block.innerHTML = `
      <div id="lyrics-window" class="lyrics-${ls.lyricsViewMode}">
        <div class="lyrics-animated-bg${ls.animationEnabled ? ' active' : ''}"></div>
        <div class="lyrics-scroll" id="lyrics">
          <div class="lyrics-placeholder lyrics-spinner"></div>
        </div>
      </div>

      <div class="player-progress-wrapper">
        <div class="player-progress-bar" id="player-progress-bar">
          <div class="player-progress-fill" id="player-progress-fill">
            <div class="player-progress-handle"></div>
          </div>
        </div>
      </div>

      <div class="player-controls">
        <div class="player-controls-row">
          <span class="time-in-controls" id="time-elapsed">00:00</span>

          <button class="player-control-btn" id="prev-btn" title="Предыдущий трек (P)">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 5L4 12l7 7V5zm9 0v14l-7-7 7-7z"/>
            </svg>
          </button>

          <button class="player-control-btn main" id="play-pause-btn" title="Воспроизведение/Пауза (K)">
            <svg id="play-pause-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>

          <button class="player-control-btn" id="stop-btn" title="Стоп (X)">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12"/>
            </svg>
          </button>

          <button class="player-control-btn" id="next-btn" title="Следующий трек (N)">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 5l7 7-7 7V5zM4 5v14l7-7-7-7z"/>
            </svg>
          </button>

          <span class="time-in-controls" id="time-remaining">--:--</span>
        </div>

        <div class="player-controls-row">
          <button class="player-control-btn" id="pq-btn" title="Качество (Hi/Lo)">
            <span class="pq-btn-label" id="pq-btn-label">Hi</span>
          </button>

          <button class="player-control-btn" id="mute-btn" title="Без звука (M)">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
            </svg>
          </button>

          <button class="player-control-btn" id="shuffle-btn" title="Случайный порядок (U)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 17h2.735a4 4 0 003.43-1.942l3.67-6.116A4 4 0 0116.265 7H21m0 0l-3-3m3 3l-3 3"/>
              <path d="M3 7h2.735a4 4 0 013.43 1.942l3.67 6.116A4 4 0 0016.265 17H21m0 0l-3 3m3-3l-3-3"/>
            </svg>
          </button>

          <button class="player-control-btn" id="repeat-btn" title="Повтор трека (R)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 2l4 4-4 4"/>
              <path d="M3 11V9a4 4 0 014-4h14"/>
              <path d="M7 22l-4-4 4-4"/>
              <path d="M21 13v2a4 4 0 01-4 4H3"/>
              <circle cx="12" cy="12" r="1" fill="currentColor"/>
            </svg>
          </button>

          <button class="sleep-timer-btn" id="sleep-timer-btn" title="Таймер сна (T)">
            <svg viewBox="0 0 24 24" width="24" height="24">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"></circle>
              <path d="M12 7v5l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
            <span class="sleep-timer-badge" id="sleep-timer-badge" style="display:none;">0</span>
          </button>

          <button class="player-control-btn" id="favorites-btn" title="Только избранные (F)">
            <img src="img/star2.png" alt="★" id="favorites-btn-icon"/>
          </button>
        </div>
      </div>

      <div class="volume-control-wrapper">
        <div class="volume-track" id="volume-track">
          <div class="volume-fill" id="volume-fill"></div>
          <div class="volume-handle" id="volume-handle"></div>
        </div>
        <input type="range" class="volume-slider" id="volume-slider" min="0" max="100" value="100" aria-label="Громкость">
      </div>

      <div class="player-buttons-wrapper">
        <div class="player-extra-buttons-row">
          <button class="lyrics-toggle-btn lyrics-${ls.lyricsViewMode}" id="lyrics-toggle-btn" title="Режим лирики (Y)">
            <span class="lyrics-toggle-btn-visual">Т</span>
          </button>

          <button class="animation-btn" id="animation-btn" title="Анимация лирики (A)">A</button>

          <button class="karaoke-btn" id="lyrics-text-btn" title="Полный текст песни">📝</button>

          <button class="stats-btn" id="stats-btn" title="Статистика" style="background:none; border:none; cursor:pointer; font-size:18px; opacity:0.8; padding:0 8px;">📊</button>

          <button class="pulse-btn" id="pulse-btn" title="Пульсация логотипа">
            <span id="pulse-heart">🤍</span>
          </button>

          <a class="player-download-btn" href="#" id="track-download-btn" download title="Скачать трек">💾</a>
        </div>
      </div>
    `;

    bindPlayerEvents(block);
    return block;
  }

  function createMiniHeader() {
    const header = document.createElement('div');
    header.className = 'mini-now';
    header.id = 'mini-now';

    header.innerHTML = `
      <span class="tnum" id="mini-now-num">--.</span>
      <span class="track-title" id="mini-now-title">—</span>
      <img src="img/star2.png" class="like-star" id="mini-now-star" alt="звезда">
    `;

    on(header, 'click', (e) => {
      if (e.target && e.target.id === 'mini-now-star') return;
      const playingKey = w.AlbumsManager?.getPlayingAlbum?.();
      if (playingKey && playingKey !== '__reliz__') w.AlbumsManager?.loadAlbum?.(playingKey);
    });

    const star = header.querySelector('#mini-now-star');
    on(star, 'click', (e) => {
      e.stopPropagation();
      toggleLikePlaying();
    });

    return header;
  }

  function createNextUpElement() {
    const nextUp = document.createElement('div');
    nextUp.className = 'next-up';
    nextUp.id = 'next-up';

    nextUp.innerHTML = `
      <span class="label">Далее:</span>
      <span class="title" title="">—</span>
    `;

    return nextUp;
  }

  // =========================
  // Mini header + Next up
  // =========================
  function updateMiniHeader() {
    const header = $('mini-now');
    if (!header) return;

    if (!isBrowsingOtherAlbum()) {
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
    const star = header.querySelector('#mini-now-star');

    if (num) num.textContent = `${String(index + 1).padStart(2, '0')}.`;
    if (title) title.textContent = track.title || '—';

    if (star) {
      const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.();
      const uid = String(track?.uid || '').trim();
      let isLiked = false;

      if (playingAlbum && w.FavoritesManager && uid) {
        if (playingAlbum !== w.SPECIAL_FAVORITES_KEY) {
          isLiked = !!w.FavoritesManager.isFavorite?.(playingAlbum, uid);
        } else {
          // __favorites__: лайк относится к sourceAlbum
          const srcAlbum = String(track?.sourceAlbum || '').trim();
          if (srcAlbum) {
            isLiked = !!w.FavoritesManager.isFavorite?.(srcAlbum, uid);
          } else {
            const ref = Array.isArray(w.favoritesRefsModel)
              ? w.favoritesRefsModel.find(it => String(it?.__uid || '').trim() === uid)
              : null;
            if (ref) isLiked = !!w.FavoritesManager.isFavorite?.(ref.__a, uid);
          }
        }
      }

      star.src = isLiked ? 'img/star.png' : 'img/star2.png';
    }
  }

  function updateNextUpLabel() {
    const nextUp = $('next-up');
    if (!nextUp) return;

    if (!isBrowsingOtherAlbum()) {
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
    const titleEl = nextUp.querySelector('.title');
    if (titleEl) {
      titleEl.textContent = nextTrack.title || '—';
      titleEl.title = nextTrack.title || '—';
    }
  }

  function switchAlbumInstantly() {
    const idx = w.playerCore?.getIndex?.();
    if (Number.isFinite(idx) && idx >= 0) ensurePlayerBlock(idx);
    updateMiniHeader();
    updateNextUpLabel();
    w.PlayerState?.save?.();
  }

  // =========================
  // Bind events (делегирование + inputs)
  // =========================
  function bindPlayerEvents(block) {
    if (!block || block.__eventsBound) return;
    block.__eventsBound = true;

    // Delegated clicks
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

    // Volume slider (input)
    const volumeSlider = block.querySelector('#volume-slider');
    on(volumeSlider, 'input', onVolumeChange);

    // Volume track pointer control (drag)
    const volumeWrap = block.querySelector('.volume-control-wrapper');
    if (volumeWrap && !volumeWrap.__bound) {
      volumeWrap.__bound = true;

      const setFromClientX = (clientX) => {
        const slider = block.querySelector('#volume-slider');
        const track = block.querySelector('.volume-track');
        if (!slider || !track) return;

        const rect = track.getBoundingClientRect();
        if (!rect.width) return;

        const p = clamp((clientX - rect.left) / rect.width, 0, 1);
        const v = Math.round(p * 100);
        slider.value = String(v);
        onVolumeChange({ target: slider });
      };

      on(volumeWrap, 'pointerdown', (e) => {
        if (e && typeof e.clientX === 'number') setFromClientX(e.clientX);
      });

      on(volumeWrap, 'pointermove', (e) => {
        if (e && e.buttons === 1 && typeof e.clientX === 'number') setFromClientX(e.clientX);
      });
    }

    // Seek handlers
    const bar = block.querySelector('#player-progress-bar');
    if (bar && !bar.__seekBound) {
      bar.__seekBound = true;

      const beginSeek = (ev) => {
        state.seeking = true;
        attachSeekDocListeners();
        handleSeeking(ev);
      };

      on(bar, 'pointerdown', (ev) => { try { ev.preventDefault(); } catch {} beginSeek(ev); });
      on(bar, 'mousedown', beginSeek);
      on(bar, 'touchstart', beginSeek, { passive: true });
    }
  }

  function attachSeekDocListeners() {
    if (state.seekAbort) return;

    const ctrl = new AbortController();
    state.seekAbort = ctrl;
    const opts = { signal: ctrl.signal, passive: false };

    const endSeek = () => {
      state.seeking = false;
      detachSeekDocListeners();
    };

    document.addEventListener('pointermove', handleSeeking, opts);
    document.addEventListener('pointerup', endSeek, opts);
    document.addEventListener('pointercancel', endSeek, opts);

    document.addEventListener('mousemove', handleSeeking, opts);
    document.addEventListener('mouseup', endSeek, opts);
    document.addEventListener('touchmove', handleSeeking, opts);
    document.addEventListener('touchend', endSeek, opts);
    document.addEventListener('touchcancel', endSeek, opts);
  }

  function detachSeekDocListeners() {
    const ctrl = state.seekAbort;
    if (!ctrl) return;
    try { ctrl.abort(); } catch {}
    state.seekAbort = null;
  }

  // =========================
  // Playback controls
  // =========================
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

  // =========================
  // Seek + Progress
  // =========================
  function handleSeeking(e) {
    if (!state.seeking) return;

    const bar = $('player-progress-bar');
    if (!bar || !w.playerCore) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const rect = bar.getBoundingClientRect();
    const p = rect.width ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0;

    const dur = w.playerCore.getDuration?.() || 0;
    w.playerCore.seek?.(dur * p);
  }

  function cacheProgressDom() {
    const block = $('lyricsplayerblock');
    if (!block) return;

    const d = state.progress;
    if (d.fill?.isConnected && d.elapsed?.isConnected && d.remaining?.isConnected) return;

    d.fill = $('player-progress-fill');
    d.elapsed = $('time-elapsed');
    d.remaining = $('time-remaining');
  }

  function updateProgress(pos, dur) {
    if (state.seeking) return;

    cacheProgressDom();

    const duration = (typeof dur === 'number' && dur > 0) ? dur : 0;
    const percent = duration ? (pos / duration) * 100 : 0;

    if (state.progress.fill) state.progress.fill.style.width = `${clamp(percent, 0, 100)}%`;
    if (state.progress.elapsed) state.progress.elapsed.textContent = fmtTime(pos);
    if (state.progress.remaining) state.progress.remaining.textContent = `-${fmtTime((duration || 0) - (pos || 0))}`;
  }

  // =========================
  // Volume UI
  // =========================
  function renderVolumeUI(value) {
    const v = clamp(Number(value) || 0, 0, 100);
    const p = v / 100;

    const fill = $('volume-fill');
    const handle = $('volume-handle');
    const track = $('volume-track');

    if (fill) fill.style.width = `${p * 100}%`;

    if (handle && track) {
      const rect = track.getBoundingClientRect();
      const handleHalf = 7; // 14px / 2
      const xRaw = rect.width * p;
      const x = clamp(xRaw, handleHalf, Math.max(handleHalf, rect.width - handleHalf));
      handle.style.left = `${x}px`;
    }
  }

  function onVolumeChange(e) {
    const v = clamp(toInt(e?.target?.value, 0), 0, 100);
    w.playerCore?.setVolume?.(v);
    raf(() => renderVolumeUI(v));
    try { localStorage.setItem('playerVolume', String(v)); } catch {}
  }

  // =========================
  // PQ (Hi/Lo) — по ТЗ
  // =========================
  function updatePQButton() {
    const btn = $('pq-btn');
    const label = $('pq-btn-label');
    if (!btn || !label) return;

    const modeRaw = String(localStorage.getItem('qualityMode:v1') || w.playerCore?.getQualityMode?.() || 'hi').toLowerCase();
    const mode = (modeRaw === 'lo') ? 'lo' : 'hi';

    const canToggleByTrack = !!w.playerCore?.canToggleQualityForCurrentTrack?.();
    const netOk = isNetworkAvailable();

    // ТЗ 7.5.1: сеть недоступна => кнопка disabled
    const canToggle = canToggleByTrack && netOk;

    btn.classList.toggle('pq-hi', mode === 'hi');
    btn.classList.toggle('pq-lo', mode === 'lo');
    btn.classList.toggle('disabled', !canToggle);

    btn.setAttribute('aria-disabled', canToggle ? 'false' : 'true');
    // pointerEvents НЕ отключаем: нужен toast по клику (ТЗ)
    btn.style.pointerEvents = '';

    label.textContent = (mode === 'lo') ? 'Lo' : 'Hi';
  }

  function togglePQ() {
    if (!w.playerCore) return;

    if (!isNetworkAvailable()) {
      w.NotificationSystem?.warning?.('Нет доступа к сети');
      updatePQButton();
      return;
    }

    const canToggle = !!w.playerCore.canToggleQualityForCurrentTrack?.();
    if (!canToggle) {
      w.NotificationSystem?.info?.('Для этого трека Lo недоступно');
      updatePQButton();
      return;
    }

    const curRaw = String(localStorage.getItem('qualityMode:v1') || w.playerCore.getQualityMode?.() || 'hi').toLowerCase();
    const cur = (curRaw === 'lo') ? 'lo' : 'hi';
    const next = (cur === 'hi') ? 'lo' : 'hi';

    // Важно: PlayerCore.switchQuality уже делает “тихую пересборку” с сохранением pos/wasPlaying.
    w.playerCore.switchQuality?.(next);
    updatePQButton();
  }

  // =========================
  // Repeat / Shuffle / Mute
  // =========================
  function toggleMute() {
    if (!w.playerCore) return;

    state.muted = !state.muted;
    w.playerCore.setMuted?.(state.muted);

    const btn = $('mute-btn');
    if (btn) btn.classList.toggle('active', state.muted);
  }

  function toggleRepeat() {
    if (!w.playerCore) return;
    w.playerCore.toggleRepeat?.();
    const btn = $('repeat-btn');
    if (btn) btn.classList.toggle('active', !!w.playerCore.isRepeat?.());
  }

  function toggleShuffle() {
    if (!w.playerCore) return;

    w.playerCore.toggleShuffle?.();
    const btn = $('shuffle-btn');
    if (btn) btn.classList.toggle('active', !!w.playerCore.isShuffle?.());

    // Пересчёт политики очереди (без stop/play)
    w.PlaybackPolicy?.apply?.({ reason: 'toggle' });
    updateAvailableTracksForPlayback();
  }

  // =========================
  // Pulse (bit) — НЕ влияет на playback, только визуал
  // =========================
  function togglePulse() {
    state.bitEnabled = !state.bitEnabled;
    try { localStorage.setItem('bitEnabled', state.bitEnabled ? '1' : '0'); } catch {}

    const btn = $('pulse-btn');
    const heart = $('pulse-heart');
    if (btn) btn.classList.toggle('active', state.bitEnabled);
    if (heart) heart.textContent = state.bitEnabled ? '❤️' : '🤍';

    if (state.bitEnabled) startBitEffect();
    else stopBitEffect();
  }

  function startBitEffect() {
    // По дизайну: пытаемся мягко перейти на WebAudio backend, без stop.
    try { w.playerCore?.rebuildCurrentSound?.({ preferWebAudio: true }); } catch {}

    try {
      if (w.Howler && w.Howler.ctx && w.Howler.masterGain) {
        if (!state.audioContext) state.audioContext = w.Howler.ctx;

        if (state.audioContext && state.audioContext.state === 'suspended') {
          try { state.audioContext.resume(); } catch {}
        }

        if (!state.analyser) {
          const a = state.audioContext.createAnalyser();
          a.fftSize = 256;
          a.smoothingTimeConstant = 0.85;
          try {
            w.Howler.masterGain.connect(a);
            state.analyser = a;
          } catch {
            state.analyser = null;
          }
        }
      }
    } catch {
      state.analyser = null;
    }

    if (!state.analyser) {
      // нет анализатора — выключаем и тост (не трогаем плеер)
      state.bitEnabled = false;
      try { localStorage.setItem('bitEnabled', '0'); } catch {}

      const btn = $('pulse-btn');
      const heart = $('pulse-heart');
      if (btn) btn.classList.remove('active');
      if (heart) heart.textContent = '🤍';

      w.NotificationSystem?.warning?.('Пульсация недоступна: браузер/режим не даёт Web Audio анализ');
      return;
    }

    animateBit();
  }

  function animateBit() {
    if (!state.bitEnabled) return;

    let intensity = 0;

    if (state.analyser && state.audioContext && state.audioContext.state === 'running') {
      try {
        const data = new Uint8Array(state.analyser.frequencyBinCount);
        state.analyser.getByteFrequencyData(data);

        const bassRange = Math.floor(data.length * 0.3);
        let sum = 0;
        for (let i = 0; i < bassRange; i++) sum += data[i];
        const avg = sum / bassRange;

        intensity = (avg / 255) * (state.bitIntensity / 100);
      } catch {
        intensity = 0;
      }
    }

    const logo = $('logo-bottom');
    if (logo) {
      const scale = 1 + (intensity * 0.2);
      logo.style.transform = `scale(${scale})`;
    }

    state.animFrame = requestAnimationFrame(animateBit);
  }

  function stopBitEffect() {
    if (state.animFrame) {
      cancelAnimationFrame(state.animFrame);
      state.animFrame = null;
    }

    const logo = $('logo-bottom');
    if (logo) {
      logo.style.transition = 'transform 0.3s ease-out';
      logo.style.transform = 'scale(1)';
      setTimeout(() => { if (logo) logo.style.transition = ''; }, 300);
    }

    state.analyser = null;
  }

  // =========================
  // Favorites-only (F)
  // =========================
  function toggleFavoritesOnly() {
    const btn = $('favorites-btn');
    const icon = $('favorites-btn-icon');
    if (!btn || !icon) return;

    const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.() || null;

    const currentlyOn = (localStorage.getItem('favoritesOnlyMode') === '1');
    const nextOn = !currentlyOn;

    // ВКЛЮЧЕНИЕ: строгие проверки доступности по ТЗ (иначе остаётся OFF)
    if (nextOn) {
      if (playingAlbum === w.SPECIAL_FAVORITES_KEY) {
        const model = Array.isArray(w.favoritesRefsModel) ? w.favoritesRefsModel : [];
        const hasActive = model.some(it => it && it.__active && it.audio);
        if (!hasActive) {
          w.NotificationSystem?.info?.('Отметьте понравившийся трек ⭐');
          btn.classList.remove('favorites-active');
          icon.src = 'img/star2.png';
          try { localStorage.setItem('favoritesOnlyMode', '0'); } catch {}
          state.favoritesOnlyMode = false;
          return;
        }
      } else if (playingAlbum && !String(playingAlbum).startsWith('__')) {
        const liked = w.FavoritesManager?.getLikedUidsForAlbum?.(playingAlbum) || [];
        if (!Array.isArray(liked) || liked.length === 0) {
          w.NotificationSystem?.info?.('Отметьте понравившийся трек ⭐');
          btn.classList.remove('favorites-active');
          icon.src = 'img/star2.png';
          try { localStorage.setItem('favoritesOnlyMode', '0'); } catch {}
          state.favoritesOnlyMode = false;
          return;
        }
      } else {
        w.NotificationSystem?.info?.('Отметьте понравившийся трек ⭐');
        btn.classList.remove('favorites-active');
        icon.src = 'img/star2.png';
        try { localStorage.setItem('favoritesOnlyMode', '0'); } catch {}
        state.favoritesOnlyMode = false;
        return;
      }
    }

    state.favoritesOnlyMode = nextOn;

    if (state.favoritesOnlyMode) {
      btn.classList.add('favorites-active');
      icon.src = 'img/star.png';
      w.NotificationSystem?.success?.('⭐ Только избранные треки');
    } else {
      btn.classList.remove('favorites-active');
      icon.src = 'img/star2.png';
      w.NotificationSystem?.info?.('Играют все треки');
    }

    try { localStorage.setItem('favoritesOnlyMode', state.favoritesOnlyMode ? '1' : '0'); } catch {}

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

  // =========================
  // Download link + size hint (не влияет на playback)
  // =========================
  function updateDownloadLink(track) {
    const a = $('track-download-btn');
    if (!a) return;

    if (!track || !track.src) {
      a.href = '#';
      a.removeAttribute('download');
      a.title = 'Скачать трек';
      return;
    }

    a.href = track.src;
    a.download = `${track.title}.mp3`;

    // size hint: best effort
    let sizeHint = '';
    try {
      const playingAlbumKey = w.AlbumsManager?.getPlayingAlbum?.();
      const albumData = playingAlbumKey ? w.AlbumsManager?.getAlbumData?.(playingAlbumKey) : null;

      if (albumData && Array.isArray(albumData.tracks)) {
        const uid = String(track?.uid || '').trim();
        const byUid = uid ? albumData.tracks.find(t => t && String(t.uid || '').trim() === uid) : null;

        const size = (() => {
          if (!byUid) return null;

          const curSrc = String(track?.src || '').trim();
          const loSrc = String(byUid.fileLo || '').trim();
          if (curSrc && loSrc && curSrc === loSrc) {
            return (typeof byUid.sizeLo === 'number') ? byUid.sizeLo : null;
          }

          return (typeof byUid.sizeHi === 'number')
            ? byUid.sizeHi
            : (typeof byUid.size === 'number' ? byUid.size : null);
        })();

        if (typeof size === 'number') sizeHint = ` (~${size.toFixed(2)} МБ)`;
      }
    } catch {}

    a.title = sizeHint ? `Скачать трек${sizeHint}` : 'Скачать трек';
  }

  // =========================
  // Restore settings (UI only + допустимые вызовы)
  // =========================
  function restoreSettings() {
    state.favoritesOnlyMode = (localStorage.getItem('favoritesOnlyMode') === '1');

    const favBtn = $('favorites-btn');
    const favIcon = $('favorites-btn-icon');
    if (favBtn && favIcon) {
      if (state.favoritesOnlyMode) {
        favBtn.classList.add('favorites-active');
        favIcon.src = 'img/star.png';
      } else {
        favBtn.classList.remove('favorites-active');
        favIcon.src = 'img/star2.png';
      }
    }

    // volume: если нет — 50%
    let volume = 50;
    const saved = localStorage.getItem('playerVolume');
    if (saved !== null) {
      const v = toInt(saved, 50);
      if (Number.isFinite(v)) volume = v;
    } else {
      try { localStorage.setItem('playerVolume', String(volume)); } catch {}
    }

    // Важно: это допустимая настройка (не stop/play), и уже было так в текущем коде
    w.playerCore?.setVolume?.(volume);

    const slider = $('volume-slider');
    if (slider) slider.value = String(volume);
    renderVolumeUI(volume);

    // Lyrics DOM restore делает LyricsController
    try { w.LyricsController?.restoreSettingsIntoDom?.(); } catch {}

    // bit
    state.bitEnabled = (localStorage.getItem('bitEnabled') === '1');
    const heart = $('pulse-heart');
    if (heart) heart.textContent = state.bitEnabled ? '❤️' : '🤍';
    if (state.bitEnabled) setTimeout(startBitEffect, 1000);

    // favoritesOnly policy apply on init (без play/stop)
    try {
      if (state.favoritesOnlyMode && w.Utils?.waitFor) {
        w.Utils.waitFor(() => !!w.playerCore, 2000, 50).then(() => {
          try { w.PlaybackPolicy?.apply?.({ reason: 'init' }); } catch (e) {
            console.warn('PlaybackPolicy.apply(init) failed:', e);
          }
        });
      }
    } catch {}

    // PQ button sync
    try { updatePQButton(); } catch {}

    console.log('✅ Settings restored');
  }

  // =========================
  // Legacy availableFavoriteIndices (fallback)
  // =========================
  function updateAvailableTracksForPlayback() {
    const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.();
    const snap = w.playerCore?.getPlaylistSnapshot?.() || [];
    if (!playingAlbum || snap.length === 0) return;

    // В __favorites__ плейлист уже активный, legacy не нужен
    if (playingAlbum === w.SPECIAL_FAVORITES_KEY) {
      w.availableFavoriteIndices = null;
      return;
    }

    if (state.favoritesOnlyMode) {
      const likedUids = w.FavoritesManager?.getLikedUidsForAlbum?.(playingAlbum) || [];
      if (!likedUids.length) {
        w.availableFavoriteIndices = null;
        return;
      }

      w.availableFavoriteIndices = [];
      snap.forEach((t, idx) => {
        const uid = String(t?.uid || '').trim();
        if (uid && likedUids.includes(uid)) w.availableFavoriteIndices.push(idx);
      });
    } else {
      w.availableFavoriteIndices = null;
    }
  }

  // =========================
  // Public API (совместимость)
  // =========================
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

    get currentLyrics() {
      return w.LyricsController?.getCurrentLyrics?.() || [];
    },
    get currentLyricsLines() {
      return w.LyricsController?.getCurrentLyricsLines?.() || [];
    }
  };

  // Back-compat: некоторые места дергают глобальную функцию
  w.toggleFavoritesOnly = toggleFavoritesOnly;

  // =========================
  // Boot
  // =========================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
