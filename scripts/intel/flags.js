// UID.005_(Soft-disable intel layer)_(не парализовать приложение)_(читать флаги из APP_CONFIG и localStorage)
// UID.006_(Lazy full semantic loading)_(не перегружать startup)_(давать слой только как мягкую надстройку)
// UID.088_(Profiles data layout)_(держать стабильные пути до semantic data)_(использовать config keys profile index/profile dir)
// UID.091_(No-op stubs before full implementation)_(безопасно подключить слой уже сейчас)_(по умолчанию включать soft boot и graceful fallback)

const DEFAULT_DISABLE_KEY = 'intel:disable';
const DEFAULT_DEV_KEY = 'intel:dev';

export function getIntelFlags(config = window.APP_CONFIG || {}) {
  const disableKey = String(config.INTEL_LAYER_STORAGE_DISABLE_KEY || DEFAULT_DISABLE_KEY);
  const devKey = String(config.INTEL_LAYER_STORAGE_DEV_KEY || DEFAULT_DEV_KEY);
  const disabledByConfig = config.INTEL_LAYER_ENABLED === false;
  const disabledByStorage = localStorage.getItem(disableKey) === '1';
  const enabled = !disabledByConfig && !disabledByStorage;

  return {
    enabled,
    bootMode: String(config.INTEL_LAYER_BOOT_MODE || 'soft'),
    disableKey,
    devKey,
    profileIndexUrl: String(config.INTEL_LAYER_PROFILE_INDEX_URL || './data/track-profiles-index.json'),
    profileDir: String(config.INTEL_LAYER_PROFILE_DIR || './data/track-profiles/'),
    reason: enabled ? 'enabled' : (disabledByConfig ? 'config' : 'storage')
  };
}

export function setIntelDisabled(disabled, config = window.APP_CONFIG || {}) {
  const key = String(config.INTEL_LAYER_STORAGE_DISABLE_KEY || DEFAULT_DISABLE_KEY);
  localStorage.setItem(key, disabled ? '1' : '0');
  return disabled;
}

export default { getIntelFlags, setIntelDisabled };
