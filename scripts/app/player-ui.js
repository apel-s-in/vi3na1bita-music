// scripts/app/player-ui.js
// UI плеера на новой платформе PlayerCore
// Инвариант: UI не должен вызывать stop()/форсить play()/сбрасывать позицию/громкость из-за новых фич.
// Lyrics полностью вынесены в scripts/app/player-ui/lyrics.js (window.LyricsController).

(function PlayerUIModule() {
  'use strict';

  const w = window;

  // ====== UI state (не лезем в playback) ======
  let isSeekingProgress = false;
  let isMuted = false;

  // Pulse (bit) визуализация
  let bitEnabled = false;
  let bitIntensity = 100;
  let audioContext = null;
  let analyser = null;
  let animationFrame = null;

  // Favorites-only mode
  let favoritesOnlyMode = false;

  // Mini-mode (когда играющий альбом != открытый)
  let isInContextMiniMode = false;
  let savedLyricsStateForMini = null;

  // Jump-to-playing (кнопка-стрелка в родном альбоме)
  let jumpBtnWrap = null;
  let jumpObserver = null;
  let lastNativeTrackRow = null;

  // Debounce ensurePlayerBlock
  let ensurePlayerBlockTimeout = null;

  // ====== Init ======
  function initPlayerUI() {
    // Защита от повторной инициализации (например, при повторном выполнении скрипта из-за кеша/SW)
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

    // Realtime sync лайков: обновляем UI и пересчитываем доступные индексы/очередь без остановки музыки
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

    // Network-aware PQ: обновляем кнопку при смене сети/типа соединения
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
        w.LyricsController?.onTick?.(position, { inMiniMode: isInContextMiniMode });

        // ✅ Статистика считается в src/PlayerCore.js (единая точка для секунд и full listen).
        // PlayerUI не должен дублировать, иначе будет двойной учёт.
      },
      onEnd: () => {
        // ✅ Full listen также считается в src/PlayerCore.js с правилом progress>0.9.
        updatePlayPauseIcon();
      }
    });
  }

  function onTrackChange(track, index) {
    if (!track) return;

    // Сброс счетчика статистики для нового трека (если где-то использовался)
    w.__lastStatsSec = -1;

    w.AlbumsManager?.highlightCurrentTrack?.(index);

    ensurePlayerBlock(index);

    // ✅ Lyrics: делегируем контроллеру
    try { w.LyricsController?.onTrackChange?.(track); } catch {}

    // ✅ Обновляем доступность кнопки "📝" (полный текст) в зависимости от fulltext.
    // ВАЖНО: не блокируем навсегда — LyricsController сам включит кнопку, если есть timed lyrics.
    const karaokeBtn = document.getElementById('lyrics-text-btn');
    if (karaokeBtn) {
      const hasFulltext = !!(track && track.fulltext);
      if (!hasFulltext) {
        karaokeBtn.classList.add('disabled');
        karaokeBtn.style.pointerEvents = 'none';
        karaokeBtn.style.opacity = '0.4';
      } else {
        karaokeBtn.classList.remove('disabled');
        karaokeBtn.style.pointerEvents = '';
        karaokeBtn.style.opacity = '';
      }
    }

    // Download
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

  // ====== Context helpers ======
  function isBrowsingOtherAlbum() {
    const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.();
    const currentAlbum = w.AlbumsManager?.getCurrentAlbum?.();

    if (!playingAlbum) return false;
    if (playingAlbum === '__favorites__' && currentAlbum === '__favorites__') return false;

    return playingAlbum !== currentAlbum;
  }

  // ====== Jump-to-playing ======
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

      try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
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

  // ====== Player block placement ======
  function ensurePlayerBlock(trackIndex, options = {}) {
    if (typeof trackIndex !== 'number' || trackIndex < 0 || !Number.isFinite(trackIndex)) {
      console.warn('⚠️ ensurePlayerBlock called with invalid trackIndex:', trackIndex);
      return;
    }

    if (ensurePlayerBlockTimeout) clearTimeout(ensurePlayerBlockTimeout);

    const opts = options && typeof options === 'object' ? options : {};
    ensurePlayerBlockTimeout = setTimeout(() => {
      ensurePlayerBlockTimeout = null;
      _doEnsurePlayerBlock(trackIndex, opts);
    }, 50);
  }

  function _doEnsurePlayerBlock(trackIndex, options = {}) {
    if (typeof trackIndex !== 'number' || trackIndex < 0 || !Number.isFinite(trackIndex)) {
      console.warn('⚠️ _doEnsurePlayerBlock: invalid trackIndex', trackIndex);
      return;
    }

    let playerBlock = document.getElementById('lyricsplayerblock');
    if (!playerBlock) playerBlock = createPlayerBlock();

    const inMiniMode = isBrowsingOtherAlbum();
    isInContextMiniMode = inMiniMode;

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

      if (!isInContextMiniMode) {
        // (на практике сюда не попадём из-за isInContextMiniMode=inMiniMode выше, но оставим на всякий случай)
        savedLyricsStateForMini = w.LyricsController?.getMiniSaveState?.() || null;
      } else if (savedLyricsStateForMini === null) {
        savedLyricsStateForMini = w.LyricsController?.getMiniSaveState?.() || null;
      }

      w.LyricsController?.applyMiniMode?.();

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

      // В мини-режиме автоскролл отключён по дизайну.
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
        if (!playerBlock.parentNode) trackList.appendChild(playerBlock);
        return;
      }

      if (!playerBlock.parentNode) {
        if (trackRow.nextSibling) trackRow.parentNode.insertBefore(playerBlock, trackRow.nextSibling);
        else trackRow.parentNode.appendChild(playerBlock);
      } else if (trackRow.nextSibling !== playerBlock) {
        if (trackRow.nextSibling) trackRow.parentNode.insertBefore(playerBlock, trackRow.nextSibling);
        else trackRow.parentNode.appendChild(playerBlock);
      }

      // Скроллим к играющему треку ТОЛЬКО по пользовательскому клику.
      if (options && options.userInitiated) {
        setTimeout(() => {
          try { trackRow.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
        }, 50);
      }

      w.LyricsController?.restoreFromMiniMode?.(savedLyricsStateForMini);
      savedLyricsStateForMini = null;

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

  // ====== DOM creation ======
  function createPlayerBlock() {
    const block = document.createElement('div');
    block.className = 'lyrics-player-block';
    block.id = 'lyricsplayerblock';

    const ls = w.LyricsController?.getState?.() || { lyricsViewMode: 'normal', animationEnabled: false };

    block.innerHTML = `
      <div id="lyrics-window" class="lyrics-${ls.lyricsViewMode}">
        <div class="lyrics-animated-bg${ls.animationEnabled ? ' active' : ''}"></div>
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
          <button class="lyrics-toggle-btn lyrics-${ls.lyricsViewMode}" id="lyrics-toggle-btn" title="Режим лирики (Y)">
            <span class="lyrics-toggle-btn-visual">Т</span>
          </button>

          <button class="animation-btn" id="animation-btn" title="Анимация лирики (A)">A</button>

          <button class="karaoke-btn" id="lyrics-text-btn" title="Полный текст песни">📝</button>

          <button class="stats-btn" id="stats-btn" title="Статистика" style="background:none; border:none; cursor:pointer; font-size:18px; opacity:0.8; padding:0 8px;">📊</button>

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
        w.AlbumsManager?.loadAlbum?.(playingKey);
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

  // ====== Mini header + Next up ======
  function updateMiniHeader() {
    const header = document.getElementById('mini-now');
    if (!header) return;

    const inMiniMode = isBrowsingOtherAlbum();
    if (!inMiniMode) {
      header.style.display = 'none';
      return;
    }

    const track = w.playerCore?.getCurrentTrack?.();
    const index = w.playerCore?.getIndex?.();

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
          isLiked = !!w.FavoritesManager.isFavorite?.(playingAlbum, uid);
        } else {
          // В режиме __favorites__ лайк относится к исходному альбому трека
          const srcAlbum = String(track?.sourceAlbum || '').trim();
          if (srcAlbum) {
            isLiked = !!w.FavoritesManager.isFavorite?.(srcAlbum, uid);
          } else {
            // fallback: если sourceAlbum не проставлен — попробуем найти в favoritesRefsModel
            const ref = Array.isArray(w.favoritesRefsModel)
              ? w.favoritesRefsModel.find(it => String(it?.__uid || '').trim() === uid)
              : null;
            if (ref) {
              isLiked = !!w.FavoritesManager.isFavorite?.(ref.__a, uid);
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

  function switchAlbumInstantly(newAlbumKey) {
    // оставлено как в текущей логике (не используем newAlbumKey здесь)
    const idx = (typeof w.playerCore?.getIndex === 'function') ? w.playerCore.getIndex() : -1;
    if (Number.isFinite(idx) && idx >= 0) ensurePlayerBlock(idx);

    updateMiniHeader();
    updateNextUpLabel();

    if (w.PlayerState && typeof w.PlayerState.save === 'function') {
      w.PlayerState.save();
    }
  }

  // ====== Bind events ======
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
          w.playerCore?.prev?.();
          return;

        case 'next-btn':
          w.playerCore?.next?.();
          return;

        case 'stop-btn':
          w.playerCore?.stop?.();
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
          w.LyricsController?.toggleLyricsView?.();
          return;

        case 'animation-btn':
          w.LyricsController?.toggleAnimation?.();
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

        case 'stats-btn':
          w.StatisticsModal?.show?.();
          return;

        case 'track-download-btn': {
          const track = w.playerCore?.getCurrentTrack?.();
          if (!track || !track.src) {
            e.preventDefault();
            w.NotificationSystem?.error?.('Трек недоступен для скачивания');
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

    // 3) Seek
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

  // ====== Playback controls ======
  function togglePlayPause() {
    if (!w.playerCore) return;
    if (w.playerCore.isPlaying?.()) w.playerCore.pause?.();
    else w.playerCore.play?.();
  }

  function updatePlayPauseIcon() {
    const icon = document.getElementById('play-pause-icon');
    if (!icon || !w.playerCore) return;

    if (w.playerCore.isPlaying?.()) {
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

    const duration = w.playerCore.getDuration?.() || 0;
    w.playerCore.seek?.(duration * percent);
  }

  // ====== Progress UI ======
  const progressDom = { fill: null, elapsed: null, remaining: null };

  function cacheProgressDomIfNeeded() {
    const block = document.getElementById('lyricsplayerblock');
    if (!block) return;

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

    if (progressDom.fill) progressDom.fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;

    const fmt = w.Utils?.formatTime || (() => '--:--');

    if (progressDom.elapsed) progressDom.elapsed.textContent = fmt(position);
    if (progressDom.remaining) progressDom.remaining.textContent = `-${fmt((safeDuration || 0) - (position || 0))}`;
  }

  // ====== Volume UI ======
  function renderVolumeUI(value) {
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    const p = v / 100;

    const fill = document.getElementById('volume-fill');
    const handle = document.getElementById('volume-handle');
    const track = document.getElementById('volume-track');

    if (fill) fill.style.width = `${p * 100}%`;

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

    w.playerCore?.setVolume?.(v);

    requestAnimationFrame(() => { renderVolumeUI(v); });

    try { localStorage.setItem('playerVolume', String(v)); } catch {}
  }

  // ====== PQ (Hi/Lo) ======
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
      .toLowerCase() === 'lo' ? 'lo' : 'hi';

    const canToggleByTrack = !!w.playerCore?.canToggleQualityForCurrentTrack?.();
    const netOk = _isNetworkAvailable();

    // По ТЗ: если сеть недоступна — PQ disabled (даже если у трека есть Lo)
    const canToggle = canToggleByTrack && netOk;

    btn.classList.toggle('pq-hi', mode === 'hi');
    btn.classList.toggle('pq-lo', mode === 'lo');
    btn.classList.toggle('disabled', !canToggle);

    btn.setAttribute('aria-disabled', canToggle ? 'false' : 'true');
    // По ТЗ 7.5.1: не отключаем pointer-events — нужен toast по клику.
    btn.style.pointerEvents = '';

    label.textContent = mode === 'lo' ? 'Lo' : 'Hi';
  }

  function togglePQ() {
    if (!w.playerCore) return;

    if (!_isNetworkAvailable()) {
      w.NotificationSystem?.warning?.('Нет доступа к сети');
      updatePQButton();
      return;
    }

    const canToggle = !!w.playerCore.canToggleQualityForCurrentTrack?.();
    if (!canToggle) {
      w.NotificationSystem?.info?.('Для этого трека Lo недоступно');
      updatePQButton();
      return;
    }

    const cur = String(localStorage.getItem('qualityMode:v1') || w.playerCore.getQualityMode?.() || 'hi')
      .toLowerCase() === 'lo' ? 'lo' : 'hi';

    const next = cur === 'hi' ? 'lo' : 'hi';
    w.playerCore.switchQuality?.(next);

    updatePQButton();
  }

  // ====== Repeat/Shuffle/Mute ======
  function toggleMute() {
    if (!w.playerCore) return;

    isMuted = !isMuted;
    w.playerCore.setMuted?.(isMuted);

    const btn = document.getElementById('mute-btn');
    if (btn) btn.classList.toggle('active', isMuted);
  }

  function toggleRepeat() {
    if (!w.playerCore) return;

    w.playerCore.toggleRepeat?.();
    const btn = document.getElementById('repeat-btn');
    if (btn) btn.classList.toggle('active', !!w.playerCore.isRepeat?.());
  }

  function toggleShuffle() {
    if (!w.playerCore) return;

    w.playerCore.toggleShuffle?.();

    const btn = document.getElementById('shuffle-btn');
    if (btn) btn.classList.toggle('active', !!w.playerCore.isShuffle?.());

    // После смены shuffle пересчитаем политику очереди (favoritesOnly + shuffle)
    if (w.PlaybackPolicy && typeof w.PlaybackPolicy.apply === 'function') {
      w.PlaybackPolicy.apply({ reason: 'toggle' });
    }

    updateAvailableTracksForPlayback();
  }

  // ====== Pulse (bit) ======
  function togglePulse() {
    bitEnabled = !bitEnabled;
    try { localStorage.setItem('bitEnabled', bitEnabled ? '1' : '0'); } catch {}

    const btn = document.getElementById('pulse-btn');
    const heart = document.getElementById('pulse-heart');

    if (btn) btn.classList.toggle('active', bitEnabled);
    if (heart) heart.textContent = bitEnabled ? '❤️' : '🤍';

    if (bitEnabled) startBitEffect();
    else stopBitEffect();
  }

  function startBitEffect() {
    // КРИТИЧНО: пульсация НЕ должна влиять на воспроизведение.
    // Реальный анализ => WebAudio backend. Пытаемся “мягко” перевести в WebAudio.
    try {
      try { w.playerCore?.rebuildCurrentSound?.({ preferWebAudio: true }); } catch {}

      if (w.Howler && w.Howler.ctx && w.Howler.masterGain) {
        if (!audioContext) audioContext = w.Howler.ctx;

        if (audioContext && audioContext.state === 'suspended') {
          try { audioContext.resume(); } catch {}
        }

        if (!analyser) {
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.85;

          try { w.Howler.masterGain.connect(analyser); } catch { analyser = null; }
        }
      }
    } catch {
      analyser = null;
    }

    if (!analyser) {
      bitEnabled = false;
      try { localStorage.setItem('bitEnabled', '0'); } catch {}

      const btn = document.getElementById('pulse-btn');
      const heart = document.getElementById('pulse-heart');
      if (btn) btn.classList.remove('active');
      if (heart) heart.textContent = '🤍';

      w.NotificationSystem?.warning?.('Пульсация недоступна: браузер/режим не даёт Web Audio анализ');
      return;
    }

    animateBit();
  }

  function animateBit() {
    if (!bitEnabled) return;

    let intensity = 0;

    if (analyser && audioContext && audioContext.state === 'running') {
      try {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);

        const bassRange = Math.floor(dataArray.length * 0.3);
        let bassSum = 0;
        for (let i = 0; i < bassRange; i++) bassSum += dataArray[i];
        const bassAvg = bassSum / bassRange;

        intensity = (bassAvg / 255) * (bitIntensity / 100);
      } catch {
        intensity = 0;
      }
    }

    if (!analyser || !audioContext || audioContext.state !== 'running') intensity = 0;

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
      logo.style.transition = 'transform 0.3s ease-out';
      logo.style.transform = 'scale(1)';
      setTimeout(() => { if (logo) logo.style.transition = ''; }, 300);
    }

    // Не трогаем Howler.ctx/masterGain. Просто сбрасываем analyser.
    analyser = null;
  }

  // ====== Favorites-only ======
  function toggleFavoritesOnly() {
    const btn = document.getElementById('favorites-btn');
    const icon = document.getElementById('favorites-btn-icon');
    if (!btn || !icon) return;

    const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.() || null;

    const currentlyOn = (localStorage.getItem('favoritesOnlyMode') === '1');
    const nextOn = !currentlyOn;

    // ВКЛЮЧЕНИЕ (OFF -> ON): проверяем доступность по ТЗ
    if (nextOn) {
      if (playingAlbum === w.SPECIAL_FAVORITES_KEY) {
        const model = Array.isArray(w.favoritesRefsModel) ? w.favoritesRefsModel : [];
        const hasActive = model.some(it => it && it.__active && it.audio);

        if (!hasActive) {
          w.NotificationSystem?.info?.('Отметьте понравившийся трек ⭐');
          btn.classList.remove('favorites-active');
          icon.src = 'img/star2.png';
          try { localStorage.setItem('favoritesOnlyMode', '0'); } catch {}
          favoritesOnlyMode = false;
          return;
        }
      } else if (playingAlbum && !String(playingAlbum).startsWith('__')) {
        const liked = w.FavoritesManager?.getLikedUidsForAlbum?.(playingAlbum) || [];
        if (!Array.isArray(liked) || liked.length === 0) {
          w.NotificationSystem?.info?.('Отметьте понравившийся трек ⭐');
          btn.classList.remove('favorites-active');
          icon.src = 'img/star2.png';
          try { localStorage.setItem('favoritesOnlyMode', '0'); } catch {}
          favoritesOnlyMode = false;
          return;
        }
      } else {
        w.NotificationSystem?.info?.('Отметьте понравившийся трек ⭐');
        btn.classList.remove('favorites-active');
        icon.src = 'img/star2.png';
        try { localStorage.setItem('favoritesOnlyMode', '0'); } catch {}
        favoritesOnlyMode = false;
        return;
      }
    }

    favoritesOnlyMode = nextOn;

    if (favoritesOnlyMode) {
      btn.classList.add('favorites-active');
      icon.src = 'img/star.png';
      w.NotificationSystem?.success?.('⭐ Только избранные треки');
    } else {
      btn.classList.remove('favorites-active');
      icon.src = 'img/star2.png';
      w.NotificationSystem?.info?.('Играют все треки');
    }

    try { localStorage.setItem('favoritesOnlyMode', favoritesOnlyMode ? '1' : '0'); } catch {}

    updateAvailableTracksForPlayback();

    if (w.PlaybackPolicy && typeof w.PlaybackPolicy.apply === 'function') {
      w.PlaybackPolicy.apply({ reason: 'toggle' });
    }
  }

  function toggleLikePlaying() {
    const playingAlbum = w.AlbumsManager?.getPlayingAlbum?.();
    const track = w.playerCore?.getCurrentTrack?.();

    if (!playingAlbum || !track || !w.FavoritesManager) return;

    const uid = String(track?.uid || '').trim();
    if (!uid) return;

    if (playingAlbum !== w.SPECIAL_FAVORITES_KEY) {
      const isLiked = !!w.FavoritesManager.isFavorite?.(playingAlbum, uid);
      w.FavoritesManager.toggleLike?.(playingAlbum, uid, !isLiked, { source: 'mini' });
    } else {
      const srcAlbum = String(track?.sourceAlbum || '').trim();
      if (!srcAlbum) return;

      const isLiked = !!w.FavoritesManager.isFavorite?.(srcAlbum, uid);
      w.FavoritesManager.toggleLike?.(srcAlbum, uid, !isLiked, { source: 'mini' });
    }

    updateMiniHeader();
  }

  // ====== Restore settings ======
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

    // Громкость: если первый запуск/очистка — ставим 50%.
    let volume = 50;
    const savedVolume = localStorage.getItem('playerVolume');

    if (savedVolume !== null) {
      const v = parseInt(savedVolume, 10);
      if (Number.isFinite(v)) volume = v;
    } else {
      try { localStorage.setItem('playerVolume', String(volume)); } catch {}
    }

    w.playerCore?.setVolume?.(volume);

    const volumeSlider = document.getElementById('volume-slider');
    if (volumeSlider) volumeSlider.value = String(volume);
    renderVolumeUI(volume);

    // Lyrics state/DOM восстановление делает LyricsController
    try { w.LyricsController?.restoreSettingsIntoDom?.(); } catch {}

    const savedBit = localStorage.getItem('bitEnabled');
    bitEnabled = savedBit === '1';
    if (bitEnabled) setTimeout(startBitEffect, 1000);

    const heart = document.getElementById('pulse-heart');
    if (heart) heart.textContent = bitEnabled ? '❤️' : '🤍';

    // Применяем политику очереди на старте, если включён favoritesOnlyMode.
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

    console.log('✅ Settings restored');
  }

  // ====== Legacy availability list (fallback) ======
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
      if (!likedUids.length) {
        w.availableFavoriteIndices = null;
        return;
      }

      w.availableFavoriteIndices = [];
      snapshot.forEach((track, idx) => {
        const uid = String(track?.uid || '').trim();
        if (uid && likedUids.includes(uid)) w.availableFavoriteIndices.push(idx);
      });
    } else {
      w.availableFavoriteIndices = null;
    }
  }

  // ====== Public API ======
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
      return w.LyricsController?.getCurrentLyrics?.() || [];
    },
    get currentLyricsLines() {
      return w.LyricsController?.getCurrentLyricsLines?.() || [];
    }
  };

  w.toggleFavoritesOnly = toggleFavoritesOnly;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayerUI);
  } else {
    initPlayerUI();
  }
})();
