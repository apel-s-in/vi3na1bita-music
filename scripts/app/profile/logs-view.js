import { readBackupV7JournalEvents } from '../../analytics/backup-v7-sync.js';
import { readSyncRevisions } from '../../analytics/sync-revisions.js';
import { LOG_FILTERS, eventDayKey, eventDomain, getJournalDayWindow, journalDayId, renderEventRow, renderLogControls } from './logs-formatters.js';

const JOURNAL_DAY_COUNT = 30;
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

  list._activityCleanup?.();
  const controller = new AbortController();
  let dayWindow = getJournalDayWindow(JOURNAL_DAY_COUNT);
  const selected = new Set(LOG_FILTERS.map(([key]) => key));
  let events = [];
  let sort = 'newest';
  let query = '';
  let visibleLimit = PAGE_SIZE;
  let refreshTimer = 0;
  let dayTimer = 0;

  const loadEvents = async () => {
    dayWindow = getJournalDayWindow(JOURNAL_DAY_COUNT);
    const merged = new Map();
    const remoteAndLocal = await readBackupV7JournalEvents({ sinceAt: dayWindow.sinceAt, limit: 5000 });
    [...remoteAndLocal, ...syncRevisionEvents()].forEach(event => {
      if (!event?.eventId || !dayWindow.set.has(journalDayId(event)) || HIDDEN_TYPES.has(String(event.type || ''))) return;
      merged.set(event.eventId, event);
    });
    events = [...merged.values()];
  };

  const updateTopButton = () => {
    const button = list.querySelector('[data-log-top]');
    const controls = list.querySelector('.activity-controls');
    if (!button || !controls) return;
    button.classList.toggle('is-visible', controls.getBoundingClientRect().top < -180);
  };

  const draw = () => {
    if (!list.isConnected) return;
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

    list.innerHTML = `${renderLogControls({ selected, sort, query, count: filtered.length })}<div class="activity-list">${rows || '<div class="fav-empty">За последние 30 полных дней подходящих событий нет</div>'}</div>${filtered.length > visible.length ? '<button type="button" class="om-btn om-btn--outline om-fullw" data-log-more>Показать ещё</button>' : ''}<button type="button" class="activity-to-top" data-log-top aria-label="Вернуться к началу истории" title="К началу истории">↑</button>`;
    updateTopButton();
  };

  const scheduleRefresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      refreshTimer = 0;
      try {
        await loadEvents();
        draw();
      } catch {}
    }, 350);
  };

  try {
    await loadEvents();

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
    }, { signal: controller.signal });

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
    }, { signal: controller.signal });

    list.addEventListener('click', event => {
      if (event.target.closest('[data-log-top]')) {
        list.querySelector('.activity-controls')?.scrollIntoView({ behavior: 'auto', block: 'start' });
        return;
      }
      if (!event.target.closest('[data-log-more]')) return;
      visibleLimit += PAGE_SIZE;
      draw();
    }, { signal: controller.signal });

    window.addEventListener('scroll', updateTopButton, { signal: controller.signal, passive: true });
    window.addEventListener('analytics:eventQueued', scheduleRefresh, { signal: controller.signal });
    window.addEventListener('analytics:logUpdated', scheduleRefresh, { signal: controller.signal });
    window.addEventListener('backup:sync:revision', scheduleRefresh, { signal: controller.signal });
    window.addEventListener('backup:sync:state', event => {
      if (event.detail?.state === 'ok') scheduleRefresh();
    }, { signal: controller.signal });

    dayTimer = setInterval(() => {
      const next = getJournalDayWindow(JOURNAL_DAY_COUNT);
      if (next.newest !== dayWindow.newest) scheduleRefresh();
    }, 60000);

    const observer = new MutationObserver(() => {
      if (list.isConnected) return;
      list._activityCleanup?.();
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    list._activityCleanup = () => {
      clearTimeout(refreshTimer);
      clearInterval(dayTimer);
      controller.abort();
      observer.disconnect();
      list._activityCleanup = null;
    };

    draw();
  } catch {
    controller.abort();
    clearInterval(dayTimer);
    list.innerHTML = '<div class="fav-empty">Ошибка загрузки 30-дневного журнала</div>';
  }
};

export default { renderProfileLogs };
