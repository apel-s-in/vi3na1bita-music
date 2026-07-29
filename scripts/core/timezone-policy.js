// Account timezone policy.
// Серверная зона аккаунта изменяется только после явного подтверждения.
// Модуль не управляет playback и не входит в backup.
import { getSocialSession, requestSocialAction } from './social-session.js';
import { getDeviceTimezone, getDeviceTimezoneOffsetMin } from './device-context.js';

const CACHE_PREFIX = 'account:timezone-policy:v1:';
const PROMPT_PREFIX = 'account:timezone-prompted:v1:';
const safe = value => String(value == null ? '' : value).trim();
const currentOwner = () => safe(window.YandexAuth?.getProfile?.()?.yandexId || window.YandexAuth?.getProfile?.()?.id);
const cacheKey = owner => `${CACHE_PREFIX}${safe(owner)}`;
const promptKey = owner => `${PROMPT_PREFIX}${safe(owner)}`;

export const getDeviceTimezoneContext = (timestamp = Date.now()) => ({
  timezone: getDeviceTimezone(),
  timezoneOffsetMin: getDeviceTimezoneOffsetMin(timestamp)
});

export const normalizeTimezonePolicy = raw => {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    available: source.available === true,
    version: Math.max(1, Math.floor(Number(source.version || 1))),
    zone: safe(source.zone),
    revision: Math.max(0, Math.floor(Number(source.revision || 0))),
    source: safe(source.source || 'browser_confirmed'),
    boundAt: Math.max(0, Math.floor(Number(source.boundAt || 0))),
    effectiveFrom: Math.max(0, Math.floor(Number(source.effectiveFrom || 0))),
    updatedAt: Math.max(0, Math.floor(Number(source.updatedAt || 0)))
  };
};

export const readCachedTimezonePolicy = (owner = currentOwner()) => {
  try {
    return normalizeTimezonePolicy(JSON.parse(localStorage.getItem(cacheKey(owner)) || 'null'));
  } catch {
    return normalizeTimezonePolicy(null);
  }
};

const cachePolicy = (owner, policy) => {
  const normalized = normalizeTimezonePolicy(policy);
  if (!owner || !normalized.available) return normalized;
  try {
    localStorage.setItem(cacheKey(owner), JSON.stringify(normalized));
  } catch {}
  window.dispatchEvent(new CustomEvent('account:timezone-policy-updated', { detail: { policy: normalized } }));
  return normalized;
};

const confirmChoice = ({ zone, currentPolicy }) => new Promise(resolve => {
  if (!window.Modals?.choice) {
    resolve(false);
    return;
  }
  const esc = window.Utils?.escapeHtml || (value => String(value || ''));
  const previous = currentPolicy?.available && currentPolicy.zone ? `<br><br>Сейчас для аккаунта закреплено: <b>${esc(currentPolicy.zone)}</b>.` : '';
  window.Modals.choice({
    title: currentPolicy?.available ? 'Изменить часовой пояс аккаунта?' : 'Часовой пояс аккаунта',
    textHtml: `Использовать <b>${esc(zone)}</b> для наград, календарных достижений и Преданности?${previous}<br><br>Путешествия не изменят эту настройку автоматически.`,
    actions: [
      { key: 'confirm', text: currentPolicy?.available ? 'Изменить' : 'Использовать', primary: true, onClick: () => resolve(true) },
      { key: 'later', text: 'Позже', onClick: () => resolve(false) }
    ],
    onClose: () => resolve(false)
  });
});

export const setAccountTimezone = async zone => {
  const owner = currentOwner();
  const context = getDeviceTimezoneContext();
  const requestedZone = safe(zone || context.timezone);
  if (!owner || !requestedZone) throw new Error('timezone_policy_auth_required');
  const result = await requestSocialAction('timezone_policy_set', {
    timezone: requestedZone,
    timezoneOffsetMin: context.timezoneOffsetMin
  });
  return cachePolicy(owner, result?.timezonePolicy);
};

export const refreshTimezonePolicy = async ({ promptIfMissing = false, forcePrompt = false } = {}) => {
  const owner = currentOwner();
  if (!owner) return normalizeTimezonePolicy(null);
  const session = await getSocialSession();
  let policy = cachePolicy(owner, session?.timezonePolicy);
  if (policy.available || !promptIfMissing) return policy;
  const context = getDeviceTimezoneContext();
  if (!context.timezone) return policy;
  if (!forcePrompt && sessionStorage.getItem(promptKey(owner)) === '1') return policy;
  sessionStorage.setItem(promptKey(owner), '1');
  if (!(await confirmChoice({ zone: context.timezone, currentPolicy: policy }))) return policy;
  policy = await setAccountTimezone(context.timezone);
  return policy;
};

export const changeAccountTimezone = async () => {
  const owner = currentOwner();
  const context = getDeviceTimezoneContext();
  const policy = readCachedTimezonePolicy(owner);
  if (!owner || !context.timezone) throw new Error('timezone_policy_unavailable');
  if (!(await confirmChoice({ zone: context.timezone, currentPolicy: policy }))) return policy;
  return setAccountTimezone(context.timezone);
};

let initialized = false;
export const initTimezonePolicy = () => {
  if (initialized) return;
  initialized = true;
  window.addEventListener('yandex:auth:changed', event => {
    if (event.detail?.status === 'active') {
      setTimeout(() => refreshTimezonePolicy({ promptIfMissing: true }).catch(() => null), 350);
    }
  });
  window.addEventListener('account:data-switched', () => {
    if (window.YandexAuth?.getSessionStatus?.() === 'active') {
      refreshTimezonePolicy({ promptIfMissing: true }).catch(() => null);
    }
  });
  if (window.YandexAuth?.getSessionStatus?.() === 'active') {
    refreshTimezonePolicy({ promptIfMissing: true }).catch(() => null);
  }
};

export const TimezonePolicy = {
  init: initTimezonePolicy,
  getDeviceContext: getDeviceTimezoneContext,
  getCached: readCachedTimezonePolicy,
  refresh: refreshTimezonePolicy,
  change: changeAccountTimezone,
  set: setAccountTimezone
};

window.TimezonePolicy = TimezonePolicy;
export default TimezonePolicy;
