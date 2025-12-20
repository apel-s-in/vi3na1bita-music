// scripts/app/player-ui.js — Объединённый UI плеера + политики воспроизведения
(function() {
  'use strict';

  // ==================== КОНФИГУРАЦИЯ ====================
  const LYRICS_CACHE_KEY = 'lyrics_cache_v1';
  const LYRICS_CACHE_MAX = 50;
  const SEEK_STEP = 5;
  const VOLUME_STEP = 0.1;

  // ==================== СОСТОЯНИЕ ====================
  const state = {
    currentLyrics: [],
    lyricsVisible: false,
    isSeeking: false,
    seekStartX: 0,
    seekStartProgress: 0,
    progressAnimFrame: null,
    isUserInteracted: false,
    pendingTrack: null,
    cleanupFns: []
  };

  // ==================== УТИЛИТЫ ====================
  const $ = id => document.getElementById(id);
  const escHtml = s => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };
  const fmtTime = s => isNaN(s) || s < 0 ? '--:--' : `${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // ==================== КЭШИРОВАНИЕ ТЕКСТОВ ====================
  const LyricsCache = {
    _getAll() {
      try { return JSON.parse(localStorage.getItem(LYRICS_CACHE_KEY)) || {}; } catch { return {}; }
    },
    _setAll(data) {
      try { localStorage.setItem(LYRICS_CACHE_KEY, JSON.stringify(data)); } catch {}
    },
    get(url) {
      const c = this._getAll()[url];
      return c ? { lyrics: c.l, ts: c.t } : null;
    },
    set(url, lyrics) {
      const all = this._getAll();
      const keys = Object.keys(all);
      if (keys.length >= LYRICS_CACHE_MAX) {
        keys.sort((a, b) => (all[a].t || 0) - (all[b].t || 0));
        keys.slice(0, 10).forEach(k => delete all[k]);
      }
      all[url] = { l: lyrics, t: Date.now() };
      this._setAll(all);
    },
    clear() { try { localStorage.removeItem(LYRICS_CACHE_KEY); } catch {} }
  };

  // ==================== ЗАГРУЗКА ТЕКСТА ====================
  async function loadLyrics(url) {
    if (!url) return [];
    
    const cached = LyricsCache.get(url);
    if (cached?.lyrics) return cached.lyrics;

    try {
      const r = await fetch(url, { cache: 'force-cache' });
      if (!r.ok) return [];
      const text = await r.text();
      const lines = parseLRC(text);
      if (lines.length) LyricsCache.set(url, lines);
      return lines;
    } catch { return []; }
  }

  function parseLRC(text) {
    const lines = [];
    const regex = /$$(\d{2}):(\d{2})(?:\.(\d{2,3}))?$$(.*)/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
      lines.push({ time: min * 60 + sec + ms / 1000, text: m[4].trim() });
    }
    return lines.sort((a, b) => a.time - b.time);
  }

  // ==================== ОТОБРАЖЕНИЕ ТЕКСТА ====================
  function renderLyrics(currentTime) {
    const box = $('lyrics-box');
    if (!box || !state.lyricsVisible || !state.currentLyrics.length) return;

    const lyrics = state.currentLyrics;
    let activeIdx = -1;
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (lyrics[i].time <= currentTime + 0.3) { activeIdx = i; break; }
    }

    const items = box.querySelectorAll('.lyrics-line');
    items.forEach((el, i) => {
      const isActive = i === activeIdx;
      el.classList.toggle('active', isActive);
      if (isActive && !el.dataset.scrolled) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.dataset.scrolled = '1';
      } else if (!isActive) {
        delete el.dataset.scrolled;
      }
    });
  }

  function displayLyricsInBox() {
    const box = $('lyrics-box');
    if (!box) return;

    if (!state.currentLyrics.length) {
      box.innerHTML = '<div class="lyrics-empty">Текст недоступен</div>';
      return;
    }

    box.innerHTML = state.currentLyrics
      .map((l, i) => `<div class="lyrics-line" data-idx="${i}">${escHtml(l.text) || '♪'}</div>`)
      .join('');
  }

  function toggleLyricsPanel() {
    const panel = $('lyrics-panel');
    const btn = $('lyrics-toggle-btn');
    if (!panel) return;

    state.lyricsVisible = !state.lyricsVisible;
    panel.classList.toggle('visible', state.lyricsVisible);
    btn?.classList.toggle('active', state.lyricsVisible);

    if (state.lyricsVisible) {
      displayLyricsInBox();
      const pos = window.playerCore?.getPosition?.() || 0;
      renderLyrics(pos);
    }
  }

  // ==================== UI ОБНОВЛЕНИЯ ====================
  function updatePlayButton(isPlaying) {
    const btn = $('play-pause-btn');
    if (btn) btn.textContent = isPlaying ? '⏸' : '▶';
  }

  function updateProgress(pos, dur) {
    const bar = $('progress-fill');
    const cur = $('time-current');
    const tot = $('time-total');
    
    if (bar && dur > 0 && !state.isSeeking) {
      bar.style.width = `${(pos / dur) * 100}%`;
    }
    if (cur) cur.textContent = fmtTime(pos);
    if (tot) tot.textContent = fmtTime(dur);
  }

  function updateTrackInfo(track) {
    const title = $('track-title');
    const artist = $('track-artist');
    const mini = $('mini-track-title');
    
    if (title) title.textContent = track?.title || 'Витрина Разбита';
    if (artist) artist.textContent = track?.artist || '';
    if (mini) mini.textContent = track?.title || '';

    // MediaSession
    if ('mediaSession' in navigator && track) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Трек',
        artist: track.artist || 'Витрина Разбита',
        album: track.album || '',
        artwork: [{ src: track.cover || 'img/logo.png', sizes: '512x512', type: 'image/png' }]
      });
    }
  }

  function updateRepeatButton(mode) {
    const btn = $('repeat-btn');
    if (!btn) return;
    const icons = { none: '🔁', all: '🔁', one: '🔂' };
    btn.textContent = icons[mode] || '🔁';
    btn.classList.toggle('active', mode !== 'none');
  }

  function updateShuffleButton(on) {
    const btn = $('shuffle-btn');
    if (btn) btn.classList.toggle('active', on);
  }

  function updateVolumeUI(vol) {
    const fill = $('volume-fill');
    const icon = $('volume-icon');
    if (fill) fill.style.width = `${vol * 100}%`;
    if (icon) icon.textContent = vol === 0 ? '🔇' : vol < 0.5 ? '🔉' : '🔊';
  }

  function updateFavoriteButton(isFav) {
    const btn = $('favorite-btn');
    if (btn) {
      btn.textContent = isFav ? '⭐' : '☆';
      btn.classList.toggle('active', isFav);
    }
  }

  // ==================== ПРОГРЕСС-БАР И SEEK ====================
  function initSeekHandlers() {
    const bar = $('progress-bar');
    if (!bar) return;

    const getProgress = e => {
      const rect = bar.getBoundingClientRect();
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      return clamp((x - rect.left) / rect.width, 0, 1);
    };

    const startSeek = e => {
      state.isSeeking = true;
      state.seekStartX = e.touches ? e.touches[0].clientX : e.clientX;
      const dur = window.playerCore?.getDuration?.() || 0;
      if (dur > 0) {
        const prog = getProgress(e);
        window.playerCore?.seek?.(prog * dur);
        updateProgress(prog * dur, dur);
      }
    };

    const doSeek = e => {
      if (!state.isSeeking) return;
      const dur = window.playerCore?.getDuration?.() || 0;
      if (dur > 0) {
        const prog = getProgress(e);
        window.playerCore?.seek?.(prog * dur);
        updateProgress(prog * dur, dur);
      }
    };

    const endSeek = () => { state.isSeeking = false; };

    bar.addEventListener('mousedown', startSeek);
    bar.addEventListener('touchstart', startSeek, { passive: true });

    const moveHandler = e => doSeek(e);
    const upHandler = () => endSeek();

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('touchmove', moveHandler, { passive: true });
    document.addEventListener('mouseup', upHandler);
    document.addEventListener('touchend', upHandler);

    // Сохраняем для cleanup
    state.cleanupFns.push(() => {
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('touchmove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
      document.removeEventListener('touchend', upHandler);
    });
  }

  // ==================== ГРОМКОСТЬ ====================
  function initVolumeHandlers() {
    const bar = $('volume-bar');
    const icon = $('volume-icon');
    if (!bar) return;

    let dragging = false;

    const setVol = e => {
      const rect = bar.getBoundingClientRect();
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const vol = clamp((x - rect.left) / rect.width, 0, 1);
      window.playerCore?.setVolume?.(vol);
      updateVolumeUI(vol);
    };

    bar.addEventListener('mousedown', e => { dragging = true; setVol(e); });
    bar.addEventListener('touchstart', e => { dragging = true; setVol(e); }, { passive: true });
    document.addEventListener('mousemove', e => dragging && setVol(e));
    document.addEventListener('touchmove', e => dragging && setVol(e), { passive: true });
    document.addEventListener('mouseup', () => { dragging = false; });
    document.addEventListener('touchend', () => { dragging = false; });

    icon?.addEventListener('click', () => {
      const cur = window.playerCore?.getVolume?.() || 1;
      const newVol = cur > 0 ? 0 : 1;
      window.playerCore?.setVolume?.(newVol);
      updateVolumeUI(newVol);
    });
  }

  // ==================== КНОПКИ УПРАВЛЕНИЯ ====================
  function initControlButtons() {
    $('play-pause-btn')?.addEventListener('click', () => window.playerCore?.togglePlay?.());
    $('prev-btn')?.addEventListener('click', () => window.playerCore?.prev?.());
    $('next-btn')?.addEventListener('click', () => window.playerCore?.next?.());
    $('stop-btn')?.addEventListener('click', () => window.playerCore?.stop?.());

    $('repeat-btn')?.addEventListener('click', () => {
      const modes = ['none', 'all', 'one'];
      const cur = window.playerCore?.getRepeatMode?.() || 'none';
      const next = modes[(modes.indexOf(cur) + 1) % modes.length];
      window.playerCore?.setRepeatMode?.(next);
      updateRepeatButton(next);
    });

    $('shuffle-btn')?.addEventListener('click', () => {
      const on = !window.playerCore?.isShuffleOn?.();
      window.playerCore?.setShuffle?.(on);
      updateShuffleButton(on);
    });

    $('favorite-btn')?.addEventListener('click', () => {
      const track = window.playerCore?.getCurrentTrack?.();
      if (!track?.uid || !track?.albumKey) return;
      window.FavoritesManager?.toggleLike?.(track.albumKey, track.uid);
      const isFav = window.FavoritesManager?.isFavorite?.(track.albumKey, track.uid);
      updateFavoriteButton(isFav);
    });

    $('lyrics-toggle-btn')?.addEventListener('click', toggleLyricsPanel);
    $('lyrics-fulltext-btn')?.addEventListener('click', () => window.LyricsModal?.show?.());
  }

  // ==================== ГОРЯЧИЕ КЛАВИШИ ====================
  function initHotkeys() {
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const key = e.key.toLowerCase();
      const pc = window.playerCore;

      switch (key) {
        case ' ':
        case 'k':
          e.preventDefault();
          pc?.togglePlay?.();
          break;
        case 'x':
          pc?.stop?.();
          break;
        case 'n':
          pc?.next?.();
          break;
        case 'p':
          pc?.prev?.();
          break;
        case 'r':
          $('repeat-btn')?.click();
          break;
        case 'u':
          $('shuffle-btn')?.click();
          break;
        case 'f':
          $('favorite-btn')?.click();
          break;
        case 't':
          window.SleepTimer?.show?.();
          break;
        case 'arrowleft':
          e.preventDefault();
          pc?.seek?.((pc.getPosition?.() || 0) - SEEK_STEP);
          break;
        case 'arrowright':
          e.preventDefault();
          pc?.seek?.((pc.getPosition?.() || 0) + SEEK_STEP);
          break;
        case 'arrowup':
          e.preventDefault();
          pc?.setVolume?.(clamp((pc.getVolume?.() || 1) + VOLUME_STEP, 0, 1));
          updateVolumeUI(pc.getVolume?.() || 1);
          break;
        case 'arrowdown':
          e.preventDefault();
          pc?.setVolume?.(clamp((pc.getVolume?.() || 1) - VOLUME_STEP, 0, 1));
          updateVolumeUI(pc.getVolume?.() || 1);
          break;
      }
    });
  }

  // ==================== PLAYBACK POLICY (iOS/Safari) ====================
  function initPlaybackPolicy() {
    const markInteracted = () => {
      if (state.isUserInteracted) return;
      state.isUserInteracted = true;
      document.body.classList.add('user-interacted');
      
      // Воспроизводим отложенный трек
      if (state.pendingTrack) {
        window.playerCore?.play?.(state.pendingTrack);
        state.pendingTrack = null;
      }
    };

    ['click', 'touchstart', 'keydown'].forEach(evt => {
      document.addEventListener(evt, markInteracted, { once: false, passive: true });
    });

    // iOS-specific: разблокировка AudioContext
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      document.addEventListener('touchstart', () => {
        if (window.Howler?.ctx?.state === 'suspended') {
          window.Howler.ctx.resume();
        }
      }, { once: true });
    }
  }

  function canAutoplay() {
    return state.isUserInteracted;
  }

  function queuePendingTrack(track) {
    state.pendingTrack = track;
  }

  // ==================== ПОДПИСКА НА СОБЫТИЯ ПЛЕЕРА ====================
  function subscribeToPlayer() {
    const pc = window.playerCore;
    if (!pc?.on) return;

    pc.on({
      onPlay: () => updatePlayButton(true),
      onPause: () => updatePlayButton(false),
      onStop: () => {
        updatePlayButton(false);
        updateProgress(0, 0);
      },
      onTrackChange: async track => {
        updateTrackInfo(track);
        const isFav = window.FavoritesManager?.isFavorite?.(track?.albumKey, track?.uid);
        updateFavoriteButton(isFav);
        
        // Загрузка текста
        state.currentLyrics = track?.lyrics ? await loadLyrics(track.lyrics) : [];
        if (state.lyricsVisible) displayLyricsInBox();
      },
      onProgress: (pos, dur) => {
        updateProgress(pos, dur);
        if (state.lyricsVisible) renderLyrics(pos);
      },
      onVolumeChange: vol => updateVolumeUI(vol),
      onError: err => window.NotificationSystem?.error?.(`Ошибка: ${err}`),
      onSleepTriggered: () => window.NotificationSystem?.info?.('⏰ Таймер сработал')
    });
  }

  // ==================== MEDIASESSION ====================
  function initMediaSession() {
    if (!('mediaSession' in navigator)) return;

    const actions = {
      play: () => window.playerCore?.play?.(),
      pause: () => window.playerCore?.pause?.(),
      previoustrack: () => window.playerCore?.prev?.(),
      nexttrack: () => window.playerCore?.next?.(),
      seekbackward: () => window.playerCore?.seek?.((window.playerCore.getPosition?.() || 0) - 10),
      seekforward: () => window.playerCore?.seek?.((window.playerCore.getPosition?.() || 0) + 10)
    };

    Object.entries(actions).forEach(([action, handler]) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
    });
  }

  // ==================== ИНИЦИАЛИЗАЦИЯ ====================
  function initialize() {
    initSeekHandlers();
    initVolumeHandlers();
    initControlButtons();
    initHotkeys();
    initPlaybackPolicy();
    initMediaSession();

    // Восстановление громкости
    try {
      const savedVol = parseFloat(localStorage.getItem('playerVolume'));
      if (!isNaN(savedVol)) {
        window.playerCore?.setVolume?.(savedVol);
        updateVolumeUI(savedVol);
      }
    } catch {}

    // Подписка с ожиданием playerCore
    const trySubscribe = () => {
      if (window.playerCore) {
        subscribeToPlayer();
        updateVolumeUI(window.playerCore.getVolume?.() || 1);
        updateRepeatButton(window.playerCore.getRepeatMode?.() || 'none');
        updateShuffleButton(window.playerCore.isShuffleOn?.() || false);
      } else {
        setTimeout(trySubscribe, 100);
      }
    };
    trySubscribe();

    // Сохранение громкости при изменении
    window.addEventListener('beforeunload', () => {
      try {
        const vol = window.playerCore?.getVolume?.();
        if (typeof vol === 'number') localStorage.setItem('playerVolume', String(vol));
      } catch {}
    });

    console.log('✅ PlayerUI initialized');
  }

  // ==================== CLEANUP ====================
  function destroy() {
    state.cleanupFns.forEach(fn => fn());
    state.cleanupFns = [];
  }

  // ==================== ЭКСПОРТ ====================
  window.PlayerUI = {
    initialize,
    destroy,
    updateTrackInfo,
    updateProgress,
    updatePlayButton,
    updateFavoriteButton,
    toggleLyricsPanel,
    canAutoplay,
    queuePendingTrack,
    get currentLyrics() { return state.currentLyrics; },
    get isUserInteracted() { return state.isUserInteracted; }
  };

  // Автоинициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
