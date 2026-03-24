// src/player-core/ios-audio-keeper.js
// iOS Silent Audio Keeper — держит аудио-сессию активной через тихий зацикленный файл.
// Работает только на iOS. Не влияет на Howler/PlayerCore playback вообще.

const SILENCE_URL = './audio/silence.mp3';
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

let _el = null;       // <audio> элемент
let _started = false; // флаг что keeper запущен
let _bound = false;   // флаг что обработчики уже навешаны

function _createEl() {
  if (_el) return _el;
  _el = document.createElement('audio');
  _el.src = SILENCE_URL;
  _el.loop = true;
  _el.volume = 0.001;        // почти беззвучно, но не 0 — iOS иначе оптимизирует
  _el.preload = 'auto';
  _el.setAttribute('playsinline', '');
  _el.setAttribute('webkit-playsinline', '');
  // Не добавляем в DOM — не нужно
  return _el;
}

export function startKeeper() {
  if (!isIOS) return;
  const el = _createEl();
  if (_started) return;
  _started = true;
  el.play().catch(() => {
    // Если autoplay заблокирован — пробуем при следующем user gesture
    // Это нормально: Howler уже разблокировал AudioContext через свой unlock
    _started = false;
  });
}

export function stopKeeper() {
  if (!isIOS || !_el) return;
  _started = false;
  try { _el.pause(); _el.currentTime = 0; } catch {}
}

export function initIosAudioKeeper() {
  if (!isIOS || _bound) return;
  _bound = true;

  window.addEventListener('player:play', () => startKeeper());
  window.addEventListener('player:stop', () => stopKeeper());

  // При возврате вкладки — перезапускаем keeper если плеер играл
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (window.playerCore?.isPlaying?.() && !_started) startKeeper();
  });

  // Восстанавливаем AudioContext после прерывания (звонок, Siri)
  const handleCtxState = () => {
    const ctx = window.Howler?.ctx;
    if (ctx && (ctx.state === 'interrupted' || ctx.state === 'suspended')) {
      ctx.resume().catch(() => {});
    }
  };

  const bindCtxWatcher = () => {
    const ctx = window.Howler?.ctx;
    if (ctx && !ctx._iosWatching) {
      ctx._iosWatching = true;
      ctx.addEventListener('statechange', () => {
        if (window.playerCore?.isPlaying?.()) handleCtxState();
      });
    }
  };

  // Восстановление после прерывания iOS (звонок, Siri, блокировка)
  let _lastKnownPos = 0, _wasPlayingBeforeHide = false;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      _lastKnownPos = window.playerCore?.getPosition?.() || 0;
      _wasPlayingBeforeHide = !!window.playerCore?.isPlaying?.();
      return;
    }
    bindCtxWatcher();
    handleCtxState();
    if (window.playerCore?.sound && !window.playerCore.isPlaying() && _wasPlayingBeforeHide) {
      _wasPlayingBeforeHide = false;
      const pos = _lastKnownPos || 0;
      setTimeout(() => {
        if (window.playerCore?.sound && !window.playerCore.isPlaying()) {
          window.playerCore.sound.seek(pos);
          window.playerCore.sound.play();
        }
      }, 300);
    }
    _wasPlayingBeforeHide = false;
  });

  setInterval(() => {
    if (window.playerCore?.isPlaying?.()) _lastKnownPos = window.playerCore.getPosition();
  }, 5000);

  window.addEventListener('player:play', () => { bindCtxWatcher(); handleCtxState(); });
}

export default { initIosAudioKeeper, startKeeper, stopKeeper };
