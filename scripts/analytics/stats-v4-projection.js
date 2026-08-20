// Stats shard v5: sparse cube и boundary-aware full repeat runs.
// Pure helper: не читает storage, не выполняет сеть и не управляет playback.
import { temporalPartsFromListenEvent } from './temporal-buckets.js';

const REPEAT_GAP_MS = 60000;
const safe = value => String(value == null ? '' : value).trim();
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const count = value => Math.max(0, Math.floor(num(value)));
const cloneRun = raw => raw ? { uid: safe(raw.uid), deviceId: safe(raw.deviceId), chainKey: safe(raw.chainKey), count: count(raw.count), firstStartedAt: count(raw.firstStartedAt), lastCompletedAt: count(raw.lastCompletedAt) } : null;
const emptyRepeat = () => ({ runs3: 0, completionsInRuns3: 0, maxRun: 0 });
const emptyFocus = () => ({ maxRun: 0 });
const emptyCell = () => ({ listenMs: 0, uniqueCoveredMs: 0, sessions: 0, analysisEligibleSessions: 0, validPlays: 0, fullPlays: 0, microSkips: 0, earlySkips: 0, validSkips: 0, partialEnds: 0, completionBasisPointsSum: 0 });
const cubeKey = values => JSON.stringify(values.map(value => safe(value || 'unknown')));
const addRun = (summary, run, direction = 1) => { if (!run?.uid || run.count < 3) return; const row = summary[run.uid] ||= emptyRepeat(); row.runs3 = Math.max(0, row.runs3 + direction); row.completionsInRuns3 = Math.max(0, row.completionsInRuns3 + run.count * direction); if (direction > 0) row.maxRun = Math.max(row.maxRun, run.count); };
const sameRun = (left, right) => !!left && !!right && left.uid === right.uid && left.deviceId === right.deviceId && left.chainKey === right.chainKey && right.firstStartedAt >= left.lastCompletedAt && right.firstStartedAt - left.lastCompletedAt <= REPEAT_GAP_MS;
const sameFocusRun = (left, right) => !!left && !!right && left.uid === right.uid && left.deviceId === right.deviceId && left.chainKey === right.chainKey;
const joinRun = (left, right) => ({ uid: left.uid, deviceId: left.deviceId, chainKey: left.chainKey, count: left.count + right.count, firstStartedAt: left.firstStartedAt, lastCompletedAt: right.lastCompletedAt });
const addCell = (cube, key, patch) => { const cell = cube[key] ||= emptyCell(); Object.entries(patch).forEach(([field, value]) => { cell[field] = num(cell[field]) + num(value); }); };
const eventChainKey = event => `${safe(event?.deviceStableId)}:${safe(event?.chainId)}`;
const runFromEvent = event => ({ uid: safe(event?.uid), deviceId: safe(event?.deviceStableId), chainKey: eventChainKey(event), count: 1, firstStartedAt: count(event?.data?.startedAt || event?.timestamp), lastCompletedAt: count(event?.timestamp) });
const normalizeRepeat = raw => Object.fromEntries(Object.entries(raw && typeof raw === 'object' ? raw : {}).map(([uid, row]) => [safe(uid), { runs3: count(row?.runs3), completionsInRuns3: count(row?.completionsInRuns3), maxRun: count(row?.maxRun) }]).filter(([uid]) => uid));
const normalizeCube = raw => Object.fromEntries(Object.entries(raw && typeof raw === 'object' ? raw : {}).map(([key, cell]) => [safe(key), { listenMs: count(cell?.listenMs), uniqueCoveredMs: count(cell?.uniqueCoveredMs), sessions: count(cell?.sessions), analysisEligibleSessions: count(cell?.analysisEligibleSessions), validPlays: count(cell?.validPlays), fullPlays: count(cell?.fullPlays), microSkips: count(cell?.microSkips), earlySkips: count(cell?.earlySkips), validSkips: count(cell?.validSkips), partialEnds: count(cell?.partialEnds), completionBasisPointsSum: count(cell?.completionBasisPointsSum) }]).filter(([key]) => key));

