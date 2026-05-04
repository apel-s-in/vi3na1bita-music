import { buildStatsViewModel } from '../../analytics/stats-state.js';

const esc = s => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || '');
const fmtDur = s => window.Utils?.fmt?.durationHuman ? window.Utils.fmt.durationHuman(s || 0) : `${Math.floor((s || 0) / 60)}м`;
const trackTitle = uid => esc(window.TrackRegistry?.getTrackByUid(uid)?.title || uid);

const renderList = (arr, fmt) => arr.length
  ? `<ul class="stat-list">${arr.map(s => `<li data-uid="${esc(s.uid)}"><span>${trackTitle(s.uid)}</span><span>${esc(fmt(s))}</span></li>`).join('')}</ul>`
  : '<div class="stat-sub">Недостаточно данных</div>';

const renderChart = (id, title, data, lsKey, labels = null) => {
  const max = Math.max(1, ...data);
  return `<div class="chart-block" id="${id}"><div class="chart-title chart-title--click" data-tg="${id}-bars" data-ls="${lsKey}">${esc(title)}</div><div class="chart-bars ${localStorage.getItem(lsKey) === '0' ? 'chart-bars--hidden' : ''}" id="${id}-bars">${data.map((v, i) => `<div class="chart-row"><div class="label">${esc(labels ? labels[i] : String(i).padStart(2, '0'))}</div><div class="bar"><div class="fill" style="width:${Math.round((v / max) * 100)}%"></div></div><div class="val">${esc(v)}</div></div>`).join('')}</div></div>`;
};

export const renderProfileStats = ({ container: c, all, vm = null }) => {
  const el = c?.querySelector('#prof-top-tracks'); if (!el) return;
  const m = vm || buildStatsViewModel(all || []), s = m.summary, f = m.globalFeatures;
  el.innerHTML = `<div class="stats-grid-compact"><div class="stat-box"><b>${s.uniqueTracks}</b><span>Уникальных</span></div><div class="stat-box"><b>${s.totalFull}</b><span>Полных</span></div><div class="stat-box"><b>${s.totalValid}</b><span>Валидных</span></div><div class="stat-box"><b>${fmtDur(s.totalSec)}</b><span>Время</span></div></div><div class="stats-grid-compact"><div class="stat-box"><b>${String(m.peakHour).padStart(2, '0')}:00</b><span>Пик часа</span></div><div class="stat-box"><b>${esc(m.peakDaypart)}</b><span>Время суток</span></div><div class="stat-box"><b>${f.sleep_timer || 0}</b><span>Таймер сна</span></div><div class="stat-box"><b>${f.social_visit_all ? 'Да' : 'Нет'}</b><span>Все соцсети</span></div></div>${renderChart('chart-hours', 'По часам суток', m.byHour, 'myStatsHoursOpen')}${renderChart('chart-week', 'По дням недели', m.byWeekday, 'myStatsWeekOpen', ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'])}${renderChart('chart-dayparts', 'По времени суток', m.dayparts.map(x => x.value), 'myStatsDayPartsOpen', m.dayparts.map(x => x.label))}<div class="stat-card stat-card--mb10"><div class="stat-title">Топ‑5 по полным прослушиваниям</div>${renderList(m.topFull, x => x.globalFullListenCount || 0)}</div><div class="stat-card stat-card--mb10"><div class="stat-title">Топ‑5 по валидным прослушиваниям</div>${renderList(m.topValid, x => x.globalValidListenCount || 0)}</div><div class="stat-card stat-card--mb15"><div class="stat-title">Топ‑5 по времени</div>${renderList(m.topTime, x => fmtDur(x.globalListenSeconds || 0))}</div><div class="prof-reset-wrap"><button class="backup-btn backup-btn--dark" id="stats-reset-open-btn" type="button">ОЧИСТИТЬ СТАТИСТИКУ</button></div>`;
};

export default { renderProfileStats };
