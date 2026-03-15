import { metaDB } from '../analytics/meta-db.js';
import { fmtAchTimerText } from './progress-formatters.js';

export async function openStatisticsModal(uid = null) {
  if (!uid) uid = window.playerCore?.getCurrentTrackUid?.() || null;

  if (uid) {
    // -----------------------------------------------------
    // 1. ТРЕКОВАЯ СТАТИСТИКА (По конкретному треку)
    // -----------------------------------------------------
    const t = window.TrackRegistry?.getTrackByUid(uid);
    const stat = await metaDB.getStat(uid);

    const plays = stat?.globalFullListenCount || 0;
    const totalStarts = stat?.globalValidListenCount || 0;
    const skips = Math.max(0, totalStarts - plays);
    const time = Math.floor((stat?.globalListenSeconds || 0) / 60);
    const lyricsUsed = stat?.featuresUsed?.lyrics || 0;

    window.Utils?.dom?.createStyleOnce?.('statistics-modal-styles', `
      .sm-center{text-align:center}
      .sm-mb20{margin-bottom:20px}
      .sm-cover{width:100px;height:100px;border-radius:12px;overflow:hidden;margin:0 auto 12px;box-shadow:0 4px 15px rgba(0,0,0,0.5)}
      .sm-cover img{width:100%;height:100%;object-fit:cover}
      .sm-title{margin:0;color:#fff;font-size:18px}
      .sm-sub{font-size:12px;color:var(--secondary-color);margin-top:4px}
      .sm-fullw{width:100%}
      .sm-note{padding:14px 0 0;color:rgba(234,242,255,.72);font-size:12px;line-height:1.35;text-align:center;margin-bottom:14px}
      .sm-card{margin-bottom:12px;background:rgba(0,0,0,0.2);padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.05);font-size:12px;color:#cfe3ff}
      .sm-card-lg{margin-bottom:15px;background:rgba(0,0,0,0.2);padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.05)}
      .sm-cap{font-size:11px;color:#888;margin-bottom:8px;font-weight:bold;letter-spacing:1px}
      .sm-top-row{display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;color:#eaf2ff;align-items:center}
      .sm-top-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:10px}
      .sm-top-val{color:var(--secondary-color);flex-shrink:0}
      .sm-empty{text-align:center;font-size:12px;color:#888}
      .sm-ach-wrap{max-height:220px;overflow-y:auto;padding-right:5px;display:flex;flex-direction:column;gap:8px}
      .sm-ach-row{display:flex;align-items:center;gap:12px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;border:1px solid rgba(255,255,255,0.05)}
      .sm-ach-icon{font-size:24px}
      .sm-ach-main{flex:1}
      .sm-ach-name{font-size:14px;font-weight:bold;color:#fff;margin-bottom:2px}
      .sm-ach-desc{font-size:11px;color:#aaa}
      .sm-ach-ok{color:#4caf50;font-weight:bold}
    `);

    const bodyHtml = `
      <div class="sm-center sm-mb20">
        <div class="sm-cover"><img src="${t?.cover || 'img/logo.png'}"></div>
        <h3 class="sm-title">${window.Utils?.escapeHtml(t?.title || 'Без названия')}</h3>
        <div class="sm-sub">${window.Utils?.escapeHtml(t?.album || '')}</div>
      </div>
      <div class="stats-grid-compact sm-mb20">
        <div class="stat-box"><b>${plays}</b><span>Дослушано</span></div>
        <div class="stat-box"><b>${skips}</b><span>Пропущено</span></div>
        <div class="stat-box"><b>${time}м</b><span>Время</span></div>
        <div class="stat-box"><b>${lyricsUsed}</b><span>Текст (раз)</span></div>
      </div>
      <button class="om-btn om-btn--primary sm-fullw" id="share-track-stat">📸 Создать карточку трека</button>
    `;

    const m = window.Modals.open({ title: 'Статистика трека', bodyHtml, maxWidth: 340 });
    m.querySelector('#share-track-stat').onclick = () => {
      import('../analytics/share-generator.js').then(mod => {
        m.remove();
        mod.ShareGenerator.generateAndShare('track', t, stat);
      });
    };
    return;
  }

  // -----------------------------------------------------
  // 2. FALLBACK: Нет текущего трека
  // -----------------------------------------------------
  const allStats = await metaDB.getAllStats();
  const totalFull = allStats.reduce((acc, s) => acc + (s.globalFullListenCount || 0), 0);
  const totalSecs = allStats.reduce((acc, s) => acc + (s.globalListenSeconds || 0), 0);
  const byH = Array(24).fill(0), byW = Array(7).fill(0);
  allStats.filter(s => s.uid !== 'global').forEach(s => {
    (s.byHour || []).forEach((v, h) => byH[h] += v || 0);
    (s.byWeekday || []).forEach((v, d) => byW[d] += v || 0);
  });
  const gStat = allStats.find(s => s.uid === 'global') || {};
  const gFeat = gStat.featuresUsed || {};
  const peakHour = byH.indexOf(Math.max(...byH));
  const deadHour = byH.indexOf(Math.min(...byH));

  const achVal = (await metaDB.getGlobal('unlocked_achievements'))?.value || {};
  const engine = window.achievementEngine;

  const topTracks = [...allStats]
    .filter(s => s.uid !== 'global')
    .sort((a, b) => (b.globalFullListenCount || 0) - (a.globalFullListenCount || 0))
    .slice(0, 5)
    .map(s => {
      const tr = window.TrackRegistry?.getTrackByUid(s.uid);
      return tr ? `<div class="sm-top-row"><span class="sm-top-title">${window.Utils?.escapeHtml(tr.title)}</span><b class="sm-top-val">${s.globalFullListenCount} раз</b></div>` : '';
    }).join('') || '<div class="sm-empty">Слушайте музыку, чтобы увидеть топ</div>';

  const bodyHtml = `
    <div class="sm-note">Не удалось определить текущий трек. Показана общая статистика.</div>
    <div class="stats-grid-compact sm-mb20">
      <div class="stat-box"><b>${totalFull}</b><span>Треков</span></div>
      <div class="stat-box"><b>${Math.floor(totalSecs / 60)}м</b><span>В пути</span></div>
      <div class="stat-box"><b>${String(peakHour).padStart(2,'0')}:00</b><span>Пик активности</span></div>
      <div class="stat-box"><b>${String(deadHour).padStart(2,'0')}:00</b><span>Тихий час</span></div>
    </div>
    <div class="sm-card">
      <div class="sm-cap">🌙 ТАЙМЕР СНА</div>
      <div>Срабатываний: <b>${gFeat.sleep_timer || 0}</b></div>
      <div>Установок: <b>${gFeat.sleep_timer_set || 0}</b></div>
      <div>Продлений: <b>${gFeat.sleep_timer_extend || 0}</b></div>
      <div>Отмен: <b>${gFeat.sleep_timer_cancel || 0}</b></div>
      <div>Сумма минут: <b>${gFeat.sleep_timer_minutes_total || 0}</b></div>
    </div>
    <div class="sm-card-lg">
      <div class="sm-cap">🏆 ТОП 5 ТРЕКОВ</div>
      ${topTracks}
    </div>
    <div class="sm-cap">ДОСТИЖЕНИЯ (${Object.keys(achVal).length}/${engine?.achievements?.length || 0})</div>
    <div class="sm-ach-wrap">
      ${(engine?.achievements || []).map(a => `
        <div class="ach-item ${achVal[a.id] ? '' : 'locked'} sm-ach-row">
          <div class="ach-icon sm-ach-icon" style="filter:${achVal[a.id] ? 'none' : 'grayscale(1)'};opacity:${achVal[a.id] ? '1' : '0.5'};">${a.icon}</div>
          <div class="sm-ach-main">
            <div class="sm-ach-name">${a.name}</div>
            <div class="sm-ach-desc">${a.desc}${!achVal[a.id] && a.progressMeta ? ` · ${fmtAchTimerText(a, 'remaining')}` : ''}</div>
          </div>
          ${achVal[a.id] ? '<div class="sm-ach-ok">✓</div>' : ''}
        </div>
      `).join('')}
    </div>
  `;

  window.Modals.open({ title: 'Профиль слушателя', bodyHtml, maxWidth: 400 });
}

window.StatisticsModal = {
  openStatisticsModal,
  init: () => {
    document.addEventListener('click', e => {
      const btn = e.target.closest('.stats-trigger');
      if (btn) openStatisticsModal(btn.dataset.uid);
    });
  }
};