export const emptyStatsV4 = () => ({ cube: {}, repeat: {}, focus: {}, boundary: { chainKey: '', firstRun: null, lastRun: null, singleRun: false }, focusBoundary: { chainKey: '', firstRun: null, lastRun: null, singleRun: false } });

export const buildStatsV4 = (events = []) => {
  const output = emptyStatsV4();
  const completions = events.filter(event => safe(event?.type) === 'LISTEN_COMPLETE' && safe(event?.uid)).sort((left, right) => count(left?.timestamp) - count(right?.timestamp) || count(left?.deviceSeq) - count(right?.deviceSeq));
  const runs = [];
  const focusRuns = [];
  completions.forEach(event => {
    const data = event.data || {};
    const listenedMs = count(data.listenedMs || num(data.listenedSeconds) * 1000);
    if (data.isValidListen === true && listenedMs >= 25000) {
      const nextFocus = runFromEvent(event);
      const previousFocus = focusRuns[focusRuns.length - 1];
      if (sameFocusRun(previousFocus, nextFocus)) focusRuns[focusRuns.length - 1] = joinRun(previousFocus, nextFocus); else focusRuns.push(nextFocus);
    }
    if (data.isValidListen === true && data.isFullListen === true && data.skipClass === 'full') {
      const next = runFromEvent(event);
      const previous = runs[runs.length - 1];
      if (sameRun(previous, next)) runs[runs.length - 1] = joinRun(previous, next); else runs.push(next);
    } else runs.push(null);
    const parts = temporalPartsFromListenEvent(event);
    const totalTemporalMs = parts.reduce((sum, part) => sum + count(part.creditedMs), 0);
    const uniqueCoveredMs = count(data.uniqueCoveredMs || num(data.uniqueCoveredSeconds) * 1000);
    const firstPart = parts[0] || { hour: 0, weekday: 0, creditedMs: listenMs };
    const dimensions = [event.uid, event.deviceStableId, event.deviceOs || event.platform, firstPart.hour, firstPart.weekday, data.quality || 'unknown', data.launchSource || 'unknown'];
    const startKey = cubeKey(dimensions);
    addCell(output.cube, startKey, { sessions: 1, analysisEligibleSessions: data.analysisEligible === true ? 1 : 0, validPlays: data.isValidListen === true ? 1 : 0, fullPlays: data.isFullListen === true ? 1 : 0, microSkips: data.skipClass === 'micro_skip' ? 1 : 0, earlySkips: data.skipClass === 'early_skip' ? 1 : 0, validSkips: data.skipClass === 'valid_skip' ? 1 : 0, partialEnds: data.skipClass === 'partial_end' ? 1 : 0, completionBasisPointsSum: data.analysisEligible === true ? count(data.completionBasisPoints) : 0 });
    (parts.length ? parts : [firstPart]).forEach(part => { const ratio = totalTemporalMs > 0 ? count(part.creditedMs) / totalTemporalMs : 1; const key = cubeKey([event.uid, event.deviceStableId, event.deviceOs || event.platform, part.hour, part.weekday, data.quality || 'unknown', data.launchSource || 'unknown']); addCell(output.cube, key, { listenMs: count(part.creditedMs || listenMs), uniqueCoveredMs: count(uniqueCoveredMs * ratio) }); });
  });
  const completedRuns = runs.filter(Boolean);
  completedRuns.forEach(run => addRun(output.repeat, run));
  focusRuns.forEach(run => { const row = output.focus[run.uid] ||= emptyFocus(); row.maxRun = Math.max(row.maxRun, run.count); });
  const chainKeys = [...new Set(completions.map(eventChainKey).filter(key => key !== ':'))];
  const chainKey = chainKeys.length === 1 ? chainKeys[0] : '';
  output.boundary = { chainKey, firstRun: cloneRun(runs[0]), lastRun: cloneRun(runs[runs.length - 1]), singleRun: runs.length === 1 && completedRuns.length === 1 };
  output.focusBoundary = { chainKey, firstRun: cloneRun(focusRuns[0]), lastRun: cloneRun(focusRuns[focusRuns.length - 1]), singleRun: focusRuns.length === 1 };
  return output;
};

