// Общая signed social session для Friends и Game Center.

const SIGNALING_URL =
  'https://functions.yandexcloud.net/d4e2epg33mkshjoar6av';

let cachedSession = null;
let cachedYandexId = '';
let pendingSession = null;
let pendingYandexId = '';
let serverBackoffUntil = 0;
let serverBackoffMs = 5000;

const coalescedActions = new Set([
  'achievement_reward_status',
  'favorite_state_get',
  'wallet_get'
]);
const actionRequests = new Map();

const safe = value => String(value == null ? '' : value).trim();

const readProfile = () => {
  const auth = window.YandexAuth;
  const active =
    auth?.getSessionStatus?.() === 'active' &&
    auth?.isTokenAlive?.();

  const profile = active
    ? auth?.getProfile?.() || null
    : null;

  return {
    active: !!active,
    yandexId: safe(
      profile?.yandexId ||
      profile?.id ||
      ''
    ),
    displayName: safe(
      profile?.displayName ||
      profile?.realName ||
      profile?.login ||
      'Слушатель'
    ),
    avatar: safe(profile?.avatar || '')
  };
};

const readJson = async response => {
  const text = await response.text();
  try {
    return JSON.parse(text || '{}') || {};
  } catch {
    return {};
  }
};

export const invalidateSocialSession = () => {
  cachedSession = null;
  cachedYandexId = '';
  pendingSession = null;
  pendingYandexId = '';
};

export const getSocialSession = async ({ force = false } = {}) => {
  const auth = window.YandexAuth;
  const token = auth?.getToken?.();
  const profile = readProfile();
  const yandexId = profile.yandexId;

  if (
    !token ||
    !auth?.isTokenAlive?.() ||
    !yandexId
  ) {
    invalidateSocialSession();
    throw new Error('yandex_oauth_required');
  }

  if (
    cachedYandexId &&
    cachedYandexId !== yandexId
  ) {
    invalidateSocialSession();
  }

  if (
    !force &&
    cachedSession?.socialSession &&
    cachedYandexId === yandexId &&
    Number(cachedSession.expiresAt || 0) >
      Date.now() + 120000
  ) {
    return cachedSession;
  }

  if (
    !force &&
    pendingSession &&
    pendingYandexId === yandexId
  ) {
    return pendingSession;
  }

  pendingYandexId = yandexId;

  pendingSession = (async () => {
    const response = await fetch(SIGNALING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Yandex-OAuth': token
      },
      credentials: 'omit',
      mode: 'cors',
      body: JSON.stringify({
        action: 'social_session_issue',
        displayName: profile.displayName,
        avatarUrl: profile.avatar
      })
    });

    const result = await readJson(response);

    if (
      !response.ok ||
      result.ok === false ||
      !result.socialSession
    ) {
      throw new Error(
        result.error ||
        result.reason ||
        'social_session_issue_failed'
      );
    }

    const currentYandexId = readProfile().yandexId;

    if (
      !currentYandexId ||
      currentYandexId !== yandexId
    ) {
      throw new Error(
        'social_session_account_changed'
      );
    }

    cachedSession = result;
    cachedYandexId = yandexId;
    return result;
  })();

  try {
    return await pendingSession;
  } finally {
    pendingSession = null;
    pendingYandexId = '';
  }
};

export const requestSocialAction = (
  action,
  data = {},
  { retryAuth = true } = {}
) => {
  const cleanAction = safe(action);
  const coalesced = coalescedActions.has(cleanAction);
  const requestKey = coalesced ? cleanAction : '';

  if (requestKey && actionRequests.has(requestKey)) {
    return actionRequests.get(requestKey);
  }

  const run = async () => {
    if (Date.now() < serverBackoffUntil) {
      const error = new Error('social_server_backoff_active');
      error.status = 429;
      error.action = cleanAction;
      error.retryAt = serverBackoffUntil;
      throw error;
    }

    const session = await getSocialSession();

    const request = async currentSession => {
      const response = await fetch(SIGNALING_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Vi3-Session': currentSession.socialSession
        },
        credentials: 'omit',
        mode: 'cors',
        body: JSON.stringify({
          action: cleanAction,
          ...data
        })
      });

      const result = await readJson(response);

      if (response.status === 429) {
        serverBackoffUntil = Date.now() + serverBackoffMs;
        serverBackoffMs = Math.min(
          60000,
          serverBackoffMs * 2
        );
      } else if (response.ok && result.ok !== false) {
        serverBackoffUntil = 0;
        serverBackoffMs = 5000;
      }

      if (!response.ok || result.ok === false) {
        const error = new Error(
          result.error ||
          result.reason ||
          `http_${response.status}`
        );
        error.status = response.status;
        error.action = cleanAction;
        throw error;
      }

      return result;
    };

    try {
      return await request(session);
    } catch (error) {
      if (
        retryAuth &&
        Number(error?.status) === 401
      ) {
        const renewed = await getSocialSession({
          force: true
        });

        return request(renewed);
      }

      throw error;
    }
  };

  const pending = run().finally(() => {
    if (
      requestKey &&
      actionRequests.get(requestKey) === pending
    ) {
      actionRequests.delete(requestKey);
    }
  });

  if (requestKey) actionRequests.set(requestKey, pending);
  return pending;
};
window.addEventListener(
  'yandex:auth:changed',
  () => invalidateSocialSession()
);

export default {
  getSocialSession,
  invalidateSocialSession,
  requestSocialAction
};
