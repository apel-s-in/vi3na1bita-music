// Playback ownership protocol.
// Управляет только разрешением старта и узкой pause-only реакцией на подтверждённую потерю ownership.
import { requestSocialAction } from '../core/social-session.js';
import { getDeviceId } from '../core/device-context.js';

const CATALOG_URL = './data/listen-track-catalog.env.json';
const GRANT_PREFIX = 'playback:ownership-grant:v1:';
const safe = value => String(value == null ? '' : value).trim();
const currentOwner = () => safe(window.YandexAuth?.getProfile?.()?.yandexId || window.YandexAuth?.getProfile?.()?.id);
const currentDeviceId = () => getDeviceId();
const grantKey = owner => `${GRANT_PREFIX}${safe(owner)}`;
let catalogPromise = null;

const readCatalog = () => {
  if (catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    const data = await window.Utils?.fetchCache?.getJson?.({ key: 'listen:track-catalog:env:v1', url: CATALOG_URL, ttlMs: 12 * 60 * 60 * 1000, store: 'session', fetchInit: { cache: 'force-cache' } });
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  })().catch(() => ({}));
  return catalogPromise;
};

export const getTrackVersion = async uid => {
  const row = (await readCatalog())[safe(uid)];
  return Array.isArray(row) ? safe(row[2]) : safe(row?.trackVersion);
};

export const readOwnershipGrant = (owner = currentOwner()) => {
  try {
    const grant = JSON.parse(sessionStorage.getItem(grantKey(owner)) || 'null');
    return grant && grant.logicalSessionId && grant.fencingToken ? grant : null;
  } catch {
    return null;
  }
};

const saveGrant = grant => {
  const owner = currentOwner();
  if (!owner || !grant?.logicalSessionId || !grant?.fencingToken) return null;
  const normalized = {
    logicalSessionId: safe(grant.logicalSessionId),
    ownerEpoch: Math.max(0, Math.floor(Number(grant.ownerEpoch || 0))),
    fencingToken: safe(grant.fencingToken),
    trackUid: safe(grant.trackUid),
    trackVersion: safe(grant.trackVersion),
    position: Math.max(0, Number(grant.position || 0)),
    leaseExpiresAt: Math.max(0, Number(grant.leaseExpiresAt || 0)),
    revision: Math.max(0, Math.floor(Number(grant.revision || 0)))
  };
  try {
    sessionStorage.setItem(grantKey(owner), JSON.stringify(normalized));
  } catch {}
  window.dispatchEvent(new CustomEvent('playback:ownership-updated', { detail: { grant: { ...normalized, fencingToken: '' } } }));
  return normalized;
};

export const clearOwnershipGrant = (owner = currentOwner()) => {
  try {
    sessionStorage.removeItem(grantKey(owner));
  } catch {}
};

const confirmTransfer = playback => new Promise(resolve => {
  if (!window.Modals?.choice) {
    resolve(false);
    return;
  }
  const esc = window.Utils?.escapeHtml || (value => String(value || ''));
  const seconds = Math.max(0, Math.floor(Number(playback?.confirmedPosition || 0)));
  const position = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  let settled = false;
  const finish = value => {
    if (settled) return;
    settled = true;
    resolve(!!value);
  };
  window.Modals.choice({
    title: 'Продолжить на этом устройстве?',
    textHtml: `Сейчас музыка играет на <b>${esc(playback?.ownerLabel || 'другом устройстве')}</b>.<br><br>Передать управление сюда${playback?.trackUid ? ` с позиции <b>${position}</b>` : ''}?`,
    actions: [
      { key: 'transfer', text: 'Продолжить здесь', primary: true, onClick: () => finish(true) },
      { key: 'cancel', text: 'Оставить там', onClick: () => finish(false) }
    ],
    onClose: () => finish(false)
  });
});

export const getPlaybackOwnershipState = async () => {
  const result = await requestSocialAction('playback_state_get', { deviceId: currentDeviceId() });
  return result?.playback || null;
};

export const reconcilePlaybackOwnership = async ({ reason = 'foreground' } = {}) => {
  if (window.YandexAuth?.getSessionStatus?.() !== 'active' || !window.YandexAuth?.isTokenAlive?.()) return null;
  if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return null;
  const playback = await getPlaybackOwnershipState();
  const grant = readOwnershipGrant();
  const lost = playback?.active === true && playback.ownerDeviceId && playback.ownerDeviceId !== currentDeviceId();
  if (!lost) return playback;
  clearOwnershipGrant();
  const detail = { reason, playback, previousGrant: grant ? { ...grant, fencingToken: '' } : null };
  window.dispatchEvent(new CustomEvent('playback:ownership-lost', { detail }));
  window.playerCore?.pauseForOwnershipTransfer?.(detail);
  return playback;
};

