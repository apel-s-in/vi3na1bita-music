// Компактная статистическая проекция immutable event range.
// Проекция является rebuildable-кэшем и не участвует в серверных достижениях.
import { isV7SyncEvent } from './event-contract.js';
import { temporalPartsFromListenEvent } from './temporal-buckets.js';
import { buildDeltaRangeKey, safeDeltaId } from './backup-delta-contract.js';

export const STATS_SHARD_VERSION = 1;
const safe = value => String(value == null ? '' : value).trim();
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const countMap = raw => Object.fromEntries(Object.entries(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}).map(([key, value]) => [safe(key), num(value)]).filter(([key, value]) => key && value > 0));
const fixed = (raw, length) => Array.from({ length }, (_, index) => Math.max(0, Math.floor(num(raw?.[index]))));
const bump = (map, key, amount = 1) => {
  const clean = safe(key);
  const value = num(amount);
  if (clean && value > 0) map[clean] = num(map[clean]) + value;
};

const sortObject = value => Array.isArray(value) ? value.map(sortObject) : !value || typeof value !== 'object' ? value : Object.keys(value).sort().reduce((out, key) => {
  out[key] = sortObject(value[key]);
  return out;
}, {});

const sha256Hex = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(sortObject(value)))))]
  .map(byte => byte.toString(16).padStart(2, '0'))
  .join('');

export const emptyStatsProjection = () => ({
  listenMs: 0,
  validPlays: 0,
  fullPlays: 0,
  starts: 0,
  skips: 0,
  byHourMs: Array(24).fill(0),
  byWeekdayMs: Array(7).fill(0),
  tracks: {},
  features: {},
  dimensions: { quality: {}, variant: {}, platform: {}, shuffle: {}, favoritesOnly: {}, launchSource: {} }
});

const ensureTrack = (projection, uid) => projection.tracks[uid] ||= { listenMs: 0, validPlays: 0, fullPlays: 0, starts: 0, skips: 0, features: {} };

export const buildStatsProjection = events => {
  const projection = emptyStatsProjection();
  (Array.isArray(events) ? events : []).filter(isV7SyncEvent).forEach(event => {
    const type = safe(event?.type);
    const uid = safe(event?.uid);
    const data = event?.data || {};

    if (type === 'LISTEN_START') {
      projection.starts++;
      if (uid) ensureTrack(projection, uid).starts++;
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
      if (uid) ensureTrack(projection, uid).skips++;
      return;
    }

    if (type === 'FEATURE_USED') {
      const feature = safe(data.feature);
      if (!feature) return;
      bump(projection.features, feature);
      if (uid && uid !== 'global') bump(ensureTrack(projection, uid).features, feature);
      return;
    }

    if (type !== 'LISTEN_COMPLETE' || !uid) return;
    const track = ensureTrack(projection, uid);
    const listenMs = Math.max(0, Math.floor(num(data.listenedSeconds) * 1000));
    projection.listenMs += listenMs;
    track.listenMs += listenMs;

    if (data.isValidListen === true) {
      projection.validPlays++;
      track.validPlays++;
    }
    if (data.isFullListen === true && data.isValidListen === true && data.variant !== 'short') {
      projection.fullPlays++;
      track.fullPlays++;
    }

    temporalPartsFromListenEvent(event).forEach(part => {
      projection.byHourMs[part.hour] += Math.floor(num(part.creditedMs));
      projection.byWeekdayMs[part.weekday] += Math.floor(num(part.creditedMs));
    });

    bump(projection.dimensions.quality, data.quality || 'unknown');
    bump(projection.dimensions.variant, data.variant || 'audio');
    bump(projection.dimensions.platform, event.platform || 'web');
    bump(projection.dimensions.shuffle, data.shuffle === true ? 'on' : 'off');
    bump(projection.dimensions.favoritesOnly, data.favoritesOnly === true ? 'on' : 'off');
    if (data.launchSource) bump(projection.dimensions.launchSource, data.launchSource);
  });
  return projection;
};

export const normalizeStatsProjection = raw => ({
  listenMs: Math.floor(num(raw?.listenMs)),
  validPlays: Math.floor(num(raw?.validPlays)),
  fullPlays: Math.floor(num(raw?.fullPlays)),
  starts: Math.floor(num(raw?.starts)),
  skips: Math.floor(num(raw?.skips)),
  byHourMs: fixed(raw?.byHourMs, 24),
  byWeekdayMs: fixed(raw?.byWeekdayMs, 7),
  tracks: Object.fromEntries(Object.entries(raw?.tracks && typeof raw.tracks === 'object' ? raw.tracks : {}).map(([uid, row]) => [safe(uid), {
    listenMs: Math.floor(num(row?.listenMs)),
    validPlays: Math.floor(num(row?.validPlays)),
    fullPlays: Math.floor(num(row?.fullPlays)),
    starts: Math.floor(num(row?.starts)),
    skips: Math.floor(num(row?.skips)),
    features: countMap(row?.features)
  }]).filter(([uid]) => uid)),
  features: countMap(raw?.features),
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
  const deviceStableId = safeDeltaId(segment?.deviceStableId);
  const fromSeq = Math.floor(num(segment?.fromSeq));
  const toSeq = Math.floor(num(segment?.toSeq));
  const sourceHash = safe(segment?.hash);
  const rangeKey = buildDeltaRangeKey({ branchId, fromSeq, toSeq, hash: sourceHash });
  const projection = normalizeStatsProjection(buildStatsProjection(events));
  const hash = await sha256Hex({ rangeKey, projection });
  return { version: STATS_SHARD_VERSION, rangeKey, deviceStableId, branchId, chainId: safe(segment?.chainId), fromSeq, toSeq, eventCount: events.length, sourceHash, hash, projection, createdAt: Date.now() };
};

export const mergeStatsProjections = shards => {
  const output = emptyStatsProjection();
  const seen = new Set();
  (Array.isArray(shards) ? shards : []).forEach(shard => {
    const rangeKey = safe(shard?.rangeKey);
    if (!rangeKey || seen.has(rangeKey)) return;
    seen.add(rangeKey);
    const value = normalizeStatsProjection(shard?.projection);
    output.listenMs += value.listenMs;
    output.validPlays += value.validPlays;
    output.fullPlays += value.fullPlays;
    output.starts += value.starts;
    output.skips += value.skips;
    value.byHourMs.forEach((amount, index) => output.byHourMs[index] += amount);
    value.byWeekdayMs.forEach((amount, index) => output.byWeekdayMs[index] += amount);
    Object.entries(value.features).forEach(([key, amount]) => bump(output.features, key, amount));
    Object.entries(value.dimensions).forEach(([dimension, rows]) => Object.entries(rows).forEach(([key, amount]) => bump(output.dimensions[dimension], key, amount)));
    Object.entries(value.tracks).forEach(([uid, row]) => {
      const track = ensureTrack(output, uid);
      track.listenMs += row.listenMs;
      track.validPlays += row.validPlays;
      track.fullPlays += row.fullPlays;
      track.starts += row.starts;
      track.skips += row.skips;
      Object.entries(row.features).forEach(([key, amount]) => bump(track.features, key, amount));
    });
  });
  return normalizeStatsProjection(output);
};

export default { STATS_SHARD_VERSION, emptyStatsProjection, buildStatsProjection, normalizeStatsProjection, buildStatsProjectionShard, mergeStatsProjections };
