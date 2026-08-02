// Компактная статистическая проекция immutable event range.
// Rollup является локальным rebuildable-кэшем и создаётся только
// после успешной проверки hash-chain исходного range.
import { isV7SyncEvent } from './event-contract.js';
import { temporalPartsFromListenEvent } from './temporal-buckets.js';
import { buildDeltaRangeKey, safeDeltaId } from './backup-delta-contract.js';

export const STATS_SHARD_VERSION = 2;
const safe = value => String(value == null ? '' : value).trim();
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
  validPlays: 0,
  fullPlays: 0,
  starts: 0,
  skips: 0,
  firstEventAt: 0,
  lastEventAt: 0,
  activeDays: [],
  byHourMs: Array(24).fill(0),
  byWeekdayMs: Array(7).fill(0),
  tracks: {},
  globalFeatures: {},
  dimensions: { quality: {}, variant: {}, platform: {}, shuffle: {}, favoritesOnly: {}, launchSource: {} }
});

const ensureTrack = (projection, uid) => projection.tracks[uid] ||= {
  listenMs: 0,
  validPlays: 0,
  fullPlays: 0,
  starts: 0,
  skips: 0,
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
  (Array.isArray(events) ? events : []).filter(isV7SyncEvent).forEach(event => {
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
      bump(projection.dimensions.shuffle, data.shuffle === true ? 'on' : 'off');
      bump(projection.dimensions.favoritesOnly, data.favoritesOnly === true ? 'on' : 'off');
      if (data.launchSource) bump(projection.dimensions.launchSource, data.launchSource);
      return;
    }

    if (type === 'LISTEN_SKIP') {
      projection.skips++;
      if (uid) {
        const track = ensureTrack(projection, uid);
        track.skips++;
        touchTrack(track, event.timestamp);
      }
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
    const listenMs = Math.max(0, Math.floor(num(data.listenedSeconds) * 1000));
    const playedAt = Math.max(0, num(data.startedAt || event.timestamp));
    projection.listenMs += listenMs;
    track.listenMs += listenMs;
    touchTrack(track, playedAt);

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
    bump(projection.dimensions.shuffle, data.shuffle === true ? 'on' : 'off');
    bump(projection.dimensions.favoritesOnly, data.favoritesOnly === true ? 'on' : 'off');
    if (data.launchSource) bump(projection.dimensions.launchSource, data.launchSource);
  });
  projection.activeDays = dayList(projection.activeDays);
  return projection;
};

export const normalizeStatsProjection = raw => ({
  listenMs: Math.floor(num(raw?.listenMs)),
  validPlays: Math.floor(num(raw?.validPlays)),
  fullPlays: Math.floor(num(raw?.fullPlays)),
  starts: Math.floor(num(raw?.starts)),
  skips: Math.floor(num(raw?.skips)),
  firstEventAt: Math.floor(num(raw?.firstEventAt)),
  lastEventAt: Math.floor(num(raw?.lastEventAt)),
  activeDays: dayList(raw?.activeDays),
  byHourMs: fixed(raw?.byHourMs, 24),
  byWeekdayMs: fixed(raw?.byWeekdayMs, 7),
  tracks: Object.fromEntries(Object.entries(raw?.tracks && typeof raw.tracks === 'object' ? raw.tracks : {}).map(([uid, row]) => [safe(uid), {
    listenMs: Math.floor(num(row?.listenMs)),
    validPlays: Math.floor(num(row?.validPlays)),
    fullPlays: Math.floor(num(row?.fullPlays)),
    starts: Math.floor(num(row?.starts)),
    skips: Math.floor(num(row?.skips)),
    firstPlayedAt: Math.floor(num(row?.firstPlayedAt)),
    lastPlayedAt: Math.floor(num(row?.lastPlayedAt)),
    byHourMs: fixed(row?.byHourMs, 24),
    byWeekdayMs: fixed(row?.byWeekdayMs, 7),
    features: countMap(row?.features)
  }]).filter(([uid]) => uid)),
  globalFeatures: countMap(raw?.globalFeatures || raw?.features),
  dimensions: {
    quality: countMap(raw?.dimensions?.quality),
    variant: countMap(raw?.dimensions?.variant),
    platform: countMap(raw?.dimensions?.platform),
    shuffle: countMap(raw?.dimensions?.shuffle),
    favoritesOnly: countMap(raw?.dimensions?.favoritesOnly),
    launchSource: countMap(raw?.dimensions?.launchSource)
  }
});

