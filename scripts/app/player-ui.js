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
      if (e.target.i
