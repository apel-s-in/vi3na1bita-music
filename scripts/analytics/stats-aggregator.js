// UID.003_(Event log truth)_(сохранить агрегатор единственным строителем stats из событий)_(recs/intel/provider слой не должен писать aggregate truth напрямую) UID.004_(Stats as cache)_(оставить stats производным кэшем)_(любые новые aggregate fields должны быть пересчитываемыми из event log) UID.017_(Launch source stats)_(добавить future агрегирование discovery source)_(источники запуска должны считаться здесь, а не в UI state) UID.018_(Variant and quality stats)_(держать честную аналитику режимов прослушивания)_(variant/quality aggregation должно развиваться именно здесь) UID.045_(Tag preferences)_(подготовить future user taste aggregates)_(tag/theme/style/use-case preferences лучше собирать из stats/events, а не напрямую из UI) UID.046_(Axis preferences)_(подготовить осевую аналитику слушателя)_(в будущем агрегатор может копить lightweight preference buckets для listener profile) UID.062_(Recommendation memory and feedback)_(не смешивать rec feedback и media stats)_(recommendation interactions могут писаться в отдельные stores/events, но не ломать current stats path) UID.094_(No-paralysis rule)_(агрегатор должен продолжать работать без intel слоя)_(новые intel-поля only additive и optional)
import { metaDB } from './meta-db.js';

const localDayKey = timestamp => {
  const date = new Date(Number(timestamp) || Date.now());
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const calculateStreakSummary = values => {
  const days = [...new Set(values || [])]
    .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();

  let longest = 0;
  let run = 0;
  let previous = 0;

  days.forEach(value => {
    const current = Date.parse(`${value}T00:00:00Z`);
    run = previous && current - previous === 86400000
      ? run + 1
      : 1;
    longest = Math.max(longest, run);
    previous = current;
  });

  return {
    current: run,
    longest,
    lastActiveDate: days[days.length - 1] || '',
    activeDays: days.slice(-400)
  };
};

export class StatsAggregator {
  constructor({ bindEvents = true } = {}) {
    this._processing = false; this._rerun = false;
    if (bindEvents) {
      window.addEventListener('analytics:logUpdated', () => this.processHotEvents());
    }
  }

  async waitForIdle(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;

    while (
      this._processing &&
      Date.now() < deadline
    ) {
      await new Promise(resolve =>
        setTimeout(resolve, 20)
      );
    }

    return !this._processing;
  }

  async processHotEvents() {
    if (window.__accountDataSwitching) return;
    if (this._processing) return void (this._rerun = true);
    this._processing = true;
    try {
      do {
        this._rerun = false;
        const events = await metaDB.getEvents('events_hot'); if (!events.length) break;
        const activeDays = new Set();

        for (const ev of events) {
          if (ev.type === 'LISTEN_COMPLETE' && ev.data) {
            const { isFullListen: isF, isValidListen: isV, variant: v, quality: q } = ev.data;
            const lSec = Math.max(0, Number(ev.data.listenedSeconds || 0) || 0);
            await metaDB.updateStat(ev.uid, s => {
              s.lastPlayedAt = ev.timestamp;
              s.featuresUsed = s.featuresUsed || {};

              if (lSec > 0) {
                const activityAt = Number(
                  ev.data.startedAt || ev.timestamp
                );
                const date = new Date(activityAt);

                s.globalListenSeconds += lSec;
                (s.byHour ??= Array(24).fill(0))[
                  date.getHours()
                ] += lSec;
                (s.byWeekday ??= Array(7).fill(0))[
                  (date.getDay() + 6) % 7
                ] += lSec;
              }

              if (isV) {
                const activityAt = Number(
                  ev.data.startedAt || ev.timestamp
                );

                s.globalValidListenCount++;
                activeDays.add(localDayKey(activityAt));
              }

              if (isF && isV && v !== 'short') {
                s.globalFullListenCount++;
                const contextDate = new Date(
                  Number(ev.data.startedAt || ev.timestamp)
                );
                const mins =
                  contextDate.getHours() * 60 +
                  contextDate.getMinutes();
                if (mins >= 120 && mins <= 270) s.featuresUsed.nightPlay = (s.featuresUsed.nightPlay || 0) + 1;
                if (mins >= 300 && mins <= 539) s.featuresUsed.earlyPlay = (s.featuresUsed.earlyPlay || 0) + 1;
                if (q === 'hi') s.featuresUsed.hiQuality = (s.featuresUsed.hiQuality || 0) + 1;
                if (s.globalFullListenCount >= (parseInt(localStorage.getItem('cloud:listenThreshold')) || 5) && !window._isRestoring) window.dispatchEvent(new CustomEvent('analytics:cloudThresholdReached', { detail: { uid: ev.uid } }));
                if (ev.data.shuffle === true) {
                  s.featuresUsed.shufflePlay =
                    (s.featuresUsed.shufflePlay || 0) + 1;
                }
              }
              return s;
            });

          } else if (ev.type === 'BACKUP_CREATED') { if (ev.data?.uploadedShared) await metaDB.updateStat('global', s => { s.featuresUsed = s.featuresUsed || {}; s.featuresUsed.backup = (s.featuresUsed.backup || 0) + 1; return s; }); }
          else if (ev.type === 'FEATURE_USED') {
            await metaDB.updateStat(ev.uid || 'global', s => {
              s.featuresUsed = s.featuresUsed || {}; const f = ev.data.feature; s.featuresUsed[f] = (s.featuresUsed[f] || 0) + 1; s.lastPlayedAt = ev.timestamp;
              if (['sleep_timer_set', 'sleep_timer_extend', 'sleep_timer_cancel', 'sleep_timer'].includes(f)) { s.featuresUsed.sleep_timer_minutes_total = (s.featuresUsed.sleep_timer_minutes_total || 0) + Math.max(0, Number(ev.data.minutes || 0)); if (ev.data.mode) s.featuresUsed[`sleep_timer_mode_${String(ev.data.mode).toLowerCase()}`] = (s.featuresUsed[`sleep_timer_mode_${String(ev.data.mode).toLowerCase()}`] || 0) + 1; }
              return s;
            });
          }
        }

        if (activeDays.size) {
          const old = (await metaDB.getGlobal('global_streak'))?.value || {};
          const summary = calculateStreakSummary([
            ...(Array.isArray(old.activeDays) ? old.activeDays : []),
            ...activeDays
          ]);
          await metaDB.setGlobal('global_streak', summary);
        }

        await metaDB.addEvents(events, 'events_warm'); await metaDB.deleteEvents(events, 'events_hot').catch(() => metaDB.clearEvents('events_hot')); window.dispatchEvent(new CustomEvent('stats:updated'));
      } while (this._rerun);
    } finally { this._processing = false; }
  }
}
