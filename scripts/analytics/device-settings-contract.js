import { DEVICE_STORAGE_KEYS, DEVICE_STORAGE_KEY_SET, PLAYBACK_SENSITIVE_DEVICE_KEYS } from './snapshot-contract.js';

export const collectDeviceSettingsLocalStorage = (storage = localStorage) => DEVICE_STORAGE_KEYS.reduce((output, key) => {
  try {
    const value = storage.getItem(key);
    if (value != null) output[key] = value;
  } catch {}
  return output;
}, {});

export const shouldApplyDeviceSettingKey = key => DEVICE_STORAGE_KEY_SET.has(String(key || ''));
export const isPlaybackSensitiveDeviceSettingKey = key => PLAYBACK_SENSITIVE_DEVICE_KEYS.has(String(key || ''));

export default { collectDeviceSettingsLocalStorage, shouldApplyDeviceSettingKey, isPlaybackSensitiveDeviceSettingKey };
