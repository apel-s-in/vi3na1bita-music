// UID.003_(Event log truth)_(stats rebuild всегда из merged event log)_(hot+warm+cloud merge по eventId без потери свежих локальных событий) UID.004_(Stats as cache)_(stats — пересчитываемый cache, не source-of-truth)_(единый слой чтения/merge/rebuild/summary) UID.099_(Multi-device sync model)_(долгая неавторизованная история должна сливаться с облаком без затирания)_(device-aware events сохраняются)
import { metaDB as defaultMetaDB } from './meta-db.js';
import { normalizeEventList } from './backup-event-cleanup.js';

const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
export const readLocalEventLog = async (db = defaultMetaDB, { forceFlush = true } = {}) => {
  if (forceFlush) try { window.dispatchEvent(new CustomEvent('analytics:forceFlush')); await new Promise(r => setTimeout(r, 120)); } catch {}
  const [hot, warm] = await Promise.all([db.getEvents('events_hot').catch(() => []), db.getEvents('events_warm').catch(() => [])]);
  return normalizeEventList([...(Array.isArray(warm) ? warm : []), ...(Array.isArray(hot) ? hot : [])], { limit: 10000 });
};
export const mergeEventLogs = (...lists) => normalizeEventList(lists.flatMap(x => Array.isArray(x) ? x : []), { limit: 10000 });
export const rebuildStatsFromEvents = async (db = defaultMetaDB, events = [], { reason = 'stats_rebuild' } = {}) => {
  const warm = normalizeEventList(events, { limit: 10000 });
  const [{ StatsAggregator }] = await Promise.all([import('./stats-aggregator.js')]);
  const agg = new StatsAggregator({ bindEvents: false });
  await db.clearEvents('events_warm').catch(() => {});
  if (warm.length) await db.addEvents(warm, 'events_warm');
  await db.tx('stats', 'readwrite', s => s.clear());
  await db.clearEvents('events_hot').catch(() => {});
  const BATCH_SIZE = 500;
  for (let i = 0; i < warm.length; i += BATCH_SIZE) {
    const batch = warm.slice(i, i + BATCH_SIZE);
    await db.addEvents(batch, 'events_hot'); await agg.processHotEvents();
    const rest = await db.getEvents('events_hot').catch(() => []);
    if (Array.isArray(rest) && rest.length) await agg.processHotEvents();
    if (i + BATCH_SIZE < warm.length) await new Promise(r => setTimeout(r, 10));
  }
  window.dispatchEvent(new CustomEvent('stats:rebuilt', { detail: { reason, events: warm.length } })); return true;
};
export const rebuildStatsFromLocalEventLog = async (db = defaultMetaDB, opts = {}) => rebuildStatsFromEvents(db, await readLocalEventLog(db, opts), opts);
export const getStatsSummary = (rows = []) => {
  const vs = (Array.isArray(rows) ? rows : []).filter(s => s?.uid && s.uid !== 'global');
  return { rows: Array.isArray(rows) ? rows : [], tracks: vs, totalFull: vs.reduce((a, s) => a + n(s.globalFullListenCount), 0), totalValid: vs.reduce((a, s) => a + n(s.globalValidListenCount), 0), totalSec: vs.reduce((a, s) => a + n(s.globalListenSeconds), 0), uniqueTracks: vs.filter(s => n(s.globalValidListenCount) > 0).length, statsCount: vs.length };
};
export const buildStatsViewModel = (rows = []) => {
  const summary = getStatsSummary(rows), byHour = Array(24).fill(0), byWeekday = Array(7).fill(0);
  summary.tracks.forEach(s => { Array.isArray(s.byHour) && s.byHour.forEach((v, h) => h >= 0 && h < 24 && (byHour[h] += n(v))); Array.isArray(s.byWeekday) && s.byWeekday.forEach((v, d) => d >= 0 && d < 7 && (byWeekday[d] += n(v))); });
  const dayparts = [{ label: 'Ночь', from: 0, to: 5 }, { label: 'Утро', from: 6, to: 11 }, { label: 'День', from: 12, to: 17 }, { label: 'Вечер', from: 18, to: 23 }].map(x => ({ label: x.label, value: byHour.slice(x.from, x.to + 1).reduce((a, v) => a + v, 0) }));
  const top = (key, limit = 5) => [...summary.tracks].sort((a, b) => n(b[key]) - n(a[key])).slice(0, limit), global = summary.rows.find(s => s?.uid === 'global') || {};
  return { summary, global, globalFeatures: global.featuresUsed || {}, byHour, byWeekday, dayparts, peakHour: byHour.some(Boolean) ? byHour.indexOf(Math.max(...byHour)) : 0, peakDaypart: [...dayparts].sort((a, b) => b.value - a.value)[0]?.label || '—', topFull: top('globalFullListenCount'), topValid: top('globalValidListenCount'), topTime: top('globalListenSeconds') };
};
export const readStatsSummary = async (db = defaultMetaDB) => getStatsSummary(await db.getAllStats().catch(() => []));
export const readStatsViewModel = async (db = defaultMetaDB) => buildStatsViewModel(await db.getAllStats().catch(() => []));
export default { readLocalEventLog, mergeEventLogs, rebuildStatsFromEvents, rebuildStatsFromLocalEventLog, getStatsSummary, buildStatsViewModel, readStatsSummary, readStatsViewModel };
