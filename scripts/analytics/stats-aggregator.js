// Live materialization Stats shard v5.
// События атомарно переходят hot → warm вместе с обновлением stats/global.
// Модуль не управляет playback и не выполняет сеть.
import { metaDB } from './meta-db.js';
import { buildStatsProjection, mergeProjectedStatsRow, projectionStreak, projectionToStatsRows } from './stats-shard-contract.js';

const dayList = raw => [...new Set((Array.isArray(raw) ? raw : [])
  .map(value => String(value || '').trim())
  .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)))]
  .sort();

const mergeStreak = (oldRaw, projection) => projectionStreak({
  activeDays: dayList([
    ...(Array.isArray(oldRaw?.activeDays) ? oldRaw.activeDays : []),
    ...(Array.isArray(projection?.activeDays) ? projection.activeDays : [])
  ])
});

const commitDelta = async ({ events, rows, streak }) => {
  await metaDB.init();
  return new Promise((resolve, reject) => {
    const tx = metaDB.db.transaction(['stats', 'global', 'events_hot', 'events_warm'], 'readwrite');
    const statsStore = tx.objectStore('stats');
    const globalStore = tx.objectStore('global');
    const hotStore = tx.objectStore('events_hot');
    const warmStore = tx.objectStore('events_warm');

    rows.forEach(row => statsStore.put(row));
    globalStore.put({ key: 'global_streak', value: streak });
    events.forEach(event => {
      warmStore.put(event);
      hotStore.delete(event.eventId);
    });

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('stats_live_commit_aborted'));
  });
};

export class StatsAggregator {
  constructor({ bindEvents = true } = {}) {
    this._processing = false;
    this._rerun = false;
    if (bindEvents) {
      window.addEventListener('analytics:logUpdated', () => this.processHotEvents());
    }
  }

  async waitForIdle(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (this._processing && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return !this._processing;
  }

  async processHotEvents() {
    if (window.__accountDataSwitching) return false;
    if (this._processing) {
      this._rerun = true;
      return false;
    }

    this._processing = true;
    try {
      do {
        this._rerun = false;
        const events = await metaDB.getEvents('events_hot');
        if (!events.length) break;

        const [currentRows, oldStreak] = await Promise.all([
          metaDB.getAllStats().catch(() => []),
          metaDB.getGlobal('global_streak').catch(() => null)
        ]);
        const projection = buildStatsProjection(events);
        const deltas = projectionToStatsRows(projection);
        const rows = new Map(currentRows.map(row => [String(row.uid || ''), row]));

        deltas.forEach(delta => {
          const merged = mergeProjectedStatsRow(rows.get(delta.uid), delta);
          if (merged) rows.set(delta.uid, merged);
        });

        await commitDelta({
          events,
          rows: [...rows.values()],
          streak: mergeStreak(oldStreak?.value, projection)
        });

        projectionToStatsRows(projection)
          .filter(row => Number(row.globalFullListenCount || 0) > 0)
          .forEach(row => {
            const threshold = parseInt(localStorage.getItem('cloud:listenThreshold'), 10) || 5;
            const total = Number(rows.get(row.uid)?.globalFullListenCount || 0);
            if (total >= threshold && !window._isRestoring) {
              window.dispatchEvent(new CustomEvent('analytics:cloudThresholdReached', {
                detail: { uid: row.uid, fullCount: total }
              }));
            }
          });

        window.dispatchEvent(new CustomEvent('stats:updated', {
          detail: { events: events.length, schemaVersion: 5 }
        }));
      } while (this._rerun);

      return true;
    } finally {
      this._processing = false;
    }
  }
}
