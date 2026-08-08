// Компактная статистическая проекция immutable event range.
// Rollup является локальным rebuildable-кэшем и создаётся только
// после успешной проверки hash-chain исходного range.
import { isV7SyncEvent } from './event-contract.js';
import { temporalPartsFromListenEvent } from './temporal-buckets.js';
import { buildStatsV4, emptyStatsV4, mergeStatsV4, normalizeStatsV4 } from './stats-v4-projection.js';

export const STATS_SHARD_VERSION = 6;
const safe = value => String(value == null ? '' : value).trim();
const safeRangeId = value => safe(value).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 160);
const buildRangeKey = ({ deviceId = '', chainId = '', branchId = '', fromSeq = 0, toSeq = 0, hash = '' } = {}) =>
  `${safeRangeId(deviceId)}:${safeRangeId(chainId || branchId)}:${Math.max(0, Math.floor(Number(fromSeq) || 0))}:${Math.max(0, Math.floor(Number(toSeq) || 0))}:${safeRangeId(hash).slice(0, 64)}`;
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const fixed = (raw, length) => Array.from({ length }, (_, index) => Math.max(0, Math.floor(num(raw?.[index]))));
const countMap = raw => Object.fromEntries(Object.entries(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}).map(([key, value]) => [safe(key), num(value)]).filter(([key, value]) => key && value > 0));
const dayList = raw => [...new Set((Array.isArray(raw) ? raw : []).map(safe).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)))].sort();
const minPositive = (...values) => {
  const rows = values.map(num).filter(value => value > 0);
  return rows.length ? Math.min(...rows) : 0;
};
const bump = (map, key, amount = 1) => {
  const clean = safe(key);
  const value = num(amount);
  if (clean && value > 0) map[clean] = num(map[clean]) + value;
};
const sortObject = value => Array.isArray(value) ? value.map(sortObject) : !value || typeof value !== 'object' ? value : Object.keys(value).sort().reduce((output, key) => {
  output[key] = sortObject(value[key]);
  return output;
}, {});
const sha256Hex = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(sortObject(value)))))]
  .map(byte => byte.toString(16).padStart(2, '0'))
  .join('');

const localDayKey = event => {
  const timestamp = Math.max(0, num(event?.data?.startedAt || event?.timestamp));
  const offsetMs = Number(event?.data?.timezoneOffsetMin || 0) * 60000;
  return timestamp ? new Date(timestamp - offsetMs).toISOString().slice(0, 10) : '';
};

const localMinute = event => {
  const timestamp = Math.max(0, num(event?.data?.startedAt || event?.timestamp));
  const offsetMs = Number(event?.data?.timezoneOffsetMin || 0) * 60000;
  if (!timestamp) return -1;
  const date = new Date(timestamp - offsetMs);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
};

export const emptyStatsProjection = () => ({
  listenMs: 0,
  uniqueCoveredMs: 0,
  completionBasisPointsSum: 0,
  analysisEligibleSessions: 0,
  validPlays: 0,
  fullPlays: 0,
  starts: 0,
  microSkips: 0,
  earlySkips: 0,
  validSkips: 0,
  partialEnds: 0,
  firstEventAt: 0,
  lastEventAt: 0,
  activeDays: [],
  byHourMs: Array(24).fill(0),
  byWeekdayMs: Array(7).fill(0),
  tracks: {},
  transitions: {},
  globalFeatures: {},
  v4: emptyStatsV4(),
  dimensions: {
    quality: {},
    variant: {},
    platform: {},
    deviceClass: {},
    deviceOs: {},
    deviceBrowser: {},
    pwa: {},
    shuffle: {},
    repeat: {},
    favoritesOnly: {},
    launchSource: {}
  }
});

