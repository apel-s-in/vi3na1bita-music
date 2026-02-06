/**
 * statistics-modal.js — Модалка статистики прослушивания
 */

import { getOfflineManager } from '../offline/offline-manager.js';
import { openModal, closeModal } from './modal-core.js';

export async function openStatisticsModal() {
  const mgr = getOfflineManager();

  let stats;
  try {
    stats = await mgr.getGlobalStatistics();
  } catch {
    stats = { totalSeconds: 0, tracks: [] };
  }

  const totalMin = Math.floor((stats.totalSeconds || 0) / 60);
  const totalHrs = (totalMin / 60).toFixed(1);

  // Сортируем треки по времени прослушивания
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

  const html = `
    <div style="padding:20px; max-width:480px; margin:auto; color:#fff; font-family:sans-serif;">
      <h2 style="margin:0 0 16px; font-size:20px;">📊 Статистика прослушивания</h2>

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

      <button id="stats-modal-close" style="
        width:100%; margin-top:16px; padding:12px; border-radius:8px; border:none;
        cursor:pointer; background:rgba(108,92,231,0.3); color:#a29bfe;
        font-size:14px; font-weight:600;">
        Закрыть
      </button>
    </div>
  `;

  openModal(html, { cssClass: 'statistics-modal', backdrop: true });

  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  document.getElementById('stats-modal-close')?.addEventListener('click', () => closeModal());
}

export default openStatisticsModal;
