// Account-wide Backup coordinator client.
// Lease token живёт только в памяти текущей операции.
// Модуль не управляет playback, игрой или голосовым звонком.
import { requestSocialAction } from '../core/social-session.js';
import { getDeviceContext } from '../core/device-context.js';

const RENEW_MS = 2 * 60 * 1000;
const FALLBACK_RETRY_MS = 15000;
const safe = value => String(value == null ? '' : value).trim();
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

let activeLease = null;

const publicLease = lease => lease ? {
  leaseId: safe(lease.leaseId),
  deviceId: safe(lease.deviceId),
  leaseExpiresAt: num(lease.leaseExpiresAt),
  reason: safe(lease.reason),
  manual: lease.manual === true
} : null;

const emit = (state, detail = {}) => {
  window.dispatchEvent(new CustomEvent('backup:coordinator', {
    detail: {
      state,
      lease: publicLease(activeLease),
      ...detail
    }
  }));
};

const leasePayload = lease => ({
  deviceId: safe(lease?.deviceId),
  leaseId: safe(lease?.leaseId),
  leaseToken: safe(lease?.leaseToken)
});

const localLockName = () =>
  `vi3-backup-sync:${safe(getDeviceContext().deviceId || 'web')}`;

const runWithLocalLock = async ({ manual = false, task } = {}) => {
  if (!navigator.locks?.request) return task();

  return navigator.locks.request(
    localLockName(),
    {
      mode: 'exclusive',
      ifAvailable: !manual
    },
    lock => {
      if (!lock) {
        return {
          ok: false,
          granted: false,
          localBusy: true,
          retryAt: Date.now() + FALLBACK_RETRY_MS
        };
      }
      return task();
    }
  );
};
export const backupCoordinatorSchedulerPatch = (outcome = {}, fallbackRetryAt = Date.now() + FALLBACK_RETRY_MS) => {
  const coordinator = outcome?.coordinator || outcome || {};
  const block = coordinator?.block || coordinator?.accountBlock || null;
  const retryAt = num(outcome?.retryAt || coordinator?.retryAt || block?.until) || fallbackRetryAt;
  const deferredReason = outcome?.localBusy
    ? 'coordinator_local_busy'
    : outcome?.queued || coordinator?.queued
      ? 'coordinator_queued'
      : outcome?.blocked || coordinator?.blocked || block
        ? 'coordinator_blocked'
        : outcome?.reason || 'coordinator_busy';

  return {
    queue: coordinator && typeof coordinator === 'object' ? coordinator : null,
    nextSyncAt: retryAt,
    continuationAt: retryAt,
    deferredReason,
    ...(block?.reason ? {
      blockReason: safe(block.reason),
      blockUntil: num(block.until)
    } : {})
  };
};

export const getBackupCoordinatorLease = () => publicLease(activeLease);

export const getBackupResourceBusyReason = () => {
  if (window.__friendsVoiceActive === true) return 'voice_call_active';
  if (window.__gameActivity?.active === true) return 'game_active';
  if (window.playerCore?.isPlaying?.() === true) return 'playback_active';
  return '';
};

export const claimBackupCoordinator = async ({
  reason = 'daily',
  manual = false,
  dirtyDomains = [],
  pendingRanges = 0
} = {}) => {
  const device = getDeviceContext();
  const result = await requestSocialAction('backup_sync_claim', {
    deviceId: device.deviceId,
    deviceLabel: device.deviceLabel,
    phase: 'full',
    reason: safe(reason || 'daily'),
    manual: manual === true,
    dirtyDomains: Array.isArray(dirtyDomains) ? dirtyDomains : [],
    pendingRanges: Math.max(0, Math.floor(num(pendingRanges))),
    ...(activeLease?.leaseToken ? { leaseToken: activeLease.leaseToken } : {})
  });

  if (!result?.granted) {
    emit(result?.blocked ? 'blocked' : result?.queued ? 'queued' : 'busy', {
      coordinator: result || null,
      retryAt: num(result?.retryAt) || Date.now() + FALLBACK_RETRY_MS
    });
    return result;
  }

  if (result.existing === true && activeLease?.leaseToken) {
    activeLease = {
      ...activeLease,
      leaseExpiresAt: num(result.leaseExpiresAt || activeLease.leaseExpiresAt)
    };
  } else {
    if (!result.leaseId || !result.leaseToken) {
      throw new Error('backup_coordinator_lease_secret_missing');
    }
    activeLease = {
      leaseId: safe(result.leaseId),
      leaseToken: safe(result.leaseToken),
      leaseExpiresAt: num(result.leaseExpiresAt),
      deviceId: safe(device.deviceId),
      reason: safe(reason),
      manual: manual === true
    };
  }

  emit('granted', {
    coordinator: result,
    retryAt: activeLease.leaseExpiresAt
  });
  return { ...result, lease: activeLease };
};

