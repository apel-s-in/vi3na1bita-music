// Общая signed social session для Friends и Game Center.
import { getDeviceContextForServer } from './device-context.js';
import { isAppQuiet } from './app-activity.js';
import { meteredJsonFetch, recordSuppressedCloudAttempt } from './cloud-usage-meter.js';

const SIGNALING_URL = 'https://functions.yandexcloud.net/d4e2epg33mkshjoar6av';
let cachedSession = null;
let cachedYandexId = '';
let pendingSession = null;
let pendingYandexId = '';
let serverBackoffUntil = 0;
let serverBackoffMs = 5000;
let playbackCoordination = { known: false, required: false, reason: 'not_checked', activePeerCount: 0, remoteOwnerActive: false, checkedAt: 0, activeWindowMs: 0 };
const coalescedActions = new Set(['achievement_reward_status', 'favorite_state_get', 'wallet_get', 'timezone_policy_get', 'account_device_list', 'playback_state_get']);
const quietBackgroundActions = new Set(['achievement_reward_status', 'favorite_state_get', 'wallet_get', 'timezone_policy_get', 'account_device_list', 'playback_state_get', 'presence_heartbeat', 'friends_snapshot', 'presence_batch', 'push_poll', 'friend_list', 'friend_status_check', 'leaderboard_v2_get', 'ranked_stats_get']);
const actionRequests = new Map();
let playbackClaimQueue = Promise.resolve();
const safe = value => String(value == null ? '' : value).trim();
const readTimezonePolicyRevision = yandexId => {
  try {
    const policy = JSON.parse(localStorage.getItem(`account:timezone-policy:v1:${safe(yandexId)}`) || 'null');
    return Math.max(0, Math.floor(Number(policy?.revision || 0)));
  } catch {
    return 0;
  }
};
const isRealtimeAction = action => /^(room_|signal_|lan_code_|ranked_)/.test(action) || action === 'push_send';
const normalizePlaybackCoordination = raw => ({
  known: raw?.known === true,
  required: raw?.required === true,
  reason: safe(raw?.reason || 'not_checked'),
  activePeerCount: Math.max(0, Math.floor(Number(raw?.activePeerCount || 0))),
  remoteOwnerActive: raw?.remoteOwnerActive === true,
  checkedAt: Math.max(0, Number(raw?.checkedAt || 0)),
  activeWindowMs: Math.max(0, Number(raw?.activeWindowMs || 0))
});
export const getSocialServerBackoffState = () => ({ active: Date.now() < serverBackoffUntil, retryAt: serverBackoffUntil, remainingMs: Math.max(0, serverBackoffUntil - Date.now()) });
export const getPlaybackCoordinationState = () => ({ ...playbackCoordination });
export const isPlaybackCoordinationRequired = () => playbackCoordination.required === true;
export const markPlaybackCoordinationRequired = (reason = 'runtime_peer_signal') => {
  playbackCoordination = { ...playbackCoordination, known: true, required: true, reason: safe(reason), checkedAt: Date.now() };
  window.dispatchEvent(new CustomEvent('playback:coordination-changed', { detail: { ...playbackCoordination } }));
  return getPlaybackCoordinationState();
};
const readProfile = () => {
  const auth = window.YandexAuth;
  const active = auth?.getSessionStatus?.() === 'active' && auth?.isTokenAlive?.();
  const profile = active ? auth?.getProfile?.() || null : null;
  return { active: !!active, yandexId: safe(profile?.yandexId || profile?.id || ''), displayName: safe(profile?.displayName || profile?.realName || profile?.login || 'Слушатель'), avatar: safe(profile?.avatar || '') };
};
const registerServerBackoff = response => {
  if (response.status !== 429 && ![502, 503, 504].includes(response.status)) {
    return 0;
  }
  const retryAfterSec = Number(response.headers.get('Retry-After') || 0);
  const delayMs = Math.max(serverBackoffMs, retryAfterSec > 0 ? retryAfterSec * 1000 : 0) + Math.floor(Math.random() * 1000);
  serverBackoffUntil = Math.max(serverBackoffUntil, Date.now() + delayMs);
  serverBackoffMs = Math.min(60000, serverBackoffMs * 2);
  return delayMs;
};
export const invalidateSocialSession = ({ resetBackoff = false } = {}) => {
  cachedSession = null;
  cachedYandexId = '';
  pendingSession = null;
  pendingYandexId = '';
  playbackCoordination = { known: false, required: false, reason: 'session_invalidated', activePeerCount: 0, remoteOwnerActive: false, checkedAt: 0, activeWindowMs: 0 };
  if (resetBackoff) {
    serverBackoffUntil = 0;
    serverBackoffMs = 5000;
    actionRequests.clear();
  }
};
export const getSocialSession = async ({ force = false } = {}) => {
  const auth = window.YandexAuth;
  const token = auth?.getToken?.();
  const profile = readProfile();
  const yandexId = profile.yandexId;
  if (!token || !auth?.isTokenAlive?.() || !yandexId) {
    invalidateSocialSession();
    throw new Error('yandex_oauth_required');
  }
  if (cachedYandexId && cachedYandexId !== yandexId) {
    invalidateSocialSession();
  }
  if (!force && cachedSession?.socialSession && cachedYandexId === yandexId && Number(cachedSession.expiresAt || 0) > Date.now() + 120000) {
    return cachedSession;
  }
  if (pendingSession && pendingYandexId === yandexId) {
    return pendingSession;
  }
  pendingYandexId = yandexId;
  pendingSession = (async () => {
    const { response, result } = await meteredJsonFetch(SIGNALING_URL, {
      action: 'social_session_issue',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Yandex-OAuth': token },
        credentials: 'omit',
        mode: 'cors',
        body: JSON.stringify({ action: 'social_session_issue', displayName: profile.displayName, avatarUrl: profile.avatar, ...getDeviceContextForServer(), timezonePolicyRevision: readTimezonePolicyRevision(yandexId) })
      }
    });
    registerServerBackoff(response);
    if (!response.ok || result.ok === false || !result.socialSession) {
      const error = new Error(result.error || result.reason || 'social_session_issue_failed');
      error.status = response.status;
      error.action = 'social_session_issue';
      error.retryAt = serverBackoffUntil;
      throw error;
    }
    const currentYandexId = readProfile().yandexId;
    if (!currentYandexId || currentYandexId !== yandexId) {
      throw new Error('social_session_account_changed');
    }
    playbackCoordination = normalizePlaybackCoordination(result.playbackCoordination);
    window.dispatchEvent(new CustomEvent('playback:coordination-changed', { detail: { ...playbackCoordination } }));
    cachedSession = result;
    cachedYandexId = yandexId;
    window.ListeningReceipts?.ingestServerResult?.(result);
    if (result?.wallet || (Array.isArray(result?.loyaltyRewards) && result.loyaltyRewards.length)) {
      import('../app/shards/reward-notifier.js').then(module => module.applyShardRewardResult?.(result)).catch(() => null);
    }
    return result;
  })();
  try {
    return await pendingSession;
  } finally {
    pendingSession = null;
    pendingYandexId = '';
  }
};
export const requestSocialAction = (action, data = {}, { retryAuth = true } = {}) => {
  const cleanAction = safe(action);
  const coalesced = coalescedActions.has(cleanAction);
  const requestKey = coalesced
    ? cleanAction
    : cleanAction === 'playback_claim'
      ? `${cleanAction}:${safe(data.trackUid)}:${safe(data.deviceId)}`
      : '';
  if (requestKey && actionRequests.has(requestKey)) {
    recordSuppressedCloudAttempt({ action: cleanAction, reason: 'single_flight_join' });
    return actionRequests.get(requestKey);
  }
  const run = async () => {
    if (quietBackgroundActions.has(cleanAction) && isAppQuiet()) {
      recordSuppressedCloudAttempt({ action: cleanAction, reason: 'quiet_mode' });
      const error = new Error('app_quiet_mode');
      error.status = 0;
      error.action = cleanAction;
      error.quiet = true;
      throw error;
    }
    if (Date.now() < serverBackoffUntil && !isRealtimeAction(cleanAction)) {
      recordSuppressedCloudAttempt({ action: cleanAction, reason: 'server_backoff' });
      const error = new Error('social_server_backoff_active');
      error.status = 429;
      error.action = cleanAction;
      error.retryAt = serverBackoffUntil;
      throw error;
    }
    const session = await getSocialSession();
    const request = async currentSession => {
      const { response, result } = await meteredJsonFetch(SIGNALING_URL, {
        action: cleanAction,
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Vi3-Session': currentSession.socialSession },
          credentials: 'omit',
          mode: 'cors',
          body: JSON.stringify({ action: cleanAction, ...data })
        }
      });
      if (response.status === 429 || [502, 503, 504].includes(response.status)) {
        registerServerBackoff(response);
      } else if (response.ok && result.ok !== false && Date.now() >= serverBackoffUntil) {
        serverBackoffUntil = 0;
        serverBackoffMs = 5000;
      }
      if (!response.ok || result.ok === false) {
        const error = new Error(result.error || result.reason || `http_${response.status}`);
        error.status = response.status;
        error.action = cleanAction;
        throw error;
      }
      return result;
    };
    try {
      return await request(session);
    } catch (error) {
      if (retryAuth && Number(error?.status) === 401) {
        const renewed = await getSocialSession({ force: true });
        return request(renewed);
      }
      throw error;
    }
  };
  const execute = cleanAction === 'playback_claim'
    ? playbackClaimQueue.catch(() => null).then(run)
    : run();
  const pending = execute.finally(() => {
    if (requestKey && actionRequests.get(requestKey) === pending) {
      actionRequests.delete(requestKey);
    }
  });
  if (cleanAction === 'playback_claim') {
    playbackClaimQueue = pending.catch(() => null);
  }
  if (requestKey) actionRequests.set(requestKey, pending);
  return pending;
};
window.addEventListener('yandex:auth:changed', event => {
  const status = safe(event.detail?.status);
  const nextYandexId = safe(event.detail?.profile?.yandexId || event.detail?.profile?.id || readProfile().yandexId);
  if (status === 'logged_out' || status === 'expired' || (cachedYandexId && nextYandexId && cachedYandexId !== nextYandexId)) {
    invalidateSocialSession({ resetBackoff: true });
  }
});
window.SocialSessionDiagnostics = {
  getBackoffState: getSocialServerBackoffState,
  getPlaybackCoordinationState
};

export default { getSocialSession, invalidateSocialSession, requestSocialAction };
