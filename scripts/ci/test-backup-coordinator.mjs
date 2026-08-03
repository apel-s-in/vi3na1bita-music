#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  authorizeCoordinatorLease,
  claimCoordinatorLease,
  completeCoordinatorLease,
  DEFAULT_RETRY_MS,
  MANUAL_RETRY_MS,
  normalizeCoordinatorState,
  publicCoordinatorState,
  releaseCoordinatorLease,
  renewCoordinatorLease
} = require('../../cloud-functions/vi3-signaling/backup-coordinator.js');

const at = 1000000;
const claim = (state, deviceId, reason, priorityToken, offset = 0, manual = false) => claimCoordinatorLease(state, {
  ticketId: `ticket_${deviceId}`,
  leaseId: `lease_${deviceId}_${offset}`,
  tokenHash: priorityToken,
  deviceId,
  deviceLabel: deviceId,
  phase: 'full',
  reason,
  manual,
  dirtyDomains: ['events'],
  pendingRanges: 1
}, { at: at + offset });

let state = normalizeCoordinatorState({});
let step = claim(state, 'device-a', 'daily', 'hash-a');
assert.equal(step.result.granted, true);
assert.equal(step.state.lease.holderDeviceId, 'device-a');
const duplicateWithoutToken = claimCoordinatorLease(state, {
  ticketId: 'ticket_device-a-second-tab',
  leaseId: 'lease_device-a-second-tab',
  tokenHash: 'different-token',
  deviceId: 'device-a',
  deviceLabel: 'device-a',
  phase: 'full',
  reason: 'daily'
}, { at: at + 50 });

assert.equal(duplicateWithoutToken.result.granted, false);
assert.equal(duplicateWithoutToken.result.busy, true);
assert.equal(duplicateWithoutToken.result.sameDevice, true);

const duplicateWithToken = claimCoordinatorLease(state, {
  ticketId: 'ticket_device-a-owner',
  leaseId: 'unused',
  tokenHash: 'hash-a',
  deviceId: 'device-a',
  deviceLabel: 'device-a',
  phase: 'full',
  reason: 'daily'
}, { at: at + 60 });

assert.equal(duplicateWithToken.result.granted, true);
assert.equal(duplicateWithToken.result.existing, true);

state = step.state;

step = claim(state, 'device-b', 'daily', 'hash-b', 100);
assert.equal(step.result.queued, true);
assert.equal(step.result.position, 1);
assert.equal(step.result.retryAt, at + 100 + DEFAULT_RETRY_MS);
state = step.state;

step = claim(state, 'device-c', 'manual', 'hash-c', 200, true);
assert.equal(step.result.queued, true);
assert.equal(step.result.position, 1);
assert.equal(step.result.retryAt, at + 200 + MANUAL_RETRY_MS);
assert.equal(step.state.queue[0].deviceId, 'device-c');
state = step.state;

const wrong = authorizeCoordinatorLease(state, {
  deviceId: 'device-a',
  leaseId: 'lease_device-a_0',
  tokenHash: 'wrong'
}, { at: at + 300 });
assert.equal(wrong.result.authorized, false);

const authorized = authorizeCoordinatorLease(state, {
  deviceId: 'device-a',
  leaseId: 'lease_device-a_0',
  tokenHash: 'hash-a'
}, { at: at + 300 });
assert.equal(authorized.result.authorized, true);

const renewed = renewCoordinatorLease(state, {
  deviceId: 'device-a',
  leaseId: 'lease_device-a_0',
  tokenHash: 'hash-a'
}, { at: at + 400 });
assert.equal(renewed.result.renewed, true);
assert.ok(renewed.state.lease.expiresAt > state.lease.expiresAt);
state = renewed.state;

const completed = completeCoordinatorLease(state, {
  deviceId: 'device-a',
  leaseId: 'lease_device-a_0',
  tokenHash: 'hash-a',
  phase: 'full',
  pushCompleted: true,
  pullCompleted: true
}, { at: at + 500 });
assert.equal(completed.result.completed, true);
assert.equal(completed.state.lease, null);
assert.equal(completed.result.nextDeviceId, 'device-c');
assert.equal(completed.state.devices['device-a'].completedSyncs, 1);
state = completed.state;

step = claim(state, 'device-c', 'continuation', 'hash-c2', 600, true);
assert.equal(step.result.granted, true);
state = step.state;

const released = releaseCoordinatorLease(state, {
  deviceId: 'device-c',
  leaseId: 'lease_device-c_600',
  tokenHash: 'hash-c2',
  reason: 'disk_space_exhausted',
  error: 'disk_space_exhausted',
  blockReason: 'disk_space_exhausted',
  blockUntil: at + 86400000
}, { at: at + 700 });
assert.equal(released.result.released, true);
assert.equal(released.result.blocked, true);
assert.equal(released.state.accountBlock.reason, 'disk_space_exhausted');
state = released.state;

step = claim(state, 'device-b', 'daily', 'hash-b2', 800);
assert.equal(step.result.granted, false);
assert.equal(step.result.blocked, true);

const publicState = publicCoordinatorState(state, 'device-b', at + 900);
assert.equal(publicState.accountBlock.reason, 'disk_space_exhausted');
assert.equal(JSON.stringify(publicState).includes('tokenHash'), false);

console.log('✅ Backup coordinator lease, priority queue and account block passed');
