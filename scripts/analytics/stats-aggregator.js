// UID.003_(Event log truth)_(сохранить агрегатор единственным строителем stats из событий)_(recs/intel/provider слой не должен писать aggregate truth напрямую) // UID.004_(Stats as cache)_(оставить stats производным кэшем)_(любые новые aggregate fields должны быть пересчитываемыми из event log) // UID.017_(Launch source stats)_(добавить future агрегирование discovery source)_(источники запуска должны считаться здесь, а не в UI state) // UID.018_(Variant and quality stats)_(держать честную аналитику режимов прослушивания)_(variant/quality aggregation должно развиваться именно здесь) // UID.045_(Tag preferences)_(подготовить future user taste aggregates)_(tag/theme/style/use-case preferences лучше собирать из stats/events, а не напрямую из UI) // UID.046_(Axis preferences)_(подготовить осевую аналитику слушателя)_(в будущем агрегатор может копить lightweight preference buckets для listener profile) // UID.062_(Recommendation memory and feedback)_(не смешивать rec feedback и media stats)_(recommendation interactions могут писаться в отдельные stores/events, но не ломать current stats path) // UID.094_(No-paralysis rule)_(агрегатор должен продолжать работать без intel слоя)_(новые intel-поля only additive и optional)
import { metaDB } from './meta-db.js';

export class StatsAggregator {
  constructor({ bindEvents = true } = {}) {
    this.lastFullListens = new Map();
    this.session = { favOrderedRun: 0, favOrderedLastUid: null, favShuffleEvents: new Set(), midnightTripleTrack: null, midnightTripleCount: 0, lastFullUid: null };
    this._processing = false;
    this._rerun = false;
    if (bindEvents) window.addEventListener('analytics:logUpdated', () => this.processHotEvents());
  }

