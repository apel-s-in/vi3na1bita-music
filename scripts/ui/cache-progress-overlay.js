/**
 * cache-progress-overlay.js — Оверлей прогресса кэширования
 * Показывает индикатор загрузки на карточках треков
 */

import { getOfflineManager } from '../offline/offline-manager.js';

let _overlay = null;
let _unsubs = [];

export function initCacheProgressOverlay() {
  const mgr = getOfflineManager();

  // Слушаем события кэширования
  const onTrackCached = (e) => {
    const { uid } = e.detail || {};
    if (uid) updateTrackCard(uid, 100, 'cached');
  };

  const onQueueUpdate = (e) => {
    const status = e.detail || {};
    // Обновляем все карточки в очереди
    if (status.items) {
      status.items.forEach(item => {
        updateTrackCard(item.uid, 0, 'queued');
      });
    }
  };

  const onDownloadFailed = (e) => {
    const { uid } = e.detail || {};
    if (uid) updateTrackCard(uid, 0, 'failed');
  };

  window.addEventListener('offline:trackCached', onTrackCached);
  window.addEventListener('offline:queueUpdate', onQueueUpdate);
  window.addEventListener('offline:downloadFailed', onDownloadFailed);

  _unsubs.push(
    () => window.removeEventListener('offline:trackCached', onTrackCached),
    () => window.removeEventListener('offline:queueUpdate', onQueueUpdate),
    () => window.removeEventListener('offline:downloadFailed', onDownloadFailed)
  );

  console.log('[CacheProgressOverlay] initialized');
}

function updateTrackCard(uid, progress, state) {
  // Ищем карточку трека по data-uid
  const cards = document.querySelectorAll(`[data-uid="${uid}"], [data-track-uid="${uid}"]`);
  cards.forEach(card => {
    let indicator = card.querySelector('.cache-progress-indicator');

    if (state === 'cached') {
      // Трек закэширован — убираем индикатор, добавляем иконку
      if (indicator) indicator.remove();
      let badge = card.querySelector('.cache-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'cache-badge';
        badge.style.cssText = 'position:absolute;top:4px;right:4px;font-size:10px;opacity:0.7;z-index:5;';
        badge.textContent = '💾';
        card.style.position = card.style.position || 'relative';
        card.appendChild(badge);
      }
      return;
    }

    if (state === 'failed') {
      if (indicator) {
        indicator.style.background = 'rgba(214,48,49,0.3)';
        setTimeout(() => indicator.remove(), 2000);
      }
      return;
    }

    // Queued / downloading — показываем прогресс-бар
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'cache-progress-indicator';
      indicator.style.cssText = `
        position:absolute; bottom:0; left:0; right:0; height:3px;
        background:rgba(108,92,231,0.3); z-index:5; overflow:hidden;
        border-radius:0 0 8px 8px;
      `;
      indicator.innerHTML = '<div class="cache-progress-bar" style="height:100%;width:0%;background:#6c5ce7;transition:width 0.3s;border-radius:0 0 8px 8px;"></div>';
      card.style.position = card.style.position || 'relative';
      card.appendChild(indicator);
    }

    const bar = indicator.querySelector('.cache-progress-bar');
    if (bar) bar.style.width = `${Math.min(100, progress)}%`;
  });
}

/**
 * Обновить оверлей для конкретного трека (вызывается извне)
 */
export function updateCacheOverlay(uid, progress, state) {
  updateTrackCard(uid, progress, state);
}

export function destroyCacheProgressOverlay() {
  _unsubs.forEach(fn => fn());
  _unsubs = [];
}

export default initCacheProgressOverlay;
