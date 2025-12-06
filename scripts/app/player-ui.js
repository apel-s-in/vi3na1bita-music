// scripts/app/player-ui.js
// Полнофункциональный UI плеера (перенесён из монолитного index.html)

(function PlayerUIModule() {
  'use strict';

  const w = window;

  // Переменные состояния (из старого кода)
  let currentLyrics = [];
  let lyricsViewMode = 'normal';
  let isSeekingProgress = false;
  let isMuted = false;
  let animationEnabled = false;
  let bitEnabled = false;
  let bitIntensity = 100;
  let audioContext = null;
  let analyser = null;
  let audioSource = null;
  let animationFrame = null;

  let sleepTimerInterval = null;
  let sleepTimerTarget = null;

  const LYRICS_MIN_INTERVAL = 250;
  let lyricsLastIdx = -1;
  let lyricsLastTs = 0;

  // Восстановление настроек
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

  // Инициализация UI плеера
  function initPlayerUI() {
    // Ждём события от player-adapter когда трек начнёт играть
    if (!w.playerCore) {
      setTimeout(initPlayerUI, 100);
      return;
    }

    w.playerCore.on({
      onTrackChange: (track, index) => {
        renderPlayerBlock();
        loadLyrics(track?.lyrics);
        updateMediaSession(track);
      },
      onPlay: () => {
        updatePlayPauseIcon();
      },
      onPause: () => {
        updatePlayPauseIcon();
      },
      onTick: (position, duration) => {
        updateProgress(position, duration);
        renderLyricsEnhanced(position);
      }
    });

    restoreLyricsViewMode();
    
    console.log('✅ PlayerUI initialized');
  }

  // Рендеринг блока плеера
  function renderPlayerBlock() {
    const container = document.getElementById('now-playing');
    if (!container) return;

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
            
            <button class="player-control-btn" id="prev-btn" title="Предыдущий трек (P)">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M11 5L4 12l7 7V5zm9 0v14l-7-7 7-7z"/>
              </svg>
            </button>
            
            <button class="player-control-btn main" id="play-pause-btn" title="Воспроизведение/Пауза (K/Пробел)">
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
          <button class="lyrics-toggle-btn lyrics-${lyricsViewMode}" id="lyrics-toggle-btn" title="Скрыть лирику (Y)">
            <span class="lyrics-toggle-btn-visual">Т</span>
          </button>
          
          <div class="player-extra-buttons-row">
            <button class="karaoke-btn" id="lyrics-text-btn">ТЕКСТ</button>
            <a class="player-download-btn" href="#" id="track-download-btn">СКАЧАТЬ ПЕСНЮ</a>
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

    bindPlayerEvents();
  }

  // Привязка событий
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

    // Prev/Next
    document.getElementById('prev-btn')?.addEventListener('click', () => w.playerCore.prev());
    document.getElementById('next-btn')?.addEventListener('click', () => w.playerCore.next());
    
    // Stop
    document.getElementById('stop-btn')?.addEventListener('click', () => {
      w.playerCore.stop();
      updatePlayPauseIcon();
    });

    // Repeat
    document.getElementById('repeat-btn')?.addEventListener('click', () => {
      const newState = !w.playerCore.repeat;
      w.playerCore.setRepeat(newState);
      document.getElementById('repeat-btn')?.classList.toggle('repeat-active', newState);
      localStorage.setItem('repeatMode', newState ? '1' : '0');
    });

    // Shuffle
    document.getElementById('shuffle-btn')?.addEventListener('click', () => {
      const newState = !w.playerCore.shuffle;
      w.playerCore.setShuffle(newState);
      document.getElementById('shuffle-btn')?.classList.toggle('active', newState);
      localStorage.setItem('shuffleMode', newState ? '1' : '0');
    });

    // Mute
    document.getElementById('mute-btn')?.addEventListener('click', () => {
      const audio = w.playerCore.howl;
      if (!audio) return;
      
      if (isMuted) {
        const saved = parseFloat(localStorage.getItem('playerVolume') || '1');
        w.playerCore.setVolume(saved);
        isMuted = false;
      } else {
        localStorage.setItem('playerVolume', String(w.playerCore.getVolume()));
        w.playerCore.setVolume(0);
        isMuted = true;
      }
      updateVolumeUI(w.playerCore.getVolume());
    });

    // Volume
    const volumeSlider = document.getElementById('volume-slider');
    volumeSlider?.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value) / 100;
      w.playerCore.setVolume(value);
      updateVolumeUI(value);
      localStorage.setItem('playerVolume', String(value));
    });

    // Progress bar
    const progressBar = document.getElementById('player-progress-bar');
    progressBar?.addEventListener('click', (e) => {
      const rect = progressBar.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      const duration = w.playerCore.getDuration();
      w.playerCore.seek(duration * percent);
    });

    // Lyrics toggle
    document.getElementById('lyrics-toggle-btn')?.addEventListener('click', toggleLyricsView);

    // Animation
    document.getElementById('animation-btn')?.addEventListener('click', toggleAnimation);

    // Bit (logo pulsation)
    document.getElementById('bit-btn')?.addEventListener('click', toggleBit);

    // Sleep timer (stub for now)
    document.getElementById('sleep-timer-btn')?.addEventListener('click', () => {
      w.NotificationSystem?.info('Таймер сна в разработке');
    });

    // Favorites only
    document.getElementById('favorites-btn')?.addEventListener('click', () => {
      w.NotificationSystem?.info('Режим "Только избранное" в разработке');
    });

    // Lyrics text modal
    document.getElementById('lyrics-text-btn')?.addEventListener('click', () => {
      w.NotificationSystem?.info('Полный текст песни в разработке');
    });

    // Download track
    document.getElementById('track-download-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      w.NotificationSystem?.info('Скачивание трека в разработке');
    });

    // Eco mode
    document.getElementById('eco-btn')?.addEventListener('click', () => {
      w.NotificationSystem?.info('Ультра-эконом в разработке');
    });
  }

  // Обновление прогресса
  function updateProgress(position, duration) {
    if (isSeekingProgress) return;

    const percent = (position / duration) * 100;
    const fill = document.getElementById('player-progress-fill');
    if (fill) fill.style.width = `${percent}%`;

    const elapsed = document.getElementById('time-elapsed');
    const remaining = document.getElementById('time-remaining');
    
    if (elapsed) elapsed.textContent = formatTime(position);
    if (remaining) remaining.textContent = formatTime(Math.max(0, duration - position));
  }

  // Обновление Play/Pause иконки
  function updatePlayPauseIcon() {
    const icon = document.getElementById('play-pause-icon');
    if (!icon) return;

    if (w.playerCore.isPlaying()) {
      icon.innerHTML = '<path d="M6 6h4v12H6zM14 6h4v12h-4z"/>';
    } else {
      icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    }
  }

  // Обновление UI громкости
  function updateVolumeUI(volume) {
    const percent = Math.round(volume * 100);
    const fill = document.getElementById('volume-fill');
    const slider = document.getElementById('volume-slider');
    
    if (fill) fill.style.width = `${percent}%`;
    if (slider) slider.value = percent;
  }

  // Форматирование времени
  function formatTime(sec) {
    if (isNaN(sec) || sec < 0) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Загрузка лирики
  async function loadLyrics(lyricsUrl) {
    if (!lyricsUrl) {
      currentLyrics = [];
      return;
    }

    try {
      const response = await fetch(lyricsUrl);
      if (!response.ok) throw new Error('Failed to load lyrics');
      
      const data = await response.json();
      currentLyrics = Array.isArray(data) ? data : [];
      renderLyrics(0);
    } catch (error) {
      console.error('Failed to load lyrics:', error);
      currentLyrics = [];
    }
  }

  // Рендеринг лирики
  function renderLyrics(time) {
    if (!currentLyrics || !currentLyrics.length) {
      const el = document.getElementById('lyrics');
      if (el) el.innerHTML = '';
      return;
    }

    const windowSize = (lyricsViewMode === 'expanded') ? 9 : 5;
    const centerLine = Math.floor(windowSize / 2);
    
    let active = 0;
    for (let i = 0; i < currentLyrics.length; i++) {
      if (time >= currentLyrics[i].time) active = i;
    }

    const start = Math.max(0, active - centerLine);
    const padTop = Math.max(0, centerLine - active);
    const rows = [];

    for (let p = 0; p < padTop; p++) {
      rows.push('<div class="lyrics-window-line"></div>');
    }

    for (let i = start; i < Math.min(currentLyrics.length, start + windowSize - padTop); i++) {
      const cls = (i === active) ? 'lyrics-window-line active' : 'lyrics-window-line';
      rows.push(`<div class="${cls}">${currentLyrics[i]?.line || ''}</div>`);
    }

    while (rows.length < windowSize) {
      rows.push('<div class="lyrics-window-line"></div>');
    }

    const lyricsEl = document.getElementById('lyrics');
    if (lyricsEl) lyricsEl.innerHTML = rows.join('');
  }

  // Троттлинг рендера лирики
  function renderLyricsEnhanced(time) {
    if (lyricsViewMode === 'hidden' || !Array.isArray(currentLyrics) || currentLyrics.length === 0) {
      return;
    }

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

  // Переключение режима лирики
  function toggleLyricsView() {
    const modes = ['normal', 'hidden', 'expanded'];
    const currentIndex = modes.indexOf(lyricsViewMode);
    lyricsViewMode = modes[(currentIndex + 1) % modes.length];
    
    applyLyricsViewMode();
    saveLyricsViewMode();

    const messages = {
      'normal': '📝 Обычный вид лирики',
      'hidden': '🚫 Лирика скрыта',
      'expanded': '📖 Расширенный вид лирики'
    };
    
    w.NotificationSystem?.info(messages[lyricsViewMode]);
  }

  // Применение режима лирики
  function applyLyricsViewMode() {
    const win = document.getElementById('lyrics-window');
    const btn = document.getElementById('lyrics-toggle-btn');
    
    if (!win || !btn) return;

    win.className = `lyrics-${lyricsViewMode}`;
    btn.className = `lyrics-toggle-btn lyrics-${lyricsViewMode}`;

    // Если лирика скрыта - выключаем анимацию
    if (lyricsViewMode === 'hidden') {
      applyAnimationState(false);
    }
  }

  // Переключение анимации
  function toggleAnimation() {
    applyAnimationState(!animationEnabled);
    localStorage.setItem('animationEnabled', animationEnabled ? '1' : '0');
    w.NotificationSystem?.info(animationEnabled ? '✨ Анимация: ВКЛ' : '✨ Анимация: ВЫКЛ');
  }

  // Применение анимации
  function applyAnimationState(on) {
    animationEnabled = !!on;
    
    const win = document.getElementById('lyrics-window');
    const bg = win?.querySelector('.lyrics-animated-bg');
    const btn = document.getElementById('animation-btn');
    
    if (win) win.classList.toggle('animation-active', animationEnabled);
    if (bg) bg.classList.toggle('active', animationEnabled);
    if (btn) btn.classList.toggle('animation-active', animationEnabled);
  }

  // Переключение пульсации логотипа
  function toggleBit() {
    bitEnabled = !bitEnabled;
    localStorage.setItem('bitEnabled', bitEnabled ? '1' : '0');
    
    const btn = document.getElementById('bit-btn');
    if (btn) btn.classList.toggle('bit-active', bitEnabled);

    if (bitEnabled) {
      initAudioContext();
      startLogoPulsation();
      w.NotificationSystem?.info(`💿 Пульсация: ВКЛ (${bitIntensity}%)`);
    } else {
      stopLogoPulsation();
      w.NotificationSystem?.info('💿 Пульсация: ВЫКЛ');
    }
  }

  // Инициализация аудио-контекста
  function initAudioContext() {
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }

      if (audioSource) audioSource.disconnect();
      audioSource = null;

      if (!analyser) {
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
      }

      // КРИТИЧНО: НЕ подключаем к destination, чтобы не влиять на звук
      // audioSource просто подключается к analyser для анализа
      
    } catch (e) {
      console.warn('Failed to init audio context:', e);
    }
  }

  // Запуск пульсации логотипа
  function startLogoPulsation() {
    const logo = document.getElementById('logo-bottom');
    if (!logo) return;

    if (animationFrame) cancelAnimationFrame(animationFrame);
    
    const dataArray = new Uint8Array(analyser ? analyser.frequencyBinCount : 32);
    let t0 = performance.now();

    function loop(ts) {
      if (!bitEnabled || !logo) return;

      let level = 0.35;
      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
        const bassCount = Math.max(4, Math.floor(dataArray.length * 0.2));
        let sum = 0;
        for (let i = 0; i < bassCount; i++) sum += dataArray[i];
        level = (sum / (bassCount * 255));
      } else {
        level = 0.5 + 0.5 * Math.sin(ts / 200);
      }

      const intensity = Math.max(0, Math.min(1, bitIntensity / 100));
      const scale = 1 + (level * 0.12 * intensity);
      logo.style.transform = `scale(${scale.toFixed(3)})`;
      
      animationFrame = requestAnimationFrame(loop);
    }

    animationFrame = requestAnimationFrame(loop);
  }

  // Остановка пульсации
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
    } catch {}

    try {
      if (analyser) {
        analyser.disconnect();
        analyser = null;
      }
    } catch {}

    try {
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(() => {});
      }
    } catch {}

    audioContext = null;
  }

  // Обновление Media Session
  function updateMediaSession(track) {
    if (!('mediaSession' in navigator) || !track) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Неизвестный трек',
        artist: track.artist || 'Витрина Разбита',
        album: track.album || 'Альбом',
        artwork: [
          { src: track.cover || 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      });
    } catch (error) {
      console.error('Failed to update Media Session:', error);
    }
  }

  // Публичный API
  w.PlayerUI = {
    initPlayerUI,
    renderPlayerBlock,
    updateProgress,
    updatePlayPauseIcon,
    loadLyrics,
    toggleLyricsView,
    toggleAnimation,
    toggleBit
  };

  // Автоинициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayerUI);
  } else {
    initPlayerUI();
  }

})();
