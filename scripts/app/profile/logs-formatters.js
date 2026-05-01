import { describeEventForUi, getEventDomain } from '../../analytics/event-contract.js';

export const esc = s => window.Utils?.escapeHtml ? window.Utils.escapeHtml(String(s || '')) : String(s || '');

export const LOG_FILTERS = [
  ['all', 'Все'],
  ['listening', 'Прослушивания'],
  ['favorites', 'Избранное'],
  ['playlists', 'Плейлисты'],
  ['achievement', 'Достижения'],
  ['profile', 'Профиль'],
  ['auth', 'Авторизация'],
  ['cloud', 'Облако']
];

export const eventDomain = ev => ev?.domain || getEventDomain(ev?.type);

export const formatEventDate = ev =>
  ev?.timestamp ? new Date(ev.timestamp).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const eventTrackTitle = ev => {
  const t = ev?.uid ? window.TrackRegistry?.getTrackByUid?.(ev.uid) : null;
  return t?.title || ev?.uid || '';
};

export const eventDeviceLabel = ev =>
  [ev?.deviceLabel, ev?.deviceClass || ev?.platform, ev?.devicePwa ? 'PWA' : ''].filter(Boolean).join(' · ');

export const renderLogFilters = cur =>
  `<div class="ach-classic-tabs" id="prof-log-filters">${LOG_FILTERS.map(([k, t]) => `<div class="ach-classic-tab ${cur === k ? 'active' : ''}" data-log-filter="${k}">${esc(t)}</div>`).join('')}</div>`;

export const renderEventRow = ev => {
  const vm = describeEventForUi(ev);
  const desc = [eventTrackTitle(ev), vm.desc, eventDeviceLabel(ev)].filter(Boolean).join(' · ');
  return `<div class="profile-list-item profile-log-row" data-event-domain="${esc(eventDomain(ev))}" data-event-type="${esc(ev?.type || '')}">
    <div class="log-time profile-log-date">${esc(formatEventDate(ev))}</div>
    <div class="log-info profile-log-info">
      <div class="log-title">${esc(vm.icon)} ${esc(vm.title)}</div>
      <div class="log-desc">${esc(desc)}</div>
    </div>
  </div>`;
};

export const bindHorizontalWheelScroll = tabs => {
  if (!tabs || tabs._wheelScrollBound) return;
  tabs._wheelScrollBound = true;
  tabs.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) && !e.deltaX) return;
    if (tabs.scrollWidth <= tabs.clientWidth) return;
    e.preventDefault();
    tabs.scrollLeft += e.deltaY || e.deltaX;
  }, { passive: false });
};

export default {
  LOG_FILTERS,
  eventDomain,
  formatEventDate,
  eventTrackTitle,
  eventDeviceLabel,
  renderLogFilters,
  renderEventRow,
  bindHorizontalWheelScroll
};
