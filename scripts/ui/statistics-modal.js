/**
 * statistics-modal.js — Модалка статистики прослушиваний.
 *
 * Использует OfflineManager.getGlobalStatistics() для данных.
 */

import offlineManager, { getOfflineManager } from '../offline/offline-manager.js';

let _modal = null;

export async function openStatisticsModal() {
  if (_modal) return;

  const mgr = getOfflineManager();
  const stats = await mgr.getGlobalStatistics();

  const overlay = document.createElement('div');
  overlay.className = 'offline-modal-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeStatisticsModal();
  });

  const modal = document.createElement('div');
  modal.className = 'offline-modal';
  modal.style.maxWidth = '420px';

  /* Header */
  const header = document.createElement('div');
  header.className = 'offline-modal__header';
  header.innerHTML = `
    <span>📊 Статистика</span>
    <button class="offline-modal__close" title="Закрыть">&times;</button>
  `;
  header.querySelector('.offline-modal__close').addEventListener('click', closeStatisticsModal);
  modal.appendChild(header);

  /* Summary */
  const summary = document.createElement('div');
  summary.className = 'offline-section';

  const hours = Math.floor(stats.totalSeconds / 3600);
  const mins = Math.floor((stats.totalSeconds % 3600) / 60);

  summary.innerHTML = `
    <div class="offline-section__title">■ Общая статистика</div>
    <div class="offline-row">
      <span class="offline-row__label">Всего прослушиваний</span>
      <span style="font-weight: 600;">${stats.totalListens}</span>
    </div>
    <div class="offline-row">
      <span class="offline-row__label">Время прослушивания</span>
      <span>${hours}ч ${mins}м</span>
    </div>
    <div class="offline-row">
      <span class="offline-row__label">Треков с историей</span>
      <span>${stats.tracksWithListens}</span>
    </div>
  `;
  modal.appendChild(summary);

  /* Top tracks */
  if (stats.topTracks.length > 0) {
    const topSection = document.createElement('div');
    topSection.className = 'offline-section';

    const topTitle = document.createElement('div');
    topTitle.className = 'offline-section__title';
    topTitle.textContent = '■ Топ треков';
    topSection.appendChild(topTitle);

    for (const t of stats.topTracks) {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px;';

      const nameSpan = document.createElement('span');
      nameSpan.style.cssText = 'flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-right: 8px;';
      nameSpan.textContent = t.title;

      const countSpan = document.createElement('span');
      countSpan.style.cssText = 'color: #5bc0de; font-weight: 600; white-space: nowrap;';
      countSpan.textContent = `${t.listens}×`;

      row.appendChild(nameSpan);
      row.appendChild(countSpan);
      topSection.appendChild(row);
    }

    modal.appendChild(topSection);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  _modal = overlay;

  document.addEventListener('keydown', _onEscStats);
}

export function closeStatisticsModal() {
  if (!_modal) return;
  _modal.remove();
  _modal = null;
  document.removeEventListener('keydown', _onEscStats);
}

function _onEscStats(e) {
  if (e.key === 'Escape') closeStatisticsModal();
}

export function initStatisticsModal() {
  /* Делегирование для data-атрибутов и .stats-modal-trigger,
     но НЕ для #stats-btn — он обрабатывается в player-ui.js через actions map */
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-stats-modal], .stats-modal-trigger');
    if (trigger) {
      e.preventDefault();
      openStatisticsModal();
    }
  });
}

// Глобальный доступ для player-ui.js
window.StatisticsModal = { openStatisticsModal, closeStatisticsModal, initStatisticsModal };

export default {
  openStatisticsModal,
  closeStatisticsModal,
  initStatisticsModal
};
