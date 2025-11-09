// scripts/core/bridge.js (ESM)
// Централизованный мост PlayerCore ↔ UI. Создаёт playerCore,
// вешает обработчики событий, особенно onTick для обновления UI без отдельного setInterval.

// Импорт ядра
import { PlayerCore } from '../src/PlayerCore.js';

// Безопасные геттеры глобальных настроек троттлинга
function uiThrottleMs() {
  const v = Number(window.__uiUpdateMinIntervalMs || 1000);
  return Number.isFinite(v) ? Math.max(100, v) : 1000;
}
function progressThrottleMs() {
  const v = Number(window.__progressThrottleMs || 1000);
  return Number.isFinite(v) ? Math.max(100, v) : 1000;
}

// Проброс блокировки экрана/ресурсов (WakeLock/WebLocks)
async function setPlaybackLocksActive(active) {
  try {
    if (window.Energy && typeof window.Energy.setPlaybackLocks === 'function') {
      await window.Energy.setPlaybackLocks(!!active);
    } else if (typeof window.setPlaybackLocks === 'function') {
      await window.setPlaybackLocks(!!active);
    }
  } catch {}
}

// «Мягкие» вызовы глобальных функций (если объявлены)
function call(fnName, ...args) {
  try {
    const fn = window[fnName];
    if (typeof fn === 'function') return fn(...args);
  } catch {}
}

// Создание и (однократная) инициализация моста
(function installCoreBridgeOnce() {
  if (window.__pcBridgeInstalled) return;

  // Инициализируем PlayerCore, если нет
  if (!window.playerCore) {
    window.playerCore = new PlayerCore();
  }
  const pc = window.playerCore;

  // Внутренние отметки троттлинга для onTick
  let lastUiTs = 0;
  let lastProgressTs = 0;
  let lastLyricsIdx = -1;
  let lastLyricsTs = 0;

  // Обновление лирики с собственным троттлингом (eco/ultra‑eco)
  function updateLyrics(posSec) {
    try {
      // Если у приложения есть «умный» рендер — используем его
      if (typeof window.renderLyricsEnhanced === 'function') {
        // Её собственный троттлинг уже внутри функции — просто вызываем
        window.renderLyricsEnhanced(posSec);
        return;
      }

      // Иначе — простейшая подстановка окна строк (не трогаем состояние, если нет данных)
      if (!Array.isArray(window.currentLyrics) || window.currentLyrics.length === 0) return;

      const baseInterval = 250; // как в прежней версии
      const ecoInterval = (window.ultraEcoEnabled || document.hidden)
        ? Math.max(500, uiThrottleMs())
        : baseInterval;

      // Определяем активный индекс по времени
      let idx = 0;
      for (let i = 0; i < window.currentLyrics.length; i++) {
        if (posSec >= window.currentLyrics[i].time) idx = i;
        else break;
      }
      const now = performance.now();
      if (idx === lastLyricsIdx && (now - lastLyricsTs) < ecoInterval) return;
      lastLyricsIdx = idx;
      lastLyricsTs = now;

      // Если есть базовый рендер — используем его
      if (typeof window.renderLyrics === 'function') {
        window.renderLyrics(posSec);
      }
    } catch {}
  }

  // Единая функция обновления прогресса/времени
  function updateTimeAndProgress(pos, dur) {
    try {
      const now = Date.now();

      // Прогресс — отдельный троттлинг
      if ((now - lastProgressTs) >= progressThrottleMs()) {
        lastProgressTs = now;
        const fill = document.getElementById('player-progress-fill');
        if (fill && dur > 0) {
          fill.style.width = `${(pos / dur) * 100}%`;
        }
      }

      // Таймеры — свой троттлинг
      if ((now - lastUiTs) >= uiThrottleMs()) {
        lastUiTs = now;
        const elapsedEl = document.getElementById('time-elapsed');
        const remainingEl = document.getElementById('time-remaining');
        const fmt = (typeof window.formatTime === 'function')
          ? window.formatTime
          : (s) => {
              if (!Number.isFinite(s) || s < 0) return '--:--';
              const m = Math.floor(s / 60);
              const sec = Math.floor(s % 60);
              return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
            };
        if (elapsedEl) elapsedEl.textContent = fmt(pos);
        if (remainingEl) remainingEl.textContent = fmt(Math.max(0, (dur || 0) - (pos || 0)));
      }
    } catch {}
  }

  // Префетч текущего трека (через SW)
  function prefetchCurrentTrack(track) {
    try {
      if (!track || !track.src) return;
      if (!('serviceWorker' in navigator)) return;
      const ctl = navigator.serviceWorker.controller;
      if (!ctl) return;
      ctl.postMessage({ type: 'PREFETCH_AUDIO', url: track.src });
    } catch {}
  }

  // Полная подписка событий
  function bindEvents() {
    pc.on({
      onPlay: () => {
        call('updatePlayPauseIcon');
        setPlaybackLocksActive(true);
      },
      onPause: () => {
        call('updatePlayPauseIcon');
        setPlaybackLocksActive(false);
      },
      onStop: () => {
        call('updatePlayPauseIcon');
        setPlaybackLocksActive(false);
      },
      onTrackChange: (track, idx) => {
        try {
          // Синхронизация курсоров UI
          window.playingTrack = idx;
          window.currentTrack = idx;
          window.playingAlbumKey = window.currentAlbumKey || window.playingAlbumKey || null;

          // Убедимся, что контейнер слота плеера присутствует
          const holder = document.getElementById('now-playing');
          if (holder && !document.getElementById('lyricsplayerblock')) {
            holder.innerHTML = '<div class="lyrics-player-block" id="lyricsplayerblock"></div>';
          }

          // Лирика
          if (track && track.lyrics && typeof window.loadLyrics === 'function') {
            window.loadLyrics(track.lyrics);
          }

          // Перерисовка блока плеера (если нужно) и подсветки
          call('renderLyricsBlock');
          call('updateMiniNowHeader');
          call('updateNextUpLabel');
          call('updatePlayPauseIcon');

          // Префетч текущего трека
          prefetchCurrentTrack(track);
        } catch {}
      },
      onTick: (pos, dur) => {
        try {
          // Централизованный onTick: время/прогресс/лирика
          updateLyrics(pos || 0);
          updateTimeAndProgress(pos || 0, dur || 0);

          // При желании можно разово подсинхронизировать UI
          if (typeof window.updateUiFromCoreOnce === 'function') {
            // Небольшая оптимизация: разово дёргаем пореже
            // Здесь не вызываем, т.к. updateTimeAndProgress уже сделал нужное
          }
        } catch {}
      },
      onSleepTriggered: () => {
        call('hideSleepOverlay');
        call('updateSleepTimerUI');
        if (window.NotificationSystem && window.NotificationSystem.info) {
          window.NotificationSystem.info('Таймер сна: воспроизведение остановлено');
        }
      }
    });
  }

  // Совместимость: если где-то вызывают window.__initPlayerCoreBindings — предоставим её
  window.__initPlayerCoreBindings = () => {
    // Ставим подписки повторно безопасно: pc.on просто перетрёт ссылки, это ок
    bindEvents();
  };

  // Первичная инициализация
  bindEvents();

  // Маркёр установлен
  window.__pcBridgeInstalled = true;
})();