const ensureTrack = (projection, uid) => projection.tracks[uid] ||= {
  listenMs: 0,
  uniqueCoveredMs: 0,
  completionBasisPointsSum: 0,
  analysisEligibleSessions: 0,
  validPlays: 0,
  fullPlays: 0,
  starts: 0,
  microSkips: 0,
  earlySkips: 0,
  validSkips: 0,
  partialEnds: 0,
  firstPlayedAt: 0,
  lastPlayedAt: 0,
  byHourMs: Array(24).fill(0),
  byWeekdayMs: Array(7).fill(0),
  features: {}
};

const touchProjection = (projection, timestamp) => {
  const at = Math.max(0, num(timestamp));
  if (!at) return;
  projection.firstEventAt = minPositive(projection.firstEventAt, at);
  projection.lastEventAt = Math.max(projection.lastEventAt, at);
};

const touchTrack = (track, timestamp) => {
  const at = Math.max(0, num(timestamp));
  if (!at) return;
  track.firstPlayedAt = minPositive(track.firstPlayedAt, at);
  track.lastPlayedAt = Math.max(track.lastPlayedAt, at);
};

const applyFeature = (features, data = {}) => {
  const feature = safe(data.feature);
  if (!feature) return;
  bump(features, feature);
  if (['sleep_timer_set', 'sleep_timer_extend', 'sleep_timer_cancel', 'sleep_timer'].includes(feature)) {
    bump(features, 'sleep_timer_minutes_total', Math.max(0, num(data.minutes)));
    if (data.mode) bump(features, `sleep_timer_mode_${safe(data.mode).toLowerCase()}`);
  }
};

