// Единый read-only snapshot подтверждённой серверной статистики.
// Не управляет playback и не записывается в пользовательский backup.

import { buildStatsViewModel } from './stats-state.js';

const n = value =>
  Number.isFinite(Number(value))
    ? Math.max(0, Number(value))
    : 0;

const fixed = (raw, length) =>
  Array.from(
    { length },
    (_, index) => Math.floor(n(raw?.[index]))
  );

const authorized = () =>
  window.YandexAuth?.getSessionStatus?.() === 'active' &&
  window.YandexAuth?.isTokenAlive?.();

const emptyServerSnapshot = () => ({
  version: 1,
  source: 'server_confirmed',
  available: false,
  totalListenMs: 0,
  classifiedListenMs: 0,
  legacyUnclassifiedMs: 0,
  validPlays: 0,
  fullPlays: 0,
  uniqueTracks: 0,
  byHourMs: Array(24).fill(0),
  byWeekdayMs: Array(7).fill(0),
  tracks: [],
  invariant: {
    byHourMs: 0,
    byWeekdayMs: 0,
    byTrackMs: 0,
    classifiedListenMs: 0,
    totalListenMs: 0,
    fullPlaysByTrack: 0,
    validPlaysByTrack: 0,
    fullCountersConsistent: true,
    validCountersConsistent: true,
    exact: false
  },
  updatedAt: 0
});

export const normalizeConfirmedListeningStats = raw => {
  const source =
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw)
      ? raw
      : {};
  const tracks = (Array.isArray(source.tracks)
    ? source.tracks
    : [])
    .map(row => ({
      uid: String(row?.uid || '').trim(),
      listenMs: Math.floor(n(row?.listenMs)),
      validPlays: Math.floor(n(row?.validPlays)),
      fullPlays: Math.floor(n(row?.fullPlays))
    }))
    .filter(row => row.uid);

  return {
    ...emptyServerSnapshot(),
    version: Math.max(1, Math.floor(n(source.version) || 1)),
    source: 'server_confirmed',
    available: source.available === true,
    totalListenMs: Math.floor(n(source.totalListenMs)),
    classifiedListenMs: Math.floor(
      n(source.classifiedListenMs)
    ),
    legacyUnclassifiedMs: Math.floor(
      n(source.legacyUnclassifiedMs)
    ),
    validPlays: Math.floor(n(source.validPlays)),
    fullPlays: Math.floor(n(source.fullPlays)),
    uniqueTracks: Math.floor(n(source.uniqueTracks)),
    byHourMs: fixed(source.byHourMs, 24),
    byWeekdayMs: fixed(source.byWeekdayMs, 7),
    tracks,
    invariant: {
      byHourMs: Math.floor(n(source.invariant?.byHourMs)),
      byWeekdayMs: Math.floor(
        n(source.invariant?.byWeekdayMs)
      ),
      byTrackMs: Math.floor(
        n(source.invariant?.byTrackMs)
      ),
      classifiedListenMs: Math.floor(
        n(source.invariant?.classifiedListenMs)
      ),
      totalListenMs: Math.floor(
        n(source.invariant?.totalListenMs)
      ),
      fullPlaysByTrack: Math.floor(
        n(source.invariant?.fullPlaysByTrack)
      ),
      validPlaysByTrack: Math.floor(
        n(source.invariant?.validPlaysByTrack)
      ),
      fullCountersConsistent:
        source.invariant?.fullCountersConsistent !== false,
      validCountersConsistent:
        source.invariant?.validCountersConsistent !== false,
      exact: source.invariant?.exact === true
    },
    updatedAt: Math.floor(n(source.updatedAt))
  };
};

export const getConfirmedListeningStats = () =>
  normalizeConfirmedListeningStats(
    window.ListeningReceipts
      ?.lastProgress
      ?.confirmedListeningStats
  );

