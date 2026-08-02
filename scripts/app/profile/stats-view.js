import { resolveListeningStatsViews } from '../../analytics/confirmed-listening-stats.js';

const SOURCE_KEY = 'profile:stats-source:v1';
const esc = value => window.Utils?.escapeHtml?.(String(value || '')) || String(value || '');
const dur = seconds => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!total) return '0м';
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return hours ? `${days}д ${hours}ч` : `${days}д`;
  if (hours) return minutes ? `${hours}ч ${minutes}м` : `${hours}ч`;
  return total < 60 ? '<1м' : `${minutes}м`;
};
const trackTitle = uid => esc(window.TrackRegistry?.getTrackByUid(uid)?.title || uid);
const renderList = (rows, formatter) => rows.length ? `<ul class="stat-list">${rows.map(row => `<li data-uid="${esc(row.uid)}"><span>${trackTitle(row.uid)}</span><span>${esc(formatter(row))}</span></li>`).join('')}</ul>` : '<div class="stat-sub">Недостаточно данных</div>';
const renderChart = (id, title, data, storageKey, labels = null) => {
  const max = Math.max(1, ...data);
  return `<div class="chart-block" id="${id}"><div class="chart-title chart-title--click" data-tg="${id}-bars" data-ls="${storageKey}">${esc(title)}</div><div class="chart-bars ${localStorage.getItem(storageKey) === '0' ? 'chart-bars--hidden' : ''}" id="${id}-bars">${data.map((value, index) => `<div class="chart-row"><div class="label">${esc(labels ? labels[index] : String(index).padStart(2, '0'))}</div><div class="bar"><div class="fill" style="width:${Math.round((value / max) * 100)}%"></div></div><div class="val">${esc(dur(value))}</div></div>`).join('')}</div></div>`;
};
const selectedSource = () => localStorage.getItem(SOURCE_KEY) === 'server' ? 'server' : 'local';

export const renderProfileStats = ({ container, all = [] }) => {
  const root = container?.querySelector('#prof-top-tracks');
  if (!root) return;

  const views = resolveListeningStatsViews(all);
  const requested = selectedSource();
  const source = requested === 'server' && views.server.available ? 'server' : 'local';
  const model = source === 'server' ? views.server : views.local;
  const summary = model.summary;
  const features = model.globalFeatures || {};

  root._statsRows = all;
  root.innerHTML = `
    <div class="stats-source-tabs" role="tablist" aria-label="Источник статистики">
      <button type="button" class="stats-source-tab ${source === 'local' ? 'is-active' : ''}" data-stats-source="local">На устройстве</button>
      <button type="button" class="stats-source-tab ${source === 'server' ? 'is-active' : ''}" data-stats-source="server" ${views.server.available ? '' : 'disabled'}>Подтверждено сервером</button>
    </div>
    <div class="stat-card"><div class="stat-sub">${source === 'server' ? `Серверно подтверждённые данные${model.exact ? '' : ' · часть старого времени не имеет точной раскладки'}` : 'Локальная rebuildable-статистика, включая данные других устройств после Backup V7 pull'}</div></div>
    ${requested === 'server' && !views.server.available ? '<div class="stat-card"><div class="stat-sub">Серверная статистика пока загружается. Показаны локальные данные.</div></div>' : ''}
    <div class="stats-grid-compact">
      <div class="stat-box"><b>${summary.uniqueTracks}</b><span>Уникальных</span></div>
      <div class="stat-box"><b>${summary.totalFull}</b><span>Полных</span></div>
      <div class="stat-box"><b>${summary.totalValid}</b><span>Валидных</span></div>
      <div class="stat-box"><b>${dur(summary.totalSec)}</b><span>Время</span></div>
    </div>
    <div class="stats-grid-compact">
      <div class="stat-box"><b>${String(model.peakHour).padStart(2, '0')}:00</b><span>Пик часа</span></div>
      <div class="stat-box"><b>${esc(model.peakDaypart)}</b><span>Время суток</span></div>
      <div class="stat-box"><b>${features.sleep_timer || 0}</b><span>Таймер сна</span></div>
      <div class="stat-box"><b>${source === 'local' ? features.lyrics || 0 : '—'}</b><span>Лирика</span></div>
    </div>
    ${renderChart('chart-hours', 'По часам суток', model.byHour, 'myStatsHoursOpen')}
    ${renderChart('chart-week', 'По дням недели', model.byWeekday, 'myStatsWeekOpen', ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'])}
    ${renderChart('chart-dayparts', 'По времени суток', model.dayparts.map(item => item.value), 'myStatsDayPartsOpen', model.dayparts.map(item => item.label))}
    <div class="stat-card stat-card--mb10"><div class="stat-title">Топ‑5 по полным прослушиваниям</div>${renderList(model.topFull, item => item.globalFullListenCount || 0)}</div>
    <div class="stat-card stat-card--mb10"><div class="stat-title">Топ‑5 по валидным прослушиваниям</div>${renderList(model.topValid, item => item.globalValidListenCount || 0)}</div>
    <div class="stat-card stat-card--mb15"><div class="stat-title">Топ‑5 по времени</div>${renderList(model.topTime, item => dur(item.globalListenSeconds || 0))}</div>
  `;

  if (!root._statsSourceBound) {
    root._statsSourceBound = true;
    root.addEventListener('click', event => {
      const button = event.target.closest('[data-stats-source]');
      if (!button || button.disabled) return;
      localStorage.setItem(SOURCE_KEY, button.dataset.statsSource === 'server' ? 'server' : 'local');
      renderProfileStats({ container: root.closest('#track-list'), all: root._statsRows || [] });
    });
  }
};

export default { renderProfileStats };
