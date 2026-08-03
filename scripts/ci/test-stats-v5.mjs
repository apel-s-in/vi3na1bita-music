#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildStatsV4, mergeStatsV4 } from '../analytics/stats-v4-projection.js';

const completion = ({ id, uid = 'GD-01', deviceId = 'dst_e2e', chainId = 'chain_e2e', startedAt, completedAt }) => ({
  eventId: id,
  type: 'LISTEN_COMPLETE',
  uid,
  deviceStableId: deviceId,
  chainId,
  timestamp: completedAt,
  deviceOs: 'Windows',
  platform: 'web',
  data: {
    startedAt,
    listenedMs: completedAt - startedAt,
    uniqueCoveredMs: completedAt - startedAt,
    completionBasisPoints: 10000,
    analysisEligible: true,
    isValidListen: true,
    isFullListen: true,
    skipClass: 'full',
    quality: 'hi',
    launchSource: 'album',
    timezoneOffsetMin: 0,
    creditedSegments: [{ startedAt, endedAt: completedAt, creditedMs: completedAt - startedAt }]
  }
});

const first = buildStatsV4([
  completion({ id: 'e1', startedAt: 100000, completedAt: 140000 }),
  completion({ id: 'e2', startedAt: 141000, completedAt: 181000 })
]);
const second = buildStatsV4([
  completion({ id: 'e3', startedAt: 182000, completedAt: 222000 })
]);

const merged = mergeStatsV4(first, second);
assert.deepEqual(merged.repeat['GD-01'], { runs3: 1, completionsInRuns3: 3, maxRun: 3 });

const otherDevice = buildStatsV4([
  completion({ id: 'e4', deviceId: 'dst_other', startedAt: 223000, completedAt: 263000 })
]);
const isolated = mergeStatsV4(merged, otherDevice);
assert.deepEqual(isolated.repeat['GD-01'], { runs3: 1, completionsInRuns3: 3, maxRun: 3 });

const changedTrack = buildStatsV4([
  completion({ id: 'e5', uid: 'GD-02', startedAt: 223000, completedAt: 263000 })
]);
const broken = mergeStatsV4(merged, changedTrack);
assert.equal(broken.repeat['GD-01'].maxRun, 3);
assert.equal(broken.repeat['GD-02']?.runs3 || 0, 0);

const sessions = Object.values(merged.cube).reduce((sum, cell) => sum + Number(cell.sessions || 0), 0);
assert.equal(sessions, 3);
const skipped = buildStatsV4([
  {
    ...completion({ id: 's1', startedAt: 300000, completedAt: 301000 }),
    data: {
      ...completion({ id: 's1', startedAt: 300000, completedAt: 301000 }).data,
      analysisEligible: false,
      isValidListen: false,
      isFullListen: false,
      skipClass: 'micro_skip'
    }
  },
  {
    ...completion({ id: 's2', startedAt: 302000, completedAt: 303000 }),
    data: {
      ...completion({ id: 's2', startedAt: 302000, completedAt: 303000 }).data,
      analysisEligible: false,
      isValidListen: false,
      isFullListen: false,
      skipClass: 'micro_skip'
    }
  },
  {
    ...completion({ id: 's3', startedAt: 304000, completedAt: 305000 }),
    data: {
      ...completion({ id: 's3', startedAt: 304000, completedAt: 305000 }).data,
      analysisEligible: false,
      isValidListen: false,
      isFullListen: false,
      skipClass: 'micro_skip'
    }
  }
]);

assert.equal(skipped.repeat['GD-01']?.runs3 || 0, 0);
console.log('✅ Stats v5 full-repeat boundary and sparse cube contract passed');
