import { metaDB } from '../analytics/meta-db.js';

export async function openStatisticsModal() {
  if (!window.Modals?.open) return window.NotificationSystem?.error('Система окон недоступна');

  const listensDoc = await metaDB.getStat('globalFullListens') || { details: {}, value: 0 };
  const timeDoc = await metaDB.getStat('totalListenTime') || { value: 0 };
  const achDoc = await metaDB.getStat('unlocked_achievements') || { details: {}, value: 0 };

  const totalListens = listensDoc.value;
  const totalSec = timeDoc.value;
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);

  // Формируем ТОП-20 треков
  const tracksArr = Object.entries(listensDoc.details).map(([uid, count]) => {
    const t = window.TrackRegistry?.getTrackByUid(uid);
    return { uid, title: t?.title || uid, count };
  }).sort((a, b) => b.count - a.count).slice(0, 20);

  const topHtml = tracksArr.length ? tracksArr.map(t => `
    <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.03); font-size:13px;">
      <span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#eaf2ff;">${window.Utils?.escapeHtml(t.title)}</span>
      <span style="color:#5bc0de; font-weight:600;">${t.count}×</span>
    </div>
  `).join('') : '<div style="color:#888; font-size:13px; text-align:center;">Нет данных</div>';

  // Формируем сетку ачивок (показываем все, серые - заблокированы)
  const engine = window.achievementEngine;
  const achHtml = engine ? engine.achievements.map(a => {
    const isUnl = !!achDoc.details[a.id];
    return `
      <div style="display:flex; align-items:center; gap:12px; padding:10px; background:rgba(255,255,255,0.03); border-radius:8px; opacity: ${isUnl ? '1' : '0.4'}; filter: ${isUnl ? 'none' : 'grayscale(100%)'};">
        <div style="font-size:24px;">${a.icon}</div>
        <div style="flex:1;">
          <div style="color:#fff; font-weight:bold; font-size:13px;">${window.Utils?.escapeHtml(a.name)}</div>
          <div style="color:#888; font-size:11px;">${window.Utils?.escapeHtml(a.desc)}</div>
        </div>
      </div>
    `;
  }).join('') : '';

  const bodyHtml = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px;">
      <div style="background:rgba(0,0,0,0.3); padding:16px; border-radius:12px; text-align:center; border:1px solid rgba(255,255,255,0.05);">
        <div style="font-size:24px; font-weight:bold; color:#fff;">${totalListens}</div>
        <div style="font-size:10px; color:#888; text-transform:uppercase;">Прослушиваний</div>
      </div>
      <div style="background:rgba(0,0,0,0.3); padding:16px; border-radius:12px; text-align:center; border:1px solid rgba(255,255,255,0.05);">
        <div style="font-size:24px; font-weight:bold; color:#fff;">${hours}ч ${mins}м</div>
        <div style="font-size:10px; color:#888; text-transform:uppercase;">Время в музыке</div>
      </div>
    </div>
    
    <div style="font-weight:800; color:#8ab8fd; margin-bottom:8px; text-transform:uppercase; font-size:13px;">Топ треков</div>
    <div style="background:rgba(255,255,255,0.03); padding:4px 12px; border-radius:8px; margin-bottom:20px; max-height:200px; overflow-y:auto; scrollbar-width:thin;">
      ${topHtml}
    </div>

    <div style="font-weight:800; color:#8ab8fd; margin-bottom:8px; text-transform:uppercase; font-size:13px;">Достижения (${achDoc.value}/${engine?.achievements.length || 0})</div>
    <div style="display:grid; grid-template-columns:1fr; gap:8px; max-height:250px; overflow-y:auto; scrollbar-width:thin;">
      ${achHtml}
    </div>
  `;

  window.Modals.open({ title: 'Личный кабинет', maxWidth: 460, bodyHtml });
}
export const closeStatisticsModal = () => {};
export function initStatisticsModal() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('.stats-btn, [data-open-stats-modal], .stats-modal-trigger')) {
      e.preventDefault(); openStatisticsModal();
    }
  });
}
window.StatisticsModal = { openStatisticsModal, closeStatisticsModal, initStatisticsModal };
export default window.StatisticsModal;