export const renewBackupCoordinator = async (lease = activeLease) => {
  if (!lease?.leaseId || !lease?.leaseToken) {
    throw new Error('backup_coordinator_lease_missing');
  }

  const result = await requestSocialAction(
    'backup_sync_renew',
    leasePayload(lease)
  );

  if (!result?.renewed) {
    throw new Error('backup_coordinator_renew_failed');
  }

  if (activeLease?.leaseId === lease.leaseId) {
    activeLease = {
      ...activeLease,
      leaseExpiresAt: num(result.leaseExpiresAt)
    };
  }

  emit('renewed', {
    retryAt: num(result.leaseExpiresAt)
  });
  return result;
};

export const completeBackupCoordinator = async ({
  lease = activeLease,
  pushCompleted = true,
  pullCompleted = true
} = {}) => {
  if (!lease?.leaseId || !lease?.leaseToken) return false;

  const result = await requestSocialAction('backup_sync_complete', {
    ...leasePayload(lease),
    phase: 'full',
    pushCompleted: pushCompleted === true,
    pullCompleted: pullCompleted === true
  });

  if (activeLease?.leaseId === lease.leaseId) activeLease = null;
  emit('completed', {
    coordinator: result?.coordinator || null,
    nextDeviceId: safe(result?.nextDeviceId)
  });
  return result;
};

export const releaseBackupCoordinator = async ({
  lease = activeLease,
  reason = 'sync_failed',
  error = '',
  blockReason = ''
} = {}) => {
  if (!lease?.leaseId || !lease?.leaseToken) return false;

  try {
    return await requestSocialAction('backup_sync_release', {
      ...leasePayload(lease),
      reason: safe(reason).slice(0, 80),
      error: safe(error).slice(0, 160),
      blockReason: blockReason === 'disk_space_exhausted'
        ? blockReason
        : ''
    });
  } finally {
    if (activeLease?.leaseId === lease.leaseId) activeLease = null;
    emit('released', {
      reason: safe(reason),
      blockReason: safe(blockReason)
    });
  }
};

export const getBackupCoordinatorStatus = () =>
  requestSocialAction('backup_sync_status', {
    deviceId: getDeviceContext().deviceId
  });

export const withBackupCoordinatorLease = ({
  reason = 'daily',
  manual = false,
  dirtyDomains = [],
  pendingRanges = 0,
  task
} = {}) => runWithLocalLock({
  manual,
  task: async () => {
    if (typeof task !== 'function') {
      throw new Error('backup_coordinator_task_required');
    }

    const busyReason = getBackupResourceBusyReason();
    if (busyReason && !manual) {
      emit('deferred', { reason: busyReason });
      return {
        ok: false,
        granted: false,
        deferred: true,
        reason: busyReason,
        retryAt: Date.now() + FALLBACK_RETRY_MS
      };
    }

    const claim = await claimBackupCoordinator({
      reason,
      manual,
      dirtyDomains,
      pendingRanges
    });

    if (!claim?.granted || !activeLease) {
      return {
        ok: false,
        granted: false,
        queued: claim?.queued === true,
        blocked: claim?.blocked === true,
        busy: claim?.busy === true,
        coordinator: claim || null,
        retryAt: num(claim?.retryAt) || Date.now() + FALLBACK_RETRY_MS
      };
    }

    const lease = activeLease;
    let renewPromise = null;
    const renew = () => {
      if (renewPromise) return renewPromise;
      renewPromise = renewBackupCoordinator(lease).finally(() => {
        renewPromise = null;
      });
      return renewPromise;
    };
    const timer = setInterval(() => {
      renew().catch(() => null);
    }, RENEW_MS);

    try {
      const result = await task({
        ...lease,
        renew
      });
      await completeBackupCoordinator({
        lease,
        pushCompleted: result?.push !== false,
        pullCompleted: result?.pull !== false
      });
      return {
        ok: true,
        granted: true,
        result
      };
    } catch (error) {
      const message = safe(error?.message);
      const status = Number(error?.status || 0);
      const diskFull =
        status === 507 ||
        /disk_space_exhausted|not.?enough.?space|insufficient.?storage/i.test(message);

      await releaseBackupCoordinator({
        lease,
        reason: diskFull ? 'disk_space_exhausted' : 'sync_failed',
        error: message,
        blockReason: diskFull ? 'disk_space_exhausted' : ''
      }).catch(() => null);
      throw error;
    } finally {
      clearInterval(timer);
    }
  }
});

window.BackupCoordinator = {
  getLease: getBackupCoordinatorLease,
  getStatus: getBackupCoordinatorStatus,
  getBusyReason: getBackupResourceBusyReason
};

export default {
  getBackupCoordinatorLease,
  backupCoordinatorSchedulerPatch,
  getBackupResourceBusyReason,
  claimBackupCoordinator,
  renewBackupCoordinator,
  completeBackupCoordinator,
  releaseBackupCoordinator,
  getBackupCoordinatorStatus,
  withBackupCoordinatorLease
};
