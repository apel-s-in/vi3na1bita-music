// scripts/app/player-ui.js
// UI плеера с правильной логикой мини-режима

(function PlayerUIModule() {
  'use strict';

  const w = window;

  // ========== СОСТОЯНИЕ ==========
  let currentLyrics = [];
  let lyricsViewMode = 'normal'; // normal | hidden | expanded
  let isSeekingProgress = false;
  let isMuted = false;
  let animationEnabled = false;
  let bitEnabled = false;
  let bitIntensity = 100;

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
    // Ждём загрузки albums
    if (!w.albumsIndex || w.albumsIndex.length === 0) {
      setTimeout(initPlayerUI, 100);
      return;
    }

    restoreSettings();
    
    console.log('✅ PlayerUI initialized');
  }

  // ========== ГЛАВНАЯ ФУНКЦИЯ: ПРОВЕРКА МИНИ-РЕЖИМА ==========

  /**
   * Определяет, нужен ли мини-режим
   * КРИТИЧНО: мини-режим активен ТОЛЬКО если:
   * 1. Есть воспроизводимый альбом (playingAlbumKey)
   * 2. Пользователь просматривает ДРУГОЙ альбом (currentAlbumKey !== playingAlbumKey)
   */
  function isBrowsingOtherAlbum() {
    const playingKey = w.AlbumsManager?.getPlayingAlbumKey?.() || null;
    const currentKey = w.AlbumsManager?.getCurrentAlbum() || null;
    
    if (!playingKey) return false;
    if (playingKey === '__favorites__' && currentKey === '__favorites__') return false;
    
    return playingKey !== currentKey;
  }

  // ========== РЕНДЕРИНГ БЛОКА ПЛЕЕРА ==========

  /**
   * Создаёт или перемещает блок плеера под текущий трек
   * КРИТИЧНО: блок плеера ВСЕГДА находится под треком, который играет
   */
  function ensurePlayerBlock(trackIndex) {
    let playerBlock = document.getElementById('lyricsplayerblock');
    
    // Если блока нет - создаём
    if (!playerBlock) {
      playerBlock = createPlayerBlock();
    }

    // Определяем куда поместить блок
    const inMiniMode = isBrowsingOtherAlbum();
    
    if (inMiniMode) {
      // Мини-режим: блок в контейнер #now-playing
      const holder = document.getElementById('now-playing');
      if (holder && !holder.contains(playerBlock)) {
        // Очищаем старое содержимое
        holder.innerHTML = '';
        
        // Добавляем мини-заголовок
        const miniHeader = createMiniHeader();
        holder.appendChild(miniHeader);
        
        // Добавляем блок плеера
        holder.appendChild(playerBlock);
        
        // Добавляем "Далее"
        const nextUp = createNextUpElement();
        holder.appendChild(nextUp);
      }
      
      // Скрываем лирику в мини-режиме
      const lyricsWindow = playerBlock.querySelector('#lyrics-window');
      if (lyricsWindow) {
        lyricsWindow.style.display = 'none';
      }
      
      // Скрываем кнопку переключения лирики
      const lyricsToggle = playerBlock.querySelector('.lyrics-toggle-btn');
      if (lyricsToggle) {
        lyricsToggle.style.display = 'none';
      }
      
    } else {
      // Обычный режим: блок под текущим треком в списке
      const trackList = document.getElementById('track-list');
      if (!trackList) return;
      
      const trackRow = trackList.querySelector(`.track[data-index="${trackIndex}"]`);
      if (trackRow) {
        // Помещаем блок после строки трека
        if (trackRow.nextSibling !== playerBlock) {
          if (trackRow.nextSibling) {
            trackRow.parentNode.insertBefore(playerBlock, trackRow.nextSibling);
          } else {
            trackRow.parentNode.appendChild(playerBlock);
          }
        }
      }
      
      // Показываем лирику в обычном режиме
      const lyricsWindow = playerBlock.querySelector('#lyrics-window');
      if (lyricsWindow) {
        lyricsWindow.style.display = '';
      }
      
      // Показываем кнопку переключения лирики
      const lyricsToggle = playerBlock.querySelector('.lyrics-toggle-btn');
      if (lyricsToggle) {
        lyricsToggle.style.display = '';
      }
    }

    // Обновляем мини-заголовок и "Далее"
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
      
      <div class="audio-wrapper">
        <div id="audio-slot">
          <audio id="audio" preload="metadata"></audio>
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
    
    // Клик по мини-заголовку - вернуться к играющему альбому
    header.addEventListener('click', (e) => {
      if (e.target.id === 'mini-now-star') return;
      
      const playingKey = w.AlbumsManager?.getPlayingAlbumKey?.();
      if (playingKey && playingKey !== '__reliz__') {
        w.AlbumsManager?.loadAlbum(playingKey);
      }
    });
    
    // Звездочка в мини-заголовке
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

  // ========== ОБНОВЛЕНИЕ МИНИ-ЭЛЕМЕНТОВ ==========

  function updateMiniHeader() {
    const header = document.getElementById('mini-now');
    if (!header) return;
    
    const inMiniMode = isBrowsingOtherAlbum();
    
    if (!inMiniMode) {
      header.style.display = 'none';
      return;
    }
    
    // Получаем данные о играющем треке
    const track = w.AlbumsManager?.getCurrentPlayingTrack?.();
    const index = w.AlbumsManager?.getCurrentPlayingIndex?.();
    
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
      const playingKey = w.AlbumsManager?.getPlayingAlbumKey?.();
      const liked = w.FavoritesManager?.isFavorite(playingKey, index);
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
    
    // Получаем следующий трек
    const nextTrack = w.AlbumsManager?.getNextTrack?.();
    
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

  // ========== ПРИВЯЗКА СОБЫТИЙ ==========

  function bindPlayerEvents(block) {
    // Play/Pause
    const playPauseBtn = block.querySelector('#play-pause-btn');
    playPauseBtn?.addEventListener('click', togglePlayPause);

    // Prev/Next/Stop
    block.querySelector('#prev-btn')?.addEventListener('click', previousTrack);
    block.querySelector('#next-btn')?.addEventListener('click', nextTrack);
    block.querySelector('#stop-btn')?.addEventListener('click', stopPlayback);

    // Repeat/Shuffle
    block.querySelector('#repeat-btn')?.addEventListener('click', toggleRepeat);
    block.querySelector('#shuffle-btn')?.addEventListener('click', toggleShuffle);

    // Mute
    block.querySelector('#mute-btn')?.addEventListener('click', toggleMute);

    // Volume
    const volumeSlider = block.querySelector('#volume-slider');
    volumeSlider?.addEventListener('input', onVolumeChange);

    // Progress bar
    const progressBar = block.querySelector('#player-progress-bar');
    progressBar?.addEventListener('mousedown', startSeeking);
    progressBar?.addEventListener('touchstart', startSeeking);

    // Lyrics toggle
    block.querySelector('#lyrics-toggle-btn')?.addEventListener('click', toggleLyricsView);

    // Animation/Bit
    block.querySelector('#animation-btn')?.addEventListener('click', toggleAnimation);
    block.querySelector('#bit-btn')?.addEventListener('click', toggleBit);

    // Favorites only
    block.querySelector('#favorites-btn')?.addEventListener('click', toggleFavoritesOnly);

    // Sleep timer
    block.querySelector('#sleep-timer-btn')?.addEventListener('click', () => {
      w.SleepTimer?.show?.();
    });

    // Lyrics text modal
    block.querySelector('#lyrics-text-btn')?.addEventListener('click', () => {
      w.LyricsModal?.show?.();
    });

    // Download
    const downloadBtn = block.querySelector('#track-download-btn');
    downloadBtn?.addEventListener('click', (e) => {
      const track = w.AlbumsManager?.getCurrentPlayingTrack?.();
      if (!track || !track.audio) {
        e.preventDefault();
        w.NotificationSystem?.error('Трек недоступен для скачивания');
      }
    });

    // Eco mode
    block.querySelector('#eco-btn')?.addEventListener('click', toggleEcoMode);

    // Global seeking handlers
    document.addEventListener('mousemove', handleSeeking);
    document.addEventListener('touchmove', handleSeeking);
    document.addEventListener('mouseup', stopSeeking);
    document.addEventListener('touchend', stopSeeking);
  }

  // ========== УПРАВЛЕНИЕ ВОСПРОИЗВЕДЕНИЕМ ==========

  function togglePlayPause() {
    const audio = document.getElementById('audio');
    if (!audio) return;
    
    if (audio.paused) {
      audio.play().catch(e => {
        console.error('Play failed:', e);
        w.NotificationSystem?.error('Не удалось воспроизвести');
      });
    } else {
      audio.pause();
    }
  }

  function previousTrack() {
    w.AlbumsManager?.playPreviousTrack?.();
  }

  function nextTrack() {
    w.AlbumsManager?.playNextTrack?.();
  }

  function stopPlayback() {
    const audio = document.getElementById('audio');
    if (!audio) return;
    
    audio.pause();
    audio.currentTime = 0;
    updatePlayPauseIcon();
  }

  function updatePlayPauseIcon() {
    const icon = document.getElementById('play-pause-icon');
    const audio = document.getElementById('audio');
    
    if (!icon || !audio) return;

    if (audio.paused) {
      icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    } else {
      icon.innerHTML = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';
    }
  }

  // ========== ПРОГРЕСС БАР ==========

  function startSeeking(e) {
    isSeekingProgress = true;
    handleSeeking(e);
  }

  function handleSeeking(e) {
    if (!isSeekingProgress) return;

    const progressBar = document.getElementById('player-progress-bar');
    const audio = document.getElementById('audio');
    
    if (!progressBar || !audio) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const rect = progressBar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    
    audio.currentTime = audio.duration * percent;
    updateProgress(audio.currentTime, audio.duration);
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
    if (remaining) remaining.textContent = formatTime(Math.max(0, duration - position));
  }

  // ========== ГРОМКОСТЬ ==========

  function onVolumeChange(e) {
    const value = parseFloat(e.target.value) / 100;
    const audio = document.getElementById('audio');
    
    if (audio) {
      audio.volume = value;
      isMuted = false;
    }
    
    updateVolumeUI(value);
    localStorage.setItem('playerVolume', String(value));
  }

  function toggleMute() {
    const audio = document.getElementById('audio');
    if (!audio) return;
    
    if (isMuted) {
      const saved = parseFloat(localStorage.getItem('playerVolume') || '1');
      audio.volume = saved;
      isMuted = false;
      updateVolumeUI(saved);
    } else {
      localStorage.setItem('playerVolume', String(audio.volume));
      audio.volume = 0;
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

  // ========== РЕЖИМЫ ВОСПРОИЗВЕДЕНИЯ ==========

  function toggleRepeat() {
    const newState = w.AlbumsManager?.toggleRepeat?.();
    
    const btn = document.getElementById('repeat-btn');
    btn?.classList.toggle('repeat-active', newState);
    
    w.NotificationSystem?.info(newState ? '🔁 Повтор: ВКЛ' : '🔁 Повтор: ВЫКЛ');
  }

  function toggleShuffle() {
    const newState = w.AlbumsManager?.toggleShuffle?.();
    
    const btn = document.getElementById('shuffle-btn');
    btn?.classList.toggle('active', newState);
    
    w.NotificationSystem?.info(newState ? '🔀 Перемешивание: ВКЛ' : '🔀 Перемешивание: ВЫКЛ');
  }

  function toggleFavoritesOnly() {
    const newState = w.AlbumsManager?.toggleFavoritesOnly?.();
    
    const btn = document.getElementById('favorites-btn');
    const icon = document.getElementById('favorites-btn-icon');
    
    if (btn) btn.classList.toggle('favorites-active', newState);
    if (icon) icon.src = newState ? 'img/star.png' : 'img/star2.png';
    
    w.NotificationSystem?.info(newState ? '⭐ Только избранные' : '🎵 Все треки');
  }

  function toggleLikePlaying() {
    const track = w.AlbumsManager?.getCurrentPlayingTrack?.();
    const index = w.AlbumsManager?.getCurrentPlayingIndex?.();
    const albumKey = w.AlbumsManager?.getPlayingAlbumKey?.();
    
    if (!track || !albumKey) return;
    
    const wasLiked = w.FavoritesManager?.isFavorite(albumKey, index);
    w.FavoritesManager?.toggleLike(albumKey, index, !wasLiked);
    
    updateMiniHeader();
  }

  // ========== ЛИРИКА ==========

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

  /**
   * КРИТИЧНО: Переключение режима лирики
   * Последовательность: normal → hidden → expanded → normal
   */
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
    
    if (win) {
      win.className = `lyrics-${lyricsViewMode}`;
    }
    
    if (btn) {
      btn.className = `lyrics-toggle-btn lyrics-${lyricsViewMode}`;
    }
    
    if (label) {
      label.textContent = getLyricsModeLabel();
    }

    // При скрытии лирики отключаем анимацию
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

  // ========== АНИМАЦИЯ ==========

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

  // ========== ПУЛЬСАЦИЯ ЛОГОТИПА ==========

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

  // ========== ЭКО-РЕЖИМ ==========

  let ecoMode = false;

  function toggleEcoMode() {
    ecoMode = !ecoMode;
    
    const btn = document.getElementById('eco-btn');
    if (btn) btn.classList.toggle('eco-active', ecoMode);

    if (ecoMode) {
      if (animationEnabled) toggleAnimation();
      if (bitEnabled) toggleBit();
      
      w.NotificationSystem?.success('⚡ Ультра-эконом: ВКЛ');
    } else {
      w.NotificationSystem?.info('⚡ Ультра-эконом: ВЫКЛ');
    }

    localStorage.setItem('ecoMode', ecoMode ? '1' : '0');
  }

  // ========== УТИЛИТЫ ==========

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
        if (btn) btn.classList.add('eco-active');
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

  // ========== ПОДПИСКА НА СОБЫТИЯ AUDIO ==========

  function attachAudioListeners() {
    const audio = document.getElementById('audio');
    if (!audio) {
      setTimeout(attachAudioListeners, 100);
      return;
    }

    audio.addEventListener('loadedmetadata', onAudioMetadataLoaded);
    audio.addEventListener('timeupdate', onAudioTimeUpdate);
    audio.addEventListener('ended', onAudioEnded);
    audio.addEventListener('play', onAudioPlay);
    audio.addEventListener('pause', onAudioPause);
    audio.addEventListener('error', onAudioError);
  }

  function onAudioMetadataLoaded() {
    const audio = document.getElementById('audio');
    if (!audio) return;
    
    const duration = audio.duration || 0;
    updateProgress(0, duration);
  }

  function onAudioTimeUpdate() {
    const audio = document.getElementById('audio');
    if (!audio) return;
    
    const position = audio.currentTime || 0;
    const duration = audio.duration || 0;
    
    updateProgress(position, duration);
    renderLyricsEnhanced(position);
  }

  function onAudioEnded() {
    // Обработка окончания трека
    const repeat = w.AlbumsManager?.isRepeatEnabled?.();
    
    if (repeat) {
      const audio = document.getElementById('audio');
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      return;
    }
    
    // Автопереход
    if (!w.autoNextDisabled) {
      nextTrack();
    }
  }

  function onAudioPlay() {
    updatePlayPauseIcon();
    
    // Media Session
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'playing';
      } catch {}
    }
  }

  function onAudioPause() {
    updatePlayPauseIcon();
    
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'paused';
      } catch {}
    }
  }

  function onAudioError(e) {
    console.error('Audio error:', e);
    w.NotificationSystem?.error('Ошибка воспроизведения');
  }

  // ========== PUBLIC API ==========

  w.PlayerUI = {
    ensurePlayerBlock,
    updateProgress,
    updatePlayPauseIcon,
    updateMiniHeader,
    updateNextUpLabel,
    loadLyrics,
    toggleLyricsView,
    toggleAnimation,
    toggleBit,
    updateVolumeUI,
    isBrowsingOtherAlbum,
    currentLyrics: () => currentLyrics,
    getLyricsViewMode: () => lyricsViewMode,
    bitIntensity,
    bitEnabled
  };

  // Автоинициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initPlayerUI();
      attachAudioListeners();
    });
  } else {
    initPlayerUI();
    attachAudioListeners();
  }

})();