export const claimPlaybackOwnership = async ({ trackUid, trackVersion = '', position = 0, confirm = true } = {}) => {
  const uid = safe(trackUid);
  if (!uid) throw new Error('playback_track_required');
  const version = safe(trackVersion) || await getTrackVersion(uid);
  const currentGrant = readOwnershipGrant();
  const base = {
    deviceId: currentDeviceId(),
    trackUid: uid,
    trackVersion: version,
    position: Math.max(0, Number(position || 0)),
    logicalSessionId: safe(currentGrant?.logicalSessionId),
    ownerEpoch: Math.max(0, Number(currentGrant?.ownerEpoch || 0)),
    fencingToken: safe(currentGrant?.fencingToken)
  };
  const claimed = await requestSocialAction('playback_claim', base);
  if (claimed?.grant) {
    return { ok: true, transferred: false, playback: claimed.playback, grant: saveGrant(claimed.grant) };
  }
  if (!claimed?.requiresConfirmation) {
    throw new Error('playback_claim_not_granted');
  }
  if (!confirm || !(await confirmTransfer(claimed.playback))) {
    return { ok: false, canceled: true, playback: claimed.playback, grant: null };
  }
  const prepared = await requestSocialAction('playback_transfer_prepare', base);
  if (prepared?.alreadyOwner) {
    return claimPlaybackOwnership({ ...base, confirm: false });
  }
  if (!prepared?.transferId || !prepared?.transferToken) {
    throw new Error('playback_transfer_prepare_failed');
  }
  const committed = await requestSocialAction('playback_transfer_commit', {
    deviceId: currentDeviceId(),
    transferId: prepared.transferId,
    transferToken: prepared.transferToken
  });
  if (!committed?.grant) throw new Error('playback_transfer_commit_failed');
  return { ok: true, transferred: true, fromDeviceId: safe(committed.fromDeviceId), playback: committed.playback, grant: saveGrant(committed.grant) };
};
const isTransportFailure = error => {
  const status = Number(error?.status || 0);
  const message = safe(error?.message);
  return !status || status === 429 || status >= 500 || /network|fetch|timeout|backoff|offline|unavailable/i.test(message);
};

const withTimeout = (promise, timeoutMs) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => {
    const error = new Error('playback_ownership_timeout');
    error.status = 0;
    reject(error);
  }, Math.max(500, Number(timeoutMs) || 3500)))
]);

export const authorizePlaybackStart = async ({ trackUid, position = 0, timeoutMs = 3500, confirm = true } = {}) => {
  const uid = safe(trackUid);
  if (!uid) return { allowed: false, reason: 'playback_track_required' };
  if (window.YandexAuth?.getSessionStatus?.() !== 'active' || !window.YandexAuth?.isTokenAlive?.()) {
    return { allowed: true, localOnly: true, reason: 'not_authorized' };
  }
  if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) {
    return { allowed: true, localOnly: true, reason: 'offline' };
  }
  try {
    const result = await withTimeout(claimPlaybackOwnership({ trackUid: uid, position, confirm }), timeoutMs);
    if (!result?.ok) return { allowed: false, canceled: result?.canceled === true, playback: result?.playback || null };
    return { allowed: true, transferred: result.transferred === true, playback: result.playback || null, grant: result.grant || readOwnershipGrant(), resumePosition: result.transferred ? Math.max(0, Number(result.grant?.position || 0)) : null };
  } catch (error) {
    if (isTransportFailure(error)) {
      window.dispatchEvent(new CustomEvent('playback:ownership-degraded', { detail: { reason: safe(error?.message), trackUid: uid } }));
      return { allowed: true, localOnly: true, degraded: true, reason: safe(error?.message) };
    }
    throw error;
  }
};

export const updateOwnershipLease = playback => {
  const grant = readOwnershipGrant();
  if (!grant || !playback?.isCurrentDeviceOwner || Number(playback.ownerEpoch) !== Number(grant.ownerEpoch)) return grant;
  return saveGrant({
    ...grant,
    leaseExpiresAt: Math.max(Number(grant.leaseExpiresAt || 0), Number(playback.leaseExpiresAt || 0)),
    revision: Math.max(Number(grant.revision || 0), Number(playback.revision || 0)),
    position: Math.max(0, Number(playback.confirmedPosition ?? grant.position ?? 0))
  });
};
let initialized = false;
export const initPlaybackOwnership = () => {
  if (initialized) return;
  initialized = true;
  window.addEventListener('yandex:auth:changed', event => {
    if (event.detail?.status !== 'active') {
      clearOwnershipGrant();
      return;
    }
    setTimeout(() => reconcilePlaybackOwnership({ reason: 'auth' }).catch(() => null), 500);
  });
  window.addEventListener('account:data-switching', () => clearOwnershipGrant());
  window.addEventListener('account:data-switched', () => reconcilePlaybackOwnership({ reason: 'account_switch' }).catch(() => null));
  window.addEventListener('online', () => {
    if (!document.hidden) reconcilePlaybackOwnership({ reason: 'online' }).catch(() => null);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) reconcilePlaybackOwnership({ reason: 'foreground' }).catch(() => null);
  });
  const onServiceWorkerMessage = event => {
    if (event.data?.type !== 'PLAYBACK_OWNERSHIP_TRANSFERRED') return;
    reconcilePlaybackOwnership({ reason: 'webpush' }).catch(() => null);
  };
  navigator.serviceWorker?.addEventListener?.('message', onServiceWorkerMessage);
  window.addEventListener('message', onServiceWorkerMessage);
};

export const playbackOwnershipService = {
  init: initPlaybackOwnership,
  getState: getPlaybackOwnershipState,
  reconcile: reconcilePlaybackOwnership,
  authorize: authorizePlaybackStart,
  claim: claimPlaybackOwnership,
  updateLease: updateOwnershipLease,
  getTrackVersion,
  getGrant: readOwnershipGrant,
  clearGrant: clearOwnershipGrant
};

window.PlaybackOwnership = playbackOwnershipService;
export default playbackOwnershipService;
