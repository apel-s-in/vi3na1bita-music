import { readBackupV7JournalEvents } from '../../analytics/backup-v7-sync.js';
import { readSyncRevisions } from '../../analytics/sync-revisions.js';
import { LOG_FILTERS, eventDayKey, eventDomain, renderEventRow, renderLogControls } from './logs-formatters.js';

const JOURNAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
const HIDDEN_TYPES = new Set(['LISTEN_START']);
const safe = value => String(value == null ? '' : value).trim().toLowerCase();

const syncRevisionEvents = () => readSyncRevisions().map((row, index) => ({
  eventId: `sync_revision_${Number(row.timestamp || 0)}_${index}`,
  timestamp: Number(row.timestamp || 0),
  type: 'SYNC_STATE_CHANGED',
  domain: 'cloud',
  data: {
    reason: row.reason,
    ok: row.ok,
    error: row.error,
    uploadedShared: row.uploadedShared,
    uploadedDevice: row.uploadedDevice,
    uploadedEventArchive: row.uploadedEventArchive,
    domains: row.domains
  }
}));

export const renderProfileLogs = async ({ container: root }) => {
  const list = root?.querySelector('#prof-logs-list');
  if (!list) return;

  const cutoff = Date.now() - JOURNAL_WINDOW_MS;
  const selected = new Set(LOG_FILTERS.map(([key]) => key));
  let sort = 'newest';
  let query = '';
  let visibleLimit = PAGE_SIZE;

  try {
    const merged = new Map();
    [...await readBackupV7JournalEvents({ sinceAt: cutoff, limit: 3000 }), ...syncRevisionEvents()].forEach(event => {
      if (!event?.eventId || Number(event.timestamp || 0) < cutoff || HIDDEN_TYPES.has(String(event.type || ''))) return;
      merged.set(event.eventId, event);
    });
    const events = [...merged.values()];

    const draw = () => {
      const filtered = events
        .filter(event => selected.has(eventDomain(event)))
        .filter(event => {
          if (!query) return true;
          const track = event?.uid ? window.TrackRegistry?.getTrackByUid?.(event.uid) : null;
          return safe(JSON.stringify({ type: event.type, data: event.data, title: track?.title, album: track?.album, device: event.deviceLabel, os: event.deviceOs, browser: event.deviceBrowser })).includes(query);
        })
        .sort((left, right) => sort === 'oldest' ? Number(left.timestamp || 0) - Number(right.timestamp || 0) : Number(right.timestamp || 0) - Number(left.timestamp || 0));

      const visible = filtered.slice(0, visibleLimit);
      let previousDay = '';
      const rows = visible.map(event => {
        const day = eventDayKey(event);
        const heading = day !== previousDay ? `<div class="activity-day">${day}</div>` : '';
        previousDay = day;
        return `${heading}${renderEventRow(event)}`;
      }).join('');

      list.innerHTML = `${renderLogControls({ selected, sort, query, count: filtered.length })}<div class="activity-list">${rows || '<div class="fav-empty">За последние 30 дней подходящих событий нет</div>'}</div>${filtered.length > visible.length ? '<button type="button" class="om-btn om-btn--outline om-fullw" data-log-more>Показать ещё</button>' : ''}`;
    };

    list.addEventListener('change', event => {
      const domain = event.target?.dataset?.logDomain;
      if (domain) {
        event.target.checked ? selected.add(domain) : selected.delete(domain);
        visibleLimit = PAGE_SIZE;
        draw();
        return;
      }
      if (event.target?.matches?.('[data-log-sort]')) {
        sort = event.target.value === 'oldest' ? 'oldest' : 'newest';
        visibleLimit = PAGE_SIZE;
        draw();
      }
    });

    list.addEventListener('input', event => {
      if (!event.target?.matches?.('[data-log-search]')) return;
      query = safe(event.target.value);
      visibleLimit = PAGE_SIZE;
      draw();
      requestAnimationFrame(() => {
        const input = list.querySelector('[data-log-search]');
        input?.focus();
        input?.setSelectionRange?.(input.value.length, input.value.length);
      });
    });

    list.addEventListener('click', event => {
      if (!event.target.closest('[data-log-more]')) return;
      visibleLimit += PAGE_SIZE;
      draw();
    });

    draw();
  } catch {
    list.innerHTML = '<div class="fav-empty">Ошибка загрузки 30-дневного журнала</div>';
  }
};

export default { renderProfileLogs };
