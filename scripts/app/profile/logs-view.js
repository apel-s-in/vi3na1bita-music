import { eventDomain, renderLogFilters, renderEventRow, bindHorizontalWheelScroll } from './logs-formatters.js';

export const renderProfileLogs = async ({ container: c, metaDB: db }) => {
  const lg = c?.querySelector('#prof-logs-list'); if (!lg) return;
  const draw = async (filter = lg.dataset.filter || 'all') => {
    lg.dataset.filter = filter;
    try {
      const raw = [...(await db?.getEvents('events_hot').catch(()=>[]) || []), ...(await db?.getEvents('events_warm').catch(()=>[]) || [])]
        .filter(Boolean)
        .sort((a,b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
      const list = raw.filter(ev => filter === 'all' || eventDomain(ev) === filter).slice(0, 100);
      lg.innerHTML = `${renderLogFilters(filter)}${list.length ? list.map(renderEventRow).join('') : '<div class="fav-empty">По этому фильтру событий нет</div>'}`;
      bindHorizontalWheelScroll(lg.querySelector('#prof-log-filters'));
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
