'use strict';

const VERSION = 1;
const DEFAULT_LEASE_MS = 8 * 60 * 1000;
const DEFAULT_TICKET_MS = 12 * 60 * 1000;
const DEFAULT_RETRY_MS = 15000;
const DEFAULT_QUEUE_LIMIT = 50;
const MAX_DEVICE_HISTORY = 100;
const PRIORITIES = Object.freeze({
  manual: 100,
  continuation: 50,
  initial_device: 40,
  daily: 10
});

const safe = value => String(value == null ? '' : value).trim();
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const cleanId = (value, max = 120) => safe(value).replace(/[^A-Za-z0-9._:-]/g, '').slice(0, max);
const cleanReason = value => cleanId(value, 60);
const priorityForReason = (reason, manual = false) => manual ? PRIORITIES.manual : PRIORITIES[cleanReason(reason)] || PRIORITIES.daily;

const normalizeTicket = raw => ({
  ticketId: cleanId(raw?.ticketId, 120),
  deviceId: cleanId(raw?.deviceId, 120),
  deviceLabel: safe(raw?.deviceLabel || 'Устройство').slice(0, 80),
  phase: cleanId(raw?.phase || 'full', 30) || 'full',
  reason: cleanReason(raw?.reason || 'daily') || 'daily',
  priority: Math.max(0, Math.min(100, Math.floor(num(raw?.priority)))),
  manual: raw?.manual === true,
  dirtyDomains: [...new Set((Array.isArray(raw?.dirtyDomains) ? raw.dirtyDomains : []).map(value => cleanId(value, 40)).filter(Boolean))].sort(),
  pendingRanges: Math.floor(num(raw?.pendingRanges)),
  requestedAt: num(raw?.requestedAt),
  lastRequestedAt: num(raw?.lastRequestedAt)
});

const normalizeLease = raw => {
  const leaseId = cleanId(raw?.leaseId, 120);
  const holderDeviceId = cleanId(raw?.holderDeviceId, 120);
  const tokenHash = safe(raw?.tokenHash).slice(0, 64);
  if (!leaseId || !holderDeviceId || !tokenHash) return null;
  return {
    leaseId,
    tokenHash,
    holderDeviceId,
    holderLabel: safe(raw?.holderLabel || 'Устройство').slice(0, 80),
    phase: cleanId(raw?.phase || 'full', 30) || 'full',
    reason: cleanReason(raw?.reason || 'daily') || 'daily',
    priority: Math.max(0, Math.min(100, Math.floor(num(raw?.priority)))),
    acquiredAt: num(raw?.acquiredAt),
    renewedAt: num(raw?.renewedAt),
    expiresAt: num(raw?.expiresAt)
  };
};

const normalizeDeviceState = raw => ({
  lastFullAt: num(raw?.lastFullAt),
  lastPushAt: num(raw?.lastPushAt),
  lastPullAt: num(raw?.lastPullAt),
  lastSuccessAt: num(raw?.lastSuccessAt),
  lastFailureAt: num(raw?.lastFailureAt),
  lastError: safe(raw?.lastError).slice(0, 160),
  completedSyncs: Math.floor(num(raw?.completedSyncs)),
  failedSyncs: Math.floor(num(raw?.failedSyncs))
});

const normalizeBlock = raw => {
  const reason = cleanReason(raw?.reason);
  const until = num(raw?.until);
  return reason && until > 0 ? {
    reason,
    until,
    sourceDeviceId: cleanId(raw?.sourceDeviceId, 120),
    createdAt: num(raw?.createdAt)
  } : null;
};

const sortQueue = queue => [...queue].sort((left, right) =>
  right.priority - left.priority ||
  left.requestedAt - right.requestedAt ||
  left.deviceId.localeCompare(right.deviceId)
);

const normalizeDevices = raw => Object.fromEntries(
  Object.entries(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {})
    .map(([deviceId, value]) => [cleanId(deviceId, 120), normalizeDeviceState(value)])
    .filter(([deviceId]) => deviceId)
    .sort((left, right) => right[1].lastSuccessAt - left[1].lastSuccessAt)
    .slice(0, MAX_DEVICE_HISTORY)
);

const normalizeCoordinatorState = raw => {
  const queue = new Map();
  (Array.isArray(raw?.queue) ? raw.queue : []).map(normalizeTicket).filter(item => item.ticketId && item.deviceId).forEach(item => {
    const old = queue.get(item.deviceId);
    if (!old || item.lastRequestedAt >= old.lastRequestedAt) queue.set(item.deviceId, item);
  });
  return {
    version: VERSION,
    revision: Math.floor(num(raw?.revision)),
    lease: normalizeLease(raw?.lease),
    queue: sortQueue([...queue.values()]).slice(0, DEFAULT_QUEUE_LIMIT),
    devices: normalizeDevices(raw?.devices),
    accountBlock: normalizeBlock(raw?.accountBlock),
    updatedAt: num(raw?.updatedAt)
  };
};

