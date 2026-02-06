/**
 * statistics-modal.js — Модалка статистики прослушивания
 */

import { getOfflineManager } from '../offline/offline-manager.js';

export async function openStatisticsModal() {
  if (!window.Modals?.open) return;

  const mgr = getOfflineManager();

  let stats;
  try {
    stats = await mgr.getGlobalStatistics();
  } catch {
    stats = { totalSeconds: 0, tracks: [] };
  }

  const totalMin = Math.floor((stats.totalSeconds || 0) / 60);
  const totalHrs = (totalMin / 60).toFixed(1);

  const topTracks = (stats.tracks || [])
    .sort((a, b) => (b.seconds || 0) - (a.seconds || 0))
    .slice(0, 20);

  const trackListHtml = topTracks.length > 0
    ? topTracks.map((t, i) => {
        const mins = Math.floor((t.seconds || 0) / 60);
        const trackInfo = window.TrackRegistry?.getTrackByUid(t.uid);
        const name = trackInfo?.title || t.uid;
        return `
          <div style="display:flex; justify-content:space-between; align-items:center;
                      padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.06); font-size:13px;">
            <span style="opacity:0.4; width:24px;">${i + 1}.</span>
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${name}</span>
            <span style="opacity:0.5; margin-left:8px; white-space:nowrap;">${mins} мин · ${t.fullListens || 0} ×</span>
          </div>
        `;
      }).join('')
    : '<div style="text-align:center; opacity:0.4; padding:20px; font-size:13px;">Нет данных</div>';

  const bodyHtml = `
    <div style="color:#fff; font-family:sans-serif;">
      <div style="display:flex; gap:12px; margin-bottom:20px;">
        <div style="flex:1; background:rgba(255,255,255,0.08); border-radius:10px; padding:14px; text-align:center;">
          <div style="font-size:24px; font-weight:700;">${totalHrs}</div>
          <div style="font-size:11px; opacity:0.5;">часов</div>
        </div>
        <div style="flex:1; background:rgba(255,255,255,0.08); border-radius:10px; padding:14px; text-align:center;">
          <div style="font-size:24px; font-weight:700;">${topTracks.length}</div>
          <div style="font-size:11px; opacity:0.5;">треков</div>
        </div>
        <div style="flex:1; background:rgba(255,255,255,0.08); border-radius:10px; padding:14px; text-align:center;">
          <div style="font-size:24px; font-weight:700;">${topTracks.reduce((s, t) => s + (t.fullListens || 0), 0)}</div>
          <div style="font-size:11px; opacity:0.5;">полных</div>
        </div>
      </div>

      <div style="font-size:14px; font-weight:600; margin-bottom:10px;">🏆 Топ треков</div>
      <div style="max-height:300px; overflow-y:auto;">
        ${trackListHtml}
      </div>
    </div>
  `;

  window.Modals.open({
    title: '📊 Статистика прослушивания',
    maxWidth: 480,
    bodyHtml
  });
}

// Глобальный доступ для кнопки stats-btn
window.StatisticsModal = { show: openStatisticsModal };

export default openStatisticsModal;
