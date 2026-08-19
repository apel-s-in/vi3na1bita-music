/**
 * Focused-interest series calculator.
 *
 * This is deliberately independent from achievements, rewards, devotion,
 * shards and server-side streaks. It is a pure projection of synchronized
 * LISTEN_COMPLETE events and is safe to recompute after a Backup V7 rebuild.
 */

const MIN_VALID_LISTEN_SECONDS = 25;
const MIN_VALID_LISTEN_MS = MIN_VALID_LISTEN_SECONDS * 1000;

function toTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function toListenMs(event) {
  const data = event?.data || {};
  const listenedMs = Number(data.listenedMs);
  if (Number.isFinite(listenedMs)) return listenedMs;

  const listenedSeconds = Number(data.listenedSeconds);
  if (Number.isFinite(listenedSeconds)) return listenedSeconds * 1000;

  return NaN;
}

function isValidInterestEvent(event) {
  if (!event || typeof event !== 'object') return false;
  if (event.type !== 'LISTEN_COMPLETE') return false;

  const uid = typeof event.uid === 'string' ? event.uid.trim() : '';
  if (!uid) return false;

  const listenedMs = toListenMs(event);
  return event.data?.isValidListen === true && listenedMs >= MIN_VALID_LISTEN_MS;
}

/**
 * Builds consecutive UID runs from valid LISTEN_COMPLETE events.
 *
 * Only absolute event order matters. Gaps, calendar days, pauses, app closes
 * and device changes are intentionally ignored. Invalid/micro-listens are
 * ignored completely and therefore cannot break a run.
 */
function buildInterestSeries(events) {
  if (!Array.isArray(events)) {
    return {
      currentUid: null,
      currentSeries: 0,
      longestSeries: 0,
      runs: [],
    };
  }

  const validEvents = events
    .filter(isValidInterestEvent)
    .map((event, index) => ({
      uid: event.uid.trim(),
      timestamp: toTimestamp(event.timestamp),
      index,
    }))
    .filter((event) => Number.isFinite(event.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp || a.index - b.index);

  const runs = [];
  for (const event of validEvents) {
    const previous = runs[runs.length - 1];
    if (previous && previous.uid === event.uid) {
      previous.count += 1;
      previous.endTimestamp = event.timestamp;
    } else {
      runs.push({
        uid: event.uid,
        count: 1,
        startTimestamp: event.timestamp,
        endTimestamp: event.timestamp,
      });
    }
  }

  const current = runs[runs.length - 1] ?? null;
  const longestSeries = runs.reduce(
    (max, run) => Math.max(max, run.count),
    0,
  );

  return {
    currentUid: current?.uid ?? null,
    currentSeries: current?.count ?? 0,
    longestSeries,
    runs,
  };
}

module.exports = {
  MIN_VALID_LISTEN_SECONDS,
  MIN_VALID_LISTEN_MS,
  isValidInterestEvent,
  buildInterestSeries,
};