export const normalizeStatsV4 = raw => ({ cube: normalizeCube(raw?.cube), repeat: normalizeRepeat(raw?.repeat), focus: Object.fromEntries(Object.entries(raw?.focus && typeof raw.focus === 'object' ? raw.focus : {}).map(([uid, row]) => [safe(uid), { maxRun: count(row?.maxRun) }]).filter(([uid]) => uid)), boundary: { chainKey: safe(raw?.boundary?.chainKey), firstRun: cloneRun(raw?.boundary?.firstRun), lastRun: cloneRun(raw?.boundary?.lastRun), singleRun: raw?.boundary?.singleRun === true }, focusBoundary: { chainKey: safe(raw?.focusBoundary?.chainKey), firstRun: cloneRun(raw?.focusBoundary?.firstRun), lastRun: cloneRun(raw?.focusBoundary?.lastRun), singleRun: raw?.focusBoundary?.singleRun === true } });

export const mergeStatsV4 = (targetRaw, sourceRaw) => {
  const target = normalizeStatsV4(targetRaw);
  const source = normalizeStatsV4(sourceRaw);
  Object.entries(source.cube).forEach(([key, cell]) => addCell(target.cube, key, cell));
  Object.entries(source.repeat).forEach(([uid, row]) => { const current = target.repeat[uid] ||= emptyRepeat(); current.runs3 += row.runs3; current.completionsInRuns3 += row.completionsInRuns3; current.maxRun = Math.max(current.maxRun, row.maxRun); });
  Object.entries(source.focus).forEach(([uid, row]) => { const current = target.focus[uid] ||= emptyFocus(); current.maxRun = Math.max(current.maxRun, row.maxRun); });
  const focusLeft = target.focusBoundary.lastRun;
  const focusRight = source.focusBoundary.firstRun;
  const focusCombined = target.focusBoundary.chainKey && target.focusBoundary.chainKey === source.focusBoundary.chainKey && sameFocusRun(focusLeft, focusRight) ? joinRun(focusLeft, focusRight) : null;
  if (focusCombined) { const current = target.focus[focusCombined.uid] ||= emptyFocus(); current.maxRun = Math.max(current.maxRun, focusCombined.count); }
  const left = target.boundary.lastRun;
  const right = source.boundary.firstRun;
  const stitch = target.boundary.chainKey && target.boundary.chainKey === source.boundary.chainKey && sameRun(left, right);
  const combined = stitch ? joinRun(left, right) : null;
  if (combined) { addRun(target.repeat, left, -1); addRun(target.repeat, right, -1); addRun(target.repeat, combined, 1); }
  const firstRun = target.boundary.firstRun ? target.boundary.singleRun && combined ? combined : target.boundary.firstRun : source.boundary.firstRun;
  const lastRun = source.boundary.lastRun ? source.boundary.singleRun && combined ? combined : source.boundary.lastRun : target.boundary.lastRun;
  target.boundary = { chainKey: source.boundary.chainKey || target.boundary.chainKey, firstRun: cloneRun(firstRun), lastRun: cloneRun(lastRun), singleRun: target.boundary.singleRun && source.boundary.singleRun && !!combined };
  target.focusBoundary = { chainKey: source.focusBoundary.chainKey || target.focusBoundary.chainKey, firstRun: cloneRun(target.focusBoundary.firstRun ? target.focusBoundary.singleRun && focusCombined ? focusCombined : target.focusBoundary.firstRun : source.focusBoundary.firstRun), lastRun: cloneRun(source.focusBoundary.lastRun ? source.focusBoundary.singleRun && focusCombined ? focusCombined : source.focusBoundary.lastRun : target.focusBoundary.lastRun), singleRun: target.focusBoundary.singleRun && source.focusBoundary.singleRun && !!focusCombined };
  return normalizeStatsV4(target);
};

export default { emptyStatsV4, buildStatsV4, normalizeStatsV4, mergeStatsV4 };
