const assert = require('node:assert/strict');
const {
  MIN_VALID_LISTEN_SECONDS,
  isValidInterestEvent,
  buildInterestSeries,
} = require('./interest-series');

const event = (uid, timestamp, listenSeconds = MIN_VALID_LISTEN_SECONDS) => ({
  uid,
  timestamp,
  listenSeconds,
});

assert.equal(isValidInterestEvent(event('A', '2026-01-01T10:00:00Z')), true);
assert.equal(isValidInterestEvent(event('A', '2026-01-01T10:00:00Z', 24.99)), false);
assert.equal(isValidInterestEvent(event('', '2026-01-01T10:00:00Z')), false);

assert.deepEqual(
  buildInterestSeries([
    event('A', '2026-01-01T10:00:00Z'),
    event('A', '2026-01-01T10:01:00Z'),
    event('A', '2026-01-01T10:02:00Z'),
  ]).currentSeries,
  3,
);

assert.deepEqual(
  buildInterestSeries([
    event('A', '2026-01-01T10:00:00Z'),
    event('A', '2026-01-01T10:01:00Z'),
    event('B', '2026-01-01T10:02:00Z'),
    event('A', '2026-01-01T10:03:00Z'),
  ]).runs.map(({ uid, count }) => ({ uid, count })),
  [
    { uid: 'A', count: 2 },
    { uid: 'B', count: 1 },
    { uid: 'A', count: 1 },
  ],
);

assert.deepEqual(
  buildInterestSeries([
    event('A', '2026-01-01T10:00:00Z'),
    event('B', '2026-01-01T10:01:00Z', 10),
    event('A', '2026-01-01T10:02:00Z'),
  ]).runs.map(({ uid, count }) => ({ uid, count })),
  [
    { uid: 'A', count: 2 },
  ],
);

assert.equal(
  buildInterestSeries([
    event('A', '2026-01-01T10:00:00Z'),
    event('A', '2026-01-02T10:00:00Z'),
  ]).currentSeries,
  2,
);

assert.equal(
  buildInterestSeries([
    event('A', '2026-01-01T10:00:00Z'),
    event('A', '2026-01-01T10:01:00Z'),
    event('B', '2026-01-01T10:02:00Z'),
  ]).currentSeries,
  1,
);

assert.equal(
  buildInterestSeries([
    event('A', '2026-01-01T10:02:00Z'),
    event('A', '2026-01-01T10:00:00Z'),
  ]).currentSeries,
  2,
);

console.log('interest-series.test.js: all tests passed');