export const buildStatsProjection = events => {
  const projection = emptyStatsProjection();
  const rows = (Array.isArray(events) ? events : []).filter(isV7SyncEvent);
  rows.forEach(event => {
    const type = safe(event?.type);
    const uid = safe(event?.uid);
    const data = event?.data || {};
    touchProjection(projection, event?.timestamp);

    if (type === 'LISTEN_START') {
      projection.starts++;
      if (uid) {
        const track = ensureTrack(projection, uid);
        track.starts++;
        touchTrack(track, event.timestamp);
      }
      bump(projection.dimensions.quality, data.quality || 'unknown');
      bump(projection.dimensions.variant, data.variant || 'audio');
      bump(projection.dimensions.platform, event.platform || 'web');
      bump(projection.dimensions.deviceClass, event.deviceClass || 'unknown');
      bump(projection.dimensions.deviceOs, event.deviceOs || 'unknown');
      bump(projection.dimensions.deviceBrowser, event.deviceBrowser || 'unknown');
      bump(projection.dimensions.pwa, event.devicePwa === true ? 'on' : 'off');
      bump(projection.dimensions.shuffle, data.shuffle === true ? 'on' : 'off');
      bump(projection.dimensions.repeat, data.repeat === true ? 'on' : 'off');
      bump(projection.dimensions.favoritesOnly, data.favoritesOnly === true ? 'on' : 'off');
      if (data.launchSource) bump(projection.dimensions.launchSource, data.launchSource);
      return;
    }

    if (type === 'FEATURE_USED') {
      if (uid && uid !== 'global') {
        const track = ensureTrack(projection, uid);
        applyFeature(track.features, data);
        touchTrack(track, event.timestamp);
      } else {
        applyFeature(projection.globalFeatures, data);
      }
      return;
    }

    if (type !== 'LISTEN_COMPLETE' || !uid) return;

    const track = ensureTrack(projection, uid);
    const listenMs = Math.max(0, Math.floor(num(data.listenedMs || num(data.listenedSeconds) * 1000)));
    const uniqueCoveredMs = Math.max(0, Math.min(listenMs, Math.floor(num(data.uniqueCoveredMs || num(data.uniqueCoveredSeconds) * 1000))));
    const completionBasisPoints = Math.max(0, Math.min(10000, Math.floor(num(data.completionBasisPoints || num(data.completionRatio) * 10000))));
    const analysisEligible = data.analysisEligible === true || listenMs >= 3000;
    const skipClass = safe(data.skipClass);
    const playedAt = Math.max(0, num(data.startedAt || event.timestamp));

    projection.listenMs += listenMs;
    projection.uniqueCoveredMs += uniqueCoveredMs;
    track.listenMs += listenMs;
    track.uniqueCoveredMs += uniqueCoveredMs;
    touchTrack(track, playedAt);

    if (analysisEligible) {
      projection.analysisEligibleSessions++;
      projection.completionBasisPointsSum += completionBasisPoints;
      track.analysisEligibleSessions++;
      track.completionBasisPointsSum += completionBasisPoints;
    }

    if (skipClass === 'micro_skip') {
      projection.microSkips++;
      track.microSkips++;
    } else if (skipClass === 'early_skip') {
      projection.earlySkips++;
      track.earlySkips++;
    } else if (skipClass === 'valid_skip') {
      projection.validSkips++;
      track.validSkips++;
    } else if (skipClass === 'partial_end') {
      projection.partialEnds++;
      track.partialEnds++;
    }

    const transitionToUid = safe(data.transitionToUid);
    if (transitionToUid && transitionToUid !== uid) {
      bump(projection.transitions, `${uid}>${transitionToUid}`);
    }

    if (data.isValidListen === true) {
      projection.validPlays++;
      track.validPlays++;
      const day = localDayKey(event);
      if (day) projection.activeDays.push(day);
    }

    const full = data.isFullListen === true && data.isValidListen === true && data.variant !== 'short';
    if (full) {
      projection.fullPlays++;
      track.fullPlays++;
      const minute = localMinute(event);
      if (minute >= 120 && minute <= 270) bump(track.features, 'nightPlay');
      if (minute >= 300 && minute <= 539) bump(track.features, 'earlyPlay');
      if (data.quality === 'hi') bump(track.features, 'hiQuality');
      if (data.shuffle === true) bump(track.features, 'shufflePlay');
    }

    temporalPartsFromListenEvent(event).forEach(part => {
      const creditedMs = Math.floor(num(part.creditedMs));
      projection.byHourMs[part.hour] += creditedMs;
      projection.byWeekdayMs[part.weekday] += creditedMs;
      track.byHourMs[part.hour] += creditedMs;
      track.byWeekdayMs[part.weekday] += creditedMs;
    });

    bump(projection.dimensions.quality, data.quality || 'unknown');
    bump(projection.dimensions.variant, data.variant || 'audio');
    bump(projection.dimensions.platform, event.platform || 'web');
    bump(projection.dimensions.deviceClass, event.deviceClass || 'unknown');
    bump(projection.dimensions.deviceOs, event.deviceOs || 'unknown');
    bump(projection.dimensions.deviceBrowser, event.deviceBrowser || 'unknown');
    bump(projection.dimensions.pwa, event.devicePwa === true ? 'on' : 'off');
    bump(projection.dimensions.shuffle, data.shuffle === true ? 'on' : 'off');
    bump(projection.dimensions.repeat, data.repeat === true ? 'on' : 'off');
    bump(projection.dimensions.favoritesOnly, data.favoritesOnly === true ? 'on' : 'off');
    if (data.launchSource) bump(projection.dimensions.launchSource, data.launchSource);
  });
  projection.activeDays = dayList(projection.activeDays);
  projection.v4 = buildStatsV4(rows);
  return projection;
};