const daypartsFromHours = byHour => [
  {
    label: 'Ночь',
    value: byHour.slice(0, 6)
      .reduce((sum, value) => sum + value, 0)
  },
  {
    label: 'Утро',
    value: byHour.slice(6, 12)
      .reduce((sum, value) => sum + value, 0)
  },
  {
    label: 'День',
    value: byHour.slice(12, 18)
      .reduce((sum, value) => sum + value, 0)
  },
  {
    label: 'Вечер',
    value: byHour.slice(18, 24)
      .reduce((sum, value) => sum + value, 0)
  }
];

const buildServerViewModel = (server, localRows) => {
  const localGlobal =
    (Array.isArray(localRows) ? localRows : [])
      .find(row => row?.uid === 'global') || {};
  const tracks = server.tracks.map(row => ({
    uid: row.uid,
    globalListenSeconds: row.listenMs / 1000,
    globalValidListenCount: row.validPlays,
    globalFullListenCount: row.fullPlays,
    featuresUsed: {}
  }));
  const byHour = server.byHourMs.map(value => value / 1000);
  const byWeekday =
    server.byWeekdayMs.map(value => value / 1000);
  const dayparts = daypartsFromHours(byHour);
  const top = (field, limit = 5) =>
    [...tracks]
      .sort((left, right) =>
        n(right[field]) - n(left[field]) ||
        left.uid.localeCompare(right.uid)
      )
      .filter(row => n(row[field]) > 0)
      .slice(0, limit);

  return {
    source: 'server_confirmed',
    available: true,
    pending: false,
    exact: server.invariant.exact,
    legacyUnclassifiedSec:
      server.legacyUnclassifiedMs / 1000,
    summary: {
      rows: tracks,
      tracks,
      totalFull: server.fullPlays,
      totalValid: server.validPlays,
      totalSec: server.totalListenMs / 1000,
      classifiedSec: server.classifiedListenMs / 1000,
      uniqueTracks: server.uniqueTracks,
      statsCount: tracks.length
    },
    global: localGlobal,
    globalFeatures: localGlobal.featuresUsed || {},
    byHour,
    byWeekday,
    dayparts,
    peakHour: byHour.some(Boolean)
      ? byHour.indexOf(Math.max(...byHour))
      : 0,
    peakDaypart: [...dayparts]
      .sort((left, right) => right.value - left.value)[0]
      ?.label || '—',
    topFull: top('globalFullListenCount'),
    topValid: top('globalValidListenCount'),
    topTime: top('globalListenSeconds'),
    server
  };
};

export const resolveListeningStatsViews = (localRows = []) => {
  const local = {
    ...buildStatsViewModel(localRows),
    source: 'local_rebuildable',
    available: true,
    pending: false,
    exact: false,
    legacyUnclassifiedSec: 0
  };
  const server = authorized() ? getConfirmedListeningStats() : emptyServerSnapshot();
  return {
    local,
    server: server.available ? buildServerViewModel(server, localRows) : {
      ...local,
      source: 'server_confirmed',
      available: false,
      pending: authorized(),
      exact: false,
      serverPending: authorized(),
      summary: {
        ...local.summary,
        totalFull: 0,
        totalValid: 0,
        totalSec: 0,
        uniqueTracks: 0
      }
    }
  };
};

  if (!authorized()) {
    return {
      ...buildStatsViewModel(localRows),
      source: 'local_rebuildable',
      available: true,
      pending: false,
      exact: false,
      legacyUnclassifiedSec: 0
    };
  }

  const server = getConfirmedListeningStats();

  if (!server.available) {
    const local = buildStatsViewModel(localRows);
    return {
      ...local,
      source: 'local_rebuildable',
      available: true,
      pending: true,
      exact: false,
      serverPending: true,
      legacyUnclassifiedSec: 0
    };
  }

  return buildServerViewModel(server, localRows);
};

export default {
  normalizeConfirmedListeningStats,
  getConfirmedListeningStats,
  resolveListeningStatsViews,
  resolveListeningStatsViewModel
};
