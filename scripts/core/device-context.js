// Канонический runtime-контекст текущей установки.
// Не является security authority, не входит в backup и не управляет playback.
const safe = value => String(value == null ? '' : value).trim();

const detectPlatform = () => {
  const info = window.Utils?.getPlatform?.() || {};
  const ua = safe(navigator.userAgent);
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const isIOS = info.isIOS === true || /iPhone|iPad|iPod/i.test(ua) || iPadOs;
  const isAndroid = info.isAndroid === true || /Android/i.test(ua);
  return isIOS ? 'ios' : isAndroid ? 'android' : 'web';
};

const detectPwa = () => {
  const info = window.Utils?.getPlatform?.() || {};
  return info.isPWA === true || window.matchMedia?.('(display-mode: standalone)')?.matches === true || navigator.standalone === true;
};

const defaultDeviceClass = platform => platform === 'ios' ? 'iPhone' : platform === 'android' ? 'Android' : 'Desktop';
const defaultDeviceLabel = platform => platform === 'ios' ? 'Мой iPhone' : platform === 'android' ? 'Моё Android устройство' : 'Мой Desktop';

export const getDeviceId = () => safe(localStorage.getItem('deviceStableId') || localStorage.getItem('deviceHash') || 'web') || 'web';
export const getDevicePlatform = () => detectPlatform();
export const isDevicePwa = () => detectPwa();
export const getDeviceTimezone = () => safe(Intl.DateTimeFormat().resolvedOptions().timeZone);
export const getDeviceTimezoneOffsetMin = (timestamp = Date.now()) => new Date(Number(timestamp) || Date.now()).getTimezoneOffset();

export const getDeviceContext = (timestamp = Date.now()) => {
  const platform = detectPlatform();
  return {
    deviceId: getDeviceId(),
    deviceLabel: safe(localStorage.getItem('yandex:onboarding:device_label')) || defaultDeviceLabel(platform),
    deviceClass: defaultDeviceClass(platform),
    platform,
    pwa: detectPwa(),
    timezone: getDeviceTimezone(),
    timezoneOffsetMin: getDeviceTimezoneOffsetMin(timestamp)
  };
};

export const getDeviceContextForServer = (timestamp = Date.now()) => ({ ...getDeviceContext(timestamp) });

export default {
  getDeviceId,
  getDevicePlatform,
  isDevicePwa,
  getDeviceTimezone,
  getDeviceTimezoneOffsetMin,
  getDeviceContext,
  getDeviceContextForServer
};