const pruneCoordinatorState = (raw, at, { ticketMs = DEFAULT_TICKET_MS } = {}) => {
  const state = normalizeCoordinatorState(raw);
  const lease = state.lease && state.lease.expiresAt > at ? state.lease : null;
  const accountBlock = state.accountBlock && state.accountBlock.until > at ? state.accountBlock : null;
  const queue = state.queue.filter(ticket => at - ticket.lastRequestedAt <= ticketMs && ticket.deviceId !== lease?.holderDeviceId);
  return { ...state, lease, accountBlock, queue: sortQueue(queue), updatedAt: Math.max(state.updatedAt, at) };
};

const changedState = (before, after) => JSON.stringify(normalizeCoordinatorState(before)) !== JSON.stringify(normalizeCoordinatorState(after));

const publicCoordinatorState = (raw, currentDeviceId = '', at = Date.now()) => {
  const state = pruneCoordinatorState(raw, at);
  const deviceId = cleanId(currentDeviceId, 120);
  const queueIndex = state.queue.findIndex(ticket => ticket.deviceId === deviceId);
  return {
    version: state.version,
    revision: state.revision,
    busy: !!state.lease,
    holder: state.lease ? {
      deviceId: state.lease.holderDeviceId,
      label: state.lease.holderLabel,
      phase: state.lease.phase,
      reason: state.lease.reason,
      acquiredAt: state.lease.acquiredAt,
      renewedAt: state.lease.renewedAt,
      expiresAt: state.lease.expiresAt,
      currentDevice: state.lease.holderDeviceId === deviceId
    } : null,
    queued: queueIndex >= 0,
    queuePosition: queueIndex >= 0 ? queueIndex + 1 : 0,
    queueLength: state.queue.length,
    retryAt: state.lease?.expiresAt || (queueIndex >= 0 ? at + DEFAULT_RETRY_MS : 0),
    accountBlock: state.accountBlock ? { ...state.accountBlock } : null,
    currentDevice: deviceId ? { ...normalizeDeviceState(state.devices[deviceId]) } : null,
    updatedAt: state.updatedAt
  };
};

const claimCoordinatorLease = (raw, input = {}, options = {}) => {
  const at = num(options.at || Date.now());
  const leaseMs = Math.max(60000, num(options.leaseMs || DEFAULT_LEASE_MS));
  const ticketMs = Math.max(leaseMs, num(options.ticketMs || DEFAULT_TICKET_MS));
  const queueLimit = Math.max(1, Math.min(100, Math.floor(num(options.queueLimit || DEFAULT_QUEUE_LIMIT))));
  const before = normalizeCoordinatorState(raw);
  let state = pruneCoordinatorState(before, at, { ticketMs });
  const deviceId = cleanId(input.deviceId, 120);
  if (!deviceId) throw new Error('backup_coordinator_device_required');

  if (state.accountBlock) {
    return {
      changed: changedState(before, state),
      state,
      result: { granted: false, queued: false, blocked: true, block: { ...state.accountBlock }, retryAt: state.accountBlock.until }
    };
  }

  if (state.lease?.holderDeviceId === deviceId) {
    return {
      changed: changedState(before, state),
      state,
      result: { granted: true, existing: true, lease: { ...state.lease }, retryAt: state.lease.expiresAt }
    };
  }

  const existing = state.queue.find(ticket => ticket.deviceId === deviceId);
  const reason = cleanReason(input.reason || existing?.reason || 'daily') || 'daily';
  const manual = input.manual === true;
  const ticket = normalizeTicket({
    ...existing,
    ticketId: existing?.ticketId || cleanId(input.ticketId, 120),
    deviceId,
    deviceLabel: input.deviceLabel || existing?.deviceLabel,
    phase: input.phase || existing?.phase || 'full',
    reason,
    manual,
    priority: priorityForReason(reason, manual),
    dirtyDomains: input.dirtyDomains,
    pendingRanges: input.pendingRanges,
    requestedAt: existing?.requestedAt || at,
    lastRequestedAt: at
  });
  if (!ticket.ticketId) throw new Error('backup_coordinator_ticket_required');

  state.queue = sortQueue([...state.queue.filter(item => item.deviceId !== deviceId), ticket]).slice(0, queueLimit);
  const first = state.queue[0];

  if (!state.lease && first?.deviceId === deviceId) {
    const leaseId = cleanId(input.leaseId, 120);
    const tokenHash = safe(input.tokenHash).slice(0, 64);
    if (!leaseId || !tokenHash) throw new Error('backup_coordinator_lease_material_required');
    state.lease = {
      leaseId,
      tokenHash,
      holderDeviceId: deviceId,
      holderLabel: ticket.deviceLabel,
      phase: ticket.phase,
      reason: ticket.reason,
      priority: ticket.priority,
      acquiredAt: at,
      renewedAt: at,
      expiresAt: at + leaseMs
    };
    state.queue = state.queue.filter(item => item.deviceId !== deviceId);
    state.revision++;
    state.updatedAt = at;
    return { changed: true, state, result: { granted: true, existing: false, lease: { ...state.lease }, retryAt: state.lease.expiresAt } };
  }

  state.revision++;
  state.updatedAt = at;
  const position = state.queue.findIndex(item => item.deviceId === deviceId) + 1;
  return {
    changed: true,
    state,
    result: {
      granted: false,
      queued: true,
      position,
      queueLength: state.queue.length,
      activeLease: state.lease ? { ...state.lease, tokenHash: '' } : null,
      retryAt: at + DEFAULT_RETRY_MS
    }
  };
};