export const buildStatsProjectionShard = async segment => {
  const events = (Array.isArray(segment?.events) ? segment.events : []).filter(isV7SyncEvent);
  const branchId = safeDeltaId(segment?.branchId);
  const deviceStableId = safeDeltaId(segment?.deviceId || segment?.deviceStableId);
  const chainId = safe(segment?.chainId);
  const fromSeq = Math.floor(num(segment?.fromSeq));
  const toSeq = Math.floor(num(segment?.toSeq));
  const sourceHash = safe(segment?.hash);
  const rangeKey = safe(segment?.rangeKey) || buildDeltaRangeKey({ deviceId: deviceStableId, chainId: chainId || branchId, fromSeq, toSeq, hash: sourceHash });
  const projection = normalizeStatsProjection(buildStatsProjection(events));
  const core = { version: STATS_SHARD_VERSION, rangeKey, sourceHash, projection };
  const hash = await sha256Hex(core);
  return { ...core, deviceStableId, branchId, chainId, fromSeq, toSeq, eventCount: events.length, hash, createdAt: Date.now() };
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
  target.validPlays += source.validPlays;
  target.fullPlays += source.fullPlays;
  target.starts += source.starts;
  target.skips += source.skips;
  target.firstEventAt = minPositive(target.firstEventAt, source.firstEventAt);
  target.lastEventAt = Math.max(target.lastEventAt, source.lastEventAt);
  target.activeDays = dayList([...target.activeDays, ...source.activeDays]);
  source.byHourMs.forEach((amount, index) => target.byHourMs[index] += amount);
  source.byWeekdayMs.forEach((amount, index) => target.byWeekdayMs[index] += amount);
  Object.entries(source.globalFeatures).forEach(([key, amount]) => bump(target.globalFeatures, key, amount));
  Object.entries(source.dimensions).forEach(([dimension, rows]) => Object.entries(rows).forEach(([key, amount]) => bump(target.dimensions[dimension], key, amount)));
  Object.entries(source.tracks).forEach(([uid, row]) => {
    const track = ensureTrack(target, uid);
    track.listenMs += row.listenMs;
    track.validPlays += row.validPlays;
    track.fullPlays += row.fullPlays;
    track.starts += row.starts;
    track.skips += row.skips;
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
    globalValidListenCount: track.validPlays,
    globalFullListenCount: track.fullPlays,
    firstPlayedAt: track.firstPlayedAt,
    lastPlayedAt: track.lastPlayedAt,
    byHourMs: [...track.byHourMs],
    byWeekdayMs: [...track.byWeekdayMs],
    byHour: track.byHourMs.map(value => value / 1000),
    byWeekday: track.byWeekdayMs.map(value => value / 1000),
    temporalSchemaVersion: 2,
    featuresUsed: { ...track.features }
  }));
  if (Object.keys(projection.globalFeatures).length) {
    rows.push({ uid: 'global', globalListenSeconds: 0, globalValidListenCount: 0, globalFullListenCount: 0, firstPlayedAt: projection.firstEventAt, lastPlayedAt: projection.lastEventAt, featuresUsed: { ...projection.globalFeatures } });
  }
  return rows;
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
  return { current: run, longest, lastActiveDate: days[days.length - 1] || '', activeDays: days };
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
  projectionStreak
};