export const normalizeStatsProjection = raw => ({
  listenMs: Math.floor(num(raw?.listenMs)),
  uniqueCoveredMs: Math.floor(num(raw?.uniqueCoveredMs)),
  completionBasisPointsSum: Math.floor(num(raw?.completionBasisPointsSum)),
  analysisEligibleSessions: Math.floor(num(raw?.analysisEligibleSessions)),
  validPlays: Math.floor(num(raw?.validPlays)),
  fullPlays: Math.floor(num(raw?.fullPlays)),
  starts: Math.floor(num(raw?.starts)),
  microSkips: Math.floor(num(raw?.microSkips)),
  earlySkips: Math.floor(num(raw?.earlySkips)),
  validSkips: Math.floor(num(raw?.validSkips)),
  partialEnds: Math.floor(num(raw?.partialEnds)),
  firstEventAt: Math.floor(num(raw?.firstEventAt)),
  lastEventAt: Math.floor(num(raw?.lastEventAt)),
  activeDays: dayList(raw?.activeDays),
  byHourMs: fixed(raw?.byHourMs, 24),
  byWeekdayMs: fixed(raw?.byWeekdayMs, 7),
  tracks: Object.fromEntries(Object.entries(raw?.tracks && typeof raw.tracks === 'object' ? raw.tracks : {}).map(([uid, row]) => [safe(uid), {
    listenMs: Math.floor(num(row?.listenMs)),
    uniqueCoveredMs: Math.floor(num(row?.uniqueCoveredMs)),
    completionBasisPointsSum: Math.floor(num(row?.completionBasisPointsSum)),
    analysisEligibleSessions: Math.floor(num(row?.analysisEligibleSessions)),
    validPlays: Math.floor(num(row?.validPlays)),
    fullPlays: Math.floor(num(row?.fullPlays)),
    starts: Math.floor(num(row?.starts)),
    microSkips: Math.floor(num(row?.microSkips)),
    earlySkips: Math.floor(num(row?.earlySkips)),
    validSkips: Math.floor(num(row?.validSkips)),
    partialEnds: Math.floor(num(row?.partialEnds)),
    firstPlayedAt: Math.floor(num(row?.firstPlayedAt)),
    lastPlayedAt: Math.floor(num(row?.lastPlayedAt)),
    byHourMs: fixed(row?.byHourMs, 24),
    byWeekdayMs: fixed(row?.byWeekdayMs, 7),
    features: countMap(row?.features)
  }]).filter(([uid]) => uid)),
  transitions: countMap(raw?.transitions),
  globalFeatures: countMap(raw?.globalFeatures || raw?.features),
  v4: normalizeStatsV4(raw?.v4),
  dimensions: {
    quality: countMap(raw?.dimensions?.quality),
    variant: countMap(raw?.dimensions?.variant),
    platform: countMap(raw?.dimensions?.platform),
    deviceClass: countMap(raw?.dimensions?.deviceClass),
    deviceOs: countMap(raw?.dimensions?.deviceOs),
    deviceBrowser: countMap(raw?.dimensions?.deviceBrowser),
    pwa: countMap(raw?.dimensions?.pwa),
    shuffle: countMap(raw?.dimensions?.shuffle),
    repeat: countMap(raw?.dimensions?.repeat),
    favoritesOnly: countMap(raw?.dimensions?.favoritesOnly),
    launchSource: countMap(raw?.dimensions?.launchSource)
  }
});

export const buildStatsProjectionShard = async segment => {
  const events = (Array.isArray(segment?.events) ? segment.events : []).filter(isV7SyncEvent);
  const branchId = safeRangeId(segment?.branchId);
  const deviceStableId = safeRangeId(segment?.deviceId || segment?.deviceStableId);
  const chainId = safe(segment?.chainId);
  const fromSeq = Math.floor(num(segment?.fromSeq));
  const toSeq = Math.floor(num(segment?.toSeq));
  const sourceHash = safe(segment?.hash);
  const rangeKey = safe(segment?.rangeKey) || buildRangeKey({ deviceId: deviceStableId, chainId: chainId || branchId, fromSeq, toSeq, hash: sourceHash });
  const projection = normalizeStatsProjection(buildStatsProjection(events));
  const core = { version: STATS_SHARD_VERSION, rangeKey, sourceHash, projection };
  const hash = await sha256Hex(core);
  return { ...core, deviceStableId, branchId, chainId, chainSeq: [deviceStableId, chainId || branchId, fromSeq], fromSeq, toSeq, eventCount: events.length, hash, createdAt: Date.now() };
};

