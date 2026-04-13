// src/player-core/ios-audio-keeper.js
// Универсальный Audio Session Keeper:
// — iOS: тихий зацикленный файл + watchdog AudioContext
// — Android: поддержка фонового воспроизведения через MediaSession + AudioFocus hint
// Не влияет на Howler/PlayerCore playback.

const SILENCE_URL = './audio/silence.mp3';
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isAndroid = /Android/i.test(navigator.userAgent);

let _el = null, _started = false, _bound = false;
let _watchdogInterval = null;

// ─── Создаём <audio> для iOS silence keeper ─────────────────────────────────
function _createEl() {
  if (_el) return _el;
  _el = document.createElement('audio');
  _el.src = SILENCE_URL;
  _el.loop = true;
  _el.volume = 0.001;
  _el.preload = 'auto';
  _el.setAttribute('playsinline', '');
  _el.setAttribute('webkit-playsinline', '');
  return _el;
}

export function startKeeper() {
  if (!isIOS || _started) return;
  _started = true;
  _createEl().play().catch(() => { _started = false; });
}

export function stopKeeper() {
  if (!isIOS || !_el) return;
  _started = false;
  try { _el.pause(); _el.currentTime = 0; } catch {}
}

// ─── Восстановление AudioContext ─────────────────────────────────────────────
function _resumeCtx() {
  const c = window.Howler?.ctx;
  if (c && (c.state === 'suspended' || c.state === 'interrupted')) {
    c.resume().catch(() => {});
  }
}

// ─── iOS watchdog: каждые 25 сек проверяем ctx и keeper ─────────────────────
function _startWatchdog() {
  if (_watchdogInterval) return;
  _watchdogInterval = setInterval(() => {
    if (!window.playerCore?.isPlaying?.()) return;
    _resumeCtx();
    // Если keeper остановился — перезапустить
    if (isIOS && _el && _el.paused && _started) {
      _el.play().catch(() => {});
    }
    // iOS: если sound.playing() = false но мы думаем что играем — recovery
    if (isIOS) {
      const pc = window.playerCore;
      if (pc?.sound && !pc.sound.playing()) {
        const pos = pc.getPosition?.() || 0;
        setTimeout(() => {
          if (pc?.sound && !pc.sound.playing()) {
            try { pc.sound.seek(pos); pc.sound.play(); } catch {}
          }
        }, 500);
      }
    }
  }, 25000);
}

function _stopWatchdog() {
  if (_watchdogInterval) { clearInterval(_watchdogInterval); _watchdogInterval = null; }
}

// ─── Привязка слушателя к AudioContext state ─────────────────────────────────
function _bindCtxWatcher() {
  const c = window.Howler?.ctx;
  if (c && !c._keeperWatching) {
    c._keeperWatching = true;
    c.addEventListener('statechange', () => {
      if (window.playerCore?.isPlaying?.()) _resumeCtx();
    });
  }
}

// ─── Android: обновить MediaSession artwork (lockscreen) ─────────────────────
function _updateAndroidMediaSession() {
  if (!isAndroid) return;
  const ms = navigator.mediaSession;
  if (!ms) return;
  const t = window.playerCore?.getCurrentTrack?.();
  if (!t) return;
  const art = String(t.cover || '').trim();
  if (!art) return;
  try {
    ms.metadata = new MediaMetadata({
      title: t.title || 'Витрина Разбита',
      artist: t.artist || 'Витрина Разбита',
      album: t.album || '',
      artwork: [96, 128, 192, 256, 512].map(s => ({
        src: art, sizes: `${s}x${s}`, type: 'image/jpeg'
      }))
    });
  } catch {}
}

// ─── Главная инициализация ───────────────────────────────────────────────────
export function initIosAudioKeeper() {
  if (_bound) return;
  _bound = true;

  // ── iOS: запуск keeper и watchdog при начале воспроизведения ──────────────
  window.addEventListener('player:play', () => {
    _bindCtxWatcher();
    _resumeCtx();
    if (isIOS) {
      startKeeper();
      _startWatchdog();
    }
    if (isAndroid) _updateAndroidMediaSession();
  });

  // ── iOS: остановка keeper при stop ────────────────────────────────────────
  window.addEventListener('player:stop', () => {
    if (isIOS) {
      stopKeeper();
      _stopWatchdog();
    }
  });

  // ── Обновление MediaSession artwork при смене трека ───────────────────────
  window.addEventListener('player:trackChanged', () => {
    _updateAndroidMediaSession();
    if (isIOS) { _resumeCtx(); }
  });

  // ── visibilitychange: главный recovery ───────────────────────────────────
  let _lastPos = 0, _wasPlaying = false;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      _lastPos = window.playerCore?.getPosition?.() || 0;
      _wasPlaying = !!window.playerCore?.isPlaying?.();
      return;
    }

    // Вернулись на страницу
    _bindCtxWatcher();
    _resumeCtx();

    if (isIOS) {
      if (!_started && window.playerCore?.isPlaying?.()) startKeeper();

      // Recovery если iOS заморозил воспроизведение
      if (_wasPlaying && window.playerCore?.sound && !window.playerCore.isPlaying()) {
        _wasPlaying = false;
        const p = _lastPos || 0;
        setTimeout(() => {
          const pc = window.playerCore;
          if (pc?.sound && !pc.isPlaying()) {
            try { pc.sound.seek(p); pc.sound.play(); } catch {}
          }
        }, 400);
      }
    }

    // Android: обновить MediaSession после возврата
    if (isAndroid && _wasPlaying) {
      _updateAndroidMediaSession();
    }
    _wasPlaying = false;
  });

  // ── Сохранять позицию каждые 5 сек для recovery ──────────────────────────
  setInterval(() => {
    if (window.playerCore?.isPlaying?.()) {
      _lastPos = window.playerCore.getPosition?.() || 0;
    }
  }, 5000);
}

export default { initIosAudioKeeper, startKeeper, stopKeeper };
