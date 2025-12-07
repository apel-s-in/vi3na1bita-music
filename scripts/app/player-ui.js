// scripts/app/player-ui.js
// Полнофункциональный UI плеера с Sleep Timer и Favorites-Only

(function PlayerUIModule() {
  'use strict';

  const w = window;

  // Состояние
  let currentLyrics = [];
  let lyricsViewMode = 'normal';
  let isSeekingProgress = false;
  let isMuted = false;
  let animationEnabled = false;
  let bitEnabled = false;
  let bitIntensity = 100;
  let favoritesOnlyMode = false;

  // Audio Context для пульсации
  let audioContext = null;
  let analyser = null;
  let audioSource = null;
  let animationFrame = null;

  const LYRICS_MIN_INTERVAL = 250;
  let lyricsLastIdx = -1;
  let lyricsLastTs = 0;

  // ========== ИНИЦИАЛИЗАЦИЯ ==========

  function initPlayerUI() {
    if (!w.playerCore) {
      setTimeout(initPlayerUI, 100);
      return;
    }

    // Подписка на события PlayerCore
    w.playerCore.on({
      onTrackChange: (track, index) => {
        ensurePlayerBlock();
        loadLyrics(track?.lyrics);
        updateTrackInfo(track);
        updateDownloadLink(track);
        highlightCurrentTrack(index);
      },
      onPlay: () => {
        updatePlayPauseIcon();
      },
      onPause: () => {
        updatePlayPauseIcon();
      },
      onStop: () => {
        updatePlayPauseIcon();
        resetProgress();
      },
      onTick: (position, duration) => {
        if (!isSeekingProgress) {
          updateProgress(position, duration);
          renderLyricsEnhanced(position);
        }
      }
    });

    restoreSettings();
    initFavoritesOnlyMode();
    
    console.log('✅ PlayerUI initialized');
  }

  // ========== РЕНДЕРИНГ БЛОКА ПЛЕЕРА ==========

  function ensurePlayerBlock() {
    const container = document.getElementById('now-playing');
    if (!container) return;

    if (document.getElementById('lyricsplayerblock')) {
      return; // Уже создан
    }

    // Добавить элемент "Далее" для мини-режима
    const nextUpExists = document.getElementById('next-up');
    if (!nextUpExists) {
      const nextUp = document.createElement('div');
      nextUp.id = 'next-up';
      nextUp.className = 'next-up';
      nextUp.innerHTML = `
        <span class="label">Далее:</span>
        <span class="title" title="">—</span>
      `;
      container.appendChild(nextUp);
    }

    container.innerHTML = `
      <div class="lyrics-player-block" id="lyricsplayerblock">
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
        
        <div class="audio-wrapper">
          <div id="audio-slot"></div>
        </div>
        
        <div class="player-controls">
          <div class="player-controls-row">
            <span class="time-in-controls" id="time-elapsed">00:00</span>
            
            <button class="player-control-btn" id="prev-btn" title="Предыдущий трек (P)" aria-label="Предыдущий">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M11 5L4 12l7 7V5zm9 0v14l-7-7 7-7z"/>
              </svg>
            </button>
            
            <button class="player-control-btn main" id="play-pause-btn" title="Воспроизведение/Пауза (K/Пробел)" aria-label="Играть/Пауза">
              <svg id="play-pause-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
            
            <button class="player-control-btn" id="stop-btn" title="Стоп (X)" aria-label="Стоп">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12"/>
              </svg>
            </button>
            
            <button class="player-control-btn" id="next-btn" title="Следующий трек (N)" aria-label="Следующий">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 5l7 7-7 7V5zM4 5v14l7-7-7-7z"/>
              </svg>
            </button>
            
            <span class="time-in-controls" id="time-remaining">--:--</span>
          </div>
          
          <div class="player-controls-row">
            <button class="player-control-btn" id="mute-btn" title="Без звука (M)" aria-label="Звук">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
              </svg>
            </button>
            
            <button class="player-control-btn" id="shuffle-btn" title="Случайный порядок (U)" aria-label="Перемешать">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 17h2.735a4 4 0 003.43-1.942l3.67-6.116A4 4 0 0116.265 7H21m0 0l-3-3m3 3l-3 3"/>
                <path d="M3 7h2.735a4 4 0 013.43 1.942l3.67 6.116A4 4 0 0016.265 17H21m0 0l-3 3m3-3l-3-3"/>
              </svg>
            </button>
            
            <button class="player-control-btn animation-btn" id="animation-btn" title="Анимация лирики (A)" aria-label="Анимация">A</button>
            <button class="player-control-btn bit-btn" id="bit-btn" title="Пульсация логотипа (B)" aria-label="Пульсация">B</button>
            
            <button class="player-control-btn" id="repeat-btn" title="Повтор трека (R)" aria-label="Повтор">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 2l4 4-4 4"/>
                <path d="M3 11V9a4 4 0 014-4h14"/>
                <path d="M7 22l-4-4 4-4"/>
                <path d="M21 13v2a4 4 0 01-4 4H3"/>
                <circle cx="12" cy="12" r="1" fill="currentColor"/>
              </svg>
            </button>
            
            <button class="sleep-timer-btn" id="sleep-timer-btn" title="Таймер сна (T)" aria-label="Таймер сна">
              <svg viewBox="0 0 24 24" width="24" height="24">
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"></circle>
                <path d="M12 7v5l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
              <span class="sleep-timer-badge" id="sleep-timer-badge" style="display:none;">0</span>
            </button>
            
            <button class="player-control-btn" id="favorites-btn" title="Только избранные (F)" aria-label="Избранное">
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
          <button class="lyrics-toggle-btn lyrics-${lyricsViewMode}" id="lyrics-toggle-btn" title="Режим лирики (Y)" aria-label="Режим лирики">
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
      </div>
    `;
    // Добавить мини-заголовок
    const miniNowExists = document.getElementById('mini-now');
    if (!miniNowExists) {
      const miniNow = document.createElement('div');
      miniNow.className = 'mini-now';
      miniNow.id = 'mini-now';
      miniNow.innerHTML = `
        <span class="tnum" id="mini-now-num">--.</span>
        <span class="track-title" id="mini-now-title">—</span>
        <img src="img/star2.png" class="like-star" id="mini-now-star" alt="звезда">
      `;
      
      miniNow.addEventListener('click', (e) => {
        if (e.target.id !== 'mini-now-star') {
          // Клик по мини-заголовку - вернуться к играющему альбому
          const playingAlbum = window.AlbumsManager?.getCurrentAlbum();
          if (playingAlbum && playingAlbum !== '__favorites__' && playingAlbum !== '__reliz__') {
            window.AlbumsManager?.loadAlbum(playingAlbum);
          }
        }
      });

      const star = miniNow.querySelector('#mini-now-star');
      star?.addEventListener('click', (e) => {
        e.stopPropagation();
        const track = w.playerCore?.getCurrentTrack();
        if (!track) return;
        
        const albumKey = window.AlbumsManager?.getCurrentAlbum();
        const index = w.playerCore?.getIndex();
        
        if (albumKey && typeof index === 'number') {
          const liked = window.FavoritesManager?.isFavorite(albumKey, index);
          window.FavoritesManager?.toggleLike(albumKey, index, !liked);
          star.src = liked ? 'img/star2.png' : 'img/star.png';
        }
      });

      const playerBlock = document.getElementById('lyricsplayerblock');
      if (playerBlock && playerBlock.parentNode) {
        playerBlock.parentNode.insertBefore(miniNow, playerBlock);
      }
    }

    bindPlayerEvents();
  }

  // ========== ПРИВЯЗКА СОБЫТИЙ ==========

  function bindPlayerEvents() {
    // Play/Pause
    const playPauseBtn = document.getElementById('play-pause-btn');
    playPauseBtn?.addEventListener('click', () => {
      if (w.playerCore.isPlaying()) {
        w.playerCore.pause();
      } else {
        w.playerCore.play();
      }
    });

    // Prev/Next/Stop
    document.getElementById('prev-btn')?.addEventListener('click', () => w.playerCore.prev());
    document.getElementById('next-btn')?.addEventListener('click', () => w.playerCore.next());
    document.getElementById('stop-btn')?.addEventListener('click', () => w.playerCore.stop());

    // Repeat
    document.getElementById('repeat-btn')?.addEventListener('click', toggleRepeat);

    // Shuffle
    document.getElementById('shuffle-btn')?.addEventListener('click', toggleShuffle);

    // Mute
    document.getElementById('mute-btn')?.addEventListener('click', toggleMute);

    // Volume
    const volumeSlider = document.getElementById('volume-slider');
    volumeSlider?.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value) / 100;
      w.playerCore.setVolume(value);
      updateVolumeUI(value);
      localStorage.setItem('playerVolume', String(value));
      isMuted = false;
    });

    // Progress bar
    const progressBar = document.getElementById('player-progress-bar');
    
    progressBar?.addEventListener('mousedown', startSeeking);
    progressBar?.addEventListener('touchstart', startSeeking);
    
    document.addEventListener('mousemove', handleSeeking);
    document.addEventListener('touchmove', handleSeeking);
    
    document.addEventListener('mouseup', stopSeeking);
    document.addEventListener('touchend', stopSeeking);

    // Lyrics toggle
    document.getElementById('lyrics-toggle-btn')?.addEventListener('click', toggleLyricsView);

    // Animation
    document.getElementById('animation-btn')?.addEventListener('click', toggleAnimation);

    // Bit
    document.getElementById('bit-btn')?.addEventListener('click', toggleBit);

    // Favorites only
    document.getElementById('favorites-btn')?.addEventListener('click', toggleFavoritesOnly);

    // Lyrics text modal
    document.getElementById('lyrics-text-btn')?.addEventListener('click', () => {
      w.LyricsModal?.show();
    });

    // Download track
    const downloadBtn = document.getElementById('track-download-btn');
    downloadBtn?.addEventListener('click', (e) => {
      const track = w.playerCore.getCurrentTrack();
      if (!track || !track.src) {
        e.preventDefault();
        w.NotificationSystem?.error('Трек недоступен для скачивания');
      }
    });

    // Eco mode
    document.getElementById('eco-btn')?.addEventListener('click', toggleEcoMode);
  }

  // ========== PROGRESS BAR ==========

  function startSeeking(e) {
    isSeekingProgress = true;
    handleSeeking(e);
  }

  function handleSeeking(e) {
    if (!isSeekingProgress) return;

    const progressBar = document.getElementById('player-progress-bar');
    if (!progressBar) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const rect = progressBar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const duration = w.playerCore.getDuration();
    
    const newPosition = duration * percent;
    w.playerCore.seek(newPosition);
    updateProgress(newPosition, duration);
  }

  function stopSeeking() {
    isSeekingProgress = false;
  }

  function updateProgress(position, duration) {
    const percent = (position / duration) * 100;
    const fill = document.getElementById('player-progress-fill');
    if (fill) fill.style.width = `${Math.min(100, percent)}%`;

    const elapsed = document.getElementById('time-elapsed');
    const remaining = document.getElementById('time-remaining');
    
    if (elapsed) elapsed.textContent = formatTime(position);
    if (remaining) remaining.textContent = formatTime(Math.max(0, duration - position));
  }

  function resetProgress() {
    const fill = document.getElementById('player-progress-fill');
    if (fill) fill.style.width = '0%';

    const elapsed = document.getElementById('time-elapsed');
    const remaining = document.getElementById('time-remaining');
    
    if (elapsed) elapsed.textContent = '00:00';
    if (remaining) remaining.textContent = '--:--';
  }

  // ========== PLAY/PAUSE ==========

  function updatePlayPauseIcon() {
    const icon = document.getElementById('play-pause-icon');
    const btn = document.getElementById('play-pause-btn');
    if (!icon || !btn) return;

    if (w.playerCore.isPlaying()) {
      icon.innerHTML = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';
      btn.title = 'Пауза (K/Пробел)';
    } else {
      icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
      btn.title = 'Играть (K/Пробел)';
    }
  }

  // ========== VOLUME ==========

  function toggleMute() {
    if (isMuted) {
      const saved = parseFloat(localStorage.getItem('playerVolume') || '1');
      w.playerCore.setVolume(saved);
      isMuted = false;
      updateVolumeUI(saved);
    } else {
      localStorage.setItem('playerVolume', String(w.playerCore.getVolume()));
      w.playerCore.setVolume(0);
      isMuted = true;
      updateVolumeUI(0);
    }
  }

  function updateVolumeUI(volume) {
    const percent = Math.round(volume * 100);
    const fill = document.getElementById('volume-fill');
    const slider = document.getElementById('volume-slider');
    
    if (fill) fill.style.width = `${percent}%`;
    if (slider) slider.value = percent;
  }

  // ========== REPEAT & SHUFFLE ==========

  function toggleRepeat() {
    const newState = !w.playerCore.repeat;
    w.playerCore.setRepeat(newState);
    
    const btn = document.getElementById('repeat-btn');
    btn?.classList.toggle('repeat-active', newState);
    
    localStorage.setItem('repeatMode', newState ? '1' : '0');
    w.NotificationSystem?.info(newState ? '🔁 Повтор: ВКЛ' : '🔁 Повтор: ВЫКЛ');
  }

  function toggleShuffle() {
    const newState = !w.playerCore.shuffle;
    w.playerCore.setShuffle(newState);
    
    const btn = document.getElementById('shuffle-btn');
    btn?.classList.toggle('active', newState);
    
    localStorage.setItem('shuffleMode', newState ? '1' : '0');
    w.NotificationSystem?.info(newState ? '🔀 Перемешивание: ВКЛ' : '🔀 Перемешивание: ВЫКЛ');
  }

  // ========== FAVORITES ONLY MODE ==========

  function initFavoritesOnlyMode() {
    try {
      favoritesOnlyMode = localStorage.getItem('favoritesOnlyMode') === '1';
      applyFavoritesOnlyState();
    } catch {}
  }

  function toggleFavoritesOnly() {
    favoritesOnlyMode = !favoritesOnlyMode;
    applyFavoritesOnlyState();
    
    try {
      localStorage.setItem('favoritesOnlyMode', favoritesOnlyMode ? '1' : '0');
    } catch {}

    if (favoritesOnlyMode) {
      applyFavoritesFilter();
      w.NotificationSystem?.success('⭐ Режим: только избранные');
    } else {
      clearFavoritesFilter();
      w.NotificationSystem?.info('🎵 Режим: все треки');
    }
  }

  function applyFavoritesOnlyState() {
    const btn = document.getElementById('favorites-btn');
    const icon = document.getElementById('favorites-btn-icon');
    
    if (btn) btn.classList.toggle('favorites-active', favoritesOnlyMode);
    if (icon) icon.src = favoritesOnlyMode ? 'img/star.png' : 'img/star2.png';
  }

  function applyFavoritesFilter() {
    const currentAlbum = w.AlbumsManager?.getCurrentAlbum();
    if (!currentAlbum || currentAlbum.startsWith('__')) return;

    const likedIndices = w.getLikedForAlbum?.(currentAlbum) || [];
    
    if (likedIndices.length === 0) {
      w.NotificationSystem?.warning('Нет избранных треков в этом альбоме');
      favoritesOnlyMode = false;
      applyFavoritesOnlyState();
      localStorage.setItem('favoritesOnlyMode', '0');
      return;
    }

    // Применить к PlayerCore
    if (typeof w.playerCore.setFavoritesOnly === 'function') {
      w.playerCore.setFavoritesOnly(true, likedIndices);
      
      // Если текущий трек не избранный - переключить
      const currentIndex = w.playerCore.getIndex();
      if (!likedIndices.includes(currentIndex)) {
        w.playerCore.play(likedIndices[0]);
      }
    }
  }

  function clearFavoritesFilter() {
    if (typeof w.playerCore.setFavoritesOnly === 'function') {
      w.playerCore.setFavoritesOnly(false, []);
    }
  }

  // ========== LYRICS ==========

  async function loadLyrics(lyricsUrl) {
    if (!lyricsUrl) {
      currentLyrics = [];
      renderLyrics(0);
      return;
    }

    try {
      const response = await fetch(lyricsUrl);
      if (!response.ok) throw new Error('HTTP error');
      
      const data = await response.json();
      currentLyrics = Array.isArray(data) ? data : [];
      renderLyrics(0);
      
    } catch (error) {
      console.warn('Failed to load lyrics:', error);
      currentLyrics = [];
      renderLyrics(0);
    }
  }

  function renderLyrics(time) {
    const lyricsEl = document.getElementById('lyrics');
    if (!lyricsEl) return;

    if (!currentLyrics || !currentLyrics.length) {
      lyricsEl.innerHTML = '<div class="lyrics-window-line" style="opacity:0.5;">Текст песни недоступен</div>';
      return;
    }

    const windowSize = (lyricsViewMode === 'expanded') ? 9 : 5;
    const centerLine = Math.floor(windowSize / 2);
    
    let active = 0;
    for (let i = 0; i < currentLyrics.length; i++) {
      if (time >= currentLyrics[i].time) active = i;
      else break;
    }

    const start = Math.max(0, active - centerLine);
    const padTop = Math.max(0, centerLine - active);
    const rows = [];

    for (let p = 0; p < padTop; p++) {
      rows.push('<div class="lyrics-window-line"></div>');
    }

    for (let i = start; i < Math.min(currentLyrics.length, start + windowSize - padTop); i++) {
      const cls = (i === active) ? 'lyrics-window-line active' : 'lyrics-window-line';
      const line = escapeHtml(currentLyrics[i]?.line || '');
      rows.push(`<div class="${cls}">${line}</div>`);
    }

    while (rows.length < windowSize) {
      rows.push('<div class="lyrics-window-line"></div>');
    }

    lyricsEl.innerHTML = rows.join('');
  }

  function renderLyricsEnhanced(time) {
    if (lyricsViewMode === 'hidden' || !currentLyrics.length) return;

    let idx = 0;
    for (let i = 0; i < currentLyrics.length; i++) {
      if (time >= currentLyrics[i].time) idx = i;
      else break;
    }

    const now = performance.now();
    if (idx === lyricsLastIdx && (now - lyricsLastTs) < LYRICS_MIN_INTERVAL) {
      return;
    }

    lyricsLastIdx = idx;
    lyricsLastTs = now;
    renderLyrics(time);
  }

  function toggleLyricsView() {
    const modes = ['normal', 'hidden', 'expanded'];
    const currentIndex = modes.indexOf(lyricsViewMode);
    lyricsViewMode = modes[(currentIndex + 1) % modes.length];
    
    applyLyricsViewMode();
    saveLyricsViewMode();

    const messages = {
      'normal': '📝 Обычный вид',
      'hidden': '🚫 Лирика скрыта',
      'expanded': '📖 Расширенный вид'
    };
    
    w.NotificationSystem?.info(messages[lyricsViewMode]);
  }

  function applyLyricsViewMode() {
    const win = document.getElementById('lyrics-window');
    const btn = document.getElementById('lyrics-toggle-btn');
    const label = btn?.querySelector('.lyrics-toggle-label');
    
    if (win) win.className = `lyrics-${lyricsViewMode}`;
    if (btn) btn.className = `lyrics-toggle-btn lyrics-${lyricsViewMode}`;
    if (label) label.textContent = getLyricsModeLabel();

    if (lyricsViewMode === 'hidden') {
      applyAnimationState(false);
    }
  }

  function getLyricsModeLabel() {
    const labels = {
      'normal': 'Обычный',
      'hidden': 'Скрыта',
      'expanded': 'Расширенный'
    };
    return labels[lyricsViewMode] || '';
  }

  // ========== ANIMATION ==========

  function toggleAnimation() {
    applyAnimationState(!animationEnabled);
    localStorage.setItem('animationEnabled', animationEnabled ? '1' : '0');
    w.NotificationSystem?.info(animationEnabled ? '✨ Анимация: ВКЛ' : '✨ Анимация: ВЫКЛ');
  }

  function applyAnimationState(on) {
    animationEnabled = !!on;
    
    const win = document.getElementById('lyrics-window');
    const bg = win?.querySelector('.lyrics-animated-bg');
    const btn = document.getElementById('animation-btn');
    
    if (win) win.classList.toggle('animation-active', animationEnabled);
    if (bg) bg.classList.toggle('active', animationEnabled);
    if (btn) btn.classList.toggle('animation-active', animationEnabled);
  }

  // ========== BIT (LOGO PULSATION) ==========

  function toggleBit() {
    bitEnabled = !bitEnabled;
    localStorage.setItem('bitEnabled', bitEnabled ? '1' : '0');
    
    const btn = document.getElementById('bit-btn');
    if (btn) btn.classList.toggle('bit-active', bitEnabled);

    if (bitEnabled) {
      initAudioContext();
      startLogoPulsation();
      w.NotificationSystem?.info(`💿 Пульсация: ВКЛ`);
    } else {
      stopLogoPulsation();
      w.NotificationSystem?.info('💿 Пульсация: ВЫКЛ');
    }
  }

  function initAudioContext() {
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }

      if (!analyser) {
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
      }

      // Подключение к Howler
      if (w.Howler && w.Howler.ctx && !audioSource) {
        try {
          const howlerDest = w.Howler.ctx.destination;
          // НЕ подключаем напрямую - только анализируем
          // audioSource создаётся динамически при необходимости
        } catch (e) {
          console.warn('Failed to connect to Howler:', e);
        }
      }

    } catch (e) {
      console.warn('Failed to init audio context:', e);
    }
  }

  function startLogoPulsation() {
    const logo = document.getElementById('logo-bottom');
    if (!logo) return;

    if (animationFrame) cancelAnimationFrame(animationFrame);
    
    const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : new Uint8Array(32);

    function loop(ts) {
      if (!bitEnabled) return;

      let level = 0.35;
      
      if (analyser) {
        try {
          analyser.getByteFrequencyData(dataArray);
          const bassCount = Math.max(4, Math.floor(dataArray.length * 0.2));
          let sum = 0;
          for (let i = 0; i < bassCount; i++) sum += dataArray[i];
          level = (sum / (bassCount * 255));
        } catch {}
      } else {
        // Fallback анимация без анализатора
        level = 0.5 + 0.3 * Math.sin(ts / 300);
      }

      const intensity = bitIntensity / 100;
      const scale = 1 + (level * 0.15 * intensity);
      
      if (logo) {
        logo.style.transform = `scale(${scale.toFixed(3)})`;
      }
      
      animationFrame = requestAnimationFrame(loop);
    }

    animationFrame = requestAnimationFrame(loop);
  }

  function stopLogoPulsation() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    const logo = document.getElementById('logo-bottom');
    if (logo) logo.style.transform = 'scale(1)';

    // Очистка аудио-контекста
    try {
      if (audioSource) {
        audioSource.disconnect();
        audioSource = null;
      }
      if (analyser) {
        analyser.disconnect();
        analyser = null;
      }
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(() => {});
      }
    } catch {}

    audioContext = null;
  }

  // ========== ECO MODE ==========

  let ecoMode = false;

  function toggleEcoMode() {
    ecoMode = !ecoMode;
    
    const btn = document.getElementById('eco-btn');
    if (btn) btn.classList.toggle('active', ecoMode);

    if (ecoMode) {
      // Отключить энергоёмкие функции
      if (animationEnabled) toggleAnimation();
      if (bitEnabled) toggleBit();
      
      // Снизить частоту обновлений
      if (w.playerCore && w.playerCore._tickIntervalMs) {
        w.playerCore._tickIntervalMs = 1000;
      }
      
      w.NotificationSystem?.success('⚡ Ультра-эконом: ВКЛ');
    } else {
      // Восстановить частоту
      if (w.playerCore && w.playerCore._tickIntervalMs) {
        w.playerCore._tickIntervalMs = 250;
      }
      
      w.NotificationSystem?.info('⚡ Ультра-эконом: ВЫКЛ');
    }

    localStorage.setItem('ecoMode', ecoMode ? '1' : '0');
  }

  // ========== TRACK INFO ==========

  function updateTrackInfo(track) {
    // Обновить заголовок документа
    if (track) {
      document.title = `${track.title} - Витрина Разбита`;
    }
  }

  function updateDownloadLink(track) {
    const downloadBtn = document.getElementById('track-download-btn');
    if (!downloadBtn || !track) return;

    if (track.src) {
      downloadBtn.href = track.src;
      downloadBtn.download = `${track.artist || 'Витрина Разбита'} - ${track.title}.mp3`;
      downloadBtn.style.opacity = '1';
      downloadBtn.style.pointerEvents = 'auto';
    } else {
      downloadBtn.href = '#';
      downloadBtn.style.opacity = '0.5';
      downloadBtn.style.pointerEvents = 'none';
    }
  }

  function highlightCurrentTrack(index) {
    document.querySelectorAll('.track.current').forEach(el => {
      el.classList.remove('current');
    });

    const currentTrack = document.querySelector(`.track[data-index="${index}"]`);
    if (currentTrack) {
      currentTrack.classList.add('current');
      
      setTimeout(() => {
        currentTrack.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }, 100);
    }
  }

  // ========== UTILITIES ==========

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function restoreSettings() {
    restoreLyricsViewMode();
    
    try {
      const savedAnimation = localStorage.getItem('animationEnabled') === '1';
      if (savedAnimation) applyAnimationState(true);
      
      const savedBit = localStorage.getItem('bitEnabled') === '1';
      if (savedBit) {
        bitEnabled = true;
        const btn = document.getElementById('bit-btn');
        if (btn) btn.classList.add('bit-active');
      }
      
      const savedEco = localStorage.getItem('ecoMode') === '1';
      if (savedEco) {
        ecoMode = true;
        const btn = document.getElementById('eco-btn');
        if (btn) btn.classList.add('active');
      }
      
      const savedRepeat = localStorage.getItem('repeatMode') === '1';
      if (savedRepeat) {
        const btn = document.getElementById('repeat-btn');
        if (btn) btn.classList.add('repeat-active');
      }
      
      const savedShuffle = localStorage.getItem('shuffleMode') === '1';
      if (savedShuffle) {
        const btn = document.getElementById('shuffle-btn');
        if (btn) btn.classList.add('active');
      }
      
      const savedVolume = parseFloat(localStorage.getItem('playerVolume') || '1');
      updateVolumeUI(savedVolume);
      
    } catch {}
  }

  function restoreLyricsViewMode() {
    try {
      const saved = localStorage.getItem('lyricsViewMode');
      if (saved && ['normal','hidden','expanded'].includes(saved)) {
        lyricsViewMode = saved;
      }
    } catch {}
  }

  function saveLyricsViewMode() {
    try {
      localStorage.setItem('lyricsViewMode', lyricsViewMode);
    } catch {}
  }

  // ========== PUBLIC API ==========

  w.PlayerUI = {
    ensurePlayerBlock,
    updateProgress,
    updatePlayPauseIcon,
    loadLyrics,
    toggleLyricsView,
    toggleAnimation,
    toggleBit,
    toggleFavoritesOnly,
    updateVolumeUI,
    currentLyrics: () => currentLyrics,
    getLyricsViewMode: () => lyricsViewMode,
    bitIntensity: bitIntensity,
    bitEnabled: bitEnabled
  };

  // Автоинициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayerUI);
  } else {
    initPlayerUI();
  }

})();
