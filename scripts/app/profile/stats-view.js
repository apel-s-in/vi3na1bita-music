const esc = s => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || '');

export const renderProfileStats = ({ container: c, all }) => {
  const ttEl = c?.querySelector('#prof-top-tracks'); if (!ttEl) return;
  const vs = (all || []).filter(s => s.uid && s.uid !== 'global'), gs = (all || []).find(s => s.uid === 'global') || {}, gFeat = gs.featuresUsed || {};
  const mkL = (arr, fmt) => arr.length ? `<ul class="stat-list">${arr.map(s => `<li data-uid="${s.uid}"><span>${esc(window.TrackRegistry?.getTrackByUid(s.uid)?.title || s.uid)}</span><span>${fmt(s)}</span></li>`).join('')}</ul>` : `<div class="stat-sub">Недостаточно данных</div>`;
  const rCh = (id, tit, data, lsKey, lbls) => `<div class="chart-block" id="${id}"><div class="chart-title chart-title--click" data-tg="${id}-bars" data-ls="${lsKey}">${tit}</div><div class="chart-bars ${localStorage.getItem(lsKey)==='0'?'chart-bars--hidden':''}" id="${id}-bars">${data.map((v, i) => `<div class="chart-row"><div class="label">${lbls ? lbls[i] : String(i).padStart(2,'0')}</div><div class="bar"><div class="fill" style="width:${Math.round((v / Math.max(1, ...data)) * 100)}%"></div></div><div class="val">${v}</div></div>`).join('')}</div></div>`;

  const byH = Array(24).fill(0), byW = Array(7).fill(0);
  vs.forEach(s => { Array.isArray(s.byHour) && s.byHour.forEach((v, h) => h >= 0 && h < 24 && (byH[h] += Number(v) || 0)); Array.isArray(s.byWeekday) && s.byWeekday.forEach((v, d) => d >= 0 && d < 7 && (byW[d] += Number(v) || 0)); });

  const sum = k => vs.reduce((a, s) => a + (s[k] || 0), 0), totalValid = sum('globalValidListenCount'), totalFull = sum('globalFullListenCount'), totalSecs = sum('globalListenSeconds'), uniqTracks = vs.filter(s => (s.globalValidListenCount || 0) > 0).length;
  const dp = [{ l: 'Ночь', f: 0, t: 5 }, { l: 'Утро', f: 6, t: 11 }, { l: 'День', f: 12, t: 17 }, { l: 'Вечер', f: 18, t: 23 }].map(x => ({ label: x.l, value: byH.slice(x.f, x.t + 1).reduce((a, v) => a + v, 0) }));

  // Статистика по устройствам из device registry
  let deviceStatsHtml = '';
  try {
    const devReg = JSON.parse(localStorage.getItem('backup:device_registry:v1') || '[]');
    if (Array.isArray(devReg) && devReg.length > 1) {
      const curHash = localStorage.getItem('deviceHash') || '';
      const rows = devReg.map(d => {
        const isCur = d.deviceHash === curHash;
        const platform = { ios: '📱 iOS', android: '📱 Android', web: '💻 Desktop' }[d.platform] || '💻';
        const lastSeen = d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleDateString('ru-RU') : '—';
        return `<div class="profile-list-item${isCur ? ' current' : ''}">
          <div class="log-info"><div class="log-title">${platform}${isCur ? ' (это устройство)' : ''}</div>
          <div class="log-desc">Последний раз: ${lastSeen}</div></div></div>`;
      }).join('');
      const canDelete = devReg.filter(d => d.deviceHash !== curHash).length > 0;
      deviceStatsHtml = `<div class="profile-section-title" style="margin-top:8px;display:flex;align-items:center;justify-content:space-between">
        <span>📱 УСТРОЙСТВА</span>
        ${canDelete ? `<button id="cleanup-devices-btn" class="om-btn om-btn--ghost" style="font-size:11px;padding:4px 10px">🗑 Очистить старые</button>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">${rows}</div>`;
    }
  } catch {}

  ttEl.innerHTML = `<div class="stats-grid-compact"><div class="stat-box"><b>${uniqTracks}</b><span>Уникальных</span></div><div class="stat-box"><b>${totalFull}</b><span>Полных</span></div><div class="stat-box"><b>${totalValid}</b><span>Валидных</span></div><div class="stat-box"><b>${window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(totalSecs) : `${Math.floor(totalSecs / 60)}м`}</b><span>Время</span></div></div><div class="stats-grid-compact"><div class="stat-box"><b>${String(byH.indexOf(Math.max(...byH))).padStart(2,'0')}:00</b><span>Пик часа</span></div><div class="stat-box"><b>${[...dp].sort((a,b)=>b.value-a.value)[0]?.label||'—'}</b><span>Время суток</span></div><div class="stat-box"><b>${gFeat.sleep_timer || 0}</b><span>Таймер сна</span></div><div class="stat-box"><b>${gFeat.social_visit_all ? 'Да' : 'Нет'}</b><span>Все соцсети</span></div></div>${rCh('chart-hours', 'По часам суток', byH, 'myStatsHoursOpen')}${rCh('chart-week', 'По дням недели', byW, 'myStatsWeekOpen', ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'])}${rCh('chart-dayparts', 'По времени суток', dp.map(x=>x.value), 'myStatsDayPartsOpen', dp.map(x=>x.label))}<div class="stat-card stat-card--mb10"><div class="stat-title">Топ‑5 по полным прослушиваниям</div>${mkL([...vs].sort((a, b) => (b.globalFullListenCount || 0) - (a.globalFullListenCount || 0)).slice(0, 5), s => s.globalFullListenCount || 0)}</div><div class="stat-card stat-card--mb10"><div class="stat-title">Топ‑5 по валидным прослушиваниям</div>${mkL([...vs].sort((a, b) => (b.globalValidListenCount || 0) - (a.globalValidListenCount || 0)).slice(0, 5), s => s.globalValidListenCount || 0)}</div><div class="stat-card stat-card--mb15"><div class="stat-title">Топ‑5 по времени</div>${mkL([...vs].sort((a, b) => (b.globalListenSeconds || 0) - (a.globalListenSeconds || 0)).slice(0, 5), s => window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(s.globalListenSeconds || 0) : `${Math.floor((s.globalListenSeconds || 0) / 60)}м`)}</div>  <div class="prof-reset-wrap"><button class="backup-btn backup-btn--dark" id="stats-reset-open-btn" type="button">ОЧИСТИТЬ СТАТИСТИКУ</button></div>
  ${deviceStatsHtml}`;
};
