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

  window.addEventListener('player:stop', () => {
    // Останавливаем keeper только при явном stop пользователя
    // При player:ended — НЕ останавливаем (автопереход на следующий трек)
    stopKeeper();
  });

  // При возврате вкладки — перезапускаем keeper если плеер играл
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (window.playerCore?.isPlaying?.() && !_started) {
      startKeeper();
    }
  });
}

export default { initIosAudioKeeper, startKeeper, stopKeeper };
