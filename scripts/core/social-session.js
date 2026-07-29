// Общая signed social session для Friends и Game Center.
import { getDeviceContextForServer } from './device-context.js';

const SIGNALING_URL = 'https://functions.yandexcloud.net/d4e2epg33mkshjoar6av';
let cachedSession = null;
let cachedYandexId = '';
let pendingSession = null;
let pendingYandexId = '';
let serverBackoffUntil = 0;
let serverBackoffMs = 5000;
const coalescedActions = new Set(['achievement_reward_status', 'favorite_state_get', 'wallet_get', 'timezone_policy_get', 'account_device_list', 'playback_state_get']);
const actionRequests = new Map();
const safe = value => String(value == null ? '' : value).trim();
const isRealtimeAction = action => /^(room_|signal_|lan_code_|ranked_|playback_)/.test(action) || action === 'push_send';
export const getSocialServerBackoffState = () => ({ active: Date.now() < serverBackoffUntil, retryAt: serverBackoffUntil, remainingMs: Math.max(0, serverBackoffUntil - Date.now()) });
const readProfile = () => {
  const auth = window.YandexAuth;
  const active = auth?.getSessionStatus?.() === 'active' && auth?.isTokenAlive?.();
  const profile = active ? auth?.getProfile?.() || null : null;
  return { active: !!active, yandexId: safe(profile?.yandexId || profile?.id || ''), displayName: safe(profile?.displayName || profile?.realName || profile?.login || 'Слушатель'), avatar: safe(profile?.avatar || '') };
};
const readJson = async response => {
  const text = await response.text();
  try {
    return JSON.parse(text || '{}') || {};
  } catch {
    return {};
  }
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
    const response = await fetch(SIGNALING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Yandex-OAuth': token },
      credentials: 'omit',
      mode: 'cors',
      body: JSON.stringify({ action: 'social_session_issue', displayName: profile.displayName, avatarUrl: profile.avatar, ...getDeviceContextForServer() })
    });
    const result = await readJson(response);
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
  const requestKey = coalesced ? cleanAction : '';
  if (requestKey && actionRequests.has(requestKey)) {
    return actionRequests.get(requestKey);
  }
  const run = async () => {
    if (Date.now() < serverBackoffUntil && !isRealtimeAction(cleanAction)) {
      const error = new Error('social_server_backoff_active');
      error.status = 429;
      error.action = cleanAction;
      error.retryAt = serverBackoffUntil;
      throw error;
    }
    const session = await getSocialSession();
    const request = async currentSession => {
      const response = await fetch(SIGNALING_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Vi3-Session': currentSession.socialSession }, credentials: 'omit', mode: 'cors', body: JSON.stringify({ action: cleanAction, ...data }) });
      const result = await readJson(response);
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
  const pending = run().finally(() => {
    if (requestKey && actionRequests.get(requestKey) === pending) {
      actionRequests.delete(requestKey);
    }
  });
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
export default { getSocialSession, invalidateSocialSession, requestSocialAction };
