// scripts/ui/statistics-modal.js
import { getOfflineManager } from '../offline/offline-manager.js';
// getAllTracks removed (dead import)

(function(W) {
  'use strict';

  const U = W.Utils;
  const esc = (s) => U.escapeHtml(String(s||''));
  const fmt = (s) => U.fmt.durationHuman(s);

  async function showStats() {
    if (!W.Modals?.open) return;

    const mgr = getOfflineManager();
    const stats = await mgr.getGlobalStatistics();
    
    // Фильтр: только те, где >= 3 прослушиваний
    const relevant = (stats.tracks || []).filter(t => t.fullListens >= 3);
    
    // Сортировка по времени прослушивания
    relevant.sort((a, b) => b.seconds - a.seconds);

    const totalDays = (stats.totalSeconds / 86400).toFixed(1);
    const totalHours = Math.floor(stats.totalSeconds / 3600);

    const listHtml = relevant.length 
      ? relevant.map((t, i) => {
          const meta = W.TrackRegistry.getTrackByUid(t.uid);
          const title = meta ? `${meta.artist} — ${meta.title}` : `UID: ${t.uid}`;
          return `
            <div class="stats-row">
              <div class="stats-rank">${i + 1}</div>
              <div class="stats-info">
                <div class="stats-title">${esc(title)}</div>
                <div class="stats-meta">🎧 ${t.fullListens} · ⏱ ${fmt(t.seconds)}</div>
              </div>
            </div>`;
        }).join('')
      : '<div class="stats-empty">Слушайте больше музыки, чтобы увидеть статистику!</div>';

    const body = `
      <div class="stats-modal">
        <div class="stats-header">
          <div class="stats-total-label">Всего времени:</div>
          <div class="stats-total-val">${totalHours} ч (${totalDays} дн)</div>
        </div>
        <div class="stats-list">
          ${listHtml}
        </div>
      </div>
      <style>
        .stats-modal { color: #eaf2ff; }
        .stats-header { text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .stats-total-label { font-size: 13px; color: #9db7dd; }
        .stats-total-val { font-size: 24px; font-weight: 900; color: #ffd166; margin-top: 4px; }
        .stats-list { max-height: 50vh; overflow-y: auto; }
        .stats-row { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .stats-rank { width: 30px; font-weight: 900; color: #4daaff; font-size: 16px; }
        .stats-info { flex: 1; min-width: 0; }
        .stats-title { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .stats-meta { font-size: 12px; color: #9db7dd; margin-top: 4px; }
        .stats-empty { text-align: center; padding: 30px; color: #9db7dd; opacity: 0.7; }
      </style>
    `;

    W.Modals.open({
      title: 'Статистика',
      maxWidth: 420,
      bodyHtml: body
    });
  }

  W.StatisticsModal = { show: showStats };

})(window);
