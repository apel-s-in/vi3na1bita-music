// scripts/ui/statistics-modal.js
// Модалка статистики прослушивания (ТЗ 17)

(function() {
  'use strict';

  async function showStatisticsModal() {
    const om = window.OfflineUI?.offlineManager;
    if (!om) {
      window.NotificationSystem?.warning('Статистика недоступна (OfflineManager не готов)');
      return;
    }

    const data = await om.getGlobalStatistics(); // { totalSeconds, tracks: [] }
    const tracks = data.tracks || [];
    
    // Сортировка: по полным прослушиваниям, затем по времени
    tracks.sort((a, b) => {
      if (b.fullListens !== a.fullListens) return b.fullListens - a.fullListens;
      return b.seconds - a.seconds;
    });

    // Фильтр: >= 3 прослушиваний (по ТЗ)
    const topTracks = tracks.filter(t => t.fullListens >= 3);

    // Форматирование общего времени
    const totalHours = (data.totalSeconds / 3600).toFixed(1);
    const totalDays = (data.totalSeconds / 86400).toFixed(1);
    
    // Рендер строк
    const rowsHtml = topTracks.map((t, idx) => {
      // Ищем название трека в реестре
      const meta = window.TrackRegistry?.getTrackByUid(t.uid);
      const title = meta?.title || t.uid;
      const artist = 'Витрина Разбита'; // хардкод или из meta, если есть
      const timeStr = formatSeconds(t.seconds);
      
      return `
        <div style="display:flex; align-items:center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
          <div style="width: 24px; color:#8ab8fd; font-weight:bold;">${idx + 1}.</div>
          <div style="flex:1; overflow:hidden;">
            <div style="color:#eaf2ff; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${window.Utils.escapeHtml(title)}</div>
            <div style="font-size:12px; color:#9db7dd;">${timeStr} всего</div>
          </div>
          <div style="text-align:right;">
            <div style="color:#ffd166; font-weight:bold;">${t.fullListens}</div>
            <div style="font-size:10px; color:#9db7dd;">раз</div>
          </div>
        </div>
      `;
    }).join('');

    const html = `
      <div class="modal-feedback" style="max-width: 480px; max-height: 80vh;">
        <button class="bigclose" title="Закрыть" aria-label="Закрыть">
          <svg viewBox="0 0 48 48">
            <line x1="12" y1="12" x2="36" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
            <line x1="36" y1="12" x2="12" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
          </svg>
        </button>

        <div style="font-size: 1.2em; font-weight: 900; color: #eaf2ff; margin-bottom: 4px; display:flex; align-items:center; gap:8px;">
          <span>📊 Статистика</span>
        </div>
        <div style="font-size:13px; color:#9db7dd; margin-bottom:20px;">Глобальная статистика (не сбрасывается)</div>

        <div style="background: rgba(77,170,255,0.1); border: 1px solid rgba(77,170,255,0.2); border-radius:12px; padding:16px; text-align:center; margin-bottom:20px;">
          <div style="font-size:12px; color:#8ab8fd; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Всего слушали</div>
          <div style="font-size:2em; font-weight:900; color:#fff;">
            ${totalHours} <span style="font-size:0.5em; font-weight:normal; opacity:0.7;">часов</span>
          </div>
          <div style="font-size:12px; color:#9db7dd; margin-top:2px;">(${totalDays} дней)</div>
        </div>

        <div style="font-weight:900; color:#eaf2ff; margin-bottom:10px; font-size:14px;">Топ треков (3+ прослушивания)</div>
        
        <div style="max-height: 40vh; overflow-y:auto; padding-right:4px;">
          ${rowsHtml || '<div style="padding:20px; text-align:center; color:#666;">Пока недостаточно данных</div>'}
        </div>
      </div>
    `;

    window.Utils.createModal(html);
  }

  function formatSeconds(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const remM = m % 60;
      return `${h}ч ${remM}м`;
    }
    return `${m}м ${s}с`;
  }

  window.StatisticsModal = { show: showStatisticsModal };
})();