export const verifyStatsProjectionShard = async (shard, sourceRange = null) => {
  if (Number(shard?.version) !== STATS_SHARD_VERSION) throw new Error('stats_shard_version_invalid');
  if (!safe(shard?.rangeKey) || !safe(shard?.sourceHash)) throw new Error('stats_shard_identity_invalid');
  if (sourceRange && (safe(shard.rangeKey) !== safe(sourceRange.rangeKey) || safe(shard.sourceHash) !== safe(sourceRange.hash))) {
    throw new Error('stats_shard_source_mismatch');
  }
  const projection = normalizeStatsProjection(shard.projection);
  const expectedHash = await sha256Hex({ version: STATS_SHARD_VERSION, rangeKey: safe(shard.rangeKey), sourceHash: safe(shard.sourceHash), projection });
  if (safe(shard.hash) !== expectedHash) throw new Error('stats_shard_hash_mismatch');
  return { ...shard, projection, hash: expectedHash };
};

export const mergeStatsProjectionInto = (targetRaw, sourceRaw) => {
  const target = normalizeStatsProjection(targetRaw);
  const source = normalizeStatsProjection(sourceRaw?.projection || sourceRaw);
  target.listenMs += source.listenMs;
  target.uniqueCoveredMs += source.uniqueCoveredMs;
  target.completionBasisPointsSum += source.completionBasisPointsSum;
  target.analysisEligibleSessions += source.analysisEligibleSessions;
  target.validPlays += source.validPlays;
  target.fullPlays += source.fullPlays;
  target.starts += source.starts;
  target.microSkips += source.microSkips;
  target.earlySkips += source.earlySkips;
  target.validSkips += source.validSkips;
  target.partialEnds += source.partialEnds;
  target.firstEventAt = minPositive(target.firstEventAt, source.firstEventAt);
  target.lastEventAt = Math.max(target.lastEventAt, source.lastEventAt);
  target.activeDays = dayList([...target.activeDays, ...source.activeDays]);
  source.byHourMs.forEach((amount, index) => target.byHourMs[index] += amount);
  source.byWeekdayMs.forEach((amount, index) => target.byWeekdayMs[index] += amount);
  target.v4 = mergeStatsV4(target.v4, source.v4);
  Object.entries(source.transitions).forEach(([key, amount]) => bump(target.transitions, key, amount));
  Object.entries(source.globalFeatures).forEach(([key, amount]) => bump(target.globalFeatures, key, amount));
  Object.entries(source.dimensions).forEach(([dimension, rows]) => Object.entries(rows).forEach(([key, amount]) => bump(target.dimensions[dimension], key, amount)));
  Object.entries(source.tracks).forEach(([uid, row]) => {
    const track = ensureTrack(target, uid);
    track.listenMs += row.listenMs;
    track.uniqueCoveredMs += row.uniqueCoveredMs;
    track.completionBasisPointsSum += row.completionBasisPointsSum;
    track.analysisEligibleSessions += row.analysisEligibleSessions;
    track.validPlays += row.validPlays;
    track.fullPlays += row.fullPlays;
    track.starts += row.starts;
    track.microSkips += row.microSkips;
    track.earlySkips += row.earlySkips;
    track.validSkips += row.validSkips;
    track.partialEnds += row.partialEnds;
    track.firstPlayedAt = minPositive(track.firstPlayedAt, row.firstPlayedAt);
    track.lastPlayedAt = Math.max(track.lastPlayedAt, row.lastPlayedAt);
    row.byHourMs.forEach((amount, index) => track.byHourMs[index] += amount);
    row.byWeekdayMs.forEach((amount, index) => track.byWeekdayMs[index] += amount);
    Object.entries(row.features).forEach(([key, amount]) => bump(track.features, key, amount));
  });
  return normalizeStatsProjection(target);
};

