/**
 * cache-progress-overlay.js — Overlay с прогрессом скачивания.
 *
 * Показывает индикатор когда идёт фоновое кэширование 🔒/☁ треков.
 */

import offlineManager, { getOfflineManager } from '../offline/offline-manager.js';

let _overlay = null;
let _visible = false;

export function initCacheProgressOverlay() {
  /* Подписка на события */
  window.addEventListener('offline:downloadStart', _onDownloadStart);
  window.addEventListener('offline:trackCached', _onTrackCached);
  window.addEventListener('offline:downloadFailed', _onUpdate);
}

function _onDownloadStart(e) {
  if (!_visible) _show();
  _update();
}

function _onTrackCached(e) {
  _update();
}

function _onUpdate() {
  _update();
}

function _show() {
  if (_overlay) return;

  _overlay = document.createElement('div');
  _overlay.id = 'cache-progress-overlay';
  _overlay.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 16px;
    z-index: 9000;
    background: rgba(26, 26, 46, 0.95);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 12px;
    color: #aaa;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    transition: opacity 0.3s;
    max-width: 260px;
  `;
  _overlay.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="animation: offlineIndBlink 1.2s infinite;">⬇</span>
      <span id="cache-progress-text">Скачивание…</span>
    </div>
  `;

  document.body.appendChild(_overlay);
  _visible = true;
}

function _hide() {
  if (_overlay) {
    _overlay.style.opacity = '0';
    setTimeout(() => {
      _overlay?.remove();
      _overlay = null;
      _visible = false;
    }, 300);
  }
}

function _update() {
  const mgr = getOfflineManager();
  const status = mgr.getDownloadStatus();

  if (status.active === 0 && status.queued === 0) {
    _hide();
    return;
  }

  if (!_visible) _show();

  const text = _overlay?.querySelector('#cache-progress-text');
  if (text) {
    const total = status.active + status.queued;
    text.textContent = `Скачивание: ${status.active} активных, ${status.queued} в очереди`;
  }
}

export default { initCacheProgressOverlay };
