// scripts/app/player-ui.js
// UI плеера на новой платформе PlayerCore

(function PlayerUIModule() {
  'use strict';

  const w = window;

  let currentLyrics = [];
  let lyricsViewMode = 'normal';
  let isSeekingProgress = false;
  let isMuted = false;
  let animationEnabled = false;
  let bitEnabled = false;
  let bitIntensity = 100;

  let audioContext = null;
  let analyser = null;
  let animationFrame = null;

  const LYRICS_MIN_INTERVAL = 250;
  let lyricsLastIdx = -1;
  let lyricsLastTs = 0;

  function initPlayerUI() {
    if (!w.albumsIndex || w.albumsIndex.length === 0) {
      setTimeout(initPlayerUI, 100);
      return;
    }

    restoreSettings();
    attachPlayerCoreEvents();
    
    console.log('✅ PlayerUI initialized');
  }

  function attachPlayerCoreEvents() {
    if (!w.playerCore) {
      setTimeout(attachPlayerCoreEvents, 100);
      return;
    }

    w.playerCore.on({
      onTrackChange: (track, index) => {
        onTrackChange(track, index);
      },
      onPlay: (track, index) => {
        updatePlayPauseIcon();
      },
      onPause: (track, index) => {
        updatePlayPauseIcon();
      },
      onStop: (track, index) => {
        updatePlayPauseIcon();
      },
      onTick: (position, duration) => {
        updateProgress(position, duration);
        renderLyricsEnhanced(position);
      }
    });
  }

  function onTrackChange(track, index) {
    if (!track) return;
    
    ensurePlayerBlock(index);
    loadLyrics(track.lyrics);
    
    const downloadBtn = document.getElementById('track-download-btn');
    if (downloadBtn && track.src) {
      downloadBtn.href = track.src;
      downloadBtn.download = `${track.title}.mp3`;
    }
  }

  function isBrowsingOtherAlbum() {
    const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.();
    const currentAlbum = w.AlbumsManager?.getCurrentAlbum();
    
    if (!playingAlbum) return false;
    if (playingAlbum === '__favorites__' && currentAlbum === '__favorites__') return false;
    
    return playingAlbum !== currentAlbum;
  }

  function ensurePlayerBlock(trackIndex) {
    let playerBlock = document.getElementById('lyricsplayerblock');
    
    if (!playerBlock) {
      playerBlock = createPlayerBlock();
    }

    const inMiniMode = isBrowsingOtherAlbum();
    const nowPlaying = document.getElementById('now-playing');

    if (inMiniMode) {
      if (nowPlaying && !nowPlaying.contains(playerBlock)) {
        nowPlaying.innerHTML = '';

        const miniHeader = createMiniHeader();
        nowPlaying.appendChild(miniHeader);

        nowPlaying.appendChild(playerBlock);

        const nextUp = createNextUpElement();
        nowPlaying.appendChild(nextUp);
      }

      // В мини-режиме ЛИРИКА не показывается (экономия места и ресурсов)
      const lyricsWindow = playerBlock.querySelector('#lyrics-window');
      if (lyricsWindow) {
        lyricsWindow.style.display = 'none';
      }

      const lyricsToggle = playerBlock.querySelector('.lyrics-toggle-btn');
      if (lyricsToggle) {
        lyricsToggle.style.display = 'none';
      }

      // Мини-шапка и "Далее" видны
      const miniHeaderEl = document.getElementById('mini-now');
      if (miniHeaderEl) miniHeaderEl.style.display = 'flex';

      const nextUpEl = document.getElementById('next-up');
      if (nextUpEl) nextUpEl.style.display = 'flex';

    } else {
      const trackList = document.getElementById('track-list');
      if (!trackList) return;

      const trackRow = trackList.querySelector(`.track[data-index="${trackIndex}"]`);
      if (trackRow) {
        if (trackRow.nextSibling !== playerBlock) {
          if (trackRow.nextSibling) {
            trackRow.parentNode.insertBefore(playerBlock, trackRow.nextSibling);
          } else {
            trackRow.parentNode.appendChild(playerBlock);
          }
        }
      }

      // В обычном режиме показываем окно лирики и кнопку
      const lyricsWindow = playerBlock.querySelector('#lyrics-window');
      if (lyricsWindow) {
        lyricsWindow.style.display = '';
      }

      const lyricsToggle = playerBlock.querySelector('.lyrics-toggle-btn');
      if (lyricsToggle) {
        lyricsToggle.style.display = '';
      }

      // Мини-шапка и "Далее" скрываем (но не удаляем, mini.js может управлять стилем рамки)
      const miniHeaderEl = document.getElementById('mini-now');
      if (miniHeaderEl) miniHeaderEl.style.display = 'none';

      const nextUpEl = document.getElementById('next-up');
      if (nextUpEl) nextUpEl.style.display = 'none';
    }

    updateMiniHeader();
    updateNextUpLabel();
  }

  function createPlayerBlock() {
    const block = document.createElement('div');
    block.className = 'lyrics-player-block';
    block.id = 'lyricsplayerblock';
    
    block.innerHTML = `
      <div id="lyrics-window" class="lyrics-${lyricsViewMode}">
        <div class="lyrics-animated-bg${animationEnabled ? ' active' : ''}"></div>
        <div class="lyrics-scroll" id="lyrics"></div>
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
          
          <button class="player-control-btn animation-btn" id="animation-btn" title="Анимация лирики (A)">A</button>
          <button class="player-control-btn bit-btn" id="bit-btn" title="Пульсация логотипа (B)">B</button>
          
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
        <div class="volume-track"></div>
        <div class="volume-fill" id="volume-fill"></div>
        <input type="range" class="volume-slider" id="volume-slider" min="0" max="100" value="100" aria-label="Громкость">
      </div>
      
      <div class="player-buttons-wrapper">
        <button class="lyrics-toggle-btn lyrics-${lyricsViewMode}" id="lyrics-toggle-btn" title="Режим лирики (Y)">
          <span class="lyrics-toggle-btn-visual">Т</span>
          <span class="lyrics-toggle-label">${getLyricsModeLabel()}</span>
        </button>
        
        <div class="player-extra-buttons-row">
          <button class="karaoke-btn" id="lyrics-text-btn">📝 ТЕКСТ</button>
          <a class="player-download-btn" href="#" id="track-download-btn" download>💾 СКАЧАТЬ</a>
          <button id="eco-btn" class="eco-btn" title="Ультра-эконом">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z"/>
            </svg>
            <span class="eco-label">ЭКО</span>
          </button>
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
    
    header.addEventListener('click', (e) => {
      if (e.target.id === 'mini-now-star') return;
      
      const playingKey = w.AlbumsManager?.getPlayingAlbum?.();
      if (playingKey && playingKey !== '__reliz__') {
        w.AlbumsManager?.loadAlbum(playingKey);
      }
    });
    
    const star = header.querySelector('#mini-now-star');
    star?.addEventListener('click', (e) => {
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

  function updateMiniHeader() {
    const header = document.getElementById('mini-now');
    if (!header) return;
    
    const inMiniMode = isBrowsingOtherAlbum();
    
    if (!inMiniMode) {
      header.style.display = 'none';
      return;
    }
    
    const track = w.playerCore?.getCurrentTrack();
    const index = w.playerCore?.getIndex();
    
    if (!track) {
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
      const liked = w.FavoritesManager?.getLikedForAlbum(playingAlbum)?.includes(index);
      star.src = liked ? 'img/star.png' : 'img/star2.png';
    }
  }

  function updateNextUpLabel() {
    const nextUp = document.getElementById('next-up');
    if (!nextUp) return;
    
    const inMiniMode = isBrowsingOtherAlbum();
    
    if (!inMiniMode) {
      nextUp.style.display = 'none';
      return;
    }
    
    const nextIndex = w.playerCore?.getNextIndex();
    if (nextIndex === undefined || nextIndex < 0) {
      nextUp.style.display = 'none';
      return;
    }
    
    const snapshot = w.playerCore?.getPlaylistSnapshot();
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

  function bindPlayerEvents(block) {
    const playPauseBtn = block.querySelector('#play-pause-btn');
    playPauseBtn?.addEventListener('click', togglePlayPause);

    block.querySelector('#prev-btn')?.addEventListener('click', () => w.playerCore?.prev());
    block.querySelector('#next-btn')?.addEventListener('click', () => w.playerCore?.next());
    block.querySelector('#stop-btn')?.addEventListener('click', () => w.playerCore?.stop());

    block.querySelector('#repeat-btn')?.addEventListener('click', toggleRepeat);
    block.querySelector('#shuffle-btn')?.addEventListener('click', toggleShuffle);

    block.querySelector('#mute-btn')?.addEventListener('click', toggleMute);

    const volumeSlider = block.querySelector('#volume-slider');
    volumeSlider?.addEventListener('input', onVolumeChange);

    const progressBar = block.querySelector('#player-progress-bar');
    progressBar?.addEventListener('mousedown', startSeeking);
    progressBar?.addEventListener('touchstart', startSeeking);

    block.querySelector('#lyrics-toggle-btn')?.addEventListener('click', toggleLyricsView);

    block.querySelector('#animation-btn')?.addEventListener('click', toggleAnimation);
    block.querySelector('#bit-btn')?.addEventListener('click', toggleBit);

    block.querySelector('#favorites-btn')?.addEventListener('click', toggleFavoritesOnly);

    block.querySelector('#sleep-timer-btn')?.addEventListener('click', () => {
      w.SleepTimer?.show?.();
    });

    block.querySelector('#lyrics-text-btn')?.addEventListener('click', () => {
      w.LyricsModal?.show?.();
    });

    const downloadBtn = block.querySelector('#track-download-btn');
    downloadBtn?.addEventListener('click', (e) => {
      const track = w.playerCore?.getCurrentTrack();
      if (!track || !track.src) {
        e.preventDefault();
        w.NotificationSystem?.error('Трек недоступен для скачивания');
      }
    });

    block.querySelector('#eco-btn')?.addEventListener('click', toggleEcoMode);

    document.addEventListener('mousemove', handleSeeking);
    document.addEventListener('touchmove', handleSeeking);
    document.addEventListener('mouseup', stopSeeking);
    document.addEventListener('touchend', stopSeeking);
  }

  function togglePlayPause() {
    if (!w.playerCore) return;
    
    if (w.playerCore.isPlaying()) {
      w.playerCore.pause();
    } else {
      w.playerCore.play();
    }
  }

  function updatePlayPauseIcon() {
    const icon = document.getElementById('play-pause-icon');
    if (!icon || !w.playerCore) return;

    if (w.playerCore.isPlaying()) {
      icon.innerHTML = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';
    } else {
      icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    }
  }

  function startSeeking(e) {
    isSeekingProgress = true;
    handleSeeking(e);
  }

  function handleSeeking(e) {
    if (!isSeekingProgress) return;

    const progressBar = document.getElementById('player-progress-bar');
    if (!progressBar || !w.playerCore) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const rect = progressBar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    
    const duration = w.playerCore.getDuration();
    w.playerCore.seek(duration * percent);
  }

  function stopSeeking() {
    isSeekingProgress = false;
  }

  function updateProgress(position, duration) {
    if (isSeekingProgress) return;
    
    const percent = (position / duration) * 100;
    const fill = document.getElementById('player-progress-fill');
    if (fill) fill.style.width = `${Math.min(100, percent)}%`;

    const elapsed = document.getElementById('time-elapsed');
    const remaining = document.getElementById('time-remaining');
    
    if (elapsed) elapsed.textContent = formatTime(position);
    if (remaining) remaining.textContent = `-${formatTime(duration - position)}`;
  }

  function onVolumeChange(e) {
    const value = parseInt(e.target.value, 10);
    w.playerCore?.setVolume(value);
    
    const fill = document.getElementById('volume-fill');
    if (fill) fill.style.width = `${value}%`;
    
    localStorage.setItem('playerVolume', value);
  }

  function toggleMute() {
    if (!w.playerCore) return;
    
    isMuted = !isMuted;
    w.playerCore.setMuted(isMuted);
    
    const btn = document.getElementById('mute-btn');
    if (btn) btn.classList.toggle('active', isMuted);
  }

  function toggleRepeat() {
    if (!w.playerCore) return;
    
    w.playerCore.toggleRepeat();
    const btn = document.getElementById('repeat-btn');
    if (btn) btn.classList.toggle('active', w.playerCore.isRepeat());
  }

  function toggleShuffle() {
    if (!w.playerCore) return;
    
    w.playerCore.toggleShuffle();
    const btn = document.getElementById('shuffle-btn');
    if (btn) btn.classList.toggle('active', w.playerCore.isShuffle());
  }

  function toggleAnimation() {
    animationEnabled = !animationEnabled;
    localStorage.setItem('lyricsAnimationEnabled', animationEnabled ? '1' : '0');
    
    const bg = document.querySelector('.lyrics-animated-bg');
    bg?.classList.toggle('active', animationEnabled);
    
    const btn = document.getElementById('animation-btn');
    if (btn) btn.classList.toggle('active', animationEnabled);
  }

  function toggleBit() {
    bitEnabled = !bitEnabled;
    localStorage.setItem('bitEnabled', bitEnabled ? '1' : '0');
    
    const btn = document.getElementById('bit-btn');
    if (btn) btn.classList.toggle('active', bitEnabled);
    
    if (bitEnabled) {
      startBitEffect();
    } else {
      stopBitEffect();
    }
  }

  function startBitEffect() {
    if (!audioContext) {
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        
        const source = audioContext.createMediaElementSource(w.playerCore?.getAudioElement?.());
        source.connect(analyser);
        analyser.connect(audioContext.destination);
      } catch (e) {
        console.error('Failed to init AudioContext:', e);
        return;
      }
    }
    
    animateBit();
  }

  function animateBit() {
    if (!bitEnabled || !analyser) return;
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    
    const avg = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
    const intensity = (avg / 255) * (bitIntensity / 100);
    
    const logo = document.getElementById('logo-bottom');
    if (logo) {
      const scale = 1 + (intensity * 0.2);
      logo.style.transform = `scale(${scale})`;
    }
    
    animationFrame = requestAnimationFrame(animateBit);
  }

  function stopBitEffect() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    
    const logo = document.getElementById('logo-bottom');
    if (logo) logo.style.transform = 'scale(1)';
  }

  function toggleLyricsView() {
    const modes = ['normal', 'medium', 'large', 'compact'];
    const currentIndex = modes.indexOf(lyricsViewMode);
    lyricsViewMode = modes[(currentIndex + 1) % modes.length];
    
    localStorage.setItem('lyricsViewMode', lyricsViewMode);
    
    const lyricsWindow = document.getElementById('lyrics-window');
    const btn = document.getElementById('lyrics-toggle-btn');
    
    if (lyricsWindow) {
      lyricsWindow.className = `lyrics-${lyricsViewMode}`;
    }
    
    if (btn) {
      btn.className = `lyrics-toggle-btn lyrics-${lyricsViewMode}`;
      const label = btn.querySelector('.lyrics-toggle-label');
      if (label) label.textContent = getLyricsModeLabel();
    }
  }

  function getLyricsModeLabel() {
    const labels = {
      normal: 'Нормальный',
      medium: 'Средний',
      large: 'Большой',
      compact: 'Компактный'
    };
    return labels[lyricsViewMode] || 'Нормальный';
  }

  function toggleFavoritesOnly() {
    const currentAlbum = w.AlbumsManager?.getCurrentAlbum();
    
    if (currentAlbum === '__favorites__') {
      w.NotificationSystem?.info('Вы уже в разделе Избранное');
      return;
    }
    
    const btn = document.getElementById('favorites-btn');
    const icon = document.getElementById('favorites-btn-icon');
    
    const isActive = btn?.classList.contains('active');
    
    if (isActive) {
      btn?.classList.remove('active');
      if (icon) icon.src = 'img/star2.png';
      
      document.querySelectorAll('.track').forEach(el => {
        el.style.display = '';
      });
    } else {
      btn?.classList.add('active');
      if (icon) icon.src = 'img/star.png';
      
      const liked = w.FavoritesManager?.getLikedForAlbum(currentAlbum) || [];
      
      document.querySelectorAll('.track').forEach(el => {
        const index = parseInt(el.dataset.index, 10);
        if (!liked.includes(index + 1)) {
          el.style.display = 'none';
        }
      });
    }
  }

  function toggleLikePlaying() {
    const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.();
    const index = w.playerCore?.getIndex();

    if (!playingAlbum || index === undefined) return;

    // Везде считаем, что номер трека = index + 1 (как в likedTracks:v2)
    const trackNum = index + 1;
    const liked = w.FavoritesManager?.getLikedForAlbum(playingAlbum) || [];
    const isLiked = liked.includes(trackNum);

    if (w.FavoritesManager && typeof w.FavoritesManager.toggleLike === 'function') {
      w.FavoritesManager.toggleLike(playingAlbum, trackNum, !isLiked);
    } else if (typeof w.toggleLikeForAlbum === 'function') {
      // Back‑compat: если по какой‑то причине класс недоступен
      w.toggleLikeForAlbum(playingAlbum, trackNum, !isLiked);
    }

    updateMiniHeader();
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

  async function loadLyrics(lyricsUrl) {
    currentLyrics = [];
    lyricsLastIdx = -1;
    
    const container = document.getElementById('lyrics');
    if (!container) return;
    
    if (!lyricsUrl) {
      container.innerHTML = '<div class="lyrics-placeholder">Текст не найден</div>';
      return;
    }
    
    try {
      const response = await fetch(lyricsUrl, { cache: 'force-cache' });
      if (!response.ok) throw new Error('Failed to load lyrics');
      
      const text = await response.text();
      parseLyrics(text);
      renderLyrics();
    } catch (error) {
      console.error('Failed to load lyrics:', error);
      container.innerHTML = '<div class="lyrics-placeholder">Ошибка загрузки текста</div>';
    }
  }

  function parseLyrics(text) {
    const lines = text.split('\n');
    currentLyrics = [];
    
    lines.forEach(line => {
      const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2})\](.*)$/);
      if (match) {
        const [, mm, ss, cs, txt] = match;
        const time = parseInt(mm) * 60 + parseInt(ss) + parseInt(cs) / 100;
        currentLyrics.push({ time, text: txt.trim() });
      }
    });
    
    currentLyrics.sort((a, b) => a.time - b.time);
  }

  function renderLyrics() {
    const container = document.getElementById('lyrics');
    if (!container) return;
    
    if (currentLyrics.length === 0) {
      container.innerHTML = '<div class="lyrics-placeholder">Текст не найден</div>';
      return;
    }
    
    container.innerHTML = '';
    
    currentLyrics.forEach((line, index) => {
      const div = document.createElement('div');
      div.className = 'lyrics-line';
      div.dataset.index = index;
      div.textContent = line.text || '♪';
      container.appendChild(div);
    });
  }

  function renderLyricsEnhanced(position) {
    if (!currentLyrics.length) return;
    
    let activeIdx = -1;
    
    for (let i = 0; i < currentLyrics.length; i++) {
      if (currentLyrics[i].time <= position) {
        activeIdx = i;
      } else {
        break;
      }
    }
    
    if (activeIdx === lyricsLastIdx) return;
    
    const now = Date.now();
    if (now - lyricsLastTs < LYRICS_MIN_INTERVAL) return;
    
    lyricsLastIdx = activeIdx;
    lyricsLastTs = now;
    
    const container = document.getElementById('lyrics');
    if (!container) return;
    
    const lines = container.querySelectorAll('.lyrics-line');
    lines.forEach((line, idx) => {
      line.classList.toggle('active', idx === activeIdx);
    });
    
    if (activeIdx >= 0 && lines[activeIdx]) {
      lines[activeIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function restoreSettings() {
    const savedVolume = localStorage.getItem('playerVolume');
    if (savedVolume !== null) {
      const volume = parseInt(savedVolume, 10);
      w.playerCore?.setVolume(volume);
      
      const volumeSlider = document.getElementById('volume-slider');
      const volumeFill = document.getElementById('volume-fill');
      
      if (volumeSlider) volumeSlider.value = volume;
      if (volumeFill) volumeFill.style.width = `${volume}%`;
    }
    
    const savedLyricsMode = localStorage.getItem('lyricsViewMode');
    if (savedLyricsMode) {
      lyricsViewMode = savedLyricsMode;
    }
    
    const savedAnimation = localStorage.getItem('lyricsAnimationEnabled');
    animationEnabled = savedAnimation === '1';
    
    const savedBit = localStorage.getItem('bitEnabled');
    bitEnabled = savedBit === '1';
    
    if (bitEnabled) {
      setTimeout(startBitEffect, 1000);
    }
  }

  function formatTime(sec) {
    if (isNaN(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Экспорт в window
  w.PlayerUI = {
    initialize: initPlayerUI,
    ensurePlayerBlock,
    updateMiniHeader,
    updateNextUpLabel,
    togglePlayPause,
    toggleLikePlaying
  };

  // Автоинициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayerUI);
  } else {
    initPlayerUI();
  }

})();

