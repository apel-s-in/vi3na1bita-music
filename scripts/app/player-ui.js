// scripts/app/player-ui.js
// UI плеера на новой платформе PlayerCore

(function PlayerUIModule() {
  'use strict';

  const w = window;

  let currentLyrics = [];
  let lyricsViewMode = 'normal';
  let hasTimedLyricsForCurrentTrack = false;
  let isSeekingProgress = false;
  let isMuted = false;
  let animationEnabled = false;
  let bitEnabled = false;
  let bitIntensity = 100;

  // ========== ФИЛЬТРАЦИЯ ИЗБРАННОГО ==========
  let favoritesFilterActive = false;
  let favoritesOnlyMode = false;

  let audioContext = null;
  let analyser = null;
  let animationFrame = null;

  const LYRICS_MIN_INTERVAL = 250;
  let lyricsLastIdx = -1;
  let lyricsLastTs = 0;

  let isInContextMiniMode = false;
  let savedLyricsViewModeForMini = null;
  let savedAnimationForMini = null;
  let countdownValue = null;

  function initPlayerUI() {
  if (w.__playerUIInitialized) return;
  if (!w.albumsIndex?.length) { setTimeout(initPlayerUI, 100); return; }
  w.__playerUIInitialized = true;

    restoreSettings();
    attachPlayerCoreEvents();

    // ✅ Realtime sync лайков: обновляем UI и пересчитываем доступные индексы/очередь без остановки музыки
    if (!w.__favoritesChangedBound) {
      w.__favoritesChangedBound = true;

      window.addEventListener('favorites:changed', (e) => {
        try {
          // 1) UI обновления
          updateMiniHeader();
          updateNextUpLabel();

          // 2) Единая политика очереди/режимов (применяем к playingAlbum)
          if (w.PlaybackPolicy && typeof w.PlaybackPolicy.apply === 'function') {
            w.PlaybackPolicy.apply({
              reason: 'favoritesChanged',
              changed: e?.detail || {}
            });
          }

          // 3) Fallback пересчёта доступных индексов (legacy)
          updateAvailableTracksForPlayback();
        } catch (err) {
          console.warn('favorites:changed handler failed:', err);
        }
      });
    }

    // ✅ КРИТИЧНО: Привязываем кнопку фильтрации ОДИН РАЗ
    const filterBtnEl = document.getElementById('filter-favorites-btn');
    if (filterBtnEl && !filterBtnEl.__bound) {
      filterBtnEl.__bound = true;
      filterBtnEl.addEventListener('click', () => {
        toggleFavoritesFilter();
      });
    }

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
      onPlay: () => {
        updatePlayPauseIcon();
      },
      onPause: () => {
        updatePlayPauseIcon();
      },
      onStop: () => {
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

    w.AlbumsManager?.highlightCurrentTrack?.(index);

    ensurePlayerBlock(index);

    // ✅ Сразу (до fetch) выставляем корректную доступность по hasLyrics/lyrics url
    // чтобы на первом треке не было “мига” активных кнопок.
    try {
      const has = checkTrackHasLyrics(track);
      if (!has) {
        hasTimedLyricsForCurrentTrack = false;
        setLyricsAvailability(false);
      }
    } catch {}

    // ✅ Загрузка лирики (тихо обрабатывает отсутствие файла)
    loadLyrics(track.lyrics).then(() => {
      // Рендерим лирику только если она есть и режим не hidden
      if (hasTimedLyricsForCurrentTrack && lyricsViewMode !== 'hidden') {
        renderLyrics(0);
      }
    });

    // ✅ Обновляем доступность кнопки "📝" (полный текст) в зависимости от fulltext
    const karaokeBtn = document.getElementById('lyrics-text-btn');
    if (karaokeBtn) {
      const hasFulltext = !!(track && track.fulltext);
      // Кнопка будет активна, если есть fulltext ИЛИ таймкод-лирика
      // Финальное состояние установит setLyricsAvailability после загрузки
      if (!hasFulltext) {
        karaokeBtn.classList.add('disabled');
        karaokeBtn.style.pointerEvents = 'none';
        karaokeBtn.style.opacity = '0.4';
      }
    }

    const downloadBtn = document.getElementById('track-download-btn');
    if (downloadBtn && track.src) {
      downloadBtn.href = track.src;
      downloadBtn.download = `${track.title}.mp3`;

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

      downloadBtn.title = sizeHint ? `Скачать трек${sizeHint}` : 'Скачать трек';
    }
  }

  function isBrowsingOtherAlbum() {
    const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.();
    const currentAlbum = w.AlbumsManager?.getCurrentAlbum();

    if (!playingAlbum) return false;
    if (playingAlbum === '__favorites__' && currentAlbum === '__favorites__') return false;

    return playingAlbum !== currentAlbum;
  }

  // ✅ Debounce для предотвращения множественных вызовов
  let ensurePlayerBlockTimeout = null;

  function ensurePlayerBlock(trackIndex) {
    // ✅ Защита от некорректного индекса
    if (typeof trackIndex !== 'number' || trackIndex < 0 || !Number.isFinite(trackIndex)) {
      console.warn('⚠️ ensurePlayerBlock called with invalid trackIndex:', trackIndex);
      return;
    }

    // Отменяем предыдущий отложенный вызов
    if (ensurePlayerBlockTimeout) {
      clearTimeout(ensurePlayerBlockTimeout);
    }

    // Откладываем выполнение на 50ms
    ensurePlayerBlockTimeout = setTimeout(() => {
      ensurePlayerBlockTimeout = null;
      _doEnsurePlayerBlock(trackIndex);
    }, 50);
  }

  function _doEnsurePlayerBlock(trackIndex) {
    // ✅ Дополнительная защита от некорректного индекса
    if (typeof trackIndex !== 'number' || trackIndex < 0 || !Number.isFinite(trackIndex)) {
      console.warn('⚠️ _doEnsurePlayerBlock: invalid trackIndex', trackIndex);
      return;
    }

    let playerBlock = document.getElementById('lyricsplayerblock');

    if (!playerBlock) {
      playerBlock = createPlayerBlock();
    }

    const inMiniMode = isBrowsingOtherAlbum();

    if (inMiniMode) {
      const nowPlaying = document.getElementById('now-playing');

      if (!nowPlaying) {
        console.error('❌ #now-playing not found!');
        return;
      }

      if (!nowPlaying.contains(playerBlock)) {
        nowPlaying.innerHTML = '';
        nowPlaying.appendChild(createMiniHeader());
        nowPlaying.appendChild(playerBlock);
        nowPlaying.appendChild(createNextUpElement());
      }

      applyMiniLyricsState();

      const miniHeaderEl = document.getElementById('mini-now');
      const nextUpEl = document.getElementById('next-up');

      if (miniHeaderEl) {
        miniHeaderEl.style.display = 'flex';
        miniHeaderEl.style.transition = 'none';
      }
      if (nextUpEl) {
        nextUpEl.style.display = 'flex';
        nextUpEl.style.transition = 'none';
      }

      setTimeout(() => {
        nowPlaying.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);

    } else {
      const trackList = document.getElementById('track-list');

      if (!trackList) {
        console.error('❌ #track-list not found!');
        return;
      }

      const trackRow = trackList.querySelector(`.track[data-index="${trackIndex}"]`);

      if (!trackRow) {
        console.warn(`⚠️ Track row [data-index="${trackIndex}"] not found!`);

        if (!playerBlock.parentNode) {
          trackList.appendChild(playerBlock);
        }

        return;
      }

      if (!playerBlock.parentNode) {
        if (trackRow.nextSibling) {
          trackRow.parentNode.insertBefore(playerBlock, trackRow.nextSibling);
        } else {
          trackRow.parentNode.appendChild(playerBlock);
        }
      } else if (trackRow.nextSibling !== playerBlock) {
        if (trackRow.nextSibling) {
          trackRow.parentNode.insertBefore(playerBlock, trackRow.nextSibling);
        } else {
          trackRow.parentNode.appendChild(playerBlock);
        }
      }

      setTimeout(() => {
        trackRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);

      restoreLyricsStateIfNeeded();

      const miniHeaderEl = document.getElementById('mini-now');
      const nextUpEl = document.getElementById('next-up');

      if (miniHeaderEl) {
        miniHeaderEl.style.display = 'none';
        miniHeaderEl.style.transition = 'none';
      }
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
      const uid = String(track?.uid || '').trim();
      let isLiked = false;

      if (playingAlbum && w.FavoritesManager && uid) {
        if (playingAlbum !== w.SPECIAL_FAVORITES_KEY) {
          isLiked = !!w.FavoritesManager.isFavorite(playingAlbum, uid);
        } else {
          // В режиме __favorites__ лайк относится к исходному альбому трека
          const srcAlbum = String(track?.sourceAlbum || '').trim();
          if (srcAlbum) {
            isLiked = !!w.FavoritesManager.isFavorite(srcAlbum, uid);
          } else {
            // fallback: если sourceAlbum не проставлен — попробуем найти в favoritesRefsModel
            const ref = Array.isArray(w.favoritesRefsModel)
              ? w.favoritesRefsModel.find(it => String(it?.__uid || '').trim() === uid)
              : null;
            if (ref) {
              isLiked = !!w.FavoritesManager.isFavorite(ref.__a, uid);
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

  function switchAlbumInstantly(newAlbumKey) {
    const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.();
    const currentIndex = w.playerCore?.getIndex() || 0;

    ensurePlayerBlock(currentIndex);
    updateMiniHeader();
    updateNextUpLabel();

    if (w.PlayerState && typeof w.PlayerState.save === 'function') {
      w.PlayerState.save();
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

    const volumeWrap = block.querySelector('.volume-control-wrapper');
    if (volumeWrap && !volumeWrap.__bound) {
      volumeWrap.__bound = true;

      const setFromClientX = (clientX) => {
        const slider = block.querySelector('#volume-slider');
        const track = block.querySelector('.volume-track');
        if (!slider || !track) return;

        const rect = track.getBoundingClientRect();
        if (!rect.width) return;

        const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const v = Math.round(p * 100);

        slider.value = String(v);
        onVolumeChange({ target: slider });
      };

      volumeWrap.addEventListener('pointerdown', (e) => {
        if (e && typeof e.clientX === 'number') {
          setFromClientX(e.clientX);
        }
      });

      volumeWrap.addEventListener('pointermove', (e) => {
        // drag по полосе при зажатой кнопке
        if (e && e.buttons === 1 && typeof e.clientX === 'number') {
          setFromClientX(e.clientX);
        }
      });
    }

    const progressBar = block.querySelector('#player-progress-bar');
    progressBar?.addEventListener('mousedown', startSeeking);
    progressBar?.addEventListener('touchstart', startSeeking);

    block.querySelector('#lyrics-toggle-btn')?.addEventListener('click', toggleLyricsView);
    block.querySelector('#animation-btn')?.addEventListener('click', toggleAnimation);
    block.querySelector('#pulse-btn')?.addEventListener('click', togglePulse);

    const favoritesBtn = block.querySelector('#favorites-btn');
    if (favoritesBtn) {
      favoritesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavoritesOnly();
      });
    }

    block.querySelector('#sleep-timer-btn')?.addEventListener('click', () => w.SleepTimer?.show?.());
    block.querySelector('#lyrics-text-btn')?.addEventListener('click', () => w.LyricsModal?.show?.());

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

  function renderVolumeUI(value) {
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    const p = v / 100;

    const fill = document.getElementById('volume-fill');
    const handle = document.getElementById('volume-handle');
    const track = document.getElementById('volume-track');

    if (fill) {
      fill.style.width = `${p * 100}%`;
    }

    if (handle && track) {
      const rect = track.getBoundingClientRect();
      const handleHalf = 7; // 14px / 2 (см. CSS)
      const xRaw = rect.width * p;
      const x = Math.max(handleHalf, Math.min(rect.width - handleHalf, xRaw));
      handle.style.left = `${x}px`;
    }
  }

  function onVolumeChange(e) {
    const value = parseInt(e.target.value, 10);
    const v = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

    w.playerCore?.setVolume(v);
    
    // ✅ Вызываем renderVolumeUI после небольшой задержки для плавности
    requestAnimationFrame(() => {
      renderVolumeUI(v);
    });

    try { localStorage.setItem('playerVolume', String(v)); } catch {}
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

    // ✅ После смены shuffle пересчитаем политику очереди (favoritesOnly + shuffle)
    if (w.PlaybackPolicy && typeof w.PlaybackPolicy.apply === 'function') {
      w.PlaybackPolicy.apply({ reason: 'toggle' });
    }

    updateAvailableTracksForPlayback();
  }

  function toggleAnimation() {
    const animBtn = document.getElementById('animation-btn');
    if (animBtn && animBtn.classList.contains('disabled')) return;

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
    // ✅ КРИТИЧНО: Пульсация НЕ должна влиять на воспроизведение музыки.
    // Стратегия:
    // 1) Если Howler использует Web Audio и masterGain доступен — 
    //    создаём AnalyserNode и подключаем ПАРАЛЛЕЛЬНО (не разрывая цепочку masterGain → destination).
    // 2) Если Howler недоступен или не использует Web Audio — fallback на синусоидальную анимацию.
    // 3) НИКОГДА не используем createMediaElementSource (он "захватывает" элемент и может сломать воспроизведение).

    try {
      // Проверяем, есть ли Howler и использует ли он Web Audio
      if (w.Howler && w.Howler.ctx && w.Howler.masterGain) {
        // ✅ Используем существующий AudioContext от Howler (не создаём новый!)
        if (!audioContext) {
          audioContext = w.Howler.ctx;
        }

        // ✅ Создаём analyser только один раз
        if (!analyser) {
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.85;

          // ✅ ВАЖНО: подключаем analyser ПАРАЛЛЕЛЬНО основной цепочке.
          // masterGain уже подключен к destination. Мы добавляем analyser как "слушателя",
          // не разрывая основной путь звука.
          // Схема: masterGain → destination (звук)
          //        masterGain → analyser (анализ, без звука из analyser)
          try {
            w.Howler.masterGain.connect(analyser);
            // analyser НЕ подключаем к destination — он только для чтения данных
          } catch {
            // Если не удалось — будем использовать fallback
            analyser = null;
          }
        }
      }
      // Если analyser не создан — будет использоваться fallback в animateBit()
    } catch {
      // Ошибка инициализации — fallback в animateBit()
      analyser = null;
    }

    animateBit();
  }

  function animateBit() {
    if (!bitEnabled) return;

    let intensity = 0;

    if (analyser && audioContext && audioContext.state === 'running') {
      // ✅ Реальный анализ через Web Audio (безопасный — не влияет на воспроизведение)
      try {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        
        // Используем среднее значение низких частот (басы) для более выразительной пульсации
        const bassRange = Math.floor(dataArray.length * 0.3); // Нижние 30% частот
        let bassSum = 0;
        for (let i = 0; i < bassRange; i++) {
          bassSum += dataArray[i];
        }
        const bassAvg = bassSum / bassRange;
        intensity = (bassAvg / 255) * (bitIntensity / 100);
      } catch {
        // Ошибка чтения — используем fallback
        intensity = 0;
      }
    }
    
    // ✅ Fallback: если analyser недоступен или AudioContext suspended
    if (intensity === 0 && w.playerCore && w.playerCore.isPlaying()) {
      // Плавная синусоидальная пульсация с лёгким "дыханием"
      const time = Date.now() / 1000;
      // Комбинируем две синусоиды для более естественного эффекта
      const wave1 = Math.sin(time * 2.5) * 0.5 + 0.5;
      const wave2 = Math.sin(time * 1.3 + 0.5) * 0.3 + 0.7;
      intensity = wave1 * wave2 * 0.25 * (bitIntensity / 100);
    }

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
    if (logo) {
      // ✅ Плавный возврат к scale(1)
      logo.style.transition = 'transform 0.3s ease-out';
      logo.style.transform = 'scale(1)';
      // Убираем transition после анимации
      setTimeout(() => {
        if (logo) logo.style.transition = '';
      }, 300);
    }

    // ✅ НЕ отключаем analyser от masterGain — это может вызвать проблемы.
    // Просто обнуляем ссылку. При следующем startBitEffect() создадим новый analyser.
    // audioContext НЕ трогаем — это Howler.ctx, его закрытие убьёт воспроизведение!
    analyser = null;
    // audioContext остаётся как есть (ссылка на Howler.ctx)
  }

  function toggleLyricsView() {
    const btn = document.getElementById('lyrics-toggle-btn');
    if (btn && btn.classList.contains('disabled')) return;

    const modes = ['normal', 'hidden', 'expanded'];
    const currentIndex = modes.indexOf(lyricsViewMode);
    const nextIndex = (currentIndex === -1 ? 0 : (currentIndex + 1) % modes.length);
    lyricsViewMode = modes[nextIndex];

    try {
      localStorage.setItem('lyricsViewMode', lyricsViewMode);
    } catch {}

    renderLyricsViewMode();

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

  function renderLyricsViewMode() {
    const playerBlock = document.getElementById('lyricsplayerblock');
    if (!playerBlock) return;

    const lyricsWindow = playerBlock.querySelector('#lyrics-window');
    const btn = playerBlock.querySelector('#lyrics-toggle-btn');
    if (!lyricsWindow || !btn) return;

    lyricsWindow.classList.remove('lyrics-normal', 'lyrics-hidden', 'lyrics-expanded');
    btn.classList.remove('lyrics-normal', 'lyrics-hidden', 'lyrics-expanded');

    const cls = `lyrics-${lyricsViewMode}`;
    lyricsWindow.classList.add(cls);
    btn.classList.add(cls);

    if (lyricsViewMode === 'hidden') {
      const bg = playerBlock.querySelector('.lyrics-animated-bg');
      bg?.classList.remove('active');
      const animBtn = document.getElementById('animation-btn');
      if (animBtn) animBtn.classList.remove('active');
    } else if (animationEnabled) {
      const bg = playerBlock.querySelector('.lyrics-animated-bg');
      bg?.classList.add('active');
      const animBtn = document.getElementById('animation-btn');
      if (animBtn) animBtn.classList.add('active');
    }
  }

  function applyMiniLyricsState() {
    const playerBlock = document.getElementById('lyricsplayerblock');
    if (!playerBlock) return;
    if (isInContextMiniMode) return;

    isInContextMiniMode = true;

    if (savedLyricsViewModeForMini === null && lyricsViewMode !== 'hidden') {
      savedLyricsViewModeForMini = lyricsViewMode || 'normal';
    }

    if (savedAnimationForMini === null) {
      savedAnimationForMini = animationEnabled;
    }

    const lyricsWindow = playerBlock.querySelector('#lyrics-window');
    if (lyricsWindow) {
      lyricsWindow.style.transition = 'none';
      lyricsWindow.style.display = 'none';
      setTimeout(() => {
        if (lyricsWindow) lyricsWindow.style.transition = '';
      }, 50);
    }

    const lyricsToggle = playerBlock.querySelector('.lyrics-toggle-btn');
    if (lyricsToggle) {
      lyricsToggle.style.display = 'none';
    }

    animationEnabled = false;
    const bg = playerBlock.querySelector('.lyrics-animated-bg');
    bg?.classList.remove('active');
    const animBtn = document.getElementById('animation-btn');
    if (animBtn) animBtn.classList.remove('active');
  }

  function restoreLyricsStateIfNeeded() {
    const playerBlock = document.getElementById('lyricsplayerblock');
    if (!playerBlock || !isInContextMiniMode) return;

    isInContextMiniMode = false;

    const lyricsWindow = playerBlock.querySelector('#lyrics-window');
    if (lyricsWindow) {
      lyricsWindow.style.transition = 'none';
      lyricsWindow.style.display = '';
      setTimeout(() => {
        if (lyricsWindow) lyricsWindow.style.transition = '';
      }, 50);
    }

    const lyricsToggle = playerBlock.querySelector('.lyrics-toggle-btn');
    if (lyricsToggle) {
      lyricsToggle.style.display = '';
    }

    // ✅ Если у текущего трека нет таймкод‑лирики — ничего не “воскрешаем”.
    // Кнопки Т/А должны оставаться disabled всегда.
    if (!hasTimedLyricsForCurrentTrack) {
      lyricsViewMode = 'hidden';
      animationEnabled = false;
      savedLyricsViewModeForMini = null;
      savedAnimationForMini = null;
      setLyricsAvailability(false);
      return;
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
    const btn = document.getElementById('favorites-btn');
    const icon = document.getElementById('favorites-btn-icon');

    if (!btn || !icon) return;

    favoritesOnlyMode = !favoritesOnlyMode;

    if (favoritesOnlyMode) {
      btn.classList.add('favorites-active');
      icon.src = 'img/star.png';
      w.NotificationSystem?.success('⭐ Только избранные треки');
    } else {
      btn.classList.remove('favorites-active');
      icon.src = 'img/star2.png';
      w.NotificationSystem?.info('Играют все треки');
    }

    try {
      localStorage.setItem('favoritesOnlyMode', favoritesOnlyMode ? '1' : '0');
    } catch {}

    syncFilterWithFavoritesMode();

    updateAvailableTracksForPlayback();

    if (w.PlaybackPolicy && typeof w.PlaybackPolicy.apply === 'function') {
      w.PlaybackPolicy.apply({ reason: 'toggle' });
    }
  }

  function toggleLikePlaying() {
    const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.();
    const track = w.playerCore?.getCurrentTrack();

    if (!playingAlbum || !track || !w.FavoritesManager) return;

    const uid = String(track?.uid || '').trim();
    if (!uid) return;

    if (playingAlbum !== w.SPECIAL_FAVORITES_KEY) {
      const isLiked = !!w.FavoritesManager.isFavorite(playingAlbum, uid);
      w.FavoritesManager.toggleLike(playingAlbum, uid, !isLiked);
    } else {
      // В режиме __favorites__ лайк относится к исходному альбому трека
      const srcAlbum = String(track?.sourceAlbum || '').trim();
      if (!srcAlbum) return;

      const isLiked = !!w.FavoritesManager.isFavorite(srcAlbum, uid);
      w.FavoritesManager.toggleLike(srcAlbum, uid, !isLiked);
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

  function setLyricsAvailability(enabled) {
    const playerBlock = document.getElementById('lyricsplayerblock');
    if (!playerBlock) return;

    const lyricsWindow = playerBlock.querySelector('#lyrics-window');
    const lyricsBtn = playerBlock.querySelector('#lyrics-toggle-btn');
    const animBtn = playerBlock.querySelector('#animation-btn');
    const karaokeBtn = playerBlock.querySelector('#lyrics-text-btn');
    const bg = playerBlock.querySelector('.lyrics-animated-bg');
    const container = document.getElementById('lyrics');

    if (lyricsWindow) {
      lyricsWindow.style.display = enabled ? '' : 'none';
    }

    // ✅ Кнопка "Т" (режим лирики)
    if (lyricsBtn) {
      lyricsBtn.classList.toggle('disabled', !enabled);
      lyricsBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
      lyricsBtn.setAttribute('tabindex', enabled ? '0' : '-1');
      lyricsBtn.style.pointerEvents = enabled ? '' : 'none';
    }

    // ✅ Кнопка "А" (анимация)
    if (animBtn) {
      animBtn.classList.toggle('disabled', !enabled);
      animBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
      animBtn.setAttribute('tabindex', enabled ? '0' : '-1');
      animBtn.style.pointerEvents = enabled ? '' : 'none';
    }

    // ✅ Кнопка "📝" (полный текст)
    if (karaokeBtn) {
      const track = w.playerCore?.getCurrentTrack();
      const hasFulltext = !!(track && track.fulltext);
      const hasTimedLyrics = enabled && hasTimedLyricsForCurrentTrack && currentLyrics.length > 0;
      
      const karaokeEnabled = hasFulltext || hasTimedLyrics;
      
      karaokeBtn.classList.toggle('disabled', !karaokeEnabled);
      karaokeBtn.style.pointerEvents = karaokeEnabled ? '' : 'none';
      karaokeBtn.style.opacity = karaokeEnabled ? '' : '0.4';
    }

    if (!enabled) {
      // ✅ Лирики нет — выключаем анимацию
      animationEnabled = false;
      if (bg) bg.classList.remove('active');
      if (animBtn) animBtn.classList.remove('active');

      lyricsViewMode = 'hidden';
      
      if (container) {
        container.innerHTML = '';
      }
    } else {
      // ✅ Лирика есть — восстанавливаем сохранённые настройки
      const savedMode = localStorage.getItem('lyricsViewMode');
      if (savedMode && ['normal', 'hidden', 'expanded'].includes(savedMode)) {
        lyricsViewMode = savedMode;
      } else {
        lyricsViewMode = 'normal';
      }

      const savedAnimation = localStorage.getItem('lyricsAnimationEnabled');
      animationEnabled = savedAnimation === '1';

      if (animBtn) {
        animBtn.classList.toggle('active', animationEnabled);
      }
      if (bg) {
        bg.classList.toggle('active', animationEnabled && lyricsViewMode !== 'hidden');
      }
    }

    renderLyricsViewMode();
  }

  // ✅ Кэш для 404 ответов — не проверяем повторно
  const LYRICS_404_CACHE_KEY = 'lyrics_404_cache:v1';
  
  // ✅ Кэш предзагруженной лирики следующего трека
  let prefetchedLyrics = null;
  let prefetchedLyricsUrl = null;

  function getLyrics404Cache() {
    try {
      const raw = sessionStorage.getItem(LYRICS_404_CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function setLyrics404Cache(url) {
    try {
      const cache = getLyrics404Cache();
      cache[url] = Date.now();
      // Ограничиваем размер кэша (макс 100 записей)
      const keys = Object.keys(cache);
      if (keys.length > 100) {
        const oldest = keys.sort((a, b) => cache[a] - cache[b]).slice(0, 50);
        oldest.forEach(k => delete cache[k]);
      }
      sessionStorage.setItem(LYRICS_404_CACHE_KEY, JSON.stringify(cache));
    } catch {}
  }

  function isLyrics404Cached(url) {
    const cache = getLyrics404Cache();
    return !!cache[url];
  }

  /**
   * ✅ Проверяет, есть ли лирика у трека БЕЗ HEAD-запроса
   * Использует поле hasLyrics из config.json (если есть)
   */
  function checkTrackHasLyrics(track) {
    if (!track) return false;
    
    // 1. Если явно указано hasLyrics: false — лирики нет
    if (track.hasLyrics === false) return false;
    
    // 2. Если hasLyrics: true или есть URL лирики — считаем что есть
    if (track.hasLyrics === true) return true;
    if (track.lyrics) return true;
    
    return false;
  }

  /**
   * ✅ Автоопределение формата лирики по URL или содержимому
   */
  function detectLyricsFormat(url, content) {
    // По расширению
    if (url) {
      const lower = url.toLowerCase();
      if (lower.endsWith('.lrc')) return 'lrc';
      if (lower.endsWith('.json')) return 'json';
      if (lower.endsWith('.txt')) return 'lrc'; // .txt обычно LRC-формат
    }
    
    // По содержимому
    if (content) {
      const trimmed = content.trim();
      // JSON начинается с [ или {
      if (trimmed.startsWith('[') && !trimmed.match(/^$$\d{1,2}:\d{2}/)) {
        try {
          JSON.parse(trimmed);
          return 'json';
        } catch {}
      }
      // LRC содержит таймкоды [mm:ss.xx]
      if (/\[\d{1,2}:\d{2}[.\d]*$$/.test(trimmed)) return 'lrc';
    }
    
    return 'unknown';
  }

  async function loadLyrics(lyricsUrl) {
    currentLyrics = [];
    lyricsLastIdx = -1;
    hasTimedLyricsForCurrentTrack = false;

    const container = document.getElementById('lyrics');
    if (!container) return Promise.resolve();

    // ✅ Если ссылки на лирику нет — проверяем hasLyrics флаг трека
    if (!lyricsUrl) {
      const track = w.playerCore?.getCurrentTrack();
      if (!checkTrackHasLyrics(track)) {
        hasTimedLyricsForCurrentTrack = false;
        setLyricsAvailability(false);
        return Promise.resolve();
      }
    }

    // ✅ Если URL нет после всех проверок — дизейблим
    if (!lyricsUrl) {
      hasTimedLyricsForCurrentTrack = false;
      setLyricsAvailability(false);
      return Promise.resolve();
    }

    // ✅ Проверяем кэш 404 — если уже знаем что файла нет, не делаем запрос
    if (isLyrics404Cached(lyricsUrl)) {
      hasTimedLyricsForCurrentTrack = false;
      setLyricsAvailability(false);
      return Promise.resolve();
    }

    // ✅ Проверяем предзагруженную лирику
    if (prefetchedLyricsUrl === lyricsUrl && prefetchedLyrics !== null) {
      currentLyrics = prefetchedLyrics;
      prefetchedLyrics = null;
      prefetchedLyricsUrl = null;
      
      if (currentLyrics.length > 0) {
        hasTimedLyricsForCurrentTrack = true;
        setLyricsAvailability(true);
        renderLyricsViewMode();
      } else {
        hasTimedLyricsForCurrentTrack = false;
        setLyricsAvailability(false);
      }
      
      // Запускаем предзагрузку следующего трека
      prefetchNextTrackLyrics();
      return Promise.resolve();
    }

    // ✅ Проверяем кэш в sessionStorage
    const cacheKey = `lyrics_cache_${lyricsUrl}`;
    const cached = sessionStorage.getItem(cacheKey);

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        
        // Проверяем, не закэширован ли маркер "нет лирики"
        if (parsed === null || parsed === '__NO_LYRICS__') {
          hasTimedLyricsForCurrentTrack = false;
          setLyricsAvailability(false);
          prefetchNextTrackLyrics();
          return Promise.resolve();
        }
        
        parseLyrics(parsed);

        if (!Array.isArray(currentLyrics) || currentLyrics.length === 0) {
          hasTimedLyricsForCurrentTrack = false;
          setLyricsAvailability(false);
          prefetchNextTrackLyrics();
          return Promise.resolve();
        }

        hasTimedLyricsForCurrentTrack = true;
        setLyricsAvailability(true);
        renderLyricsViewMode();
        prefetchNextTrackLyrics();
        return Promise.resolve();
      } catch {
        try { sessionStorage.removeItem(cacheKey); } catch {}
      }
    }

    // ✅ Показываем спиннер
    container.innerHTML = '<div class="lyrics-spinner"></div>';

    try {
      const response = await fetch(lyricsUrl, {
        cache: 'force-cache',
        headers: { 'Accept': 'application/json, text/plain, */*' }
      });

      if (!response.ok) {
        // ✅ Кэшируем 404 чтобы не проверять повторно
        if (response.status === 404) {
          setLyrics404Cache(lyricsUrl);
        }
        hasTimedLyricsForCurrentTrack = false;
        setLyricsAvailability(false);
        prefetchNextTrackLyrics();
        return Promise.resolve();
      }

      const contentType = response.headers.get('content-type') || '';
      const bodyText = await response.text();
      
      // ✅ Автоопределение формата
      const format = detectLyricsFormat(lyricsUrl, bodyText);

      if (format === 'json' || contentType.includes('application/json')) {
        try {
          const asJson = JSON.parse(bodyText);
          if (!Array.isArray(asJson)) {
            // Кэшируем как "нет лирики"
            try { sessionStorage.setItem(cacheKey, JSON.stringify('__NO_LYRICS__')); } catch {}
            hasTimedLyricsForCurrentTrack = false;
            setLyricsAvailability(false);
            prefetchNextTrackLyrics();
            return Promise.resolve();
          }

          sessionStorage.setItem(cacheKey, JSON.stringify(asJson));
          parseLyrics(asJson);
        } catch {
          try { sessionStorage.setItem(cacheKey, JSON.stringify('__NO_LYRICS__')); } catch {}
          hasTimedLyricsForCurrentTrack = false;
          setLyricsAvailability(false);
          prefetchNextTrackLyrics();
          return Promise.resolve();
        }
      } else {
        // ✅ LRC или текстовый формат
        sessionStorage.setItem(cacheKey, JSON.stringify(bodyText));
        parseLyrics(bodyText);
      }

      if (currentLyrics.length === 0) {
        hasTimedLyricsForCurrentTrack = false;
        setLyricsAvailability(false);
        prefetchNextTrackLyrics();
        return Promise.resolve();
      }

      hasTimedLyricsForCurrentTrack = true;
      setLyricsAvailability(true);
      renderLyricsViewMode();
      prefetchNextTrackLyrics();
      return Promise.resolve();

    } catch {
      hasTimedLyricsForCurrentTrack = false;
      setLyricsAvailability(false);
      prefetchNextTrackLyrics();
      return Promise.resolve();
    }
  }

  /**
   * ✅ Предзагрузка лирики следующего трека
   */
  async function prefetchNextTrackLyrics() {
    // Сбрасываем предыдущую предзагрузку
    prefetchedLyrics = null;
    prefetchedLyricsUrl = null;

    if (!w.playerCore) return;

    const nextIndex = w.playerCore.getNextIndex();
    if (nextIndex < 0) return;

    const playlist = w.playerCore.getPlaylistSnapshot();
    const nextTrack = playlist[nextIndex];

    if (!nextTrack || !nextTrack.lyrics) return;

    const lyricsUrl = nextTrack.lyrics;

    // Проверяем кэш 404
    if (isLyrics404Cached(lyricsUrl)) return;

    // Проверяем sessionStorage кэш
    const cacheKey = `lyrics_cache_${lyricsUrl}`;
    const cached = sessionStorage.getItem(cacheKey);

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed !== '__NO_LYRICS__') {
          // Парсим и сохраняем
          const tempLyrics = [];
          parseLyricsInto(parsed, tempLyrics);
          if (tempLyrics.length > 0) {
            prefetchedLyrics = tempLyrics;
            prefetchedLyricsUrl = lyricsUrl;
          }
        }
      } catch {}
      return;
    }

    // ✅ Загружаем в фоне (без блокировки UI)
    try {
      const response = await fetch(lyricsUrl, {
        cache: 'force-cache',
        headers: { 'Accept': 'application/json, text/plain, */*' }
      });

      if (!response.ok) {
        if (response.status === 404) {
          setLyrics404Cache(lyricsUrl);
        }
        return;
      }

      const bodyText = await response.text();
      const format = detectLyricsFormat(lyricsUrl, bodyText);

      let dataToCache = bodyText;
      const tempLyrics = [];

      if (format === 'json') {
        try {
          const asJson = JSON.parse(bodyText);
          if (Array.isArray(asJson)) {
            dataToCache = asJson;
            parseLyricsInto(asJson, tempLyrics);
          }
        } catch {}
      } else {
        parseLyricsInto(bodyText, tempLyrics);
      }

      // Кэшируем
      try { sessionStorage.setItem(cacheKey, JSON.stringify(dataToCache)); } catch {}

      if (tempLyrics.length > 0) {
        prefetchedLyrics = tempLyrics;
        prefetchedLyricsUrl = lyricsUrl;
      }
    } catch {
      // Тихо игнорируем ошибки предзагрузки
    }
  }

  /**
   * ✅ Парсинг лирики в указанный массив (для предзагрузки)
   */
  function parseLyricsInto(source, targetArray) {
    if (Array.isArray(source)) {
      source.forEach((item) => {
        if (!item || typeof item.time !== 'number') return;
        const text = (item.line || item.text || '').trim();
        if (!text) return;
        targetArray.push({ time: item.time, text });
      });
      targetArray.sort((a, b) => a.time - b.time);
      return;
    }

    const text = String(source || '');
    const lines = text.split('\n');

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Пропускаем метаданные LRC
      const metaMatch = trimmed.match(/^$$([a-z]{2}):(.*)$$$/i);
      if (metaMatch) return;

      // [mm:ss.xx] формат
      const match1 = trimmed.match(/^$$(\d{1,2}):(\d{2})\.(\d{2,3})$$(.*)$/);
      if (match1) {
        const [, mm, ss, cs, txt] = match1;
        const csValue = cs.length === 3 ? parseInt(cs, 10) / 1000 : parseInt(cs, 10) / 100;
        const time = parseInt(mm, 10) * 60 + parseInt(ss, 10) + csValue;
        const lyricText = (txt || '').trim();
        if (lyricText) {
          targetArray.push({ time, text: lyricText });
        }
        return;
      }

      // [mm:ss] формат (без сотых)
      const match2 = trimmed.match(/^$$(\d{1,2}):(\d{2})$$(.*)$/);
      if (match2) {
        const [, mm, ss, txt] = match2;
        const time = parseInt(mm, 10) * 60 + parseInt(ss, 10);
        const lyricText = (txt || '').trim();
        if (lyricText) {
          targetArray.push({ time, text: lyricText });
        }
        return;
      }
    });

    targetArray.sort((a, b) => a.time - b.time);
  }

  function parseLyrics(source) {
    currentLyrics = [];
    parseLyricsInto(source, currentLyrics);
  }

  function renderLyrics(position) {
    const container = document.getElementById('lyrics');
    if (!container) return;

    if (!currentLyrics || currentLyrics.length === 0) {
      container.innerHTML = '<div class="lyrics-placeholder">Текст не найден</div>';
      countdownValue = null;
      return;
    }

    const firstLineTime = currentLyrics[0]?.time || 0;
    const COUNTDOWN_THRESHOLD = 5;
    const windowSize = (lyricsViewMode === 'expanded') ? 9 : 5;
    const centerLine = Math.floor(windowSize / 2);

    if (position < firstLineTime && firstLineTime > COUNTDOWN_THRESHOLD) {
      const remaining = firstLineTime - position;
      const secondsLeft = Math.ceil(remaining);

      if (remaining < 1) {
        countdownValue = null;
        container.innerHTML = `
          <div class="lyrics-countdown fade-out" style="opacity: ${remaining.toFixed(2)};">
            ${secondsLeft}
          </div>
        `;
        return;
      }

      countdownValue = secondsLeft;
      container.innerHTML = `
        <div class="lyrics-countdown">
          ${secondsLeft}
        </div>
      `;
      return;
    }

    countdownValue = null;

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

    for (let p = 0; p < padTop; ++p) {
      rows.push('<div class="lyrics-window-line"></div>');
    }

    for (let i = start; i < Math.min(currentLyrics.length, start + windowSize - padTop); i++) {
      const cls = (i === activeIdx) ? 'lyrics-window-line active' : 'lyrics-window-line';
      const text = currentLyrics[i] ? (currentLyrics[i].text || currentLyrics[i].line || '') : '';
      rows.push(`<div class="${cls}">${escapeHtml(text)}</div>`);
    }

    while (rows.length < windowSize) {
      rows.push('<div class="lyrics-window-line"></div>');
    }

    container.innerHTML = rows.join('');
  }

  function renderLyricsEnhanced(position) {
    if (lyricsViewMode === 'hidden' || isInContextMiniMode) return;
    if (!Array.isArray(currentLyrics) || currentLyrics.length === 0) return;

    let activeIdx = -1;
    for (let i = 0; i < currentLyrics.length; i++) {
      if (position >= currentLyrics[i].time) {
        activeIdx = i;
      } else {
        break;
      }
    }

    const now = Date.now();

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
    const savedMode = localStorage.getItem('favoritesOnlyMode');
    favoritesOnlyMode = (savedMode === '1');

    const btn = document.getElementById('favorites-btn');
    const icon = document.getElementById('favorites-btn-icon');

    if (btn && icon) {
      if (favoritesOnlyMode) {
        btn.classList.add('favorites-active');
        icon.src = 'img/star.png';
      } else {
        btn.classList.remove('favorites-active');
        icon.src = 'img/star2.png';
      }
    }

    // ✅ Громкость: если первый запуск/очистка — ставим 50%.
    // Далее используем сохранённое значение и не сбрасываем его.
    let volume = 50;
    const savedVolume = localStorage.getItem('playerVolume');

    if (savedVolume !== null) {
      const v = parseInt(savedVolume, 10);
      if (Number.isFinite(v)) volume = v;
    } else {
      try { localStorage.setItem('playerVolume', String(volume)); } catch {}
    }

    w.playerCore?.setVolume(volume);

    const volumeSlider = document.getElementById('volume-slider');
    const volumeFill = document.getElementById('volume-fill');

    if (volumeSlider) volumeSlider.value = String(volume);
    renderVolumeUI(volume);

    const savedLyricsMode = localStorage.getItem('lyricsViewMode');
    if (savedLyricsMode && ['normal', 'hidden', 'expanded'].includes(savedLyricsMode)) {
      lyricsViewMode = savedLyricsMode;
    } else {
      lyricsViewMode = 'normal';
    }

    const savedAnimation = localStorage.getItem('lyricsAnimationEnabled');
    animationEnabled = savedAnimation === '1';

    const savedBit = localStorage.getItem('bitEnabled');
    bitEnabled = savedBit === '1';

    if (bitEnabled) {
      setTimeout(startBitEffect, 1000);
    }

    const heart = document.getElementById('pulse-heart');
    if (heart) heart.textContent = bitEnabled ? '❤️' : '🤍';

    renderLyricsViewMode();

    console.log(`✅ Settings restored: lyrics=${lyricsViewMode}, animation=${animationEnabled}`);
  }

  function toggleFavoritesFilter() {
    const currentAlbum = w.AlbumsManager?.getCurrentAlbum();
    const trackList = document.getElementById('track-list');
    const btn = document.getElementById('filter-favorites-btn');

    if (!currentAlbum || !trackList || !btn) return;

    if (currentAlbum === w.SPECIAL_FAVORITES_KEY) {
      // ✅ В "ИЗБРАННОЕ" нет смысла показывать кнопку фильтра "скрыть не отмеченные",
      // потому что список строится по лайкам. Оставляем кнопку скрытой (см. AlbumsManager.loadFavoritesAlbum).
      w.NotificationSystem?.info('Фильтр недоступен для «ИЗБРАННОЕ»');
      return;
    }

    if (currentAlbum === w.SPECIAL_RELIZ_KEY) {
      w.NotificationSystem?.info('Фильтр недоступен для новостей');
      return;
    }

    const likedUids = w.FavoritesManager?.getLikedUidsForAlbum?.(currentAlbum) || [];

    favoritesFilterActive = !favoritesFilterActive;

    if (favoritesFilterActive) {
      if (likedUids.length === 0) {
        favoritesFilterActive = false;
        w.NotificationSystem?.warning('Нет избранных треков в этом альбоме');
        return;
      }

      btn.textContent = 'ПОКАЗАТЬ ВСЕ ПЕСНИ';
      btn.classList.add('filtered');
      trackList.classList.add('filtered');

      updateFavoriteClasses(likedUids);

      w.NotificationSystem?.success('Показаны только избранные треки');
    } else {
      btn.textContent = 'Скрыть не отмеченные ⭐ песни';
      btn.classList.remove('filtered');
      trackList.classList.remove('filtered');

      document.querySelectorAll('.track.is-favorite').forEach(el => {
        el.classList.remove('is-favorite');
      });

      w.NotificationSystem?.info('Показаны все треки');
    }
  }

  function toggleFavoritesFilterForFavorites() {
    const trackList = document.getElementById('track-list');
    const btn = document.getElementById('filter-favorites-btn');

    if (!trackList || !btn) return;

    favoritesFilterActive = !favoritesFilterActive;

    if (favoritesFilterActive) {
      const model = w.favoritesRefsModel || [];
      const activeCount = model.filter(x => x.__active).length;

      if (activeCount === 0) {
        favoritesFilterActive = false;
        w.NotificationSystem?.warning('Нет активных треков со ⭐');
        return;
      }

      btn.textContent = 'ПОКАЗАТЬ ВСЕ ПЕСНИ';
      btn.classList.add('filtered');
      trackList.classList.add('filtered');

      updateFavoriteClassesFavorites();

      w.NotificationSystem?.success('Показаны только активные треки');
    } else {
      btn.textContent = 'Скрыть не отмеченные ⭐ песни';
      btn.classList.remove('filtered');
      trackList.classList.remove('filtered');

      w.NotificationSystem?.info('Показаны все треки');
    }
  }

  function updateFavoriteClasses(likedUids) {
    const albumKey = w.AlbumsManager?.getCurrentAlbum?.();
    const albumData = w.AlbumsManager?.getAlbumData?.(albumKey);
    if (!albumData || !Array.isArray(albumData.tracks)) return;

    document.querySelectorAll('.track').forEach(el => {
      const idx = parseInt(el.dataset.index, 10);
      if (!Number.isFinite(idx)) return;

      const track = albumData.tracks[idx];
      const uid = String(track?.uid || '').trim();

      if (uid && Array.isArray(likedUids) && likedUids.includes(uid)) {
        el.classList.add('is-favorite');
      } else {
        el.classList.remove('is-favorite');
      }
    });
  }

  function updateFavoriteClassesFavorites() {
    const model = w.favoritesRefsModel || [];

    document.querySelectorAll('.track').forEach(el => {
      const id = String(el.id || '');
      const match = id.match(/^fav_(.+)_(.+)$/);

      if (!match) return;

      const albumKey = match[1];
      const uid = match[2];

      const item = Array.isArray(model)
        ? model.find(x => x && x.__a === albumKey && String(x.__uid || '').trim() === String(uid || '').trim())
        : null;

      if (item && item.__active) {
        el.classList.add('is-favorite');
      } else {
        el.classList.remove('is-favorite');
      }
    });
  }

  function syncFilterWithFavoritesMode() {
    const currentAlbum = w.AlbumsManager?.getCurrentAlbum();
    const filterBtn = document.getElementById('filter-favorites-btn');
    const trackList = document.getElementById('track-list');

    if (!filterBtn || !trackList) return;

    favoritesFilterActive = favoritesOnlyMode;

    if (favoritesFilterActive) {
      filterBtn.textContent = 'ПОКАЗАТЬ ВСЕ ПЕСНИ';
      filterBtn.classList.add('filtered');
      trackList.classList.add('filtered');

      if (currentAlbum === w.SPECIAL_FAVORITES_KEY) {
        updateFavoriteClassesFavorites();
      } else {
        const likedUids = w.FavoritesManager?.getLikedUidsForAlbum?.(currentAlbum) || [];
        updateFavoriteClasses(likedUids);
      }
    } else {
      filterBtn.textContent = 'Скрыть не отмеченные ⭐ песни';
      filterBtn.classList.remove('filtered');
      trackList.classList.remove('filtered');

      document.querySelectorAll('.track.is-favorite').forEach(el => {
        el.classList.remove('is-favorite');
      });
    }
  }

  function updateAvailableTracksForPlayback() {
    const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.();
    const snapshot = w.playerCore?.getPlaylistSnapshot?.() || [];

    if (!playingAlbum || snapshot.length === 0) return;

    if (playingAlbum === w.SPECIAL_FAVORITES_KEY) {
      w.availableFavoriteIndices = null;
      return;
    }

    if (favoritesOnlyMode) {
      const likedUids = w.FavoritesManager?.getLikedUidsForAlbum?.(playingAlbum) || [];

      if (likedUids.length === 0) {
        w.availableFavoriteIndices = null;
        return;
      }

      w.availableFavoriteIndices = [];

      snapshot.forEach((track, idx) => {
        const uid = String(track?.uid || '').trim();
        if (uid && likedUids.includes(uid)) {
          w.availableFavoriteIndices.push(idx);
        }
      });
    } else {
      w.availableFavoriteIndices = null;
    }
  }

  function rebuildShuffledPlaylist() {
    const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.();
    const originalPlaylist = w.playerCore?.originalPlaylist || [];

    if (!playingAlbum || originalPlaylist.length === 0) {
      console.warn('⚠️ No original playlist to shuffle');
      return;
    }

    if (favoritesOnlyMode && playingAlbum !== w.SPECIAL_FAVORITES_KEY) {
      const likedUids = w.FavoritesManager?.getLikedUidsForAlbum?.(playingAlbum) || [];

      if (likedUids.length === 0) {
        w.NotificationSystem?.warning('Нет избранных треков для shuffle');
        return;
      }

      const favoriteTracks = originalPlaylist.filter(track => {
        const uid = String(track?.uid || '').trim();
        return uid && likedUids.includes(uid);
      });

      if (favoriteTracks.length === 0) {
        w.NotificationSystem?.warning('Нет избранных треков для shuffle');
        return;
      }

      const shuffled = [...favoriteTracks];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const currentTrack = w.playerCore?.getCurrentTrack();
      const newIndex = currentTrack
        ? shuffled.findIndex(t => t.src === currentTrack.src)
        : 0;

      w.playerCore?.setPlaylist(shuffled, Math.max(0, newIndex), {
        artist: 'Витрина Разбита',
        album: playingAlbum,
        cover: shuffled[0]?.cover || 'img/logo.png'
      });

      updateAvailableTracksForPlayback();
    } else {
      w.playerCore?.toggleShuffle();
    }
  }

  function formatTime(sec) {
    if (isNaN(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ========== ПУБЛИЧНЫЙ API ==========

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
    get currentLyrics() {
      return currentLyrics;
    },
    get currentLyricsLines() {
      return Array.isArray(currentLyrics)
        ? currentLyrics.map(l => ({ line: l.text }))
        : [];
    }
  };

  w.toggleFavoritesFilter = toggleFavoritesFilter;
  w.toggleFavoritesOnly = toggleFavoritesOnly;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayerUI);
  } else {
    initPlayerUI();
  }

})();
