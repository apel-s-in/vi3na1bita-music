// scripts/app/player-ui.js
// Полностью переписан. Компактный, компонентный, без утечек.
(function PlayerUIModule() {
  'use strict';
  const w = window;

  // ========== СОСТОЯНИЕ ==========
  const state = {
    lyrics: [],
    lyricsViewMode: localStorage.getItem('lyricsViewMode') || 'normal',
    hasTimedLyrics: false,
    isSeeking: false,
    isMuted: false,
    animationEnabled: localStorage.getItem('lyricsAnimationEnabled') === '1',
    bitEnabled: localStorage.getItem('bitEnabled') === '1',
    favoritesOnly: localStorage.getItem('favoritesOnlyMode') === '1',
    volume: 100
  };

  let audioContext = null;
  let analyser = null;
  let animationFrame = null;
  let playerEl = null;
  let lyricsEl = null;
  let progressFill = null;
  let timeElapsed = null;
  let timeRemaining = null;

  // ========== ИНИЦИАЛИЗАЦИЯ ==========
  function init() {
    if (w.__playerUIInitialized) return;
    w.__playerUIInitialized = true;

    // Ждём albumsIndex
    if (!w.albumsIndex || w.albumsIndex.length === 0) {
      setTimeout(init, 100);
      return;
    }

    restoreSettings();
    attachEvents();
    attachPlayerCoreEvents();

    // Realtime синхронизация лайков
    window.addEventListener('favorites:changed', onFavoritesChanged);

    console.log('✅ PlayerUI initialized');
  }

  function attachPlayerCoreEvents() {
    if (!w.playerCore) {
      setTimeout(attachPlayerCoreEvents, 100);
      return;
    }
    w.playerCore.on({
      onTrackChange: onTrackChange,
      onPlay: updatePlayPauseIcon,
      onPause: updatePlayPauseIcon,
      onStop: updatePlayPauseIcon,
      onTick: onTick
    });
  }

  // ========== ОБРАБОТЧИКИ ==========
  function onTrackChange(track, index) {
    if (!track) return;
    w.AlbumsManager?.highlightCurrentTrack?.(index);
    loadLyrics(track.lyrics);
    updateDownloadButton(track);
    updateKaraokeButton(track);
    syncUI();
  }

  function onTick(position, duration) {
    if (!state.isSeeking) updateProgress(position, duration);
    if (state.lyricsViewMode !== 'hidden') renderLyrics(position);
  }

  function onFavoritesChanged(e) {
    const d = e?.detail || {};
    if (w.PlaybackPolicy?.apply) {
      w.PlaybackPolicy.apply({ reason: 'favoritesChanged', changed: d });
    }
    updateMiniHeader();
    updateNextUpLabel();
  }

  // ========== СИНХРОНИЗАЦИЯ UI ==========
  function isBrowsingOtherAlbum() {
    const playing = w.AlbumsManager?.getPlayingAlbum?.();
    const current = w.AlbumsManager?.getCurrentAlbum?.();
    return playing && current && playing !== current;
  }

  function syncUI() {
    const inMini = isBrowsingOtherAlbum();
    if (!playerEl) {
      playerEl = createPlayerElement();
      document.body.appendChild(playerEl);
    }
    playerEl.className = `lyrics-player-block ${inMini ? 'mini' : ''}`;
    renderPlayer(inMini);
    updateMiniHeader();
    updateNextUpLabel();
    updateJumpButton(inMini);
  }

  function renderPlayer(isMini) {
    // Обновляем DOM-ссылки
    lyricsEl = playerEl.querySelector('#lyrics');
    progressFill = playerEl.querySelector('#player-progress-fill');
    timeElapsed = playerEl.querySelector('#time-elapsed');
    timeRemaining = playerEl.querySelector('#time-remaining');

    // Обновляем вид лирики
    const lyricsWindow = playerEl.querySelector('#lyrics-window');
    lyricsWindow.className = `lyrics-window lyrics-${state.lyricsViewMode}`;
    const bg = playerEl.querySelector('.lyrics-animated-bg');
    bg?.classList.toggle('active', state.animationEnabled && state.lyricsViewMode !== 'hidden');

    // Обновляем кнопки
    toggleButton('favorites-btn', state.favoritesOnly, 'favorites-active');
    toggleButton('animation-btn', state.animationEnabled, 'active');
    toggleButton('pulse-btn', state.bitEnabled, 'active');
    updatePlayPauseIcon();
    updateMuteButton();
    updateRepeatButton();
    updateShuffleButton();

    // Показываем/скрываем мини-заголовок
    const miniHeader = playerEl.querySelector('#mini-now');
    const nextUp = playerEl.querySelector('#next-up');
    if (isMini) {
      miniHeader.style.display = 'flex';
      nextUp.style.display = 'flex';
    } else {
      miniHeader.style.display = 'none';
      nextUp.style.display = 'none';
    }
  }

  // ========== ЭЛЕМЕНТ ПЛЕЕРА ==========
  function createPlayerElement() {
    const div = document.createElement('div');
    div.id = 'lyricsplayerblock';
    div.innerHTML = `
      <div id="mini-now" class="mini-now" style="display:none;">
        <span class="tnum" id="mini-now-num">--.</span>
        <span class="track-title" id="mini-now-title">—</span>
        <img src="img/star2.png" class="like-star" id="mini-now-star" alt="звезда">
      </div>
      <div id="lyrics-window" class="lyrics-window">
        <div class="lyrics-animated-bg"></div>
        <div class="lyrics-scroll" id="lyrics"></div>
      </div>
      <div class="player-progress-wrapper">
        <div class="player-progress-bar" id="player-progress-bar">
          <div class="player-progress-fill" id="player-progress-fill"></div>
          <div class="player-progress-handle"></div>
        </div>
      </div>
      <div class="player-controls">
        <div class="player-controls-row">
          <span class="time-in-controls" id="time-elapsed">00:00</span>
          <button class="player-control-btn" id="prev-btn"><svg viewBox="0 0 24 24"><path d="M11 5L4 12l7 7V5zm9 0v14l-7-7 7-7z"/></svg></button>
          <button class="player-control-btn main" id="play-pause-btn"><svg id="play-pause-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
          <button class="player-control-btn" id="stop-btn"><svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"/></svg></button>
          <button class="player-control-btn" id="next-btn"><svg viewBox="0 0 24 24"><path d="M13 5l7 7-7 7V5zM4 5v14l7-7-7-7z"/></svg></button>
          <span class="time-in-controls" id="time-remaining">--:--</span>
        </div>
        <div class="player-controls-row">
          <button class="player-control-btn" id="mute-btn"><svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg></button>
          <button class="player-control-btn" id="shuffle-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 17h2.735a4 4 0 003.43-1.942l3.67-6.116A4 4 0 0116.265 7H21m0 0l-3-3m3 3l-3 3"/><path d="M3 7h2.735a4 4 0 013.43 1.942l3.67 6.116A4 4 0 0016.265 17H21m0 0l-3 3m3-3l-3-3"/></svg></button>
          <button class="player-control-btn" id="repeat-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/><circle cx="12" cy="12" r="1"/></svg></button>
          <button class="sleep-timer-btn" id="sleep-timer-btn"><svg><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg><span class="sleep-timer-badge" id="sleep-timer-badge" style="display:none;"></span></button>
          <button class="player-control-btn" id="favorites-btn"><img src="img/star2.png" alt="★" id="favorites-btn-icon"/></button>
        </div>
      </div>
      <div class="volume-control-wrapper">
        <div class="volume-track" id="volume-track">
          <div class="volume-fill" id="volume-fill"></div>
          <div class="volume-handle" id="volume-handle"></div>
        </div>
        <input type="range" class="volume-slider" id="volume-slider" min="0" max="100" value="100">
      </div>
      <div class="player-buttons-wrapper">
        <div class="player-extra-buttons-row">
          <button class="lyrics-toggle-btn" id="lyrics-toggle-btn"><span class="lyrics-toggle-btn-visual">Т</span></button>
          <button class="animation-btn" id="animation-btn">A</button>
          <button class="karaoke-btn" id="lyrics-text-btn">📝</button>
          <button class="pulse-btn" id="pulse-btn"><span id="pulse-heart">🤍</span></button>
          <a class="player-download-btn" id="track-download-btn" href="#" download>💾</a>
          <button class="eco-btn" id="eco-btn"><svg viewBox="0 0 24 24"><path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z"/></svg></button>
        </div>
      </div>
      <div id="next-up" class="next-up" style="display:none;">
        <span class="label">Далее:</span>
        <span class="title">—</span>
      </div>
    `;

    // Слушатели
    div.addEventListener('click', onClick);
    const progressBar = div.querySelector('#player-progress-bar');
    if (progressBar) {
      progressBar.addEventListener('pointerdown', onSeekStart);
      progressBar.addEventListener('mousedown', onSeekStart);
      progressBar.addEventListener('touchstart', onSeekStart, { passive: true });
    }

    const volumeSlider = div.querySelector('#volume-slider');
    if (volumeSlider) {
      volumeSlider.addEventListener('input', onVolumeChange);
    }

    return div;
  }

  // ========== СЛУШАТЕЛИ ==========
  function onClick(e) {
    const target = e.target;
    if (!target) return;

    if (target.closest('#prev-btn')) w.playerCore?.prev();
    else if (target.closest('#next-btn')) w.playerCore?.next();
    else if (target.closest('#stop-btn')) w.playerCore?.stop();
    else if (target.closest('#play-pause-btn')) togglePlayPause();
    else if (target.closest('#repeat-btn')) toggleRepeat();
    else if (target.closest('#shuffle-btn')) toggleShuffle();
    else if (target.closest('#mute-btn')) toggleMute();
    else if (target.closest('#favorites-btn')) toggleFavoritesOnly();
    else if (target.closest('#sleep-timer-btn')) w.SleepTimer?.show?.();
    else if (target.closest('#lyrics-toggle-btn')) toggleLyricsView();
    else if (target.closest('#animation-btn')) toggleAnimation();
    else if (target.closest('#pulse-btn')) togglePulse();
    else if (target.closest('#lyrics-text-btn')) w.LyricsModal?.show?.();
    else if (target.closest('#eco-btn')) toggleEcoMode();
    else if (target.closest('#mini-now-star')) toggleLikePlaying();
    else if (target.closest('#mini-now') && !target.closest('#mini-now-star')) {
      const playing = w.AlbumsManager?.getPlayingAlbum?.();
      if (playing && playing !== '__reliz__') w.AlbumsManager?.loadAlbum(playing);
    }
  }

  function onSeekStart(e) {
    e.preventDefault();
    state.isSeeking = true;
    const progressBar = playerEl.querySelector('#player-progress-bar');
    if (!progressBar || !w.playerCore) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const rect = progressBar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    w.playerCore.seek(w.playerCore.getDuration() * percent);
    document.addEventListener('pointermove', onSeekMove, { passive: false });
    document.addEventListener('pointerup', onSeekEnd);
    document.addEventListener('pointercancel', onSeekEnd);
  }

  function onSeekMove(e) {
    if (!state.isSeeking || !w.playerCore) return;
    const progressBar = playerEl.querySelector('#player-progress-bar');
    if (!progressBar) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const rect = progressBar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    w.playerCore.seek(w.playerCore.getDuration() * percent);
  }

  function onSeekEnd() {
    state.isSeeking = false;
    document.removeEventListener('pointermove', onSeekMove);
    document.removeEventListener('pointerup', onSeekEnd);
    document.removeEventListener('pointercancel', onSeekEnd);
  }

  function onVolumeChange(e) {
    const v = parseInt(e.target.value, 10);
    const vol = Math.max(0, Math.min(100, v));
    state.volume = vol;
    w.playerCore?.setVolume(vol);
    renderVolumeUI(vol);
    try { localStorage.setItem('playerVolume', String(vol)); } catch {}
  }

  // ========== ФУНКЦИИ УПРАВЛЕНИЯ ==========
  function togglePlayPause() {
    if (w.playerCore?.isPlaying()) w.playerCore.pause();
    else w.playerCore?.play();
  }

  function toggleRepeat() {
    if (!w.playerCore) return;
    w.playerCore.toggleRepeat();
    updateRepeatButton();
  }

  function toggleShuffle() {
    if (!w.playerCore) return;
    w.playerCore.toggleShuffle();
    updateShuffleButton();
    if (w.PlaybackPolicy?.apply) w.PlaybackPolicy.apply({ reason: 'toggle' });
  }

  function toggleMute() {
    state.isMuted = !state.isMuted;
    w.playerCore?.setMuted(state.isMuted);
    updateMuteButton();
  }

  function toggleFavoritesOnly() {
    state.favoritesOnly = !state.favoritesOnly;
    localStorage.setItem('favoritesOnlyMode', state.favoritesOnly ? '1' : '0');
    const msg = state.favoritesOnly ? '⭐ Только избранные треки' : 'Играют все треки';
    w.NotificationSystem?.info(msg);
    toggleButton('favorites-btn', state.favoritesOnly, 'favorites-active');
    if (w.PlaybackPolicy?.apply) w.PlaybackPolicy.apply({ reason: 'toggle' });
  }

  function toggleLyricsView() {
    const modes = ['normal', 'hidden', 'expanded'];
    const i = modes.indexOf(state.lyricsViewMode);
    state.lyricsViewMode = modes[(i + 1) % modes.length];
    localStorage.setItem('lyricsViewMode', state.lyricsViewMode);
    renderPlayer(isBrowsingOtherAlbum());
    const msgs = { normal: '📝 Обычный вид лирики', hidden: '🚫 Лирика скрыта', expanded: '📖 Расширенный вид лирики' };
    w.NotificationSystem?.info(msgs[state.lyricsViewMode]);
  }

  function toggleAnimation() {
    if (state.lyricsViewMode === 'hidden') {
      w.NotificationSystem?.info('Лирика скрыта — анимация недоступна');
      return;
    }
    state.animationEnabled = !state.animationEnabled;
    localStorage.setItem('lyricsAnimationEnabled', state.animationEnabled ? '1' : '0');
    renderPlayer(isBrowsingOtherAlbum());
    w.NotificationSystem?.info(state.animationEnabled ? '✨ Анимация лирики: ВКЛ' : '✨ Анимация лирики: ВЫКЛ');
  }

  function togglePulse() {
    state.bitEnabled = !state.bitEnabled;
    localStorage.setItem('bitEnabled', state.bitEnabled ? '1' : '0');
    toggleButton('pulse-btn', state.bitEnabled, 'active');
    document.getElementById('pulse-heart').textContent = state.bitEnabled ? '❤️' : '🤍';
    if (state.bitEnabled) startBitEffect();
    else stopBitEffect();
  }

  function toggleEcoMode() {
    const btn = document.getElementById('eco-btn');
    const isActive = btn?.classList.contains('active');
    if (isActive) {
      btn?.classList.remove('active');
      w.playerCore?.setQuality('high');
      w.NotificationSystem?.success('Эконом режим выключен');
    } else {
      btn?.classList.add('active');
      w.playerCore?.setQuality('low');
      w.NotificationSystem?.success('Эконом режим включён (низкое качество)');
    }
  }

  function toggleLikePlaying() {
    const playing = w.AlbumsManager?.getPlayingAlbum?.();
    const track = w.playerCore?.getCurrentTrack?.();
    const uid = String(track?.uid || '').trim();
    if (!playing || !uid || !w.FavoritesManager) return;

    let srcAlbum = playing;
    if (playing === w.SPECIAL_FAVORITES_KEY) {
      srcAlbum = String(track?.sourceAlbum || '').trim();
      if (!srcAlbum) return;
    }

    const isLiked = w.FavoritesManager.isFavorite(srcAlbum, uid);
    w.FavoritesManager.toggleLike(srcAlbum, uid, !isLiked, { source: 'mini' });
    updateMiniHeader();
  }

  // ========== ОБНОВЛЕНИЕ UI ==========
  function updatePlayPauseIcon() {
    const icon = document.getElementById('play-pause-icon');
    if (!icon || !w.playerCore) return;
    icon.innerHTML = w.playerCore.isPlaying()
      ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>'
      : '<path d="M8 5v14l11-7z"/>';
  }

  function updateMuteButton() {
    const btn = document.getElementById('mute-btn');
    if (btn) btn.classList.toggle('active', state.isMuted);
  }

  function updateRepeatButton() {
    const btn = document.getElementById('repeat-btn');
    if (btn) btn.classList.toggle('active', w.playerCore?.isRepeat?.() || false);
  }

  function updateShuffleButton() {
    const btn = document.getElementById('shuffle-btn');
    if (btn) btn.classList.toggle('active', w.playerCore?.isShuffle?.() || false);
  }

  function toggleButton(id, enabled, className) {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle(className, !!enabled);
  }

  function updateProgress(position, duration) {
    const percent = duration ? (position / duration) * 100 : 0;
    if (progressFill) progressFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    const fmt = w.Utils?.formatTime || (() => '--:--');
    if (timeElapsed) timeElapsed.textContent = fmt(position);
    if (timeRemaining) timeRemaining.textContent = `-${fmt(Math.max(0, duration - position))}`;
  }

  function renderVolumeUI(value) {
    const v = Math.max(0, Math.min(100, value));
    const p = v / 100;
    const fill = document.getElementById('volume-fill');
    const handle = document.getElementById('volume-handle');
    if (fill) fill.style.width = `${p * 100}%`;
    if (handle) {
      const track = document.getElementById('volume-track');
      if (track) {
        const rect = track.getBoundingClientRect();
        const x = Math.max(7, Math.min(rect.width - 7, rect.width * p));
        handle.style.left = `${x}px`;
      }
    }
  }

  function updateMiniHeader() {
    const inMini = isBrowsingOtherAlbum();
    const header = document.getElementById('mini-now');
    if (!header || !inMini) {
      if (header) header.style.display = 'none';
      return;
    }
    header.style.display = 'flex';

    const track = w.playerCore?.getCurrentTrack?.();
    const index = w.playerCore?.getIndex?.();
    if (!track || index === undefined || index < 0) {
      header.style.display = 'none';
      return;
    }

    const numEl = header.querySelector('#mini-now-num');
    const titleEl = header.querySelector('#mini-now-title');
    const starEl = header.querySelector('#mini-now-star');

    if (numEl) numEl.textContent = `${String(index + 1).padStart(2, '0')}.`;
    if (titleEl) titleEl.textContent = track.title || '—';
    if (starEl) {
      const playing = w.AlbumsManager?.getPlayingAlbum?.();
      const uid = String(track.uid || '').trim();
      let isLiked = false;
      if (playing && uid) {
        if (playing !== w.SPECIAL_FAVORITES_KEY) {
          isLiked = w.FavoritesManager?.isFavorite?.(playing, uid);
        } else {
          const src = String(track.sourceAlbum || '').trim();
          if (src) isLiked = w.FavoritesManager?.isFavorite?.(src, uid);
        }
      }
      starEl.src = isLiked ? 'img/star.png' : 'img/star2.png';
    }
  }

  function updateNextUpLabel() {
    const inMini = isBrowsingOtherAlbum();
    const nextUp = document.getElementById('next-up');
    if (!nextUp || !inMini) {
      if (nextUp) nextUp.style.display = 'none';
      return;
    }
    const nextIndex = w.playerCore?.getNextIndex?.();
    if (nextIndex === undefined || nextIndex < 0) {
      nextUp.style.display = 'none';
      return;
    }
    const snapshot = w.playerCore?.getPlaylistSnapshot?.();
    const nextTrack = snapshot?.[nextIndex];
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

  function updateJumpButton(inMini) {
    const btn = document.querySelector('.jump-to-playing');
    if (btn) btn.style.display = inMini ? 'none' : 'flex';
  }

  // ========== ЛИРИКА ==========
  async function loadLyrics(url) {
    state.lyrics = [];
    state.hasTimedLyrics = false;
    if (!url) {
      const track = w.playerCore?.getCurrentTrack?.();
      if (!track || !track.hasLyrics) {
        setLyricsAvailability(false);
        return;
      }
    }

    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) throw new Error();
      const text = await res.text();
      if (text.trim().startsWith('[')) {
        state.lyrics = parseLrc(text);
      } else {
        state.lyrics = parseJson(text);
      }
    } catch {
      state.lyrics = [];
    }

    state.hasTimedLyrics = state.lyrics.length > 0;
    setLyricsAvailability(state.hasTimedLyrics);
  }

  function parseLrc(text) {
    const lines = text.split('\n');
    const out = [];
    for (const line of lines) {
      const match = line.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/);
      if (match) {
        const [, m, s, ms, txt] = match;
        const time = parseInt(m) * 60 + parseInt(s) + (ms ? parseInt(ms.padEnd(3, '0')) / 1000 : 0);
        const lyric = txt.trim();
        if (lyric) out.push({ time, text: lyric });
      }
    }
    return out.sort((a, b) => a.time - b.time);
  }

  function parseJson(text) {
    try {
      const data = JSON.parse(text);
      return Array.isArray(data) ? data.map(i => ({ time: i.time, text: i.line || i.text || '' })).filter(i => i.text) : [];
    } catch {
      return [];
    }
  }

  function setLyricsAvailability(enabled) {
    const win = document.getElementById('lyrics-window');
    const toggle = document.getElementById('lyrics-toggle-btn');
    const anim = document.getElementById('animation-btn');
    const karaoke = document.getElementById('lyrics-text-btn');

    if (win) win.style.display = enabled ? '' : 'none';
    if (!enabled) {
      state.lyricsViewMode = 'hidden';
      state.animationEnabled = false;
    }

    const disableBtn = (el, disable) => {
      if (!el) return;
      el.classList.toggle('disabled', disable);
      el.style.pointerEvents = disable ? 'none' : '';
    };

    disableBtn(toggle, !enabled);
    disableBtn(anim, !enabled);
    const track = w.playerCore?.getCurrentTrack?.();
    const hasFulltext = !!(track?.fulltext);
    disableBtn(karaoke, !(hasFulltext || state.hasTimedLyrics));

    renderPlayer(isBrowsingOtherAlbum());
  }

  function renderLyrics(position) {
    if (!lyricsEl || state.lyricsViewMode === 'hidden' || !state.lyrics.length) return;
    const windowSize = state.lyricsViewMode === 'expanded' ? 9 : 5;
    const center = Math.floor(windowSize / 2);
    let activeIdx = -1;
    for (let i = 0; i < state.lyrics.length; i++) {
      if (position >= state.lyrics[i].time) activeIdx = i;
      else break;
    }
    const start = Math.max(0, activeIdx - center);
    const padTop = Math.max(0, center - activeIdx);
    const rows = [];
    for (let p = 0; p < padTop; p++) rows.push('<div class="lyrics-window-line"></div>');
    for (let i = start; i < Math.min(state.lyrics.length, start + windowSize - padTop); i++) {
      const cls = i === activeIdx ? 'lyrics-window-line active' : 'lyrics-window-line';
      rows.push(`<div class="${cls}">${w.Utils?.escapeHtml?.(state.lyrics[i].text) || ''}</div>`);
    }
    while (rows.length < windowSize) rows.push('<div class="lyrics-window-line"></div>');
    lyricsEl.innerHTML = rows.join('');
  }

  // ========== ПУЛЬСАЦИЯ ==========
  function startBitEffect() {
    if (w.Howler?.ctx) {
      audioContext = w.Howler.ctx;
      if (!analyser) {
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        w.Howler.masterGain.connect(analyser);
      }
    }
    animateBit();
  }

  function animateBit() {
    if (!state.bitEnabled) return;
    let intensity = 0;
    if (analyser && audioContext?.state === 'running') {
      try {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const bass = Math.floor(data.length * 0.3);
        const sum = data.slice(0, bass).reduce((a, b) => a + b, 0);
        intensity = (sum / (bass * 255)) * 100;
      } catch {}
    }
    if (intensity === 0 && w.playerCore?.isPlaying?.()) {
      const t = Date.now() / 1000;
      intensity = (Math.sin(t * 2.5) * 0.5 + 0.5) * (Math.sin(t * 1.3 + 0.5) * 0.3 + 0.7) * 25;
    }
    const logo = document.getElementById('logo-bottom');
    if (logo) logo.style.transform = `scale(${1 + (intensity / 100) * 0.2})`;
    animationFrame = requestAnimationFrame(animateBit);
  }

  function stopBitEffect() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    const logo = document.getElementById('logo-bottom');
    if (logo) {
      logo.style.transition = 'transform 0.3s ease-out';
      logo.style.transform = 'scale(1)';
      setTimeout(() => { if (logo) logo.style.transition = ''; }, 300);
    }
    analyser = null;
  }

  // ========== ДОПОЛНИТЕЛЬНО ==========
  function restoreSettings() {
    const vol = parseInt(localStorage.getItem('playerVolume') || '100', 10);
    state.volume = Math.max(0, Math.min(100, vol));
    w.playerCore?.setVolume(state.volume);
    const slider = document.getElementById('volume-slider');
    if (slider) slider.value = String(state.volume);
    renderVolumeUI(state.volume);
    if (state.bitEnabled) setTimeout(startBitEffect, 1000);
  }

  function updateDownloadButton(track) {
    const btn = document.getElementById('track-download-btn');
    if (!btn || !track?.src) return;
    btn.href = track.src;
    btn.download = `${track.title}.mp3`;
  }

  function updateKaraokeButton(track) {
    const btn = document.getElementById('lyrics-text-btn');
    if (!btn) return;
    const enabled = !!(track?.fulltext || state.hasTimedLyrics);
    btn.classList.toggle('disabled', !enabled);
    btn.style.pointerEvents = enabled ? '' : 'none';
    btn.style.opacity = enabled ? '' : '0.4';
  }

  // ========== ПУБЛИЧНЫЙ API ==========
  w.PlayerUI = {
    initialize: init,
    ensurePlayerBlock: syncUI,
    updateMiniHeader,
    updateNextUpLabel,
    togglePlayPause,
    toggleLikePlaying,
    switchAlbumInstantly: syncUI,
    toggleFavoritesOnly,
    updateAvailableTracksForPlayback() {}, // deprecated, handled by PlaybackPolicy
    get currentLyricsLines() {
      return state.lyrics.map(l => ({ line: l.text }));
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
