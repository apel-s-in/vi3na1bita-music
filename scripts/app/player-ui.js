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

  // Jump-to-playing (кнопка-стрелка в родном альбоме)
  let jumpBtnWrap = null;
  let jumpObserver = null;
  let lastNativeTrackRow = null;

  function initPlayerUI() {
    // ✅ Защита от повторной инициализации (например, при повторном выполнении скрипта из-за кеша/SW)
    if (w.__playerUIInitialized) return;
    w.__playerUIInitialized = true;

    if (!w.albumsIndex || w.albumsIndex.length === 0) {
      // albumsIndex ещё не готов — снимем флаг и попробуем позже
      w.__playerUIInitialized = false;
      setTimeout(initPlayerUI, 100);
      return;
    }

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

    // ✅ Network-aware PQ: обновляем кнопку при смене сети/типа соединения
    try {
      if (w.NetworkManager && typeof w.NetworkManager.subscribe === 'function') {
        w.NetworkManager.subscribe(() => {
          try { updatePQButton(); } catch {}
        });
      } else {
        // Fallback: online/offline события
        window.addEventListener('online', () => { try { updatePQButton(); } catch {} });
        window.addEventListener('offline', () => { try { updatePQButton(); } catch {} });
      }
    } catch {}

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
        // PQ availability зависит от текущего трека
        try { updatePQButton(); } catch {}
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

    // ✅ Сразу (до fetch) выставляем корректную доступность.
    // Требование: если файл лирики отсутствует (или уже известно, что отсутствует) — кнопки Т/А должны быть disabled без "мигания".
    try {
      const has = checkTrackHasLyrics(track);
      const knownMissing = (!track?.lyrics) ? true : isLyricsKnownMissingFast(track.lyrics);

      if (!has || knownMissing) {
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
        const uid = String(track?.uid || '').trim();
        const byUid = uid
          ? albumData.tracks.find(t => t && String(t.uid || '').trim() === uid)
          : null;

        const size = (() => {
          // При Lo/Hi отображаем просто "размер трека" по текущему src:
          // - если src совпал с fileLo -> sizeLo
          // - иначе -> sizeHi
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

        if (typeof size === 'number') {
          sizeHint = ` (~${size.toFixed(2)} МБ)`;
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

  function ensureJumpToPlayingButton() {
    if (jumpBtnWrap) return jumpBtnWrap;

    jumpBtnWrap = document.createElement('div');
    jumpBtnWrap.className = 'jump-to-playing';
    jumpBtnWrap.innerHTML = `<button type="button" aria-label="Перейти к текущему треку">↑</button>`;

    jumpBtnWrap.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const playerBlock = document.getElementById('lyricsplayerblock');
      const target = lastNativeTrackRow || playerBlock;
      if (!target) return;

      try {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {}
    });

    document.body.appendChild(jumpBtnWrap);
    return jumpBtnWrap;
  }

  function setJumpVisible(visible) {
    const el = ensureJumpToPlayingButton();
    el.style.display = visible ? 'flex' : 'none';
  }

  function updateJumpObserver() {
    const inMiniMode = isBrowsingOtherAlbum();
    const playerBlock = document.getElementById('lyricsplayerblock');

    // Кнопка нужна только в родном альбоме
    if (inMiniMode || !playerBlock) {
      setJumpVisible(false);
      if (jumpObserver) {
        try { jumpObserver.disconnect(); } catch {}
        jumpObserver = null;
      }
      return;
    }

    if (!('IntersectionObserver' in window)) {
      // Без observer — просто не показываем (безопасный fallback)
      setJumpVisible(false);
      return;
    }

    if (!jumpObserver) {
      jumpObserver = new IntersectionObserver((entries) => {
        const entry = entries && entries[0];
        if (!entry) return;

        const fullyOut = entry.intersectionRatio === 0;
        const stillNative = !isBrowsingOtherAlbum();
        setJumpVisible(fullyOut && stillNative);
      }, { threshold: [0] });
    }

    try { jumpObserver.disconnect(); } catch {}
    jumpObserver.observe(playerBlock);
  }

  // ✅ Debounce для предотвращения множественных вызовов
  let ensurePlayerBlockTimeout = null;

  function ensurePlayerBlock(trackIndex, options = {}) {
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
    const opts = options && typeof options === 'object' ? options : {};
    ensurePlayerBlockTimeout = setTimeout(() => {
      ensurePlayerBlockTimeout = null;
      _doEnsurePlayerBlock(trackIndex, opts);
    }, 50);
  }

  function _doEnsurePlayerBlock(trackIndex, options = {}) {
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

      // ✅ В мини-режиме автоскролл отключён по дизайну.

    } else {
      const trackList = document.getElementById('track-list');

      if (!trackList) {
        console.error('❌ #track-list not found!');
        return;
      }

      const trackRow = trackList.querySelector(`.track[data-index="${trackIndex}"]`);
      lastNativeTrackRow = trackRow || null;

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

      // ✅ Скроллим к играющему треку ТОЛЬКО по пользовательскому клику.
      if (options && options.userInitiated) {
        setTimeout(() => {
          trackRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
      }

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
    updateJumpObserver();
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
          <button class="lyrics-toggle-btn lyrics-${lyricsViewMode}" id="lyrics-toggle-btn" title="Режим лирики (Y)">
            <span class="lyrics-toggle-btn-visual">Т</span>
          </button>
          
          <button class="animation-btn" id="animation-btn" title="Анимация лирики (A)">A</button>
          
          <button class="karaoke-btn" id="lyrics-text-btn" title="Полный текст песни">📝</button>
          
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
    const idx = (typeof w.playerCore?.getIndex === 'function') ? w.playerCore.getIndex() : -1;

    if (Number.isFinite(idx) && idx >= 0) {
      ensurePlayerBlock(idx);
    }

    updateMiniHeader();
    updateNextUpLabel();

    if (w.PlayerState && typeof w.PlayerState.save === 'function') {
      w.PlayerState.save();
    }
  }

  function bindPlayerEvents(block) {
    if (!block || block.__eventsBound) return;
    block.__eventsBound = true;

    // 1) Делегирование кликов по кнопкам/ссылкам внутри блока
    block.addEventListener('click', (e) => {
      const t = e.target;
      const el = t?.closest?.('button, a');
      if (!el || !block.contains(el)) return;

      const id = el.id;

      switch (id) {
        case 'play-pause-btn':
          togglePlayPause();
          return;

        case 'prev-btn':
          w.playerCore?.prev();
          return;

        case 'next-btn':
          w.playerCore?.next();
          return;

        case 'stop-btn':
          w.playerCore?.stop();
          return;

        case 'repeat-btn':
          toggleRepeat();
          return;

        case 'shuffle-btn':
          toggleShuffle();
          return;

        case 'pq-btn':
          e.preventDefault();
          e.stopPropagation();
          togglePQ();
          return;

        case 'mute-btn':
          toggleMute();
          return;

        case 'lyrics-toggle-btn':
          toggleLyricsView();
          return;

        case 'animation-btn':
          toggleAnimation();
          return;

        case 'pulse-btn':
          togglePulse();
          return;

        case 'favorites-btn':
          e.preventDefault();
          e.stopPropagation();
          toggleFavoritesOnly();
          return;

        case 'sleep-timer-btn':
          w.SleepTimer?.show?.();
          return;

        case 'lyrics-text-btn':
          w.LyricsModal?.show?.();
          return;

        case 'track-download-btn': {
          const track = w.playerCore?.getCurrentTrack();
          if (!track || !track.src) {
            e.preventDefault();
            w.NotificationSystem?.error('Трек недоступен для скачивания');
            return;
          }
          return;
        }
      }
    });

    // 2) Volume: input остаётся отдельным (это не click)
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
        if (e && typeof e.clientX === 'number') setFromClientX(e.clientX);
      });

      volumeWrap.addEventListener('pointermove', (e) => {
        if (e && e.buttons === 1 && typeof e.clientX === 'number') setFromClientX(e.clientX);
      });
    }

    // 3) Seek: оставляем как было (pointer-based), но без лишних локальных переменных/мусора
    const progressBarEl = block.querySelector('#player-progress-bar');
    const seekControllerKey = '__seekAbortController';

    const addSeekDocumentListeners = () => {
      if (w[seekControllerKey]) return;

      const ctrl = new AbortController();
      w[seekControllerKey] = ctrl;

      const opts = { signal: ctrl.signal, passive: false };

      document.addEventListener('pointermove', handleSeeking, opts);
      document.addEventListener('pointerup', endSeek, opts);
      document.addEventListener('pointercancel', endSeek, opts);

      document.addEventListener('mousemove', handleSeeking, opts);
      document.addEventListener('mouseup', endSeek, opts);
      document.addEventListener('touchmove', handleSeeking, opts);
      document.addEventListener('touchend', endSeek, opts);
      document.addEventListener('touchcancel', endSeek, opts);
    };

    const removeSeekDocumentListeners = () => {
      const ctrl = w[seekControllerKey];
      if (!ctrl) return;
      try { ctrl.abort(); } catch {}
      w[seekControllerKey] = null;
    };

    const beginSeek = (ev) => {
      isSeekingProgress = true;
      addSeekDocumentListeners();
      handleSeeking(ev);
    };

    function endSeek() {
      isSeekingProgress = false;
      removeSeekDocumentListeners();
    }

    if (progressBarEl && !progressBarEl.__seekBound) {
      progressBarEl.__seekBound = true;

      progressBarEl.addEventListener('pointerdown', (ev) => {
        try { ev.preventDefault(); } catch {}
        beginSeek(ev);
      });

      progressBarEl.addEventListener('mousedown', beginSeek);
      progressBarEl.addEventListener('touchstart', beginSeek, { passive: true });
    }
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

  // ✅ Кэш DOM для тиков прогресса (уменьшаем getElementById на каждом onTick)
  const progressDom = {
    fill: null,
    elapsed: null,
    remaining: null
  };

  function cacheProgressDomIfNeeded() {
    // Если плеер-блок ещё не создан — нечего кэшировать
    const block = document.getElementById('lyricsplayerblock');
    if (!block) return;

    // Если уже закешировано и элементы всё ещё в DOM — оставляем
    if (progressDom.fill && progressDom.fill.isConnected &&
        progressDom.elapsed && progressDom.elapsed.isConnected &&
        progressDom.remaining && progressDom.remaining.isConnected) {
      return;
    }

    progressDom.fill = document.getElementById('player-progress-fill');
    progressDom.elapsed = document.getElementById('time-elapsed');
    progressDom.remaining = document.getElementById('time-remaining');
  }

  function updateProgress(position, duration) {
    if (isSeekingProgress) return;

    cacheProgressDomIfNeeded();

    const safeDuration = (typeof duration === 'number' && duration > 0) ? duration : 0;
    const percent = safeDuration ? (position / safeDuration) * 100 : 0;

    if (progressDom.fill) {
      progressDom.fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    }

    const fmt = w.Utils?.formatTime || ((s) => '--:--');

    if (progressDom.elapsed) {
      progressDom.elapsed.textContent = fmt(position);
    }
    if (progressDom.remaining) {
      progressDom.remaining.textContent = `-${fmt((safeDuration || 0) - (position || 0))}`;
    }
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

  function _isNetworkAvailable() {
    try {
      if (w.NetworkManager && typeof w.NetworkManager.getStatus === 'function') {
        return !!w.NetworkManager.getStatus().online;
      }
    } catch {}
    return navigator.onLine !== false;
  }

  function updatePQButton() {
    const btn = document.getElementById('pq-btn');
    const label = document.getElementById('pq-btn-label');
    if (!btn || !label) return;

    const mode = String(localStorage.getItem('qualityMode:v1') || w.playerCore?.getQualityMode?.() || 'hi')
      .toLowerCase() === 'lo'
      ? 'lo'
      : 'hi';

    const canToggleByTrack = !!w.playerCore?.canToggleQualityForCurrentTrack?.();
    const netOk = _isNetworkAvailable();

    // По ТЗ: если сеть недоступна — PQ disabled (даже если у трека есть Lo)
    const canToggle = canToggleByTrack && netOk;

    btn.classList.toggle('pq-hi', mode === 'hi');
    btn.classList.toggle('pq-lo', mode === 'lo');
    btn.classList.toggle('disabled', !canToggle);

    btn.setAttribute('aria-disabled', canToggle ? 'false' : 'true');
    btn.style.pointerEvents = canToggle ? '' : 'none';

    label.textContent = mode === 'lo' ? 'Lo' : 'Hi';
  }

  function togglePQ() {
    if (!w.playerCore) return;

    // По ТЗ: если сеть недоступна — не переключаем и показываем toast
    if (!_isNetworkAvailable()) {
      w.NotificationSystem?.warning('Нет доступа к сети');
      updatePQButton();
      return;
    }

    const canToggle = !!w.playerCore.canToggleQualityForCurrentTrack?.();
    if (!canToggle) {
      w.NotificationSystem?.info('Для этого трека Lo недоступно');
      updatePQButton();
      return;
    }

    const cur = String(localStorage.getItem('qualityMode:v1') || w.playerCore.getQualityMode?.() || 'hi')
      .toLowerCase() === 'lo'
      ? 'lo'
      : 'hi';

    const next = cur === 'hi' ? 'lo' : 'hi';
    w.playerCore.switchQuality(next);

    updatePQButton();
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
    // ✅ КРИТИЧНО: пульсация НЕ должна влиять на воспроизведение.
    // Для "такта" нужен реальный анализ => нужен WebAudio backend.
    // Поэтому:
    // 1) мягко переводим текущий Howl в WebAudio (html5:false) БЕЗ stop(),
    // 2) подключаем analyser к Howler.masterGain,
    // 3) если анализ невозможен — отключаем pulse (без синус-имитации).

    try {
      // Попробуем переключить backend без прерывания
      try {
        w.playerCore?.rebuildCurrentSound?.({ preferWebAudio: true });
      } catch {}

      if (w.Howler && w.Howler.ctx && w.Howler.masterGain) {
        if (!audioContext) audioContext = w.Howler.ctx;

        // Попробуем вывести ctx в running (не должно прерывать трек)
        if (audioContext && audioContext.state === 'suspended') {
          try { audioContext.resume(); } catch {}
        }

        if (!analyser) {
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.85;

          try {
            w.Howler.masterGain.connect(analyser);
          } catch {
            analyser = null;
          }
        }
      }
    } catch {
      analyser = null;
    }

    // Если analyser не поднялся — отключаем pulse (без синуса)
    if (!analyser) {
      bitEnabled = false;
      try { localStorage.setItem('bitEnabled', '0'); } catch {}

      const btn = document.getElementById('pulse-btn');
      const heart = document.getElementById('pulse-heart');
      if (btn) btn.classList.remove('active');
      if (heart) heart.textContent = '🤍';

      w.NotificationSystem?.warning('Пульсация недоступна: браузер/режим не даёт Web Audio анализ');
      return;
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
    
    // ✅ Никакой синус-имитации: либо реальный анализ, либо 0 (чтобы было честно)
    // Если analyser вдруг "ослеп" (например, ctx снова стал suspended) — просто не пульсируем.
    if (!analyser || !audioContext || audioContext.state !== 'running') {
      intensity = 0;
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

    const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.() || null;

    // Текущее состояние (единый источник — localStorage)
    const currentlyOn = (localStorage.getItem('favoritesOnlyMode') === '1');
    const nextOn = !currentlyOn;

    // === ВКЛЮЧЕНИЕ (OFF -> ON): проверяем доступность по ТЗ ===
    if (nextOn) {
      // Контекст: playing = __favorites__
      if (playingAlbum === w.SPECIAL_FAVORITES_KEY) {
        const model = Array.isArray(w.favoritesRefsModel) ? w.favoritesRefsModel : [];
        const hasActive = model.some(it => it && it.__active && it.audio);

        if (!hasActive) {
          // По ТЗ: если нет active — уведомление и F остаётся OFF
          w.NotificationSystem?.info('Отметьте понравившийся трек ⭐');
          btn.classList.remove('favorites-active');
          icon.src = 'img/star2.png';
          try { localStorage.setItem('favoritesOnlyMode', '0'); } catch {}
          favoritesOnlyMode = false;
          return;
        }
        // Есть active — можно включать (хотя набор и так active-only)
      } else if (playingAlbum && !String(playingAlbum).startsWith('__')) {
        // Контекст: playing = обычный альбом
        const liked = w.FavoritesManager?.getLikedUidsForAlbum?.(playingAlbum) || [];
        if (!Array.isArray(liked) || liked.length === 0) {
          w.NotificationSystem?.info('Отметьте понравившийся трек ⭐');
          btn.classList.remove('favorites-active');
          icon.src = 'img/star2.png';
          try { localStorage.setItem('favoritesOnlyMode', '0'); } catch {}
          favoritesOnlyMode = false;
          return;
        }
      } else {
        // Спец-разделы (__reliz__ и др.) — включать бессмысленно, но по ТЗ это “нет доступных”
        w.NotificationSystem?.info('Отметьте понравившийся трек ⭐');
        btn.classList.remove('favorites-active');
        icon.src = 'img/star2.png';
        try { localStorage.setItem('favoritesOnlyMode', '0'); } catch {}
        favoritesOnlyMode = false;
        return;
      }
    }

    // === Применяем состояние ===
    favoritesOnlyMode = nextOn;

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

    // Обновляем доступность (legacy fallback)
    updateAvailableTracksForPlayback();

    // Единая политика: перестройка playing-плейлиста под F+shuffle без STOP
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
      w.FavoritesManager.toggleLike(playingAlbum, uid, !isLiked, { source: 'mini' });
    } else {
      // В режиме __favorites__ лайк относится к исходному альбому трека
      const srcAlbum = String(track?.sourceAlbum || '').trim();
      if (!srcAlbum) return;

      const isLiked = !!w.FavoritesManager.isFavorite(srcAlbum, uid);
      w.FavoritesManager.toggleLike(srcAlbum, uid, !isLiked, { source: 'mini' });
    }

    updateMiniHeader();
  }

  // eco-btn удалён по ТЗ_Нью: PQ управляется отдельной кнопкой Hi/Lo.

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

  function isLyricsKnownMissingFast(lyricsUrl) {
    const url = String(lyricsUrl || '').trim();
    if (!url) return true;

    // 1) 404 cache
    if (isLyrics404Cached(url)) return true;

    // 2) sessionStorage cache marker
    try {
      const cacheKey = `lyrics_cache_${url}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed === null || parsed === '__NO_LYRICS__') return true;
      }
    } catch {
      // игнорируем ошибки парсинга
    }

    return false;
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
        container.innerHTML = `
          <div class="lyrics-countdown fade-out" style="opacity: ${remaining.toFixed(2)};">
            ${secondsLeft}
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="lyrics-countdown">
          ${secondsLeft}
        </div>
      `;
      return;
    }

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
      rows.push(`<div class="${cls}">${w.Utils?.escapeHtml ? w.Utils.escapeHtml(text) : String(text || '')}</div>`);
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

    // ✅ Применяем политику очереди на старте, если включён favoritesOnlyMode.
    // Важно: НЕ останавливаем воспроизведение (PlaybackPolicy + PlayerCore.setPlaylist работают “мягко”).
    try {
      if (favoritesOnlyMode && w.Utils?.waitFor) {
        w.Utils.waitFor(() => !!w.playerCore, 2000, 50).then(() => {
          try {
            if (w.PlaybackPolicy && typeof w.PlaybackPolicy.apply === 'function') {
              w.PlaybackPolicy.apply({ reason: 'init' });
            }
          } catch (e) {
            console.warn('PlaybackPolicy.apply(init) failed:', e);
          }
        });
      }
    } catch {}

    // PQ кнопка: синхронизируем состояние при старте (до первого onTrackChange)
    try { updatePQButton(); } catch {}

    console.log(`✅ Settings restored: lyrics=${lyricsViewMode}, animation=${animationEnabled}`);
  }

  // updateFavoriteClasses удалён: класс is-favorite сейчас не используется как источник логики,
  // звёзды и состояния синхронизируются через favorites:changed и прямые обновления DOM.

  // updateFavoriteClassesFavorites удалён: is-favorite не используется,
  // favorites-строки управляются классом .inactive и звёздами (realtime).

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

  // ========== ПУБЛИЧНЫЙ API ==========

  w.PlayerUI = {
    initialize: initPlayerUI,
    ensurePlayerBlock,
    updateMiniHeader,
    updateNextUpLabel,
    togglePlayPause,
    toggleLikePlaying,
    switchAlbumInstantly,
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

  w.toggleFavoritesOnly = toggleFavoritesOnly;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayerUI);
  } else {
    initPlayerUI();
  }

})();
