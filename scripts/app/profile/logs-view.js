import { eventDomain, renderLogFilters, renderEventRow, bindHorizontalWheelScroll } from './logs-formatters.js';

const JOURNAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const HIDDEN_TYPES = new Set(['LISTEN_START', 'LISTEN_SKIP', 'BACKUP_CREATED', 'RESTORE_APPLIED', 'SYNC_STATE_CHANGED']);

export const renderProfileLogs = async ({ container: c, metaDB: db }) => {
  const list = c?.querySelector('#prof-logs-list');
  if (!list) return;

  const draw = async (filter = list.dataset.filter || 'all') => {
    list.dataset.filter = filter;

    try {
      const cutoff = Date.now() - JOURNAL_WINDOW_MS;
      const rows = [
        ...((await db?.getEvents('events_hot').catch(() => [])) || []),
        ...((await db?.getEvents('events_warm').catch(() => [])) || [])
      ]
        .filter(event => event && Number(event.timestamp || 0) >= cutoff && !HIDDEN_TYPES.has(String(event.type || '')))
        .sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0));

      const visible = rows
        .filter(event => filter === 'all' || eventDomain(event) === filter)
        .slice(0, 300);

      list.innerHTML = `${renderLogFilters(filter)}${visible.length ? visible.map(renderEventRow).join('') : '<div class="fav-empty">За последние 30 дней событий этого типа нет</div>'}`;
      bindHorizontalWheelScroll(list.querySelector('#prof-log-filters'));

      list.querySelector('#prof-log-filters')?.addEventListener('click', event => {
        const next = event.target.closest('[data-log-filter]')?.dataset.logFilter;
        if (next) draw(next);
      });
    } catch {
      list.innerHTML = '<div class="fav-empty">Ошибка загрузки журнала</div>';
    }
  };

  await draw();
};

export default { renderProfileLogs };
