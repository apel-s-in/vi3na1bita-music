// Общая signed social session для Friends и Game Center.
// OAuth остаётся только в основном приложении и никогда не передаётся iframe.

const SIGNALING_URL =
  'https://functions.yandexcloud.net/d4e2epg33mkshjoar6av';

let cachedSession = null;
let cachedYandexId = '';
let pendingSession = null;
let pendingYandexId = '';

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

export const requestSocialAction = async (
  action,
  data = {},
  { retryAuth = true } = {}
) => {
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
        action: safe(action),
        ...data
      })
    });

    const result = await readJson(response);

    if (!response.ok || result.ok === false) {
      const error = new Error(
        result.error ||
        result.reason ||
        `http_${response.status}`
      );
      error.status = response.status;
      error.action = action;
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
      const renewed = await getSocialSession({ force: true });
      return request(renewed);
    }

    throw error;
  }
};

window.addEventListener(
  'yandex:auth:changed',
  () => invalidateSocialSession()
);

  invalidateSocialSession,
  requestSocialAction
};
