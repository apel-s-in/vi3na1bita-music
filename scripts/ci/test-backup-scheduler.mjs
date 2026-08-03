#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  BACKUP_CONTINUATION_MS,
  BACKUP_DAILY_MS,
  backupNeedsContinuation,
  deterministicBackupJitter,
  dirtyDomainsAfterSync,
  mergeDirtyDomains,
  nextBackupDailyAt,
  normalizeBackupSchedulerState
} from '../analytics/backup-scheduler-policy.js';

const base = normalizeBackupSchedulerState({
  enabled: true,
  dirtyDomains: ['events', 'playlists', 'events'],
  nextSyncAt: 100
});

assert.deepEqual(base.dirtyDomains, ['events', 'playlists']);
assert.deepEqual(mergeDirtyDomains(base.dirtyDomains, 'settings'), ['events', 'playlists', 'settings']);

const anchor = Date.UTC(2026, 7, 3, 12);
const jitterA = deterministicBackupJitter({ owner: 'owner-a', deviceId: 'device-a', anchorAt: anchor });
const jitterARepeat = deterministicBackupJitter({ owner: 'owner-a', deviceId: 'device-a', anchorAt: anchor });
assert.equal(jitterARepeat, jitterA);

const next = nextBackupDailyAt({ fromAt: anchor, owner: 'owner-a', deviceId: 'device-a' });
assert.equal(next, anchor + BACKUP_DAILY_MS + jitterA);

assert.equal(backupNeedsContinuation({ pendingRanges: 1 }), true);
assert.equal(backupNeedsContinuation({ unpackedEvents: 1 }), true);
assert.equal(backupNeedsContinuation({ pullRemaining: 1 }), true);
assert.equal(backupNeedsContinuation({ pageLimitReached: true }), true);
assert.equal(backupNeedsContinuation({ pendingRanges: 0, unpackedEvents: 0, pullRemaining: 0 }), false);
assert.equal(BACKUP_CONTINUATION_MS, 3 * 60 * 1000);

assert.deepEqual(
  dirtyDomainsAfterSync({
    dirtyDomains: ['events', 'playlists', 'settings'],
    backlog: { pendingRanges: 2, unpackedEvents: 0, pullRemaining: 0 },
    sharedWriteRequired: true,
    sharedWriteConfirmed: true,
    settingsWriteRequired: true,
    settingsWriteConfirmed: true
  }),
  ['events']
);

assert.deepEqual(
  dirtyDomainsAfterSync({
    dirtyDomains: ['events', 'playlists', 'settings'],
    backlog: { pendingRanges: 0, unpackedEvents: 0, pullRemaining: 0 },
    sharedWriteRequired: true,
    sharedWriteConfirmed: false,
    settingsWriteRequired: true,
    settingsWriteConfirmed: true
  }),
  ['playlists']
);

assert.deepEqual(
  dirtyDomainsAfterSync({
    dirtyDomains: ['events', 'playlists', 'settings'],
    backlog: { pendingRanges: 0, unpackedEvents: 0, pullRemaining: 0 },
    sharedWriteRequired: true,
    sharedWriteConfirmed: true,
    settingsWriteRequired: true,
    settingsWriteConfirmed: true
  }),
  []
);

console.log('✅ Daily Backup scheduler and backlog policy passed');
