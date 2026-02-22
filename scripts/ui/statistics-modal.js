/**
 * scripts/ui/statistics-modal.js
 * ПОЛНОСТЬЮ ПЕРЕПИСАНО: Интеграция с AnalyticsEngine v4.0.
 * Заменяет устаревший GlobalStatsManager.
 */

export async function openStatisticsModal() {
  if (!window.AnalyticsEngine) {
    return window.NotificationSystem?.warning('Статистика загружается…');
  }

  // Получаем агрегированные данные из нового изолированного ядра
  const stats = await window.AnalyticsEngine.StatsAggregator.getStats();

  const totalListens = stats.totalListens || 0;
  const streak = stats.streak || 0;
  const unlockedCount = (stats.unlocked || []).length;

  const row = (lbl, val, bold = false) => `
    <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:14px;">
      <span style="color:#9db7dd">${lbl}</span>
      <span style="color:#eaf2ff; ${bold ? 'font-weight:700' : ''}">${val}</span>
    </div>`;

  const bodyHtml = `
    <div style="margin-bottom:24px;">
      <div style="font-weight:800; color:#8ab8fd; margin-bottom:8px; text-transform:uppercase; font-size:13px; letter-spacing:0.5px;">Глобальная статистика</div>
      <div style="background:rgba(255,255,255,0.03); padding:4px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
        ${row('Всего полных прослушиваний', totalListens, true)}
        ${row('Огненный стрик (дней)', streak)}
        ${row('Открыто достижений', unlockedCount)}
      </div>
    </div>
    <div style="text-align:center; color:#888; font-size:12px; margin-top:10px;">
      Подробная статистика доступна в Личном кабинете
    </div>
  `;

  if (!window.Modals?.open) {
    return window.NotificationSystem?.error('Система окон недоступна');
  }

  window.Modals.open({
    title: '📊 Статистика',
    maxWidth: 420,
    bodyHtml
  });
}

export const closeStatisticsModal = () => {};

export function initStatisticsModal() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-stats-modal], .stats-btn, #stats-btn')) {
      e.preventDefault();
      openStatisticsModal();
    }
  });
}

window.StatisticsModal = { openStatisticsModal, closeStatisticsModal, initStatisticsModal };
export default window.StatisticsModal;
