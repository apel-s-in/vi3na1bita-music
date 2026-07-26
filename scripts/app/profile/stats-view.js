import { resolveListeningStatsViewModel } from '../../analytics/confirmed-listening-stats.js';

const esc = value =>
  window.Utils?.escapeHtml?.(String(value || '')) ||
  String(value || '');

const dur = seconds => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (total === 0) return '0м';
  if (total < 60) return '<1м';

  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (days > 0) {
    return hours > 0 ? `${days}д ${hours}ч` : `${days}д`;
  }

  if (hours > 0) {
    return minutes > 0 ? `${hours}ч ${minutes}м` : `${hours}ч`;
  }

  return `${minutes}м`;
};

const tT = uid =>
  esc(
    window.TrackRegistry?.getTrackByUid(uid)?.title ||
    uid
  );
const rL = (a,f) => a.length ? `<ul class="stat-list">${a.map(s=>`<li data-uid="${esc(s.uid)}"><span>${tT(s.uid)}</span><span>${esc(f(s))}</span></li>`).join('')}</ul>` : '<div class="stat-sub">Недостаточно данных</div>';
const rC = (id, title, data, storageKey, labels = null) => {
  const max = Math.max(1, ...data);

  return `<div class="chart-block" id="${id}"><div class="chart-title chart-title--click" data-tg="${id}-bars" data-ls="${storageKey}">${esc(title)}</div><div class="chart-bars ${localStorage.getItem(storageKey) === '0' ? 'chart-bars--hidden' : ''}" id="${id}-bars">${data.map((value, index) => `<div class="chart-row"><div class="label">${esc(labels ? labels[index] : String(index).padStart(2, '0'))}</div><div class="bar"><div class="fill" style="width:${Math.round((value / max) * 100)}%"></div></div><div class="val">${esc(dur(value))}</div></div>`).join('')}</div></div>`;
};
export const renderProfileStats = ({ container: c, all, vm = null }) => { const el = c?.querySelector('#prof-top-tracks'); if(!el)return; const m=vm||resolveListeningStatsViewModel(all||[]), s=m.summary, f=m.globalFeatures, fullTotal=s.totalFull; el.innerHTML=`${m.pending?'<div class="stat-card"><div class="stat-sub">Подтверждённая серверная статистика обновляется…</div></div>':m.source==='server_confirmed'?`<div class="stat-card"><div class="stat-sub">Данные подтверждены сервером${m.exact?'':' · часть старого времени не имеет точной раскладки по часам'}</div></div>`:'<div class="stat-card"><div class="stat-sub">Локальная статистика этого устройства</div></div>'}<div class="stats-grid-compact"><div class="stat-box"><b>${s.uniqueTracks}</b><span>Уникальных</span></div><div class="stat-box"><b>${fullTotal}</b><span>Полных</span></div><div class="stat-box"><b>${s.totalValid}</b><span>Валидных</span></div><div class="stat-box"><b>${dur(s.totalSec)}</b><span>Время</span></div></div><div class="stats-grid-compact"><div class="stat-box"><b>${String(m.peakHour).padStart(2,'0')}:00</b><span>Пик часа</span></div><div class="stat-box"><b>${esc(m.peakDaypart)}</b><span>Время суток</span></div><div class="stat-box"><b>${f.sleep_timer||0}</b><span>Таймер сна</span></div><div class="stat-box"><b>${f.backup||0}</b><span>Backup</span></div></div>${rC('chart-hours','По часам суток',m.byHour,'myStatsHoursOpen')}${rC('chart-week','По дням недели',m.byWeekday,'myStatsWeekOpen',['Пн','Вт','Ср','Чт','Пт','Сб','Вс'])}${rC('chart-dayparts','По времени суток',m.dayparts.map(x=>x.value),'myStatsDayPartsOpen',m.dayparts.map(x=>x.label))}<div class="stat-card stat-card--mb10"><div class="stat-title">Топ‑5 по полным прослушиваниям</div>${rL(m.topFull, x=>x.globalFullListenCount||0)}</div><div class="stat-card stat-card--mb10"><div class="stat-title">Топ‑5 по валидным прослушиваниям</div>${rL(m.topValid, x=>x.globalValidListenCount||0)}</div><div class="stat-card stat-card--mb15"><div class="stat-title">Топ‑5 по времени</div>${rL(m.topTime, x=>dur(x.globalListenSeconds||0))}</div>`; };
export default { renderProfileStats };