  async processHotEvents() {
    if (this._processing) { this._rerun = true; return; }
    this._processing = true;
    try {
      do {
        this._rerun = false;
        const events = await metaDB.getEvents('events_hot'); if (!events.length) break;
        const n = new Date(), dateStr = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
        let dailyActive = false;

    for (const ev of events) {
      if (ev.type === 'LISTEN_COMPLETE' && ev.data) {
        const { isFullListen: isF, isValidListen: isV, listenedSeconds: lSec, variant: v, trackDuration: tDur } = ev.data;
        const isRateLimited = isF && (ev.timestamp - (this.lastFullListens.get(ev.uid) || 0)) < (tDur || 0) * 900;

        await metaDB.updateStat(ev.uid, s => {
          s.globalListenSeconds += (lSec || 0); s.lastPlayedAt = ev.timestamp; s.featuresUsed = s.featuresUsed || {};
          if (isV) {
            s.globalValidListenCount++; dailyActive = true;
            try { const d = new Date(ev.timestamp), h = d.getHours(), w = (d.getDay() + 6) % 7; (s.byHour ??= Array(24).fill(0))[h]++; (s.byWeekday ??= Array(7).fill(0))[w]++; } catch {}
          }
          if (isF && !isRateLimited && v !== 'short') {
            s.globalFullListenCount++; this.lastFullListens.set(ev.uid, ev.timestamp);
            const mins = new Date(ev.timestamp).getHours() * 60 + new Date(ev.timestamp).getMinutes();
            if (mins >= 120 && mins <= 270) s.featuresUsed.nightPlay = (s.featuresUsed.nightPlay || 0) + 1;
            if (mins >= 300 && mins <= 539) s.featuresUsed.earlyPlay = (s.featuresUsed.earlyPlay || 0) + 1;
            if (ev.data?.quality === 'hi') s.featuresUsed.hiQuality = (s.featuresUsed.hiQuality || 0) + 1;
            if (s.globalFullListenCount >= (parseInt(localStorage.getItem('cloud:listenThreshold')) || 5) && !window._isRestoring) window.dispatchEvent(new CustomEvent('analytics:cloudThresholdReached', { detail: { uid: ev.uid } }));

            if (window.playerCore) {
              const isFavOnly = localStorage.getItem('favoritesOnlyMode') === '1', isShuf = window.playerCore.isShuffle(), isFav = window.playerCore.isFavorite(ev.uid);
              if (isShuf) s.featuresUsed.shufflePlay = (s.featuresUsed.shufflePlay || 0) + 1;
              if (isFavOnly && !isShuf && isFav) { if (this.session.favOrderedLastUid !== ev.uid) { this.session.favOrderedRun++; this.session.favOrderedLastUid = ev.uid; } } else { this.session.favOrderedRun = 0; this.session.favOrderedLastUid = null; }
              isFavOnly && isShuf && isFav ? this.session.favShuffleEvents.add(ev.uid) : this.session.favShuffleEvents.clear();
              const timeStr = new Date(ev.timestamp).toTimeString().slice(0, 8);
              if (timeStr >= '00:00:00' && timeStr <= '00:30:00') { if (this.session.lastFullUid === ev.uid && this.session.midnightTripleTrack === ev.uid) this.session.midnightTripleCount++; else { this.session.midnightTripleTrack = ev.uid; this.session.midnightTripleCount = 1; } } else { this.session.midnightTripleTrack = null; this.session.midnightTripleCount = 0; }
              this.session.lastFullUid = ev.uid;
              if ((this.session.favOrderedRun >= 5 || this.session.favShuffleEvents.size >= 5 || this.session.midnightTripleCount >= 3) && !window._isRestoring) {
                setTimeout(async () => await metaDB.updateStat('global', gs => { gs.featuresUsed = gs.featuresUsed || {}; if (this.session.favOrderedRun >= 5) gs.featuresUsed.fav_ordered_5 = 5; if (this.session.favShuffleEvents.size >= 5) gs.featuresUsed.fav_shuffle_5 = 5; if (this.session.midnightTripleCount >= 3) gs.featuresUsed.midnight_triple = 1; return gs; }), 500);
              }
            }
          }
          return s;
        });
      } else if (ev.type === 'LISTEN_SKIP') { this.session.favOrderedRun = 0; this.session.favOrderedLastUid = null; this.session.favShuffleEvents.clear(); this.session.midnightTripleTrack = null; this.session.midnightTripleCount = 0; this.session.lastFullUid = null; }
      else if (ev.type === 'BACKUP_CREATED') {
        if (!ev.data?.uploadedShared) continue;
        await metaDB.updateStat('global', s => {
          s.featuresUsed = s.featuresUsed || {};
          s.featuresUsed.backup = (s.featuresUsed.backup || 0) + 1;
          return s;
        });
      }
      else if (ev.type === 'FEATURE_USED') {
        await metaDB.updateStat(ev.uid || 'global', s => {
          s.featuresUsed = s.featuresUsed || {}; const f = ev.data.feature; s.featuresUsed[f] = (s.featuresUsed[f] || 0) + 1;
          const d = new Date(ev.timestamp), h = d.getHours(), w = (d.getDay() + 6) % 7; (s.byHour ??= Array(24).fill(0))[h]++; (s.byWeekday ??= Array(7).fill(0))[w]++; s.lastPlayedAt = ev.timestamp;
          if (f === 'social_visit') { const tgt = String(ev.data.target || 'other').toLowerCase(); s.featuresUsed[`social_visit_${tgt}`] = (s.featuresUsed[`social_visit_${tgt}`] || 0) + 1; if ((s.featuresUsed.social_visit_youtube || 0) > 0 && (s.featuresUsed.social_visit_telegram || 0) > 0 && (s.featuresUsed.social_visit_vk || 0) > 0 && (s.featuresUsed.social_visit_tiktok || 0) > 0) s.featuresUsed.social_visit_all = 1; }
          if (['sleep_timer_set', 'sleep_timer_extend', 'sleep_timer_cancel', 'sleep_timer'].includes(f)) { s.featuresUsed.sleep_timer_minutes_total = (s.featuresUsed.sleep_timer_minutes_total || 0) + Math.max(0, Number(ev.data.minutes || 0)); if (ev.data.mode) s.featuresUsed[`sleep_timer_mode_${String(ev.data.mode).toLowerCase()}`] = (s.featuresUsed[`sleep_timer_mode_${String(ev.data.mode).toLowerCase()}`] || 0) + 1; }
          return s;
        });
      }
    }

    if (dailyActive && !window._isRestoring) {
      const sObj = (await metaDB.getGlobal('global_streak'))?.value || { current: 0, longest: 0, lastActiveDate: '' };
      if (sObj.lastActiveDate !== dateStr) { const yd = new Date(); yd.setDate(yd.getDate() - 1); const yStr = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, '0')}-${String(yd.getDate()).padStart(2, '0')}`; sObj.current = (sObj.lastActiveDate === yStr) ? sObj.current + 1 : 1; sObj.longest = Math.max(sObj.longest, sObj.current); sObj.lastActiveDate = dateStr; await metaDB.setGlobal('global_streak', sObj); }
    }

        await metaDB.addEvents(events, 'events_warm'); await metaDB.deleteEvents(events, 'events_hot').catch(() => metaDB.clearEvents('events_hot')); window.dispatchEvent(new CustomEvent('stats:updated'));
      } while (this._rerun);
    } finally {
      this._processing = false;
    }
  }
}
