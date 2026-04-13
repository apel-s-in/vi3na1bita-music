// src/player-core/ios-audio-keeper.js
// Универсальный Audio Session Keeper:
// — iOS: тихий зацикленный файл + watchdog AudioContext + recovery
// — Android: MediaSession lockscreen + setCameraActive(false) для Chrome 120+

const SILENCE_URL = './audio/silence.mp3';
const ua = navigator.userAgent;
const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
const isAndroid = /Android/i.test(ua);
const isChrome = /Chrome\/(\d+)/.test(ua);
const chromeVer = isChrome ? Number(ua.match(/Chrome\/(\d+)/)?.[1] || 0) : 0;

let _el = null, _started = false, _bound = false;
let _watchdogInterval = null, _retryTimer = null, _retryCount = 0;
const MAX_RETRY = 5;

// ─── silence <audio> ────────────────────────────────────────────────────────
function _createEl() {
  if (_el) return _el;
  _el = document.createElement('audio');
  _el.src = SILENCE_URL;
  _el.loop = true;
  _el.volume = 0.001;
  _el.preload = 'auto';
  _el.setAttribute('playsinline', '');
  _el.setAttribute('webkit-playsinline', '');
  // Для надёжности переподключаемся при ошибке
  _el.onerror = () => {
    _started = false;
    _scheduleRetry();
  };
  return _el;
}

function _scheduleRetry() {
  if (_retryCount >= MAX_RETRY || !window.playerCore?.isPlaying?.()) return;
  clearTimeout(_retryTimer);
  const delay = Math.min(30000, 1000 * Math.pow(2, _retryCount));
  _retryCount++;
  _retryTimer = setTimeout(() => startKeeper(), delay);
}

export function startKeeper() {
  if (!isIOS) return;
  if (_started) return;
  const el = _createEl();
  el.play().then(() => {
    _started = true;
    _retryCount = 0;
  }).catch(() => {
    _started = false;
    _scheduleRetry();
  });
}

export function stopKeeper() {
  if (!isIOS || !_el) return;
  _started = false;
  clearTimeout(_retryTimer);
  _retryCount = 0;
  try { _el.pause(); _el.currentTime = 0; } catch {}
}

// ─── AudioContext recovery ────────────────────────────────────────────────────
function _resumeCtx() {
  const c = window.Howler?.ctx;
  if (c && (c.state === 'suspended' || c.state === 'interrupted')) {
    c.resume().catch(() => {});
  }
}

function _bindCtxWatcher() {
  const c = window.Howler?.ctx;
  if (c && !c._keeperWatching) {
    c._keeperWatching = true;
    c.addEventListener('statechange', () => {
      if (window.playerCore?.isPlaying?.()) _resumeCtx();
    });
  }
}

// ─── iOS watchdog — каждые 10 сек (быстрее чем было 25) ────────────────────
function _startWatchdog() {
  if (_watchdogInterval) return;
  _watchdogInterval = setInterval(() => {
    if (!window.playerCore?.isPlaying?.()) return;

    _resumeCtx();

    // Keeper упал — перезапускаем
    if (isIOS && _el && _el.paused && _started) {
      _el.play().catch(() => { _started = false; _scheduleRetry(); });
    }

    // iOS завис (звук не движется)
    if (isIOS) {
      const pc = window.playerCore;
      if (pc?.sound && !pc.sound.playing()) {
        const pos = pc.getPosition?.() || 0;
        setTimeout(() => {
          if (!window.playerCore?.isPlaying?.() && pc?.sound && !pc.sound.playing()) {
            try { pc.sound.seek(pos); pc.sound.play(); } catch {}
          }
        }, 600);
      }
    }
  }, 10000);
}

function _stopWatchdog() {
  if (_watchdogInterval) { clearInterval(_watchdogInterval); _watchdogInterval = null; }
}

// ─── Android: MediaSession lockscreen ────────────────────────────────────────
function _updateAndroidMediaSession() {
  if (!isAndroid) return;
  const ms = navigator.mediaSession;
  if (!ms) return;

  // Chrome 120+: отключаем запрос камеры для корректного отображения в шторке
  try {
    if (chromeVer >= 120 && typeof ms.setCameraActive === 'function') {
      ms.setCameraActive(false);
    }
  } catch {}

  const t = window.playerCore?.getCurrentTrack?.();
  if (!t) return;
  const art = String(t.cover || '').trim();

  try {
    ms.metadata = new MediaMetadata({
      title: t.title || 'Витрина Разбита',
      artist: t.artist || 'Витрина Разбита',
      album: t.album || '',
      artwork: art
        ? [96, 128, 192, 256, 384, 512].map(s => ({
            src: art,
            sizes: `${s}x${s}`,
            type: art.endsWith('.png') ? 'image/png' : 'image/jpeg'
          }))
        : []
    });
    ms.playbackState = 'playing';
  } catch {}
}

function _updateMediaSessionPaused() {
  const ms = navigator.mediaSession;
  if (!ms) return;
  try { ms.playbackState = 'paused'; } catch {}
}

// ─── Главная инициализация ────────────────────────────────────────────────────
export function initIosAudioKeeper() {
  if (_bound) return;
  _bound = true;

  window.addEventListener('player:play', () => {
    _bindCtxWatcher();
    _resumeCtx();
    if (isIOS) {
      startKeeper();
      _startWatchdog();
    }
    if (isAndroid || isIOS) _updateAndroidMediaSession();
  });

  window.addEventListener('player:pause', () => {
    _updateMediaSessionPaused();
  });

  window.addEventListener('player:stop', () => {
    if (isIOS) {
      stopKeeper();
      _stopWatchdog();
    }
    _updateMediaSessionPaused();
  });

  window.addEventListener('player:trackChanged', () => {
    if (isAndroid || isIOS) _updateAndroidMediaSession();
    if (isIOS) _resumeCtx();
  });

  // ── visibilitychange: главный recovery ─────────────────────────────────────
  let _lastPos = 0, _wasPlaying = false;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      _lastPos = window.playerCore?.getPosition?.() || 0;
      _wasPlaying = !!window.playerCore?.isPlaying?.();
      return;
    }

    // Вернулись в приложение
    _bindCtxWatcher();
    _resumeCtx();

    if (isIOS) {
      if (!_started && window.playerCore?.isPlaying?.()) startKeeper();

      if (_wasPlaying) {
        // Даём 500мс и проверяем — iOS мог заморозить
        setTimeout(() => {
          const pc = window.playerCore;
          if (!pc) return;
          if (!pc.isPlaying() || (pc.sound && !pc.sound.playing())) {
            const p = _lastPos || 0;
            try { if (pc.sound) { pc.sound.seek(p); pc.sound.play(); } } catch {}
          }
        }, 500);
      }
    }

    if ((isAndroid || isIOS) && _wasPlaying) {
      _updateAndroidMediaSession();
    }

    _wasPlaying = false;
  });

  // ── Сохраняем позицию каждые 4 сек ──────────────────────────────────────────
  setInterval(() => {
    if (window.playerCore?.isPlaying?.()) {
      _lastPos = window.playerCore.getPosition?.() || 0;
    }
  }, 4000);

  // ── Android: начальная установка setCameraActive ──────────────────────────
  if (isAndroid && chromeVer >= 120) {
    try {
      if (navigator.mediaSession && typeof navigator.mediaSession.setCameraActive === 'function') {
        navigator.mediaSession.setCameraActive(false);
      }
    } catch {}
  }
}

export default { initIosAudioKeeper, startKeeper, stopKeeper };
