/**
 * statistics-modal.js — Модалка статистики прослушиваний.
 *
 * ТЗ 9.4: Показывает треки с globalFullListenCount >= 3
 * и общий total globalTotalListenSeconds (дни/часы).
 *
 * Данные берёт из GlobalStatsManager (самодостаточный модуль).
 */

let _modal = null;

export async function openStatisticsModal() {
  if (_modal) return;

  const gsm = window.GlobalStatsManager;
  if (!gsm || !gsm.isReady()) {
    window.NotificationSystem?.warning?.('Статистика загружается…');
    return;
  }

  const stats = await gsm.getStatistics();

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

  /* ТЗ 9.4: globalTotalListenSeconds в дни/часы */
  const days = stats.totalDays;
  const hours = stats.totalHours;
  const mins = stats.totalMinutes;
  let timeStr = '';
  if (days > 0) timeStr = `${days}д ${hours}ч ${mins}м`;
  else if (hours > 0) timeStr = `${hours}ч ${mins}м`;
  else timeStr = `${mins}м`;

  summary.innerHTML = `
    <div class="offline-section__title">■ Общая статистика</div>
    <div class="offline-row">
      <span class="offline-row__label">Всего полных прослушиваний</span>
      <span style="font-weight: 600;">${stats.totalListens}</span>
    </div>
    <div class="offline-row">
      <span class="offline-row__label">Общее время прослушивания</span>
      <span>${timeStr}</span>
    </div>
    <div class="offline-row">
      <span class="offline-row__label">Треков в статистике (≥3 прослушиваний)</span>
      <span>${stats.tracksWithStats}</span>
    </div>
  `;
  modal.appendChild(summary);

  /* Top tracks (ТЗ 9.4: только >= 3) */
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

      const infoSpan = document.createElement('span');
      infoSpan.style.cssText = 'color: #5bc0de; font-weight: 600; white-space: nowrap;';
      const trackMins = Math.floor((t.seconds || 0) / 60);
      infoSpan.textContent = `${t.listens}× · ${trackMins}м`;

      row.appendChild(nameSpan);
      row.appendChild(infoSpan);
      topSection.appendChild(row);
    }

    modal.appendChild(topSection);
  } else {
    const emptySection = document.createElement('div');
    emptySection.className = 'offline-section';
    emptySection.innerHTML = `
      <div class="offline-section__title">■ Топ треков</div>
      <div style="color: #888; font-size: 13px; text-align: center; padding: 16px 0;">
        Прослушайте треки минимум 3 раза для появления в статистике
      </div>
    `;
    modal.appendChild(emptySection);
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
  /* Делегирование для data-атрибутов и .stats-modal-trigger */
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-stats-modal], .stats-modal-trigger');
    if (trigger) {
      e.preventDefault();
      openStatisticsModal();
    }
  });
}

/* Глобальный доступ для player-ui.js */
window.StatisticsModal = { openStatisticsModal, closeStatisticsModal, initStatisticsModal };

export default {
  openStatisticsModal,
  closeStatisticsModal,
  initStatisticsModal
};
