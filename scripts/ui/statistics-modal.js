/**
 * statistics-modal.js — Модалка статистики прослушиваний.
 * ОПТИМИЗАЦИЯ v2.0:
 * - Исключено ручное создание DOM-дерева и утечки EventListeners.
 * - Внедрен глобальный API window.Modals.open для консистентного UI/UX.
 * - ТЗ 9.4: Строго показывает треки с globalFullListenCount >= 3.
 */

export async function openStatisticsModal() {
  const gsm = window.GlobalStatsManager;
  
  if (!gsm || !gsm.isReady()) {
    return window.NotificationSystem?.warning?.('Статистика загружается…');
  }

  const stats = await gsm.getStatistics();
  const esc = window.Utils?.escapeHtml || (s => String(s || ''));

  // Форматирование общего времени (дни/часы/минуты)
  let timeStr = `${stats.totalMinutes}м`;
  if (stats.totalDays > 0) timeStr = `${stats.totalDays}д ${stats.totalHours}ч ${stats.totalMinutes}м`;
  else if (stats.totalHours > 0) timeStr = `${stats.totalHours}ч ${stats.totalMinutes}м`;

  // Хелпер для отрисовки строки
  const row = (lbl, val, bold = false) => `
    <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:14px;">
      <span style="color:#9db7dd">${lbl}</span>
      <span style="color:#eaf2ff; ${bold ? 'font-weight:700' : ''}">${val}</span>
    </div>`;

  // Генерация списка ТОП треков (уже отфильтровано >=3 внутри gsm.getStatistics)
  const topHtml = stats.topTracks.length > 0
    ? stats.topTracks.map(t => `
        <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.03); font-size:13px;">
          <span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-right:8px; color:#eaf2ff;" title="${esc(t.title)}">
            ${esc(t.title)}
          </span>
          <span style="color:#5bc0de; font-weight:600; white-space:nowrap; flex-shrink:0;">
            ${t.listens}× · ${Math.floor((t.seconds || 0) / 60)}м
          </span>
        </div>
      `).join('')
    : `<div style="color:#888; font-size:13px; text-align:center; padding:16px 0;">Прослушайте треки минимум 3 раза для появления в статистике</div>`;

  // Итоговый шаблон модалки
  const bodyHtml = `
    <div style="margin-bottom:24px;">
      <div style="font-weight:800; color:#8ab8fd; margin-bottom:8px; text-transform:uppercase; font-size:13px; letter-spacing:0.5px;">Общая статистика</div>
      <div style="background:rgba(255,255,255,0.03); padding:4px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
        ${row('Всего полных прослушиваний', stats.totalListens, true)}
        ${row('Общее время прослушивания', timeStr)}
        ${row('Треков в статистике (≥3)', stats.tracksWithStats)}
      </div>
    </div>
    
    <div>
      <div style="font-weight:800; color:#8ab8fd; margin-bottom:8px; text-transform:uppercase; font-size:13px; letter-spacing:0.5px;">Топ треков</div>
      <div style="background:rgba(255,255,255,0.03); padding:4px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.05); max-height:40vh; overflow-y:auto; scrollbar-width:thin; scrollbar-color:rgba(255,255,255,0.15) transparent;">
        ${topHtml}
      </div>
    </div>
  `;

  if (!window.Modals?.open) {
    return window.NotificationSystem?.error('Система окон недоступна');
  }

  // Делегируем рендер и управление (ESC, overlay click) центральному компоненту
  window.Modals.open({
    title: '📊 Статистика',
    maxWidth: 420,
    bodyHtml
  });
}

// Заглушка для обратной совместимости вызовов (модалка теперь закрывает себя сама)
export const closeStatisticsModal = () => {};

export function initStatisticsModal() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-stats-modal], .stats-modal-trigger')) {
      e.preventDefault();
      openStatisticsModal();
    }
  });
}

// Глобальный доступ для app.js / player-ui.js
window.StatisticsModal = { openStatisticsModal, closeStatisticsModal, initStatisticsModal };
export default window.StatisticsModal;
