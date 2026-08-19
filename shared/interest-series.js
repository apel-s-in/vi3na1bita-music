/**
 * Focused-interest series calculator.
 *
 * This is deliberately independent from achievements, rewards, devotion,
 * shards and server-side streaks. It is a pure projection of already
 * synchronized listening events and is safe to recompute after a Backup V7
 * rebuild.
 */

const MIN_VALID_LISTEN_SECONDS = 25;

function toTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return NaN;
}

function toListenSeconds(event) {
  const candidates = [
    event?.listenSeconds,
    event?.playedSeconds,
    event?.durationPlayed,
    event?.validSeconds,
  ];
  for (const value of candidates) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return NaN;
}

function isValidInterestEvent(event) {
  if (!event || typeof event !== 'object') return false;
  const uid = typeof event.uid === 'string' ? event.uid.trim() : '';
  if (!uid) return false;
  return toListenSeconds(event) >= MIN_VALID_LISTEN_SECONDS;
}

/**
 * Builds consecutive UID runs from valid listening events.
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
      timestamp: toTimestamp(event.timestamp ?? event.ts ?? event.createdAt),
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
  isValidInterestEvent,
  buildInterestSeries,
};
