import { metaDB } from '../analytics/meta-db.js';

export async function openStatisticsModal() {
  const listens = await metaDB.getStat('globalFullListens') || { details: {}, value: 0 };
  const time = await metaDB.getStat('totalListenTime') || { value: 0 };
  const ach = await metaDB.getStat('unlocked_achievements') || { details: {}, value: 0 };
  const engine = window.achievementEngine;

  const topTracks = Object.entries(listens.details)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([uid, count]) => {
      const t = window.TrackRegistry?.getTrackByUid(uid);
      return `<div class="top-track-row"><span>${t?.title || uid}</span><b>${count}</b></div>`;
    }).join('') || 'Нет данных';

  const bodyHtml = `
    <div class="stats-grid-compact">
      <div class="stat-box"><b>${listens.value}</b><span>Треков</span></div>
      <div class="stat-box"><b>${Math.floor(time.value / 60)}м</b><span>В пути</span></div>
    </div>
    <div style="margin-bottom:15px;">
      <div style="font-size:11px; color:#555; margin-bottom:5px;">ТОП 5 ТРЕКОВ</div>
      ${topTracks}
    </div>
    <div style="font-size:11px; color:#555; margin-bottom:8px;">ДОСТИЖЕНИЯ (${ach.value}/${engine?.achievements.length || 0})</div>
    <div style="max-height:200px; overflow-y:auto; padding-right:5px;">
      ${engine.achievements.map(a => `
        <div class="ach-item ${ach.details[a.id] ? '' : 'locked'}">
          <div class="ach-icon">${a.icon}</div>
          <div>
            <div style="font-size:13px; font-weight:bold;">${a.name}</div>
            <div style="font-size:10px; color:#777;">${a.desc}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  window.Modals.open({ title: 'Профиль слушателя', bodyHtml, maxWidth: 400 });
}

window.StatisticsModal = { openStatisticsModal, init: () => {
  document.addEventListener('click', e => { if(e.target.closest('.stats-trigger')) openStatisticsModal(); });
}};
