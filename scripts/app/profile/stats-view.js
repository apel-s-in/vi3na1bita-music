const esc = s => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || '');

export const renderProfileStats = ({ container: c, all }) => {
  const ttEl = c?.querySelector('#prof-top-tracks'); if (!ttEl) return;

  const vs = (all || []).filter(s => s.uid && s.uid !== 'global');
  const gs = (all || []).find(s => s.uid === 'global') || {};
  const gFeat = gs.featuresUsed || {};

  const mkL = (arr, fmt) => arr.length
    ? `<ul class="stat-list">${arr.map(s => `<li data-uid="${s.uid}"><span>${esc(window.TrackRegistry?.getTrackByUid(s.uid)?.title || s.uid)}</span><span>${fmt(s)}</span></li>`).join('')}</ul>`
    : `<div class="stat-sub">Недостаточно данных</div>`;

  const rCh = (id, title, data, lsKey, labels) => `<div class="chart-block" id="${id}"><div class="chart-title chart-title--click" data-tg="${id}-bars" data-ls="${lsKey}">${title}</div><div class="chart-bars ${localStorage.getItem(lsKey)==='0'?'chart-bars--hidden':''}" id="${id}-bars">${data.map((v, i) => `<div class="chart-row"><div class="label">${labels ? labels[i] : String(i).padStart(2,'0')}</div><div class="bar"><div class="fill" style="width:${Math.round((v / Math.max(1, ...data)) * 100)}%"></div></div><div class="val">${v}</div></div>`).join('')}</div></div>`;

  const byH = Array(24).fill(0), byW = Array(7).fill(0);
  vs.forEach(s => {
    if (Array.isArray(s.byHour)) s.byHour.forEach((v, h) => { if (h >= 0 && h < 24) byH[h] += Number(v) || 0; });
    if (Array.isArray(s.byWeekday)) s.byWeekday.forEach((v, d) => { if (d >= 0 && d < 7) byW[d] += Number(v) || 0; });
  });

  const totalValid = vs.reduce((a, s) => a + (s.globalValidListenCount || 0), 0);
  const totalFull = vs.reduce((a, s) => a + (s.globalFullListenCount || 0), 0);
  const totalSecs = vs.reduce((a, s) => a + (s.globalListenSeconds || 0), 0);
  const uniqTracks = vs.filter(s => (s.globalValidListenCount || 0) > 0).length;

  const dayParts = [
    { label: 'Ночь', from: 0, to: 5 },
    { label: 'Утро', from: 6, to: 11 },
    { label: 'День', from: 12, to: 17 },
    { label: 'Вечер', from: 18, to: 23 }
  ].map(x => ({
    label: x.label,
    value: byH.slice(x.from, x.to + 1).reduce((a, v) => a + v, 0)
  }));

  const peakHour = byH.indexOf(Math.max(...byH));
  const topDayPart = [...dayParts].sort((a, b) => b.value - a.value)[0]?.label || '—';

  ttEl.innerHTML =
    `<div class="stats-mini-grid">
      <div class="stats-mini-box"><b>${uniqTracks}</b><span>Уникальных</span></div>
      <div class="stats-mini-box"><b>${totalFull}</b><span>Полных</span></div>
      <div class="stats-mini-box"><b>${totalValid}</b><span>Валидных</span></div>
      <div class="stats-mini-box"><b>${window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(totalSecs) : `${Math.floor(totalSecs / 60)}м`}</b><span>Время</span></div>
    </div>` +

    `<div class="stats-mini-grid">
      <div class="stats-mini-box"><b>${String(peakHour).padStart(2,'0')}:00</b><span>Пик часа</span></div>
      <div class="stats-mini-box"><b>${topDayPart}</b><span>Время суток</span></div>
      <div class="stats-mini-box"><b>${gFeat.sleep_timer || 0}</b><span>Таймер сна</span></div>
      <div class="stats-mini-box"><b>${gFeat.social_visit_all || 0 ? 'Да' : 'Нет'}</b><span>Все соцсети</span></div>
    </div>` +

    rCh('chart-hours', 'По часам суток', byH, 'myStatsHoursOpen') +
    rCh('chart-week', 'По дням недели', byW, 'myStatsWeekOpen', ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']) +
    rCh('chart-dayparts', 'По времени суток', dayParts.map(x => x.value), 'myStatsDayPartsOpen', dayParts.map(x => x.label)) +

    `<div class="stat-card stat-card--mb10"><div class="stat-title">Топ‑5 по полным прослушиваниям</div>${mkL([...vs].sort((a, b) => (b.globalFullListenCount || 0) - (a.globalFullListenCount || 0)).slice(0, 5), s => s.globalFullListenCount || 0)}</div>` +
    `<div class="stat-card stat-card--mb10"><div class="stat-title">Топ‑5 по валидным прослушиваниям</div>${mkL([...vs].sort((a, b) => (b.globalValidListenCount || 0) - (a.globalValidListenCount || 0)).slice(0, 5), s => s.globalValidListenCount || 0)}</div>` +
    `<div class="stat-card stat-card--mb15"><div class="stat-title">Топ‑5 по времени</div>${mkL([...vs].sort((a, b) => (b.globalListenSeconds || 0) - (a.globalListenSeconds || 0)).slice(0, 5), s => window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(s.globalListenSeconds || 0) : `${Math.floor((s.globalListenSeconds || 0) / 60)}м`)}</div>` +
    `<div class="prof-reset-wrap"><button class="backup-btn backup-btn--dark" id="stats-reset-open-btn" type="button">ОЧИСТИТЬ СТАТИСТИКУ</button></div>`;
};
