// scripts/app/player-controls.js
// Управление интерфейсом плеера - ТОЛЬКО PlayerCore

(function() {
  'use strict';

  let isInitialized = false;

  function init() {
    if (isInitialized) return;
    if (!window.playerCore) {
      console.warn('PlayerCore not ready, retrying...');
      setTimeout(init, 200);
      return;
    }

    isInitialized = true;

    // Подписка на события плеера
    subscribeToPlayerEvents();

    // Обновление UI при переключении треков
    window.playerCore.on('trackChanged', updateNowPlaying);
    window.playerCore.on('play', updatePlayState);
    window.playerCore.on('pause', updatePlayState);
    window.playerCore.on('stop', clearNowPlaying);

    console.log('✅ Player controls initialized');
  }

  function subscribeToPlayerEvents() {
    // Обновление текущего трека
    window.playerCore.on('trackChanged', (data) => {
      updateCurrentTrackInList(data.index);
      updateNowPlaying(data);
    });

    // Обновление прогресса
    window.playerCore.on('progress', (data) => {
      updateProgressDisplay(data);
    });

    // Ошибки
    window.playerCore.on('error', (error) => {
      console.error('Player error:', error);
      window.NotificationSystem?.error('Ошибка воспроизведения');
    });
  }

  function updateNowPlaying(data) {
    const container = document.getElementById('now-playing');
    if (!container) return;

    const track = data.track;
    if (!track) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div class="mini-now">
        <div class="tnum">${track.trackNumber || '—'}</div>
        <div class="track-title">${track.title || 'Неизвестный трек'}</div>
        <button class="mini-play-pause" aria-label="Воспроизведение/Пауза">
          ${window.playerCore.isPlaying() ? '⏸' : '▶'}
        </button>
      </div>
    `;

    // Обработчик кнопки play/pause
    const playPauseBtn = container.querySelector('.mini-play-pause');
    playPauseBtn?.addEventListener('click', () => {
      if (window.playerCore.isPlaying()) {
        window.playerCore.pause();
      } else {
        window.playerCore.play();
      }
    });

    // Показать следующий трек (если есть)
    const nextTrack = window.playerCore.getNextTrack();
    showNextUp(nextTrack);
  }

  function showNextUp(nextTrack) {
    let nextUpEl = document.querySelector('.next-up');
    
    if (!nextTrack) {
      if (nextUpEl) nextUpEl.style.display = 'none';
      return;
    }

    if (!nextUpEl) {
      const container = document.getElementById('now-playing');
      if (!container) return;

      nextUpEl = document.createElement('div');
      nextUpEl.className = 'next-up';
      container.appendChild(nextUpEl);
    }

    nextUpEl.innerHTML = `
      <span class="label">Следующий:</span>
      <span class="title">${nextTrack.title}</span>
    `;
    nextUpEl.style.display = 'flex';
  }

  function clearNowPlaying() {
    const container = document.getElementById('now-playing');
    if (container) {
      container.innerHTML = '';
    }
  }

  function updatePlayState() {
    const playPauseBtn = document.querySelector('.mini-play-pause');
    if (playPauseBtn) {
      playPauseBtn.textContent = window.playerCore.isPlaying() ? '⏸' : '▶';
    }
  }

  function updateCurrentTrackInList(index) {
    // Снять подсветку со всех треков
    document.querySelectorAll('.track').forEach(t => {
      t.classList.remove('current');
    });

    // Подсветить текущий
    const currentTrack = document.querySelector(`.track[data-index="${index}"]`);
    if (currentTrack) {
      currentTrack.classList.add('current');
      
      // Прокрутить к треку
      currentTrack.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'nearest' 
      });
    }
  }

  function updateProgressDisplay(data) {
    // Можно добавить прогресс-бар если нужен
    // Пока просто логируем
    // console.log('Progress:', data.percent.toFixed(1) + '%');
  }

  // Глобальные клавиши управления
  function setupGlobalHotkeys() {
    document.addEventListener('keydown', (e) => {
      if (!window.playerCore) return;

      // Игнорировать если фокус в input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      switch(e.code) {
        case 'Space':
          e.preventDefault();
          if (window.playerCore.isPlaying()) {
            window.playerCore.pause();
          } else {
            window.playerCore.play();
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          window.playerCore.previous();
          break;

        case 'ArrowDown':
          e.preventDefault();
          window.playerCore.next();
          break;

        case 'KeyM':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            window.playerCore.toggleMute();
          }
          break;
      }
    });
  }

  // Автостарт
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      setupGlobalHotkeys();
    });
  } else {
    init();
    setupGlobalHotkeys();
  }
})();