const authorizeCoordinatorLease = (raw, input = {}, options = {}) => {
  const at = num(options.at || Date.now());
  const before = normalizeCoordinatorState(raw);
  const state = pruneCoordinatorState(before, at, options);
  const lease = state.lease;
  const deviceId = cleanId(input.deviceId, 120);
  const leaseId = cleanId(input.leaseId, 120);
  const tokenHash = safe(input.tokenHash).slice(0, 64);
  const authorized = !!lease &&
    lease.holderDeviceId === deviceId &&
    lease.leaseId === leaseId &&
    lease.tokenHash === tokenHash &&
    lease.expiresAt > at;
  return {
    changed: changedState(before, state),
    state,
    result: {
      authorized,
      reason: authorized ? 'authorized' : !lease ? 'backup_lease_missing' : lease.expiresAt <= at ? 'backup_lease_expired' : 'backup_lease_mismatch',
      lease: authorized ? { ...lease, tokenHash: '' } : null
    }
  };
};

const renewCoordinatorLease = (raw, input = {}, options = {}) => {
  const at = num(options.at || Date.now());
  const leaseMs = Math.max(60000, num(options.leaseMs || DEFAULT_LEASE_MS));
  const authorized = authorizeCoordinatorLease(raw, input, { ...options, at });
  if (!authorized.result.authorized) return authorized;
  const state = authorized.state;
  state.lease = { ...state.lease, renewedAt: at, expiresAt: at + leaseMs };
  state.revision++;
  state.updatedAt = at;
  return { changed: true, state, result: { renewed: true, lease: { ...state.lease, tokenHash: '' } } };
};

const completeCoordinatorLease = (raw, input = {}, options = {}) => {
  const at = num(options.at || Date.now());
  const authorized = authorizeCoordinatorLease(raw, input, { ...options, at });
  if (!authorized.result.authorized) return authorized;
  const state = authorized.state;
  const deviceId = state.lease.holderDeviceId;
  const old = normalizeDeviceState(state.devices[deviceId]);
  const phase = cleanId(input.phase || state.lease.phase, 30);
  state.devices = {
    ...state.devices,
    [deviceId]: normalizeDeviceState({
      ...old,
      lastFullAt: phase === 'full' ? at : old.lastFullAt,
      lastPushAt: input.pushCompleted === true ? at : old.lastPushAt,
      lastPullAt: input.pullCompleted === true ? at : old.lastPullAt,
      lastSuccessAt: at,
      lastError: '',
      completedSyncs: old.completedSyncs + 1
    })
  };
  state.lease = null;
  state.queue = state.queue.filter(ticket => ticket.deviceId !== deviceId);
  state.revision++;
  state.updatedAt = at;
  return { changed: true, state, result: { completed: true, nextDeviceId: state.queue[0]?.deviceId || '', coordinator: publicCoordinatorState(state, deviceId, at) } };
};

const releaseCoordinatorLease = (raw, input = {}, options = {}) => {
  const at = num(options.at || Date.now());
  const authorized = authorizeCoordinatorLease(raw, input, { ...options, at });
  if (!authorized.result.authorized) return authorized;
  const state = authorized.state;
  const deviceId = state.lease.holderDeviceId;
  const old = normalizeDeviceState(state.devices[deviceId]);
  const error = safe(input.error || input.reason).slice(0, 160);
  state.devices = {
    ...state.devices,
    [deviceId]: normalizeDeviceState({
      ...old,
      lastFailureAt: at,
      lastError: error,
      failedSyncs: old.failedSyncs + 1
    })
  };
  if (cleanReason(input.blockReason) === 'disk_space_exhausted' && num(input.blockUntil) > at) {
    state.accountBlock = {
      reason: 'disk_space_exhausted',
      until: num(input.blockUntil),
      sourceDeviceId: deviceId,
      createdAt: at
    };
  }
  state.lease = null;
  state.revision++;
  state.updatedAt = at;
  return { changed: true, state, result: { released: true, blocked: !!state.accountBlock, block: state.accountBlock ? { ...state.accountBlock } : null, nextDeviceId: state.queue[0]?.deviceId || '' } };
};

module.exports = {
  VERSION,
  DEFAULT_LEASE_MS,
  DEFAULT_TICKET_MS,
  DEFAULT_RETRY_MS,
  PRIORITIES,
  priorityForReason,
  normalizeCoordinatorState,
  pruneCoordinatorState,
  publicCoordinatorState,
  claimCoordinatorLease,
  authorizeCoordinatorLease,
  renewCoordinatorLease,
  completeCoordinatorLease,
  releaseCoordinatorLease
};
