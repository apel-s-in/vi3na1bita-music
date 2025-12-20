// scripts/app/player-ui.js — UI плеера (оптимизировано)
(function PlayerUIModule() {
  'use strict';
  const w = window;
  const $ = (id) => document.getElementById(id);
  const $q = (sel) => document.querySelector(sel);
  const $qa = (sel) => document.querySelectorAll(sel);

  let currentLyrics = [], lyricsViewMode = 'normal', hasTimedLyrics = false;
  let isSeekingProgress = false, isMuted = false, animationEnabled = false;
  let bitEnabled = false, bitIntensity = 100;
  let favoritesFilterActive = false, favoritesOnlyMode = false;
  let audioContext = null, analyser = null, animationFrame = null;
  let lyricsLastIdx = -1, lyricsLastTs = 0;
  let isInContextMiniMode = false, savedLyricsMode = null, savedAnimation = null;
  const LYRICS_404_KEY = 'lyrics_404_cache:v1';
  let prefetchedLyrics = null, prefetchedLyricsUrl = null;

  function initPlayerUI() {
    if (w.__playerUIInitialized) return;
    if (!w.albumsIndex?.length) { setTimeout(initPlayerUI, 100); return; }
    w.__playerUIInitialized = true;

    restoreSettings();
    attachPlayerCoreEvents();
    bindGlobalEvents();
    console.log('✅ PlayerUI initialized');
  }

  function bindGlobalEvents() {
    if (!w.__favoritesChangedBound) {
      w.__favoritesChangedBound = true;
      w.addEventListener('favorites:changed', (e) => {
        updateMiniHeader();
        updateNextUpLabel();
        w.PlaybackPolicy?.apply?.({ reason: 'favoritesChanged', changed: e?.detail || {} });
        updateAvailableTracksForPlayback();
      });
    }

    const filterBtn = $('filter-favorites-btn');
    if (filterBtn && !filterBtn.__bound) {
      filterBtn.__bound = true;
      filterBtn.addEventListener('click', toggleFavoritesFilter);
    }
  }

  function attachPlayerCoreEvents() {
    if (!w.playerCore) { setTimeout(attachPlayerCoreEvents, 100); return; }
    w.playerCore.on({
      onTrackChange: onTrackChange,
      onPlay: updatePlayPauseIcon,
      onPause: updatePlayPauseIcon,
      onStop: updatePlayPauseIcon,
      onTick: (pos, dur) => { updateProgress(pos, dur); renderLyricsEnhanced(pos); }
    });
  }

  function onTrackChange(track, index) {
    if (!track) return;
    w.AlbumsManager?.highlightCurrentTrack?.(index);
    ensurePlayerBlock(index);

    const has = !!(track.hasLyrics !== false && (track.hasLyrics || track.lyrics));
    if (!has) { hasTimedLyrics = false; setLyricsAvailability(false); }

    loadLyrics(track.lyrics).then(() => {
      if (hasTimedLyrics && lyricsViewMode !== 'hidden') renderLyrics(0);
    });

    const karaokeBtn = $('lyrics-text-btn');
    if (karaokeBtn && !track.fulltext) {
      karaokeBtn.classList.add('disabled');
      karaokeBtn.style.pointerEvents = 'none';
    }

    const dlBtn = $('track-download-btn');
    if (dlBtn && track.src) {
      dlBtn.href = track.src;
      dlBtn.download = `${track.title}.mp3`;
    }
  }

  function isBrowsingOther() {
    const playing = w.AlbumsManager?.getPlayingAlbum?.();
    const current = w.AlbumsManager?.getCurrentAlbum?.();
    return playing && playing !== current && !(playing === '__favorites__' && current === '__favorites__');
  }

  let ensureTimeout = null;
  function ensurePlayerBlock(idx) {
    if (typeof idx !== 'number' || idx < 0 || !Number.isFinite(idx)) return;
    if (ensureTimeout) clearTimeout(ensureTimeout);
    ensureTimeout = setTimeout(() => { ensureTimeout = null; _doEnsure(idx); }, 50);
  }

  function _doEnsure(idx) {
    let block = $('lyricsplayerblock');
    if (!block) block = createPlayerBlock();

    const mini = isBrowsingOther();
    const nowPlaying = $('now-playing');
    const trackList = $('track-list');

    if (mini) {
      if (nowPlaying && !nowPlaying.contains(block)) {
        nowPlaying.innerHTML = '';
        nowPlaying.appendChild(createMiniHeader());
        nowPlaying.appendChild(block);
        nowPlaying.appendChild(createNextUp());
      }
      applyMiniState();
      setDisplay('mini-now', 'flex');
      setDisplay('next-up', 'flex');
      setTimeout(() => nowPlaying?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } else {
      if (!trackList) return;
      const row = trackList.querySelector(`.track[data-index="${idx}"]`);
      if (row) {
        if (row.nextSibling !== block) row.parentNode.insertBefore(block, row.nextSibling);
        setTimeout(() => row.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      } else if (!block.parentNode) {
        trackList.appendChild(block);
      }
      restoreLyricsState();
      setDisplay('mini-now', 'none');
      setDisplay('next-up', 'none');
    }
    updateMiniHeader();
    updateNextUpLabel();
  }

  function setDisplay(id, val) {
    const el = $(id);
    if (el) el.style.display = val;
  }

  function createPlayerBlock() {
    const b = document.createElement('div');
    b.className = 'lyrics-player-block';
    b.id = 'lyricsplayerblock';
    b.innerHTML = PLAYER_HTML;
    bindPlayerEvents(b);
    return b;
  }

  const PLAYER_HTML = `
<div id="lyrics-window" class="lyrics-normal">
  <div class="lyrics-animated-bg"></div>
  <div class="lyrics-scroll" id="lyrics"><div class="lyrics-placeholder lyrics-spinner"></div></div>
</div>
<div class="player-progress-wrapper">
  <div class="player-progress-bar" id="player-progress-bar">
    <div class="player-progress-fill" id="player-progress-fill"><div class="player-progress-handle"></div></div>
  </div>
</div>
<div class="player-controls">
  <div class="player-controls-row">
    <span class="time-in-controls" id="time-elapsed">00:00</span>
    <button class="player-control-btn" id="prev-btn" title="Предыдущий (P)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 5L4 12l7 7V5zm9 0v14l-7-7 7-7z"/></svg></button>
    <button class="player-control-btn main" id="play-pause-btn" title="Play/Pause (K)"><svg id="play-pause-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
    <button class="player-control-btn" id="stop-btn" title="Стоп (X)"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg></button>
    <button class="player-control-btn" id="next-btn" title="Следующий (N)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 5l7 7-7 7V5zM4 5v14l7-7-7-7z"/></svg></button>
    <span class="time-in-controls" id="time-remaining">--:--</span>
  </div>
  <div class="player-controls-row">
    <button class="player-control-btn" id="mute-btn" title="Mute (M)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg></button>
    <button class="player-control-btn" id="shuffle-btn" title="Shuffle (U)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17h2.735a4 4 0 003.43-1.942l3.67-6.116A4 4 0 0116.265 7H21m0 0l-3-3m3 3l-3 3"/><path d="M3 7h2.735a4 4 0 013.43 1.942l3.67 6.116A4 4 0 0016.265 17H21m0 0l-3 3m3-3l-3-3"/></svg></button>
    <button class="player-control-btn" id="repeat-btn" title="Repeat (R)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></button>
    <button class="sleep-timer-btn" id="sleep-timer-btn" title="Таймер сна (T)"><svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="sleep-timer-badge" id="sleep-timer-badge" style="display:none">0</span></button>
    <button class="player-control-btn" id="favorites-btn" title="Только избранные (F)"><img src="img/star2.png" alt="★" id="favorites-btn-icon"/></button>
  </div>
</div>
<div class="volume-control-wrapper">
  <div class="volume-track" id="volume-track"><div class="volume-fill" id="volume-fill"></div><div class="volume-handle" id="volume-handle"></div></div>
  <input type="range" class="volume-slider" id="volume-slider" min="0" max="100" value="100" aria-label="Громкость">
</div>
<div class="player-buttons-wrapper">
  <div class="player-extra-buttons-row">
    <button class="lyrics-toggle-btn" id="lyrics-toggle-btn" title="Режим лирики (Y)"><span>Т</span></button>
    <button class="animation-btn" id="animation-btn" title="Анимация (A)">A</button>
    <button class="karaoke-btn" id="lyrics-text-btn" title="Полный текст">📝</button>
    <button class="pulse-btn" id="pulse-btn" title="Пульсация"><span id="pulse-heart">🤍</span></button>
    <a class="player-download-btn" href="#" id="track-download-btn" download title="Скачать">💾</a>
    <button id="eco-btn" class="eco-btn" title="Эконом режим"><svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z"/></svg></button>
  </div>
</div>`;

  function createMiniHeader() {
    const h = document.createElement('div');
    h.className = 'mini-now'; h.id = 'mini-now';
    h.innerHTML = `<span class="tnum" id="mini-now-num">--.</span><span class="track-title" id="mini-now-title">—</span><img src="img/star2.png" class="like-star" id="mini-now-star" alt="★">`;
    h.addEventListener('click', (e) => {
      if (e.target.id === 'mini-now-star') return;
      const k = w.AlbumsManager?.getPlayingAlbum?.();
      if (k && k !== '__reliz__') w.AlbumsManager?.loadAlbum(k);
    });
    h.querySelector('#mini-now-star')?.addEventListener('click', (e) => { e.stopPropagation(); toggleLikePlaying(); });
    return h;
  }

  function createNextUp() {
    const n = document.createElement('div');
    n.className = 'next-up'; n.id = 'next-up';
    n.innerHTML = `<span class="label">Далее:</span><span class="title">—</span>`;
    return n;
  }

  function updateMiniHeader() {
    const h = $('mini-now');
    if (!h) return;
    if (!isBrowsingOther()) { h.style.display = 'none'; return; }
    const track = w.playerCore?.getCurrentTrack?.();
    const idx = w.playerCore?.getIndex?.();
    if (!track || idx < 0) { h.style.display = 'none'; return; }
    h.style.display = 'flex';
    const num = h.querySelector('#mini-now-num');
    const title = h.querySelector('#mini-now-title');
    const star = h.querySelector('#mini-now-star');
    if (num) num.textContent = `${String(idx + 1).padStart(2, '0')}.`;
    if (title) title.textContent = track.title || '—';
    if (star) {
      const album = w.AlbumsManager?.getPlayingAlbum?.();
      const uid = String(track?.uid || '').trim();
      let liked = false;
      if (album && uid && w.FavoritesManager) {
        if (album !== '__favorites__') liked = !!w.FavoritesManager.isFavorite(album, uid);
        else {
          const src = String(track?.sourceAlbum || '').trim();
          if (src) liked = !!w.FavoritesManager.isFavorite(src, uid);
        }
      }
      star.src = liked ? 'img/star.png' : 'img/star2.png';
    }
  }

  function updateNextUpLabel() {
    const n = $('next-up');
    if (!n) return;
    if (!isBrowsingOther()) { n.style.display = 'none'; return; }
    const ni = w.playerCore?.getNextIndex?.();
    if (ni < 0) { n.style.display = 'none'; return; }
    const snap = w.playerCore?.getPlaylistSnapshot?.();
    const next = snap?.[ni];
    if (!next) { n.style.display = 'none'; return; }
    n.style.display = 'flex';
    const t = n.querySelector('.title');
    if (t) { t.textContent = next.title || '—'; t.title = next.title || ''; }
  }

  function switchAlbumInstantly(key) {
    const idx = w.playerCore?.getIndex?.() || 0;
    ensurePlayerBlock(idx);
    updateMiniHeader();
    updateNextUpLabel();
    w.PlayerState?.save?.();
  }

  function bindPlayerEvents(b) {
    b.querySelector('#play-pause-btn')?.addEventListener('click', togglePlayPause);
    b.querySelector('#prev-btn')?.addEventListener('click', () => w.playerCore?.prev());
    b.querySelector('#next-btn')?.addEventListener('click', () => w.playerCore?.next());
    b.querySelector('#stop-btn')?.addEventListener('click', () => w.playerCore?.stop());
    b.querySelector('#repeat-btn')?.addEventListener('click', toggleRepeat);
    b.querySelector('#shuffle-btn')?.addEventListener('click', toggleShuffle);
    b.querySelector('#mute-btn')?.addEventListener('click', toggleMute);

    const vs = b.querySelector('#volume-slider');
    vs?.addEventListener('input', onVolumeChange);

    const vw = b.querySelector('.volume-control-wrapper');
    if (vw && !vw.__bound) {
      vw.__bound = true;
      const set = (x) => {
        const t = b.querySelector('.volume-track');
        if (!t) return;
        const r = t.getBoundingClientRect();
        if (!r.width) return;
        const p = Math.max(0, Math.min(1, (x - r.left) / r.width));
        vs.value = Math.round(p * 100);
        onVolumeChange({ target: vs });
      };
      vw.addEventListener('pointerdown', (e) => set(e.clientX));
      vw.addEventListener('pointermove', (e) => { if (e.buttons === 1) set(e.clientX); });
    }

    const pb = b.querySelector('#player-progress-bar');
    pb?.addEventListener('mousedown', startSeek);
    pb?.addEventListener('touchstart', startSeek);

    b.querySelector('#lyrics-toggle-btn')?.addEventListener('click', toggleLyricsView);
    b.querySelector('#animation-btn')?.addEventListener('click', toggleAnimation);
    b.querySelector('#pulse-btn')?.addEventListener('click', togglePulse);
    b.querySelector('#favorites-btn')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleFavoritesOnly(); });
    b.querySelector('#sleep-timer-btn')?.addEventListener('click', () => w.SleepTimer?.show?.());
    b.querySelector('#lyrics-text-btn')?.addEventListener('click', () => w.LyricsModal?.show?.());
    b.querySelector('#track-download-btn')?.addEventListener('click', (e) => {
      if (!w.playerCore?.getCurrentTrack?.()?.src) { e.preventDefault(); w.NotificationSystem?.error('Трек недоступен'); }
    });
    b.querySelector('#eco-btn')?.addEventListener('click', toggleEcoMode);

    document.addEventListener('mousemove', handleSeek);
    document.addEventListener('touchmove', handleSeek);
    document.addEventListener('mouseup', stopSeek);
    document.addEventListener('touchend', stopSeek);
  }

  function togglePlayPause() {
    if (!w.playerCore) return;
    w.playerCore.isPlaying() ? w.playerCore.pause() : w.playerCore.play();
  }

  function updatePlayPauseIcon() {
    const icon = $('play-pause-icon');
    if (!icon || !w.playerCore) return;
    icon.innerHTML = w.playerCore.isPlaying() ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M8 5v14l11-7z"/>';
  }

  function startSeek(e) { isSeekingProgress = true; handleSeek(e); }
  function handleSeek(e) {
    if (!isSeekingProgress) return;
    const bar = $('player-progress-bar');
    if (!bar || !w.playerCore) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const r = bar.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (x - r.left) / r.width));
    w.playerCore.seek(w.playerCore.getDuration() * p);
  }
  function stopSeek() { isSeekingProgress = false; }

  function updateProgress(pos, dur) {
    if (isSeekingProgress) return;
    const fill = $('player-progress-fill');
    if (fill) fill.style.width = `${Math.min(100, (pos / dur) * 100)}%`;
    const el = $('time-elapsed'), rem = $('time-remaining');
    if (el) el.textContent = formatTime(pos);
    if (rem) rem.textContent = `-${formatTime(dur - pos)}`;
  }

  function renderVolumeUI(v) {
    const p = Math.max(0, Math.min(100, v)) / 100;
    const fill = $('volume-fill'), handle = $('volume-handle'), track = $('volume-track');
    if (fill) fill.style.width = `${p * 100}%`;
    if (handle && track) {
      const r = track.getBoundingClientRect();
      handle.style.left = `${Math.max(7, Math.min(r.width - 7, r.width * p))}px`;
    }
  }

  function onVolumeChange(e) {
    const v = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
    w.playerCore?.setVolume(v);
    requestAnimationFrame(() => renderVolumeUI(v));
    try { localStorage.setItem('playerVolume', String(v)); } catch {}
  }

  function toggleMute() {
    if (!w.playerCore) return;
    isMuted = !isMuted;
    w.playerCore.setMuted(isMuted);
    $('mute-btn')?.classList.toggle('active', isMuted);
  }

  function toggleRepeat() {
    if (!w.playerCore) return;
    w.playerCore.toggleRepeat();
    $('repeat-btn')?.classList.toggle('active', w.playerCore.isRepeat());
  }

  function toggleShuffle() {
    if (!w.playerCore) return;
    w.playerCore.toggleShuffle();
    $('shuffle-btn')?.classList.toggle('active', w.playerCore.isShuffle());
    w.PlaybackPolicy?.apply?.({ reason: 'toggle' });
    updateAvailableTracksForPlayback();
  }

  function toggleAnimation() {
    if ($('animation-btn')?.classList.contains('disabled')) return;
    if (lyricsViewMode === 'hidden') { w.NotificationSystem?.info('Лирика скрыта'); return; }
    animationEnabled = !animationEnabled;
    try { localStorage.setItem('lyricsAnimationEnabled', animationEnabled ? '1' : '0'); } catch {}
    const bg = $q('.lyrics-animated-bg');
    bg?.classList.toggle('active', animationEnabled);
    $('animation-btn')?.classList.toggle('active', animationEnabled);
    w.NotificationSystem?.info(animationEnabled ? '✨ Анимация: ВКЛ' : '✨ Анимация: ВЫКЛ');
  }

  function togglePulse() {
    bitEnabled = !bitEnabled;
    localStorage.setItem('bitEnabled', bitEnabled ? '1' : '0');
    $('pulse-btn')?.classList.toggle('active', bitEnabled);
    const h = $('pulse-heart'); if (h) h.textContent = bitEnabled ? '❤️' : '🤍';
    bitEnabled ? startBitEffect() : stopBitEffect();
  }

  function startBitEffect() {
    try {
      if (w.Howler?.ctx && w.Howler.masterGain && !audioContext) {
        audioContext = w.Howler.ctx;
        if (!analyser) {
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.85;
          try { w.Howler.masterGain.connect(analyser); } catch { analyser = null; }
        }
      }
    } catch {}
    animateBit();
  }

  function animateBit() {
    if (!bitEnabled) return;
    let intensity = 0;
    if (analyser && audioContext?.state === 'running') {
      try {
        const d = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(d);
        const range = Math.floor(d.length * 0.3);
        let sum = 0;
        for (let i = 0; i < range; i++) sum += d[i];
        intensity = (sum / range / 255) * (bitIntensity / 100);
      } catch {}
    }
    if (intensity === 0 && w.playerCore?.isPlaying?.()) {
      const t = Date.now() / 1000;
      intensity = (Math.sin(t * 2.5) * 0.5 + 0.5) * (Math.sin(t * 1.3 + 0.5) * 0.3 + 0.7) * 0.25 * (bitIntensity / 100);
    }
    const logo = $('logo-bottom');
    if (logo) logo.style.transform = `scale(${1 + intensity * 0.2})`;
    animationFrame = requestAnimationFrame(animateBit);
  }

  function stopBitEffect() {
    if (animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = null; }
    const logo = $('logo-bottom');
    if (logo) { logo.style.transition = 'transform 0.3s'; logo.style.transform = 'scale(1)'; setTimeout(() => { if (logo) logo.style.transition = ''; }, 300); }
    analyser = null;
  }

  function toggleLyricsView() {
    if ($('lyrics-toggle-btn')?.classList.contains('disabled')) return;
    const modes = ['normal', 'hidden', 'expanded'];
    lyricsViewMode = modes[(modes.indexOf(lyricsViewMode) + 1) % modes.length];
    try { localStorage.setItem('lyricsViewMode', lyricsViewMode); } catch {}
    renderLyricsViewMode();
    const msg = { normal: '📝 Обычный вид', hidden: '🚫 Скрыта', expanded: '📖 Расширенный' };
    w.NotificationSystem?.info(msg[lyricsViewMode]);
  }

  function renderLyricsViewMode() {
    const win = $('lyrics-window'), btn = $('lyrics-toggle-btn');
    if (!win || !btn) return;
    win.className = `lyrics-${lyricsViewMode}`;
    btn.className = `lyrics-toggle-btn lyrics-${lyricsViewMode}`;
    const bg = $q('.lyrics-animated-bg');
    if (lyricsViewMode === 'hidden') {
      bg?.classList.remove('active');
      $('animation-btn')?.classList.remove('active');
    } else if (animationEnabled) {
      bg?.classList.add('active');
      $('animation-btn')?.classList.add('active');
    }
  }

  function applyMiniState() {
    if (isInContextMiniMode) return;
    isInContextMiniMode = true;
    if (savedLyricsMode === null && lyricsViewMode !== 'hidden') savedLyricsMode = lyricsViewMode;
    if (savedAnimation === null) savedAnimation = animationEnabled;
    const win = $('lyrics-window');
    if (win) { win.style.display = 'none'; }
    const btn = $q('.lyrics-toggle-btn');
    if (btn) btn.style.display = 'none';
    animationEnabled = false;
    $q('.lyrics-animated-bg')?.classList.remove('active');
    $('animation-btn')?.classList.remove('active');
  }

  function restoreLyricsState() {
    if (!isInContextMiniMode) return;
    isInContextMiniMode = false;
    const win = $('lyrics-window');
    if (win) win.style.display = '';
    const btn = $q('.lyrics-toggle-btn');
    if (btn) btn.style.display = '';
    if (!hasTimedLyrics) {
      lyricsViewMode = 'hidden';
      animationEnabled = false;
      savedLyricsMode = null;
      savedAnimation = null;
      setLyricsAvailability(false);
      return;
    }
    if (savedLyricsMode !== null) { lyricsViewMode = savedLyricsMode; savedLyricsMode = null; }
    if (savedAnimation !== null) { animationEnabled = savedAnimation; savedAnimation = null; }
    renderLyricsViewMode();
  }

  function toggleFavoritesOnly() {
    const btn = $('favorites-btn'), icon = $('favorites-btn-icon');
    if (!btn || !icon) return;
    favoritesOnlyMode = !favoritesOnlyMode;
    btn.classList.toggle('favorites-active', favoritesOnlyMode);
    icon.src = favoritesOnlyMode ? 'img/star.png' : 'img/star2.png';
    w.NotificationSystem?.[favoritesOnlyMode ? 'success' : 'info'](favoritesOnlyMode ? '⭐ Только избранные' : 'Все треки');
    try { localStorage.setItem('favoritesOnlyMode', favoritesOnlyMode ? '1' : '0'); } catch {}
    syncFilterWithFavoritesMode();
    updateAvailableTracksForPlayback();
    w.PlaybackPolicy?.apply?.({ reason: 'toggle' });
  }

  function toggleLikePlaying() {
    const album = w.AlbumsManager?.getPlayingAlbum?.();
    const track = w.playerCore?.getCurrentTrack?.();
    if (!album || !track || !w.FavoritesManager) return;
    const uid = String(track?.uid || '').trim();
    if (!uid) return;
    if (album !== '__favorites__') {
      const liked = !!w.FavoritesManager.isFavorite(album, uid);
      w.FavoritesManager.toggleLike(album, uid, !liked);
    } else {
      const src = String(track?.sourceAlbum || '').trim();
      if (!src) return;
      const liked = !!w.FavoritesManager.isFavorite(src, uid);
      w.FavoritesManager.toggleLike(src, uid, !liked);
    }
    updateMiniHeader();
  }

  function toggleEcoMode() {
    const btn = $('eco-btn'), active = btn?.classList.contains('active');
    btn?.classList.toggle('active', !active);
    w.playerCore?.setQuality?.(active ? 'high' : 'low');
    w.NotificationSystem?.success(active ? 'Эконом ВЫКЛ' : 'Эконом ВКЛ');
  }

  function setLyricsAvailability(enabled) {
    const win = $('lyrics-window'), lBtn = $('lyrics-toggle-btn'), aBtn = $('animation-btn'), kBtn = $('lyrics-text-btn'), bg = $q('.lyrics-animated-bg'), cont = $('lyrics');
    if (win) win.style.display = enabled ? '' : 'none';
    [lBtn, aBtn].forEach(b => {
      if (b) {
        b.classList.toggle('disabled', !enabled);
        b.style.pointerEvents = enabled ? '' : 'none';
      }
    });
    if (kBtn) {
      const track = w.playerCore?.getCurrentTrack?.();
      const ok = !!(track?.fulltext) || (enabled && hasTimedLyrics && currentLyrics.length);
      kBtn.classList.toggle('disabled', !ok);
      kBtn.style.pointerEvents = ok ? '' : 'none';
      kBtn.style.opacity = ok ? '' : '0.4';
    }
    if (!enabled) {
      animationEnabled = false;
      bg?.classList.remove('active');
      aBtn?.classList.remove('active');
      lyricsViewMode = 'hidden';
      if (cont) cont.innerHTML = '';
    } else {
      const saved = localStorage.getItem('lyricsViewMode');
      lyricsViewMode = ['normal', 'hidden', 'expanded'].includes(saved) ? saved : 'normal';
      animationEnabled = localStorage.getItem('lyricsAnimationEnabled') === '1';
      aBtn?.classList.toggle('active', animationEnabled);
      bg?.classList.toggle('active', animationEnabled && lyricsViewMode !== 'hidden');
    }
    renderLyricsViewMode();
  }

  function get404Cache() { try { return JSON.parse(sessionStorage.getItem(LYRICS_404_KEY) || '{}'); } catch { return {}; } }
  function set404Cache(url) { try { const c = get404Cache(); c[url] = Date.now(); const k = Object.keys(c); if (k.length > 100) k.sort((a, b) => c[a] - c[b]).slice(0, 50).forEach(x => delete c[x]); sessionStorage.setItem(LYRICS_404_KEY, JSON.stringify(c)); } catch {} }
  function is404Cached(url) { return !!get404Cache()[url]; }

  async function loadLyrics(url) {
    currentLyrics = []; lyricsLastIdx = -1; hasTimedLyrics = false;
    const cont = $('lyrics');
    if (!cont) return;
    if (!url) { const t = w.playerCore?.getCurrentTrack?.(); if (!(t?.hasLyrics !== false && (t?.hasLyrics || t?.lyrics))) { setLyricsAvailability(false); return; } }
    if (!url) { setLyricsAvailability(false); return; }
    if (is404Cached(url)) { setLyricsAvailability(false); return; }
    if (prefetchedLyricsUrl === url && prefetchedLyrics) {
      currentLyrics = prefetchedLyrics; prefetchedLyrics = null; prefetchedLyricsUrl = null;
      if (currentLyrics.length) { hasTimedLyrics = true; setLyricsAvailability(true); renderLyricsViewMode(); }
      else { setLyricsAvailability(false); }
      prefetchNext(); return;
    }
    const cacheKey = `lyrics_cache_${url}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const p = JSON.parse(cached);
        if (p === '__NO_LYRICS__' || p === null) { setLyricsAvailability(false); prefetchNext(); return; }
        parseLyrics(p);
        if (!currentLyrics.length) { setLyricsAvailability(false); prefetchNext(); return; }
        hasTimedLyrics = true; setLyricsAvailability(true); renderLyricsViewMode(); prefetchNext(); return;
      } catch { sessionStorage.removeItem(cacheKey); }
    }
    cont.innerHTML = '<div class="lyrics-spinner"></div>';
    try {
      const r = await fetch(url, { cache: 'force-cache' });
      if (!r.ok) { if (r.status === 404) set404Cache(url); setLyricsAvailability(false); prefetchNext(); return; }
      const txt = await r.text();
      const fmt = detectFmt(url, txt);
      if (fmt === 'json' || r.headers.get('content-type')?.includes('application/json')) {
        try {
          const j = JSON.parse(txt);
          if (!Array.isArray(j)) { sessionStorage.setItem(cacheKey, JSON.stringify('__NO_LYRICS__')); setLyricsAvailability(false); prefetchNext(); return; }
          sessionStorage.setItem(cacheKey, JSON.stringify(j)); parseLyrics(j);
        } catch { sessionStorage.setItem(cacheKey, JSON.stringify('__NO_LYRICS__')); setLyricsAvailability(false); prefetchNext(); return; }
      } else {
        sessionStorage.setItem(cacheKey, JSON.stringify(txt)); parseLyrics(txt);
      }
      if (!currentLyrics.length) { setLyricsAvailability(false); prefetchNext(); return; }
      hasTimedLyrics = true; setLyricsAvailability(true); renderLyricsViewMode(); prefetchNext();
    } catch { setLyricsAvailability(false); prefetchNext(); }
  }

  function detectFmt(url, txt) {
    if (url) { const l = url.toLowerCase(); if (l.endsWith('.lrc') || l.endsWith('.txt')) return 'lrc'; if (l.endsWith('.json')) return 'json'; }
    if (txt) { const t = txt.trim(); if (t.startsWith('[') && !/^$$\d/.test(t)) { try { JSON.parse(t); return 'json'; } catch {} } if (/\[\d{1,2}:\d{2}/.test(t)) return 'lrc'; }
    return 'unknown';
  }

  async function prefetchNext() {
    prefetchedLyrics = null; prefetchedLyricsUrl = null;
    const ni = w.playerCore?.getNextIndex?.(); if (ni < 0) return;
    const snap = w.playerCore?.getPlaylistSnapshot?.(); const next = snap?.[ni]; if (!next?.lyrics) return;
    const url = next.lyrics; if (is404Cached(url)) return;
    const cacheKey = `lyrics_cache_${url}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) { try { const p = JSON.parse(cached); if (p && p !== '__NO_LYRICS__') { const tmp = []; parseLyricsInto(p, tmp); if (tmp.length) { prefetchedLyrics = tmp; prefetchedLyricsUrl = url; } } } catch {} return; }
    try {
      const r = await fetch(url, { cache: 'force-cache' }); if (!r.ok) { if (r.status === 404) set404Cache(url); return; }
      const txt = await r.text(); const fmt = detectFmt(url, txt); let data = txt; const tmp = [];
      if (fmt === 'json') { try { const j = JSON.parse(txt); if (Array.isArray(j)) { data = j; parseLyricsInto(j, tmp); } } catch {} } else parseLyricsInto(txt, tmp);
      try { sessionStorage.setItem(cacheKey, JSON.stringify(data)); } catch {}
      if (tmp.length) { prefetchedLyrics = tmp; prefetchedLyricsUrl = url; }
    } catch {}
  }

  function parseLyrics(src) { currentLyrics = []; parseLyricsInto(src, currentLyrics); }

  function parseLyricsInto(src, arr) {
    if (Array.isArray(src)) {
      src.forEach(it => { if (typeof it?.time !== 'number') return; const t = (it.line || it.text || '').trim(); if (t) arr.push({ time: it.time, text: t }); });
      arr.sort((a, b) => a.time - b.time); return;
    }
    String(src || '').split('\n').forEach(ln => {
      const tr = ln.trim(); if (!tr || /^\[[a-z]{2}:/i.test(tr)) return;
      let m = tr.match(/^\[(\d{1,2}):(\d{2})\.(\d{2,3})$$(.*)$/);
      if (m) { const cs = m[3].length === 3 ? parseInt(m[3], 10) / 1000 : parseInt(m[3], 10) / 100; const t = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + cs; const txt = (m[4] || '').trim(); if (txt) arr.push({ time: t, text: txt }); return; }
      m = tr.match(/^$$(\d{1,2}):(\d{2})$$(.*)$/);
      if (m) { const t = parseInt(m[1], 10) * 60 + parseInt(m[2], 10); const txt = (m[3] || '').trim(); if (txt) arr.push({ time: t, text: txt }); }
    });
    arr.sort((a, b) => a.time - b.time);
  }

  function renderLyrics(pos) {
    const cont = $('lyrics'); if (!cont) return;
    if (!currentLyrics.length) { cont.innerHTML = '<div class="lyrics-placeholder">Текст не найден</div>'; return; }
    const first = currentLyrics[0]?.time || 0;
    if (pos < first && first > 5) { const rem = first - pos; cont.innerHTML = `<div class="lyrics-countdown"${rem < 1 ? ` style="opacity:${rem.toFixed(2)}"` : ''}>${Math.ceil(rem)}</div>`; return; }
    let active = -1; for (let i = 0; i < currentLyrics.length; i++) { if (pos >= currentLyrics[i].time) active = i; else break; }
    const ws = lyricsViewMode === 'expanded' ? 9 : 5, center = Math.floor(ws / 2);
    const start = Math.max(0, active - center), pad = Math.max(0, center - active);
    const rows = [];
    for (let p = 0; p < pad; p++) rows.push('<div class="lyrics-window-line"></div>');
    for (let i = start; i < Math.min(currentLyrics.length, start + ws - pad); i++) {
      const cls = i === active ? 'lyrics-window-line active' : 'lyrics-window-line';
      rows.push(`<div class="${cls}">${escapeHtml(currentLyrics[i]?.text || '')}</div>`);
    }
    while (rows.length < ws) rows.push('<div class="lyrics-window-line"></div>');
    cont.innerHTML = rows.join('');
  }

  function renderLyricsEnhanced(pos) {
    if (lyricsViewMode === 'hidden' || isInContextMiniMode || !currentLyrics.length) return;
    let active = -1; for (let i = 0; i < currentLyrics.length; i++) { if (pos >= currentLyrics[i].time) active = i; else break; }
    const now = Date.now(); if (active === lyricsLastIdx && now - lyricsLastTs < 250) return;
    lyricsLastIdx = active; lyricsLastTs = now;
    renderLyrics(pos);
  }

  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

  function restoreSettings() {
    favoritesOnlyMode = localStorage.getItem('favoritesOnlyMode') === '1';
    const btn = $('favorites-btn'), icon = $('favorites-btn-icon');
    if (btn && icon) { btn.classList.toggle('favorites-active', favoritesOnlyMode); icon.src = favoritesOnlyMode ? 'img/star.png' : 'img/star2.png'; }
    let vol = 50; const sv = localStorage.getItem('playerVolume'); if (sv !== null) { const v = parseInt(sv, 10); if (Number.isFinite(v)) vol = v; } else try { localStorage.setItem('playerVolume', '50'); } catch {}
    w.playerCore?.setVolume(vol);
    const vs = $('volume-slider'); if (vs) vs.value = String(vol); renderVolumeUI(vol);
    const sm = localStorage.getItem('lyricsViewMode'); lyricsViewMode = ['normal', 'hidden', 'expanded'].includes(sm) ? sm : 'normal';
    animationEnabled = localStorage.getItem('lyricsAnimationEnabled') === '1';
    bitEnabled = localStorage.getItem('bitEnabled') === '1'; if (bitEnabled) setTimeout(startBitEffect, 1000);
    const h = $('pulse-heart'); if (h) h.textContent = bitEnabled ? '❤️' : '🤍';
    renderLyricsViewMode();
    console.log(`✅ Settings restored: lyrics=${lyricsViewMode}, anim=${animationEnabled}`);
  }

  function toggleFavoritesFilter() {
    const cur = w.AlbumsManager?.getCurrentAlbum?.();
    const list = $('track-list'), btn = $('filter-favorites-btn'); if (!cur || !list || !btn) return;
    if (cur === '__favorites__' || cur === '__reliz__') { w.NotificationSystem?.info('Фильтр недоступен'); return; }
    const liked = w.FavoritesManager?.getLikedUidsForAlbum?.(cur) || [];
    favoritesFilterActive = !favoritesFilterActive;
    if (favoritesFilterActive) {
      if (!liked.length) { favoritesFilterActive = false; w.NotificationSystem?.warning('Нет избранных'); return; }
      btn.textContent = 'ПОКАЗАТЬ ВСЕ ПЕСНИ'; btn.classList.add('filtered'); list.classList.add('filtered');
      updateFavoriteClasses(liked);
      w.NotificationSystem?.success('Показаны только избранные');
    } else {
      btn.textContent = 'Скрыть не отмеченные ⭐ песни'; btn.classList.remove('filtered'); list.classList.remove('filtered');
      $qa('.track.is-favorite').forEach(el => el.classList.remove('is-favorite'));
      w.NotificationSystem?.info('Показаны все треки');
    }
  }

  function updateFavoriteClasses(liked) {
    const album = w.AlbumsManager?.getCurrentAlbum?.();
    const data = w.AlbumsManager?.getAlbumData?.(album);
    if (!data?.tracks) return;
    $qa('.track').forEach(el => {
      const idx = parseInt(el.dataset.index, 10); if (!Number.isFinite(idx)) return;
      const t = data.tracks[idx], uid = String(t?.uid || '').trim();
      el.classList.toggle('is-favorite', uid && liked.includes(uid));
    });
  }

  function syncFilterWithFavoritesMode() {
    const cur = w.AlbumsManager?.getCurrentAlbum?.();
    const btn = $('filter-favorites-btn'), list = $('track-list'); if (!btn || !list) return;
    favoritesFilterActive = favoritesOnlyMode;
    if (favoritesFilterActive) {
      btn.textContent = 'ПОКАЗАТЬ ВСЕ ПЕСНИ'; btn.classList.add('filtered'); list.classList.add('filtered');
      const liked = cur === '__favorites__' ? null : w.FavoritesManager?.getLikedUidsForAlbum?.(cur) || [];
      if (liked) updateFavoriteClasses(liked);
    } else {
      btn.textContent = 'Скрыть не отмеченные ⭐ песни'; btn.classList.remove('filtered'); list.classList.remove('filtered');
      $qa('.track.is-favorite').forEach(el => el.classList.remove('is-favorite'));
    }
  }

  function updateAvailableTracksForPlayback() {
    const album = w.AlbumsManager?.getPlayingAlbum?.();
    const snap = w.playerCore?.getPlaylistSnapshot?.() || [];
    if (!album || !snap.length) return;
    if (album === '__favorites__') { w.availableFavoriteIndices = null; return; }
    if (favoritesOnlyMode) {
      const liked = w.FavoritesManager?.getLikedUidsForAlbum?.(album) || [];
      if (!liked.length) { w.availableFavoriteIndices = null; return; }
      w.availableFavoriteIndices = snap.map((t, i) => liked.includes(String(t?.uid || '').trim()) ? i : -1).filter(i => i >= 0);
    } else {
      w.availableFavoriteIndices = null;
    }
  }

  function formatTime(s) { if (isNaN(s) || s < 0) return '00:00'; const m = Math.floor(s / 60), sec = Math.floor(s % 60); return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`; }

  w.PlayerUI = {
    initialize: initPlayerUI,
    ensurePlayerBlock,
    updateMiniHeader,
    updateNextUpLabel,
    togglePlayPause,
    toggleLikePlaying,
    switchAlbumInstantly,
    toggleFavoritesFilter,
    toggleFavoritesOnly,
    updateAvailableTracksForPlayback,
    get currentLyrics() { return currentLyrics; },
    get currentLyricsLines() { return currentLyrics.map(l => ({ line: l.text })); }
  };

  w.toggleFavoritesFilter = toggleFavoritesFilter;
  w.toggleFavoritesOnly = toggleFavoritesOnly;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPlayerUI);
  else initPlayerUI();
})();