export const projectionToStatsRows = raw => {
  const projection = normalizeStatsProjection(raw);
  const rows = Object.entries(projection.tracks).map(([uid, track]) => ({
    uid,
    globalListenSeconds: track.listenMs / 1000,
    uniqueCoveredSeconds: track.uniqueCoveredMs / 1000,
    analysisEligibleSessions: track.analysisEligibleSessions,
    averageCompletionRate: track.analysisEligibleSessions > 0 ? track.completionBasisPointsSum / track.analysisEligibleSessions / 10000 : 0,
    microSkips: track.microSkips,
    earlySkips: track.earlySkips,
    validSkips: track.validSkips,
    partialEnds: track.partialEnds,
    globalValidListenCount: track.validPlays,
    globalFullListenCount: track.fullPlays,
    firstPlayedAt: track.firstPlayedAt,
    lastPlayedAt: track.lastPlayedAt,
    byHourMs: [...track.byHourMs],
    byWeekdayMs: [...track.byWeekdayMs],
    byHour: track.byHourMs.map(value => value / 1000),
    byWeekday: track.byWeekdayMs.map(value => value / 1000),
    temporalSchemaVersion: 3,
    featuresUsed: { ...track.features }
  }));
  rows.push({
    uid: 'global',
    globalListenSeconds: 0,
    globalValidListenCount: 0,
    globalFullListenCount: 0,
    firstPlayedAt: projection.firstEventAt,
    lastPlayedAt: projection.lastEventAt,
    featuresUsed: { ...projection.globalFeatures },
    analyticsSchemaVersion: STATS_SHARD_VERSION,
    statsV4: normalizeStatsV4(projection.v4),
    sparseCube: { ...projection.v4.cube },
    repeatRuns: { ...projection.v4.repeat },
    focusRuns: { ...projection.v4.focus },
    focusBoundary: structuredClone(projection.v4.focusBoundary),
    transitions: { ...projection.transitions },
    dimensions: structuredClone(projection.dimensions)
  });
  return rows;
};
const mergeCountMaps = (leftRaw, rightRaw) => {
  const output = countMap(leftRaw);
  Object.entries(countMap(rightRaw)).forEach(([key, amount]) => bump(output, key, amount));
  return output;
};

const mergeFixedArrays = (leftRaw, rightRaw, length) => {
  const left = fixed(leftRaw, length);
  fixed(rightRaw, length).forEach((amount, index) => {
    left[index] += amount;
  });
  return left;
};

