const sS = v => String(v == null ? '' : v).trim();
const sN = v => Number.isFinite(Number(v)) ? Number(v) : 0;

export const normalizeDevicePlatform = ua => {
  const raw = sS(ua || navigator.userAgent);
  if (/iPhone/i.test(raw)) return 'ios';
  if (/iPad/i.test(raw)) return 'ios';
  if (/Android/i.test(raw)) return 'android';
  return 'web';
};

export const normalizeDeviceClass = ({ platform = 'web', rawClass = '' } = {}) => {
  const rc = sS(rawClass).toLowerCase();
  if (['iphone', 'ipad', 'android', 'desktop', 'tablet'].includes(rc)) return rc.charAt(0).toUpperCase() + rc.slice(1);
  if (platform === 'ios') return 'iPhone';
  if (platform === 'android') return 'Android';
  return 'Desktop';
};

export const detectBrowserName = ua => {
  const raw = sS(ua || navigator.userAgent);
  if (/YaBrowser\/([\d.]+)/.test(raw)) return 'Яндекс Браузер';
  if (/OPR\//.test(raw) || /Opera\//.test(raw)) return 'Opera';
  if (/Edg\//.test(raw)) return 'Edge';
  if (/Chrome\//.test(raw) && !/Edg\//.test(raw)) return 'Chrome';
  if (/Safari\//.test(raw) && !/Chrome\//.test(raw)) return 'Safari';
  if (/Firefox\//.test(raw)) return 'Firefox';
  return 'Browser';
};

export const detectOsName = ua => {
  const raw = sS(ua || navigator.userAgent);
  if (/iPhone/i.test(raw)) return { os: 'iPhone', osIcon: '📱' };
  if (/iPad/i.test(raw)) return { os: 'iPad', osIcon: '📱' };
  if (/Android/i.test(raw)) return { os: 'Android', osIcon: '📱' };
  if (/Mac OS X|Macintosh/i.test(raw)) return { os: 'macOS', osIcon: '🖥' };
  if (/Windows/i.test(raw)) return { os: 'Windows', osIcon: '🖥' };
  if (/Linux/i.test(raw)) return { os: 'Linux', osIcon: '🖥' };
  return { os: 'Unknown OS', osIcon: '💻' };
};

export const getDefaultDeviceLabel = ({ platform = 'web', deviceNumber = 1, savedLabel = '' } = {}) => {
  const val = sS(savedLabel);
  if (val) return val;
  return `Моё устройство №${Math.max(1, sN(deviceNumber) || 1)}`;
};

export const detectCurrentDeviceProfile = ({ registry = [], savedLabel = '' } = {}) => {
  const ua = navigator.userAgent;
  const platform = normalizeDevicePlatform(ua);
  const { os, osIcon } = detectOsName(ua);
  const browser = detectBrowserName(ua);
  const deviceNumber = (Array.isArray(registry) ? registry.length : 0) + 1;
  return {
    os,
    osIcon,
    browser,
    platform,
    class: normalizeDeviceClass({ platform }),
    screen: `${window.screen.width || 0}×${window.screen.height || 0}`,
    lang: navigator.language || '',
    userAgent: ua,
    label: getDefaultDeviceLabel({ platform, deviceNumber, savedLabel }),
    deviceNumber,
    lastActive: new Date().toLocaleDateString('ru-RU')
  };
};

export const getSystemInstallDateLabel = () => {
  const ts = sN(localStorage.getItem('app:first-install-ts') || 0);
  return ts > 0 ? new Date(ts).toLocaleDateString('ru-RU') : '—';
};

export default {
  normalizeDevicePlatform,
  normalizeDeviceClass,
  detectBrowserName,
  detectOsName,
  getDefaultDeviceLabel,
  detectCurrentDeviceProfile,
  getSystemInstallDateLabel
};
