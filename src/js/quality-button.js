/**
 * Quality Button — Hi/Lo на плеере (ТЗ 4)
 * Видна только в R0/R1. В R2/R3 скрыта.
 * Переключение PQ без stop().
 */

import { getMode, MODES, getPlaybackQuality, setPlaybackQuality, onModeChange } from './mode-manager.js';
import { hasVariant, getTrackVariantPath } from './track-resolver.js';

let _btn = null;
let _currentTrack = null;
let _switchCallback = null; // (newQuality) => void — PlayerCore callback

function init(switchCallback) {
  _switchCallback = switchCallback;
  _ensureDOM();
  _bindEvents();
  _updateUI();
}

function _ensureDOM() {
  if (_btn) return;

  // Find or create button
  _btn = document.getElementById('quality-btn');
  if (!_btn) {
    _btn = document.createElement('button');
    _btn.id = 'quality-btn';
    _btn.className = 'quality-btn';
    _btn.setAttribute('aria-label', 'Переключить качество');

    // ТЗ 4.1: left of mute in 2nd row
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn && muteBtn.parentNode) {
      muteBtn.parentNode.insertBefore(_btn, muteBtn);
    } else {
      // Fallback: find controls row 2
      const row2 = document.querySelector('.player-controls-row-2, .controls-secondary');
      if (row2) {
        row2.insertBefore(_btn, row2.firstChild);
      }
    }
  }
}

function _bindEvents() {
  if (!_btn) return;

  _btn.addEventListener('click', (e) => {
    e.stopPropagation();
    _handleClick();
  });

  onModeChange(() => _updateUI());

  // Listen for network changes
  window.addEventListener('online', () => _updateUI());
  window.addEventListener('offline', () => _updateUI());
}

function _handleClick() {
  const mode = getMode();

  // ТЗ 4.4: hidden in R2/R3
  if (mode === MODES.R2 || mode === MODES.R3) return;

  // ТЗ 7.5.1: disabled when offline
  if (!navigator.onLine) {
    if (window.showToast) window.showToast('Нет доступа к сети', 2000);
    return;
  }

  // Check if current track has alternative
  if (!_currentTrack) return;
  const pq = getPlaybackQuality();
  const newQ = pq === 'hi' ? 'lo' : 'hi';

  if (!hasVariant(_currentTrack, newQ)) {
    if (window.showToast) window.showToast('Альтернативное качество недоступно', 2000);
    return;
  }

  // ТЗ 4.2: switch PQ
  setPlaybackQuality(newQ);
  _updateUI();

  if (_switchCallback) {
    _switchCallback(newQ);
  }
}

function setCurrentTrack(track) {
  _currentTrack = track;
  _updateUI();
}

function _updateUI() {
  if (!_btn) return;

  const mode = getMode();

  // ТЗ 4.4: hide in R2/R3
  if (mode === MODES.R2 || mode === MODES.R3) {
    _btn.style.display = 'none';
    return;
  }

  _btn.style.display = '';
  const pq = getPlaybackQuality();
  _btn.textContent = pq === 'hi' ? 'Hi' : 'Lo';

  // Colors: Hi=green, Lo=orange
  _btn.classList.remove('quality-hi', 'quality-lo', 'quality-disabled');

  if (!_currentTrack || !_hasAlternative()) {
    _btn.classList.add('quality-disabled');
    _btn.disabled = true;
  } else if (!navigator.onLine) {
    // ТЗ 7.5.1: disabled offline
    _btn.classList.add('quality-disabled');
    _btn.disabled = true;
  } else {
    _btn.classList.add(pq === 'hi' ? 'quality-hi' : 'quality-lo');
    _btn.disabled = false;
  }
}

function _hasAlternative() {
  if (!_currentTrack) return false;
  return hasVariant(_currentTrack, 'hi') && hasVariant(_currentTrack, 'lo');
}

export { init, setCurrentTrack };