export const mergeProjectedStatsRow = (leftRaw = {}, rightRaw = {}) => {
  const uid = safe(rightRaw.uid || leftRaw.uid);
  if (!uid) return null;

  if (uid === 'global') {
    const leftV4 = leftRaw.statsV4 || {
      cube: leftRaw.sparseCube || {},
      repeat: leftRaw.repeatRuns || {},
      boundary: { chainKey: '', firstRun: null, lastRun: null, singleRun: false }
    };
    const rightV4 = rightRaw.statsV4 || {
      cube: rightRaw.sparseCube || {},
      repeat: rightRaw.repeatRuns || {},
      boundary: { chainKey: '', firstRun: null, lastRun: null, singleRun: false }
    };
    const statsV4 = mergeStatsV4(leftV4, rightV4);
    const dimensions = {};
    const names = new Set([
      ...Object.keys(leftRaw.dimensions || {}),
      ...Object.keys(rightRaw.dimensions || {})
    ]);
    names.forEach(name => {
      dimensions[name] = mergeCountMaps(leftRaw.dimensions?.[name], rightRaw.dimensions?.[name]);
    });
    return {
      ...leftRaw,
      ...rightRaw,
      uid,
      globalListenSeconds: 0,
      globalValidListenCount: 0,
      globalFullListenCount: 0,
      firstPlayedAt: minPositive(leftRaw.firstPlayedAt, rightRaw.firstPlayedAt),
      lastPlayedAt: Math.max(num(leftRaw.lastPlayedAt), num(rightRaw.lastPlayedAt)),
      featuresUsed: mergeCountMaps(leftRaw.featuresUsed, rightRaw.featuresUsed),
      analyticsSchemaVersion: STATS_SHARD_VERSION,
      statsV4,
      sparseCube: { ...statsV4.cube },
      repeatRuns: { ...statsV4.repeat },
      focusRuns: { ...statsV4.focus },
      focusBoundary: structuredClone(statsV4.focusBoundary),
      transitions: mergeCountMaps(leftRaw.transitions, rightRaw.transitions),
      dimensions
    };
  }

  const leftSessions = Math.floor(num(leftRaw.analysisEligibleSessions));
  const rightSessions = Math.floor(num(rightRaw.analysisEligibleSessions));
  const totalSessions = leftSessions + rightSessions;
  const completionSum =
    num(leftRaw.averageCompletionRate) * leftSessions +
    num(rightRaw.averageCompletionRate) * rightSessions;

  const byHourMs = mergeFixedArrays(leftRaw.byHourMs, rightRaw.byHourMs, 24);
  const byWeekdayMs = mergeFixedArrays(leftRaw.byWeekdayMs, rightRaw.byWeekdayMs, 7);

  return {
    ...leftRaw,
    ...rightRaw,
    uid,
    globalListenSeconds: num(leftRaw.globalListenSeconds) + num(rightRaw.globalListenSeconds),
    uniqueCoveredSeconds: num(leftRaw.uniqueCoveredSeconds) + num(rightRaw.uniqueCoveredSeconds),
    analysisEligibleSessions: totalSessions,
    averageCompletionRate: totalSessions > 0 ? completionSum / totalSessions : 0,
    microSkips: Math.floor(num(leftRaw.microSkips) + num(rightRaw.microSkips)),
    earlySkips: Math.floor(num(leftRaw.earlySkips) + num(rightRaw.earlySkips)),
    validSkips: Math.floor(num(leftRaw.validSkips) + num(rightRaw.validSkips)),
    partialEnds: Math.floor(num(leftRaw.partialEnds) + num(rightRaw.partialEnds)),
    globalValidListenCount: Math.floor(num(leftRaw.globalValidListenCount) + num(rightRaw.globalValidListenCount)),
    globalFullListenCount: Math.floor(num(leftRaw.globalFullListenCount) + num(rightRaw.globalFullListenCount)),
    firstPlayedAt: minPositive(leftRaw.firstPlayedAt, rightRaw.firstPlayedAt),
    lastPlayedAt: Math.max(num(leftRaw.lastPlayedAt), num(rightRaw.lastPlayedAt)),
    byHourMs,
    byWeekdayMs,
    byHour: byHourMs.map(value => value / 1000),
    byWeekday: byWeekdayMs.map(value => value / 1000),
    temporalSchemaVersion: 3,
    featuresUsed: mergeCountMaps(leftRaw.featuresUsed, rightRaw.featuresUsed)
  };
};

export const projectionStreak = raw => {
  const days = dayList(raw?.activeDays);
  let longest = 0;
  let run = 0;
  let previous = 0;

  days.forEach(value => {
    const current = Date.parse(`${value}T00:00:00Z`);
    run = previous && current - previous === 86400000 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = current;
  });

  const localDateKey = timestamp => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const today = localDateKey(Date.now());
  const yesterday = localDateKey(Date.now() - 86400000);
  const lastActiveDate = days[days.length - 1] || '';
  const current = lastActiveDate === today || lastActiveDate === yesterday ? run : 0;

  return { current, longest, lastActiveDate, activeDays: days };
};

export const mergeStatsProjections = shards => (Array.isArray(shards) ? shards : []).reduce((output, shard) => mergeStatsProjectionInto(output, shard), emptyStatsProjection());

export default {
  STATS_SHARD_VERSION,
  emptyStatsProjection,
  buildStatsProjection,
  normalizeStatsProjection,
  buildStatsProjectionShard,
  verifyStatsProjectionShard,
  mergeStatsProjectionInto,
  mergeStatsProjections,
  projectionToStatsRows,
  mergeProjectedStatsRow,
  projectionStreak
};
