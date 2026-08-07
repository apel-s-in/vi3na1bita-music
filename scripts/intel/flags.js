// Pure-настройки опционального INTEL-слоя.
const config = value => value || window.APP_CONFIG || {};

export function getIntelFlags(rawConfig = window.APP_CONFIG || {}) {
  const cfg = config(rawConfig);
  const disableKey = String(cfg.INTEL_LAYER_STORAGE_DISABLE_KEY || 'intel:disable');
  const disabledByConfig = cfg.INTEL_LAYER_ENABLED === false;
  const disabledByStorage = localStorage.getItem(disableKey) === '1';
  const enabled = !disabledByConfig && !disabledByStorage;

  return {
    enabled,
    recommendationsEnabled: enabled && cfg.INTEL_RECOMMENDATIONS_ENABLED !== false,
    bootMode: String(cfg.INTEL_LAYER_BOOT_MODE || 'soft'),
    disableKey,
    profileIndexUrl: String(cfg.INTEL_LAYER_PROFILE_INDEX_URL || './data/track-profiles-index.json'),
    profileDir: String(cfg.INTEL_LAYER_PROFILE_DIR || './data/track-profiles/'),
    reason: enabled ? 'enabled' : disabledByConfig ? 'config' : 'storage'
  };
}

export function setIntelDisabled(disabled, rawConfig = window.APP_CONFIG || {}) {
  const key = String(config(rawConfig).INTEL_LAYER_STORAGE_DISABLE_KEY || 'intel:disable');
  if (disabled) localStorage.setItem(key, '1');
  else localStorage.removeItem(key);
  return disabled === true;
}

export default { getIntelFlags, setIntelDisabled };
