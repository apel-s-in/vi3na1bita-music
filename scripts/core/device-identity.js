// Стабильная идентификация установки.
// Существующие ID сохраняются, новые создаются случайно и не зависят от timezone, экрана или User-Agent.
const LS_DEVICE_HASH = 'deviceHash';
const LS_DEVICE_STABLE_ID = 'deviceStableId';
const LEGACY_FINGERPRINT_KEY = 'deviceStableFingerprint';

const randomId = prefix => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

export async function getOrCreateDeviceHash() {
  let value = localStorage.getItem(LS_DEVICE_HASH);
  if (!value) {
    value = randomId('dv');
    localStorage.setItem(LS_DEVICE_HASH, value);
  }
  try {
    localStorage.removeItem(LEGACY_FINGERPRINT_KEY);
  } catch {}
  return value;
}

export async function getOrCreateDeviceStableId() {
  let value = localStorage.getItem(LS_DEVICE_STABLE_ID);
  if (!value) {
    value = randomId('dst');
    localStorage.setItem(LS_DEVICE_STABLE_ID, value);
  }
  return value;
}

export const getCurrentDeviceHash = () => localStorage.getItem(LS_DEVICE_HASH) || null;
export const getCurrentDeviceStableId = () => localStorage.getItem(LS_DEVICE_STABLE_ID) || null;

export default {
  getOrCreateDeviceHash,
  getOrCreateDeviceStableId,
  getCurrentDeviceHash,
  getCurrentDeviceStableId
};
