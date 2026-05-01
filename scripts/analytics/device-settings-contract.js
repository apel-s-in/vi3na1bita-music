import { DEVICE_STORAGE_KEYS, DEVICE_STORAGE_KEY_SET, PLAYBACK_SENSITIVE_DEVICE_KEYS } from './snapshot-contract.js';

export const DEVICE_SETTINGS_DIR = 'app:/Backup/device-settings';
export const DEVICE_SETTINGS_INDEX_PATH = `${DEVICE_SETTINGS_DIR}/index.json`;

export const safeDeviceString = v => String(v == null ? '' : v).trim();
export const safeDeviceNum = v => Number.isFinite(Number(v)) ? Number(v) : 0;

export const buildDeviceSettingsPath = stableId => {
  const id = safeDeviceString(stableId).replace(/[^A-Za-z0-9._-]/g, '');
  return id ? `${DEVICE_SETTINGS_DIR}/${id}.json` : '';
};

export const normalizeDeviceSettingsSnapshot = (raw = {}) => ({
  version: safeDeviceString(raw?.version || '1.0') || '1.0',
  timestamp: safeDeviceNum(raw?.timestamp || 0),
  ownerYandexId: safeDeviceString(raw?.ownerYandexId || ''),
  deviceStableId: safeDeviceString(raw?.deviceStableId || ''),
  deviceHash: safeDeviceString(raw?.deviceHash || ''),
  sourceDeviceLabel: safeDeviceString(raw?.sourceDeviceLabel || ''),
  sourceDeviceClass: safeDeviceString(raw?.sourceDeviceClass || ''),
  sourcePlatform: safeDeviceString(raw?.sourcePlatform || ''),
  path: safeDeviceString(raw?.path || ''),
  localStorage: Object.fromEntries(
    Object.entries(raw?.localStorage || {}).filter(([k]) => DEVICE_STORAGE_KEY_SET.has(String(k || '')))
  )
});

export const buildDeviceSettingsIndexItem = doc => {
  const d = normalizeDeviceSettingsSnapshot(doc || {});
  return {
    deviceStableId: d.deviceStableId,
    deviceHash: d.deviceHash,
    sourceDeviceLabel: d.sourceDeviceLabel,
    sourceDeviceClass: d.sourceDeviceClass,
    sourcePlatform: d.sourcePlatform,
    timestamp: d.timestamp,
    path: d.path || buildDeviceSettingsPath(d.deviceStableId),
    keysCount: Object.keys(d.localStorage || {}).length
  };
};

export const normalizeDeviceSettingsIndex = rows => ({
  version: '1.0',
  updatedAt: Date.now(),
  items: [...new Map((Array.isArray(rows?.items) ? rows.items : rows || []).map(buildDeviceSettingsIndexItem).filter(x => x.deviceStableId).map(x => [x.deviceStableId, x])).values()]
    .sort((a, b) => safeDeviceNum(b.timestamp) - safeDeviceNum(a.timestamp))
});

export const collectDeviceSettingsLocalStorage = (storage = localStorage) => DEVICE_STORAGE_KEYS.reduce((acc, key) => {
  try {
    const v = storage.getItem(key);
    if (v != null) acc[key] = v;
  } catch {}
  return acc;
}, {});

export const shouldApplyDeviceSettingKey = key => DEVICE_STORAGE_KEY_SET.has(String(key || ''));
export const isPlaybackSensitiveDeviceSettingKey = key => PLAYBACK_SENSITIVE_DEVICE_KEYS.has(String(key || ''));

export default {
  DEVICE_SETTINGS_DIR,
  DEVICE_SETTINGS_INDEX_PATH,
  safeDeviceString,
  safeDeviceNum,
  buildDeviceSettingsPath,
  normalizeDeviceSettingsSnapshot,
  buildDeviceSettingsIndexItem,
  normalizeDeviceSettingsIndex,
  collectDeviceSettingsLocalStorage,
  shouldApplyDeviceSettingKey,
  isPlaybackSensitiveDeviceSettingKey
};
