import { metaDB } from '../analytics/meta-db.js';

export async function openStatisticsModal(uid = null) {
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
    
    const bodyHtml = `
      <div style="text-align:center; margin-bottom: 20px;">
        <div style="width:100px; height:100px; border-radius:12px; overflow:hidden; margin:0 auto 12px; box-shadow:0 4px 15px rgba(0,0,0,0.5);">
          <img src="${t?.cover || 'img/logo.png'}" style="width:100%; height:100%; object-fit:cover;">
        </div>
        <h3 style="margin:0; color:#fff; font-size: 18px;">${window.Utils?.escapeHtml(t?.title || 'Без названия')}</h3>
        <div style="font-size:12px; color:var(--secondary-color); margin-top:4px;">${window.Utils?.escapeHtml(t?.album || '')}</div>
      </div>
      <div class="stats-grid-compact" style="margin-bottom: 20px;">
        <div class="stat-box"><b>${plays}</b><span>Дослушано</span></div>
        <div class="stat-box"><b>${skips}</b><span>Пропущено</span></div>
        <div class="stat-box"><b>${time}м</b><span>Время</span></div>
        <div class="stat-box"><b>${lyricsUsed}</b><span>Текст (раз)</span></div>
      </div>
      <button class="om-btn om-btn--primary" id="share-track-stat" style="width:100%;">📸 Создать карточку трека</button>
    `;

    const m = window.Modals.open({ title: 'Статистика трека', bodyHtml, maxWidth: 340 });
    m.querySelector('#share-track-stat').onclick = () => {
       import('../analytics/share-generator.js').then(mod => {
         m.remove();
         mod.ShareGenerator.generateAndShare('track', t, stat);
       });
    };
  } else {
    // -----------------------------------------------------
    // 2. ГЛОБАЛЬНАЯ СТАТИСТИКА (Сводка профиля)
    // -----------------------------------------------------
    const allStats = await metaDB.getAllStats();
    const totalFull = allStats.reduce((acc, s) => acc + (s.globalFullListenCount || 0), 0);
    const totalSecs = allStats.reduce((acc, s) => acc + (s.globalListenSeconds || 0), 0);
    
    const achVal = (await metaDB.getGlobal('unlocked_achievements'))?.value || {};
    const engine = window.achievementEngine;

    const topTracks = [...allStats]
      .sort((a, b) => (b.globalFullListenCount || 0) - (a.globalFullListenCount || 0))
      .slice(0, 5)
      .map(s => {
        const tr = window.TrackRegistry?.getTrackByUid(s.uid);
        return tr ? `<div class="top-track-row" style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:13px; color:#eaf2ff; align-items:center;">
          <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding-right:10px;">${window.Utils?.escapeHtml(tr.title)}</span>
          <b style="color:var(--secondary-color); flex-shrink:0;">${s.globalFullListenCount} раз</b>
        </div>` : '';
      }).join('') || '<div style="font-size:12px;color:#888;text-align:center;">Слушайте музыку, чтобы увидеть топ</div>';

    const bodyHtml = `
      <div class="stats-grid-compact" style="margin-bottom: 15px;">
        <div class="stat-box"><b>${totalFull}</b><span>Треков</span></div>
        <div class="stat-box"><b>${Math.floor(totalSecs / 60)}м</b><span>В пути</span></div>
      </div>
      <div style="margin-bottom:15px; background:rgba(0,0,0,0.2); padding:12px; border-radius:10px; border: 1px solid rgba(255,255,255,0.05);">
        <div style="font-size:11px; color:#888; margin-bottom:8px; font-weight:bold; letter-spacing:1px;">🏆 ТОП 5 ТРЕКОВ</div>
        ${topTracks}
      </div>
      <div style="font-size:11px; color:#888; margin-bottom:8px; font-weight:bold; letter-spacing:1px;">ДОСТИЖЕНИЯ (${Object.keys(achVal).length}/${engine?.achievements?.length || 0})</div>
      <div style="max-height:220px; overflow-y:auto; padding-right:5px; display:flex; flex-direction:column; gap:8px;">
        ${(engine?.achievements || []).map(a => `
          <div class="ach-item ${achVal[a.id] ? '' : 'locked'}" style="display:flex; align-items:center; gap:12px; padding:10px; background:rgba(255,255,255,0.03); border-radius:10px; border: 1px solid rgba(255,255,255,0.05);">
            <div class="ach-icon" style="font-size:24px; filter:${achVal[a.id] ? 'none' : 'grayscale(1)'}; opacity:${achVal[a.id] ? '1' : '0.5'};">${a.icon}</div>
            <div style="flex:1;">
              <div style="font-size:14px; font-weight:bold; color:#fff; margin-bottom:2px;">${a.name}</div>
              <div style="font-size:11px; color:#aaa;">${a.desc}</div>
            </div>
            ${achVal[a.id] ? '<div style="color:#4caf50; font-weight:bold;">✓</div>' : ''}
          </div>
        `).join('')}
      </div>
    `;

    window.Modals.open({ title: 'Профиль слушателя', bodyHtml, maxWidth: 400 });
  }
}

window.StatisticsModal = { 
  openStatisticsModal, 
  init: () => {
    document.addEventListener('click', e => { 
      const btn = e.target.closest('.stats-trigger');
      if(btn) openStatisticsModal(btn.dataset.uid); 
    });
  }
};
