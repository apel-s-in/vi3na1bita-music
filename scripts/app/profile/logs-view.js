import { describeEventForUi, getEventDomain } from '../../analytics/event-contract.js';

const esc = s => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || '');

const FILTERS = [
  ['all', 'Все'],
  ['listening', 'Прослушивания'],
  ['favorites', 'Избранное'],
  ['playlists', 'Плейлисты'],
  ['achievement', 'Достижения'],
  ['profile', 'Профиль'],
  ['auth', 'Авторизация'],
  ['cloud', 'Облако']
];

const eventTrackTitle = ev => {
  const t = ev?.uid ? window.TrackRegistry?.getTrackByUid?.(ev.uid) : null;
  return t?.title || ev?.uid || '';
};

const eventDeviceLabel = ev => [ev?.deviceLabel, ev?.deviceClass || ev?.platform, ev?.devicePwa ? 'PWA' : ''].filter(Boolean).join(' · ');

const renderFilters = cur => `<div class="ach-classic-tabs" id="prof-log-filters">${FILTERS.map(([k, t]) => `<div class="ach-classic-tab ${cur === k ? 'active' : ''}" data-log-filter="${k}">${t}</div>`).join('')}</div>`;

const eventDomain = ev => ev?.domain || getEventDomain(ev?.type);

const bindWheelScroll = tabs => {
  if (!tabs || tabs._wheelScrollBound) return;
  tabs._wheelScrollBound = true;
  tabs.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) && !e.deltaX) return;
    if (tabs.scrollWidth <= tabs.clientWidth) return;
    e.preventDefault();
    tabs.scrollLeft += e.deltaY || e.deltaX;
  }, { passive: false });
};

const renderEventRow = ev => {
  const vm = describeEventForUi(ev);
  const tr = eventTrackTitle(ev), dev = eventDeviceLabel(ev);
  const time = ev?.timestamp ? new Date(ev.timestamp).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
  return `<div class="profile-list-item" data-event-domain="${esc(eventDomain(ev))}" data-event-type="${esc(ev?.type || '')}">
    <div class="log-time">${esc(time)}</div>
    <div class="log-info">
      <div class="log-title">${esc(vm.icon)} ${esc(vm.title)}</div>
      <div class="log-desc">${esc([tr, vm.desc, dev].filter(Boolean).join(' · '))}</div>
    </div>
  </div>`;
};

export const renderProfileLogs = async ({ container: c, metaDB: db }) => {
  const lg = c?.querySelector('#prof-logs-list'); if (!lg) return;
  const draw = async (filter = lg.dataset.filter || 'all') => {
    lg.dataset.filter = filter;
    try {
      const raw = [...(await db?.getEvents('events_hot').catch(()=>[]) || []), ...(await db?.getEvents('events_warm').catch(()=>[]) || [])]
        .filter(Boolean)
        .sort((a,b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
      const list = raw.filter(ev => filter === 'all' || eventDomain(ev) === filter).slice(0, 100);
      lg.innerHTML = `${renderFilters(filter)}${list.length ? list.map(renderEventRow).join('') : '<div class="fav-empty">По этому фильтру событий нет</div>'}`;
      bindWheelScroll(lg.querySelector('#prof-log-filters'));
      lg.querySelector('#prof-log-filters')?.addEventListener('click', e => {
        const f = e.target.closest('[data-log-filter]')?.dataset.logFilter;
        if (f) draw(f);
      });
    } catch {
      lg.innerHTML = '<div class="fav-empty">Ошибка загрузки журнала</div>';
    }
  };
  await draw();
};

export default { renderProfileLogs };
