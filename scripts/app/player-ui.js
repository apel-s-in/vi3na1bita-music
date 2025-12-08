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

  // Флаг: сейчас ли мы в контекстном мини-режиме (играет один альбом, просматриваем другой)
  let isInContextMiniMode = false;

  // Сохранённый режим отображения лирики и флаг анимации при входе в мини-режим
  let savedLyricsViewModeForMini = null;
  let savedAnimationForMini = null;
  // Таймер обратного отсчёта перед началом лирики
  let countdownValue = null; // Текущее значение обратного отсчёта (null = выключен)

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
    
    // Загружаем лирику и сразу рендерим первый кадр
    loadLyrics(track.lyrics).then(() => {
      renderLyrics(0);
    });
    
    const downloadBtn = document.getElementById('track-download-btn');
    if (downloadBtn && track.src) {
      downloadBtn.href = track.src;
      downloadBtn.download = `${track.title}.mp3`;

      // Попробуем вывести примерный размер файла из albumData.tracks[].size
      let sizeHint = '';
      const playingAlbumKey = w.AlbumsManager?.getPlayingAlbum?.();
      const albumData = playingAlbumKey
        ? w.AlbumsManager?.getAlbumData?.(playingAlbumKey)
        : null;

      if (albumData && Array.isArray(albumData.tracks)) {
        const byNum = albumData.tracks.find(t => t.file === track.src || t.title === track.title);
        if (byNum && typeof byNum.size === 'number') {
          sizeHint = ` (~${byNum.size.toFixed(2)} МБ)`;
        }
      }

      downloadBtn.title = sizeHint
        ? `Скачать трек${sizeHint}`
        : 'Скачать трек';
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
      // ✅ МГНОВЕННОЕ переключение в мини-режим
      if (nowPlaying && !nowPlaying.contains(playerBlock)) {
        nowPlaying.innerHTML = '';

        const miniHeader = createMiniHeader();
        nowPlaying.appendChild(miniHeader);

        nowPlaying.appendChild(playerBlock);

        const nextUp = createNextUpElement();
        nowPlaying.appendChild(nextUp);
      }

      // ✅ Применяем состояние лирики МГНОВЕННО
      applyMiniLyricsState();

      // ✅ Мгновенно показываем мини-элементы (ЕДИНОЖДЫ!)
      const miniHeaderEl = document.getElementById('mini-now');
      if (miniHeaderEl) {
        miniHeaderEl.style.display = 'flex';
        miniHeaderEl.style.transition = 'none';
      }

      const nextUpEl = document.getElementById('next-up');
      if (nextUpEl) {
        nextUpEl.style.display = 'flex';
        nextUpEl.style.transition = 'none';
      }

      // ✅ Прокручиваем к мини-плееру при переключении
      setTimeout(() => {
        nowPlaying.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);

    } else {
      const trackList = document.getElementById('track-list');
      if (!trackList) return;

      const trackRow = trackList.querySelector(`.track[data-index="${trackIndex}"]`);
      if (trackRow) {
        // ✅ МГНОВЕННОЕ перемещение блока плеера
        if (trackRow.nextSibling !== playerBlock) {
          if (trackRow.nextSibling) {
            trackRow.parentNode.insertBefore(playerBlock, trackRow.nextSibling);
          } else {
            trackRow.parentNode.appendChild(playerBlock);
          }
        }

        // ✅ Мгновенная прокрутка к плееру
        setTimeout(() => {
          trackRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
      }

      // ✅ МГНОВЕННОЕ восстановление режима лирики
      restoreLyricsStateIfNeeded();

      // ✅ Мгновенно скрываем мини-элементы (ЕДИНОЖДЫ!)
      const miniHeaderEl = document.getElementById('mini-now');
      if (miniHeaderEl) {
        miniHeaderEl.style.display = 'none';
        miniHeaderEl.style.transition = 'none';
      }

      const nextUpEl = document.getElementById('next-up');
      if (nextUpEl) {
        nextUpEl.style.display = 'none';
        nextUpEl.style.transition = 'none';
      }
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
          
          <!-- Кнопки A и B убраны отсюда, будут в player-buttons-wrapper -->
          
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
        <div class="player-extra-buttons-row">
          <button class="lyrics-toggle-btn lyrics-${lyricsViewMode}" id="lyrics-toggle-btn" title="Режим лирики (Y)">
            <span class="lyrics-toggle-btn-visual">Т</span>
          </button>
          
          <button class="animation-btn" id="animation-btn" title="Анимация лирики (A)">A</button>
          
          <button class="karaoke-btn" id="lyrics-text-btn" title="Полный текст песни">📝</button>
          
          <button class="pulse-btn" id="pulse-btn" title="Пульсация логотипа">
            <span id="pulse-heart">🤍</span>
          </button>
          
          <a class="player-download-btn" href="#" id="track-download-btn" download title="Скачать трек">💾</a>
          
          <button id="eco-btn" class="eco-btn" title="Эконом режим">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z"/>
            </svg>
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
    
    if (!track || index === undefined || index < 0) {
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
      let isLiked = false;

      if (playingAlbum && w.FavoritesManager) {
        // Обычный альбом: номер трека = track.num, если есть, иначе index+1
        if (playingAlbum !== w.SPECIAL_FAVORITES_KEY) {
          const numVal = typeof track.num === 'number' ? track.num : (index + 1);
          isLiked = !!w.FavoritesManager.isFavorite(playingAlbum, numVal);
        } else {
          // Виртуальный альбом Избранное: ищем исходный альбом и номер трека по uid
          const uid = track.uid || null;
          if (uid && Array.isArray(w.favoritesRefsModel)) {
            const ref = w.favoritesRefsModel.find((it) => {
              const refUid = w.AlbumsManager?.getTrackUid?.(it.__a, it.__t) || `${it.__a}_${it.__t}`;
              return refUid === uid;
            });
            if (ref) {
              isLiked = !!w.FavoritesManager.isFavorite(ref.__a, ref.__t);
            }
          }
        }
      }

      star.src = isLiked ? 'img/star.png' : 'img/star2.png';
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
  /**
   * ✅ МГНОВЕННОЕ переключение между вкладками альбомов
   * Вызывается из AlbumsManager при смене альбома
   */
  function switchAlbumInstantly(newAlbumKey) {
    const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.();
    
    // Проверяем нужно ли включить мини-режим
    const shouldBeMini = !!(playingAlbum && playingAlbum !== newAlbumKey);
    
    // Получаем текущий индекс играющего трека
    const currentIndex = w.playerCore?.getIndex() || 0;
    
    if (shouldBeMini) {
      // ✅ Мгновенно переводим в мини-режим
      ensurePlayerBlock(currentIndex);
      
      // Обновляем все UI элементы
      updateMiniHeader();
      updateNextUpLabel();
      
      // Сохраняем состояние
      if (w.PlayerState && typeof w.PlayerState.save === 'function') {
        w.PlayerState.save();
      }
    } else {
      // ✅ Мгновенно переводим в обычный режим
      ensurePlayerBlock(currentIndex);
      
      // Сохраняем состояние
      if (w.PlayerState && typeof w.PlayerState.save === 'function') {
        w.PlayerState.save();
      }
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
    block.querySelector('#pulse-btn')?.addEventListener('click', togglePulse);

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
    // Если лирика скрыта — не даём включать анимацию
    if (lyricsViewMode === 'hidden') {
      w.NotificationSystem?.info('Лирика скрыта — анимация недоступна');
      return;
    }

    animationEnabled = !animationEnabled;
    try {
      localStorage.setItem('lyricsAnimationEnabled', animationEnabled ? '1' : '0');
    } catch {}

    const playerBlock = document.getElementById('lyricsplayerblock');
    const bg = playerBlock?.querySelector('.lyrics-animated-bg');
    const btn = document.getElementById('animation-btn');

    if (bg) bg.classList.toggle('active', animationEnabled);
    if (btn) btn.classList.toggle('active', animationEnabled);

    // Уведомление
    w.NotificationSystem?.info(animationEnabled ? '✨ Анимация лирики: ВКЛ' : '✨ Анимация лирики: ВЫКЛ');
  }

  function togglePulse() {
    bitEnabled = !bitEnabled;
    localStorage.setItem('bitEnabled', bitEnabled ? '1' : '0');
    
    const btn = document.getElementById('pulse-btn');
    const heart = document.getElementById('pulse-heart');
    
    if (btn) btn.classList.toggle('active', bitEnabled);
    if (heart) heart.textContent = bitEnabled ? '❤️' : '🤍';
    
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
    // Старое поведение: циклически normal -> hidden -> expanded -> normal
    const modes = ['normal', 'hidden', 'expanded'];
    const currentIndex = modes.indexOf(lyricsViewMode);
    const nextIndex = (currentIndex === -1 ? 0 : (currentIndex + 1) % modes.length);
    lyricsViewMode = modes[nextIndex];

    try {
      localStorage.setItem('lyricsViewMode', lyricsViewMode);
    } catch {}

    renderLyricsViewMode();

    // Тосты как в старом приложении
    const msgMap = {
      normal: '📝 Обычный вид лирики',
      hidden: '🚫 Лирика скрыта',
      expanded: '📖 Расширенный вид лирики'
    };
    const msg = msgMap[lyricsViewMode];
    if (msg && w.NotificationSystem?.info) {
      w.NotificationSystem.info(msg);
    }
  }

  function getLyricsModeLabel() {
    // Текстовая подпись под кнопкой — была только в новом UI; оставляем,
    // но синхронизируем с режимами старого приложения.
    if (lyricsViewMode === 'hidden') return 'Скрыта';
    if (lyricsViewMode === 'expanded') return 'Расширенная';
    return 'Нормальная';
  }

  /**
   * Применяет текущий lyricsViewMode к DOM (классы на #lyrics-window и кнопке режима),
   * а также управляет анимацией по правилам старого приложения.
   */
  function renderLyricsViewMode() {
    const playerBlock = document.getElementById('lyricsplayerblock');
    if (!playerBlock) return;

    const lyricsWindow = playerBlock.querySelector('#lyrics-window');
    const btn = playerBlock.querySelector('#lyrics-toggle-btn');
    if (!lyricsWindow || !btn) return;

    // Сбрасываем все режимы/классы
    lyricsWindow.classList.remove(
      'lyrics-normal',
      'lyrics-hidden',
      'lyrics-expanded'
    );
    btn.classList.remove(
      'lyrics-normal',
      'lyrics-hidden',
      'lyrics-expanded'
    );

    // Назначаем новые
    const cls = `lyrics-${lyricsViewMode}`;
    lyricsWindow.classList.add(cls);
    btn.classList.add(cls);

    // Дополнительной текстовой подписи под кнопкой больше нет: размеры/цвет кнопки
    // меняются только через классы lyrics-normal/hidden/expanded.

    // Если лирика скрыта — фон/анимацию по старым правилам всегда выключаем
    if (lyricsViewMode === 'hidden') {
      const bg = playerBlock.querySelector('.lyrics-animated-bg');
      bg?.classList.remove('active');
      const animBtn = document.getElementById('animation-btn');
      if (animBtn) animBtn.classList.remove('active');
    } else if (animationEnabled) {
      // При видимой лирике и включённой анимации — активируем фон
      const bg = playerBlock.querySelector('.lyrics-animated-bg');
      bg?.classList.add('active');
      const animBtn = document.getElementById('animation-btn');
      if (animBtn) animBtn.classList.add('active');
    }
  }

  /**
   * Применяет состояние лирики для контекстного мини-режима
   * по правилам старого приложения:
   *  - помечаем, что сейчас в мини-режиме,
   *  - сохраняем текущий режим отображения (кроме уже hidden),
   *  - сохраняем флаг animationEnabled,
   *  - скрываем окно лирики и кнопку переключения,
   *  - отключаем анимацию.
   */
  function applyMiniLyricsState() {
    const playerBlock = document.getElementById('lyricsplayerblock');
    if (!playerBlock) return;

    if (isInContextMiniMode) return;
    isInContextMiniMode = true;

    if (savedLyricsViewModeForMini === null && lyricsViewMode !== 'hidden') {
      savedLyricsViewModeForMini = lyricsViewMode || 'normal';
    }

    if (savedAnimationForMini === null) {
      savedAnimationForMini = animationEnabled ? true : false;
    }

    // ✅ В мини-режиме МГНОВЕННО скрываем лирику
    const lyricsWindow = playerBlock.querySelector('#lyrics-window');
    if (lyricsWindow) {
      lyricsWindow.style.display = 'none';
      lyricsWindow.style.transition = 'none'; // Убираем плавность
      // Восстанавливаем transition после скрытия
      setTimeout(() => {
        if (lyricsWindow) lyricsWindow.style.transition = '';
      }, 50);
    }

    const lyricsToggle = playerBlock.querySelector('.lyrics-toggle-btn');
    if (lyricsToggle) {
      lyricsToggle.style.display = 'none';
    }

    // И принудительно выключаем анимацию (фон) на время мини-режима
    animationEnabled = false;
    const bg = playerBlock.querySelector('.lyrics-animated-bg');
    bg?.classList.remove('active');
    const animBtn = document.getElementById('animation-btn');
    if (animBtn) animBtn.classList.remove('active');
  }

  /**
   * Восстанавливает состояние лирики после выхода из контекстного мини-режима:
   *  - возвращает видимость окна и кнопки,
   *  - восстанавливает сохранённый режим отображения (если был),
   *  - восстанавливает флаг animationEnabled и пересчитывает классы.
   */
  function restoreLyricsStateIfNeeded() {
    const playerBlock = document.getElementById('lyricsplayerblock');
    if (!playerBlock) return;
    if (!isInContextMiniMode) return;

    isInContextMiniMode = false;

    // ✅ МГНОВЕННО восстанавливаем окно лирики
    const lyricsWindow = playerBlock.querySelector('#lyrics-window');
    if (lyricsWindow) {
      lyricsWindow.style.transition = 'none'; // Убираем плавность
      lyricsWindow.style.display = '';
      // Восстанавливаем transition
      setTimeout(() => {
        if (lyricsWindow) lyricsWindow.style.transition = '';
      }, 50);
    }

    const lyricsToggle = playerBlock.querySelector('.lyrics-toggle-btn');
    if (lyricsToggle) {
      lyricsToggle.style.display = '';
    }

    if (savedLyricsViewModeForMini !== null) {
      lyricsViewMode = savedLyricsViewModeForMini;
      savedLyricsViewModeForMini = null;
    }

    if (savedAnimationForMini !== null) {
      animationEnabled = !!savedAnimationForMini;
      savedAnimationForMini = null;
    }

    renderLyricsViewMode();
  }

  function toggleFavoritesOnly() {
    const currentAlbum = w.AlbumsManager?.getCurrentAlbum();
    
    if (!currentAlbum) {
      w.NotificationSystem?.warning('Альбом не выбран');
      return;
    }

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
      return;
    }

    // Включаем фильтр
    btn?.classList.add('active');
    if (icon) icon.src = 'img/star.png';
    
    const likedNums = w.FavoritesManager?.getLikedForAlbum(currentAlbum) || [];
    const albumData = w.AlbumsManager?.getAlbumData?.(currentAlbum) || null;
    
    document.querySelectorAll('.track').forEach(el => {
      const idx = parseInt(el.dataset.index, 10);
      if (!Number.isFinite(idx)) {
        el.style.display = 'none';
        return;
      }

      let trackNum = idx + 1;
      if (albumData && Array.isArray(albumData.tracks) && albumData.tracks[idx]) {
        const t = albumData.tracks[idx];
        if (Number.isFinite(Number(t.num))) {
          trackNum = Number(t.num);
        }
      }

      if (!likedNums.includes(trackNum)) {
        el.style.display = 'none';
      } else {
        el.style.display = '';
      }
    });
  }

  function toggleLikePlaying() {
    const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.();
    const index = w.playerCore?.getIndex();
    const track = w.playerCore?.getCurrentTrack();

    if (!playingAlbum || index === undefined || !track) return;

    const fm = w.FavoritesManager;
    const uid = track.uid || null;

    // Обычный альбом: работаем по номеру трека в альбоме (track.num)
    if (playingAlbum !== w.SPECIAL_FAVORITES_KEY) {
      const trackNum = typeof track.num === 'number' ? track.num : (index + 1);
      const isLiked = !!fm?.isFavorite?.(playingAlbum, trackNum);

      if (fm && typeof fm.toggleLike === 'function') {
        fm.toggleLike(playingAlbum, trackNum, !isLiked);
      } else if (typeof w.toggleLikeForAlbum === 'function') {
        w.toggleLikeForAlbum(playingAlbum, trackNum, !isLiked);
      }
    } else {
      // Виртуальный плейлист Избранного — лайкаем исходный трек
      if (!uid || !Array.isArray(w.favoritesRefsModel) || !fm) {
        updateMiniHeader();
        return;
      }

      const ref = w.favoritesRefsModel.find((it) => {
        const refUid = w.AlbumsManager?.getTrackUid?.(it.__a, it.__t) || `${it.__a}_${it.__t}`;
        return refUid === uid;
      });

      if (!ref) {
        updateMiniHeader();
        return;
      }

      const albumKey = ref.__a;
      const trackNum = ref.__t;
      const isLiked = !!fm.isFavorite?.(albumKey, trackNum);

      fm.toggleLike(albumKey, trackNum, !isLiked);
      // Обновляем активность в refsModel (для UI списка избранного)
      if (typeof w.updateFavoritesRefsModelActiveFlag === 'function') {
        w.updateFavoritesRefsModelActiveFlag(albumKey, trackNum, !isLiked);
      }
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
    if (!container) return Promise.resolve();
    
    if (!lyricsUrl) {
      container.innerHTML = '<div class="lyrics-placeholder">Текст не найден</div>';
      return Promise.resolve();
    }
    
    // 🆕 КЭШИРОВАНИЕ: проверяем sessionStorage
    const cacheKey = `lyrics_cache_${lyricsUrl}`;
    const cached = sessionStorage.getItem(cacheKey);
    
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        parseLyrics(parsed);
        return Promise.resolve();
      } catch {}
    }
    
    // Показываем спиннер
    container.innerHTML = '<div class="lyrics-spinner"></div>';
    
    try {
      const response = await fetch(lyricsUrl, { 
        cache: 'force-cache',
        headers: { 'Accept': 'application/json, text/plain' }
      });
      
      // ✅ FALLBACK при 404
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const contentType = response.headers.get('content-type') || '';
      
      // ✅ ОБРАБОТКА ОШИБОК парсинга JSON
      if (contentType.includes('application/json')) {
        try {
          const asJson = await response.json();
          if (!Array.isArray(asJson)) {
            throw new Error('Invalid lyrics JSON: not an array');
          }
          
          // 🆕 Сохраняем в sessionStorage
          sessionStorage.setItem(cacheKey, JSON.stringify(asJson));
          
          parseLyrics(asJson);
        } catch (parseError) {
          console.error('JSON parse error:', parseError);
          throw new Error('Невалидный JSON');
        }
      } else {
        // LRC или plain text
        const bodyText = await response.text();
        
        // 🆕 Сохраняем в sessionStorage
        sessionStorage.setItem(cacheKey, JSON.stringify(bodyText));
        
        parseLyrics(bodyText);
      }

      // Если парсинг успешен но лирика пустая
      if (currentLyrics.length === 0) {
        container.innerHTML = '<div class="lyrics-placeholder">Текст пустой</div>';
      }

      return Promise.resolve();
      
    } catch (error) {
      console.error('Failed to load lyrics:', error);
      
      // ✅ Разные сообщения для разных ошибок
      let errorMsg = 'Ошибка загрузки текста';
      if (error.message.includes('404')) {
        errorMsg = 'Текст не найден (404)';
      } else if (error.message.includes('Невалидный')) {
        errorMsg = 'Неверный формат текста';
      }
      
      container.innerHTML = `<div class="lyrics-placeholder">${errorMsg}</div>`;
      return Promise.resolve();
    }
  }

  /**
   * Унифицированный парсер лирики:
   *  - если source — массив [{ time:number, line:string }] (старый JSON-формат) → напрямую;
   *  - если source — строка LRC ([mm:ss.xx] text) → парсим по таймкодам.
   */
  /**
   * Универсальный парсер лирики с поддержкой:
   *  - JSON массив [{ time, line/text }]
   *  - LRC с метаданными [ar:artist], [ti:title], [al:album]
   *  - Стандартный LRC [mm:ss.xx]text
   *  - Упрощённый LRC [mm:ss]text
   */
  function parseLyrics(source) {
    currentLyrics = [];
    const metadata = {}; // Для расширенного LRC

    // JSON-массив из config.json (lyrics/*.json)
    if (Array.isArray(source)) {
      source.forEach((item) => {
        if (!item || typeof item.time !== 'number') return;
        const text = (item.line || item.text || '').trim();
        if (!text) return;
        currentLyrics.push({ time: item.time, text });
      });
      currentLyrics.sort((a, b) => a.time - b.time);
      return;
    }

    // Строка LRC (стандартный или расширенный)
    const text = String(source || '');
    const lines = text.split('\n');

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // ✅ Расширенные метаданные LRC
      const metaMatch = trimmed.match(/^\[([a-z]{2}):(.*)\]$/i);
      if (metaMatch) {
        const [, key, value] = metaMatch;
        metadata[key.toLowerCase()] = value.trim();
        return;
      }

      // ✅ Стандартный LRC с сотыми: [mm:ss.xx]text
      const match1 = trimmed.match(/^\[(\d{1,2}):(\d{2})\.(\d{2})\](.*)$/);
      if (match1) {
        const [, mm, ss, cs, txt] = match1;
        const time = parseInt(mm, 10) * 60 + parseInt(ss, 10) + parseInt(cs, 10) / 100;
        const lyricText = (txt || '').trim();
        if (lyricText) {
          currentLyrics.push({ time, text: lyricText });
        }
        return;
      }

      // ✅ Упрощённый LRC без сотых: [mm:ss]text
      const match2 = trimmed.match(/^\[(\d{1,2}):(\d{2})\](.*)$/);
      if (match2) {
        const [, mm, ss, txt] = match2;
        const time = parseInt(mm, 10) * 60 + parseInt(ss, 10);
        const lyricText = (txt || '').trim();
        if (lyricText) {
          currentLyrics.push({ time, text: lyricText });
        }
        return;
      }
    });

    currentLyrics.sort((a, b) => a.time - b.time);

    // Логируем метаданные если есть
    if (Object.keys(metadata).length > 0) {
      console.log('📝 LRC metadata:', metadata);
    }
  }

  /**
   * Рендеринг окна лирики в стиле караоке (как в старом приложении).
   * Показывает окно из N строк с активной строкой по центру.
   * Размер окна зависит от режима: normal (5 строк) / expanded (9 строк).
   */
  /**
   * Рендеринг окна лирики с ОБРАТНЫМ ОТСЧЁТОМ перед началом текста.
   * 
   * Логика:
   * 1. Если первая строка начинается ПОЗЖЕ 5 секунд → показываем обратный отсчёт
   * 2. Отсчёт показывается ДО первой строки: 10-9-8-7-6-5-4-3-2-1
   * 3. За 1 секунду до первой строки отсчёт исчезает (плавное fade-out)
   * 4. Текст плавно подъезжает к центру к моменту первой строки
   */
  function renderLyrics(position) {
    const container = document.getElementById('lyrics');
    if (!container) return;

    if (!currentLyrics || currentLyrics.length === 0) {
      container.innerHTML = '<div class="lyrics-placeholder">Текст не найден</div>';
      countdownValue = null;
      return;
    }

    const firstLineTime = currentLyrics[0]?.time || 0;
    const COUNTDOWN_THRESHOLD = 5; // Если первая строка позже 5 сек — показываем отсчёт
    const windowSize = (lyricsViewMode === 'expanded') ? 9 : 5;
    const centerLine = Math.floor(windowSize / 2);

    // ✅ ОБРАТНЫЙ ОТСЧЁТ: если position < firstLineTime И firstLineTime > 5 сек
    if (position < firstLineTime && firstLineTime > COUNTDOWN_THRESHOLD) {
      const remaining = firstLineTime - position;
      const secondsLeft = Math.ceil(remaining);

      // За 1 секунду до начала — скрываем отсчёт (плавное исчезновение)
      if (remaining < 1) {
        countdownValue = null;
        // НЕ показываем "0", просто пустое окно с подготовкой к тексту
        container.innerHTML = `
          <div class="lyrics-countdown fade-out" style="opacity: ${remaining.toFixed(2)};">
            ${secondsLeft}
          </div>
        `;
        return;
      }

      // Показываем обратный отсчёт
      countdownValue = secondsLeft;
      container.innerHTML = `
        <div class="lyrics-countdown">
          ${secondsLeft}
        </div>
      `;
      return;
    }

    // Сбрасываем отсчёт если текст уже начался
    countdownValue = null;

    // ✅ ОБЫЧНЫЙ РЕЖИМ КАРАОКЕ
    let activeIdx = -1;
    for (let i = 0; i < currentLyrics.length; i++) {
      if (position >= currentLyrics[i].time) {
        activeIdx = i;
      } else {
        break;
      }
    }

    const start = Math.max(0, activeIdx - centerLine);
    const padTop = Math.max(0, centerLine - activeIdx);

    const rows = [];

    // Пустые строки сверху
    for (let p = 0; p < padTop; ++p) {
      rows.push('<div class="lyrics-window-line"></div>');
    }

    // Строки лирики
    for (let i = start; i < Math.min(currentLyrics.length, start + windowSize - padTop); i++) {
      const cls = (i === activeIdx) ? 'lyrics-window-line active' : 'lyrics-window-line';
      const text = currentLyrics[i] ? (currentLyrics[i].text || currentLyrics[i].line || '') : '';
      rows.push(`<div class="${cls}">${escapeHtml(text)}</div>`);
    }

    // Пустые строки снизу
    while (rows.length < windowSize) {
      rows.push('<div class="lyrics-window-line"></div>');
    }

    container.innerHTML = rows.join('');
  }

  /**
   * Оптимизированный рендеринг с троттлингом (не чаще 250ms или при смене строки).
   */
  function renderLyricsEnhanced(position) {
    // Если лирика скрыта режимом или мы в мини-режиме — не тратим ресурсы
    if (lyricsViewMode === 'hidden' || isInContextMiniMode) return;
    
    if (!Array.isArray(currentLyrics) || currentLyrics.length === 0) return;

    // Определяем активную строку
    let activeIdx = -1;
    for (let i = 0; i < currentLyrics.length; i++) {
      if (position >= currentLyrics[i].time) {
        activeIdx = i;
      } else {
        break;
      }
    }

    const now = Date.now();

    // Не рендерим если строка не изменилась И прошло меньше LYRICS_MIN_INTERVAL
    if (activeIdx === lyricsLastIdx && (now - lyricsLastTs) < LYRICS_MIN_INTERVAL) {
      return;
    }

    lyricsLastIdx = activeIdx;
    lyricsLastTs = now;
    
    renderLyrics(position);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
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
    
    // Восстановление режима лирики
    const savedLyricsMode = localStorage.getItem('lyricsViewMode');
    if (savedLyricsMode && ['normal', 'hidden', 'expanded'].includes(savedLyricsMode)) {
      lyricsViewMode = savedLyricsMode;
    } else {
      lyricsViewMode = 'normal';
    }
    
    // Восстановление анимации лирики
    const savedAnimation = localStorage.getItem('lyricsAnimationEnabled');
    animationEnabled = savedAnimation === '1';
    
    // Восстановление пульсации логотипа
    const savedBit = localStorage.getItem('bitEnabled');
    bitEnabled = savedBit === '1';
    
    if (bitEnabled) {
      setTimeout(startBitEffect, 1000);
    }
    
    // 🆕 Обновляем иконку сердечка при загрузке
    const heart = document.getElementById('pulse-heart');
    if (heart) heart.textContent = bitEnabled ? '❤️' : '🤍';

    // Применяем режим лирики к DOM (если плеер уже создан)
    renderLyricsViewMode();
    
    console.log(`✅ Settings restored: lyrics=${lyricsViewMode}, animation=${animationEnabled}`);
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
    toggleLikePlaying,
    switchAlbumInstantly, // ✅ Добавляем новую функцию
    /**
     * Текущая распарсенная лирика (для LyricsModal и других модулей).
     * Формат: [{ time: number, text: string }]
     */
    get currentLyrics() {
      return currentLyrics;
    },
    /**
     * Упрощённое представление для бэкомпат: [{ line: string }]
     * именно это сейчас ожидает lyrics-modal.js.
     */
    get currentLyricsLines() {
      return Array.isArray(currentLyrics)
        ? currentLyrics.map(l => ({ line: l.text }))
        : [];
    }
  };

  // Автоинициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayerUI);
  } else {
    initPlayerUI();
  }

})();

