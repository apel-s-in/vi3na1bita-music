// Read-only view model поверх materialized Stats shard v5.
// Запись stats выполняют только StatsAggregator и Backup streaming rebuild.
import { metaDB as defaultMetaDB } from './meta-db.js';

const num = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export const getStatsSummary = (rows = []) => {
  const all = Array.isArray(rows) ? rows : [];
  const tracks = all.filter(row => row?.uid && row.uid !== 'global');
  return {
    rows: all,
    tracks,
    totalFull: tracks.reduce((sum, row) => sum + num(row.globalFullListenCount), 0),
    totalValid: tracks.reduce((sum, row) => sum + num(row.globalValidListenCount), 0),
    totalSec: tracks.reduce((sum, row) => sum + num(row.globalListenSeconds), 0),
    uniqueTracks: tracks.filter(row => num(row.globalValidListenCount) > 0).length,
    analysisEligibleSessions: tracks.reduce((sum, row) => sum + num(row.analysisEligibleSessions), 0),
    microSkips: tracks.reduce((sum, row) => sum + num(row.microSkips), 0),
    earlySkips: tracks.reduce((sum, row) => sum + num(row.earlySkips), 0),
    validSkips: tracks.reduce((sum, row) => sum + num(row.validSkips), 0),
    partialEnds: tracks.reduce((sum, row) => sum + num(row.partialEnds), 0),
    statsCount: tracks.length
  };
};

export const buildStatsViewModel = (rows = []) => {
  const summary = getStatsSummary(rows);
  const byHour = Array(24).fill(0);
  const byWeekday = Array(7).fill(0);

  summary.tracks.forEach(row => {
    (row.byHour || []).forEach((value, index) => {
      if (index < 24) byHour[index] += num(value);
    });
    (row.byWeekday || []).forEach((value, index) => {
      if (index < 7) byWeekday[index] += num(value);
    });
  });

  const dayparts = [
    ['Ночь', 0, 5],
    ['Утро', 6, 11],
    ['День', 12, 17],
    ['Вечер', 18, 23]
  ].map(([label, from, to]) => ({
    label,
    value: byHour.slice(from, to + 1).reduce((sum, value) => sum + value, 0)
  }));

  const top = (key, limit = 5) => [...summary.tracks]
    .filter(row => num(row[key]) > 0)
    .sort((left, right) => num(right[key]) - num(left[key]) || String(left.uid).localeCompare(String(right.uid)))
    .slice(0, limit);

  const global = summary.rows.find(row => row?.uid === 'global') || {};
  const completionRows = summary.tracks.filter(row => num(row.analysisEligibleSessions) > 0);
  const completionWeight = completionRows.reduce((sum, row) => sum + num(row.analysisEligibleSessions), 0);
  const averageCompletionRate = completionWeight > 0
    ? completionRows.reduce((sum, row) => sum + num(row.averageCompletionRate) * num(row.analysisEligibleSessions), 0) / completionWeight
    : 0;

  return {
    summary,
    global,
    globalFeatures: global.featuresUsed || {},
    averageCompletionRate,
    byHour,
    byWeekday,
    dayparts,
    peakHour: byHour.some(Boolean) ? byHour.indexOf(Math.max(...byHour)) : 0,
    peakDaypart: [...dayparts].sort((left, right) => right.value - left.value)[0]?.label || '—',
    topFull: top('globalFullListenCount'),
    topValid: top('globalValidListenCount'),
    topTime: top('globalListenSeconds')
  };
};

export const readStatsSummary = async (db = defaultMetaDB) => getStatsSummary(await db.getAllStats().catch(() => []));
export const readStatsViewModel = async (db = defaultMetaDB) => buildStatsViewModel(await db.getAllStats().catch(() => []));

export default { getStatsSummary, buildStatsViewModel, readStatsSummary, readStatsViewModel };
