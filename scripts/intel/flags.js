// UID.005_(Soft-disable intel layer)_(не парализовать приложение)_(читать флаги из APP_CONFIG и localStorage) UID.006_(Lazy full semantic loading)_(не перегружать startup)_(давать слой только как мягкую надстройку) UID.088_(Profiles data layout)_(держать стабильные пути до semantic data)_(использовать config keys profile index/profile dir) UID.091_(No-op stubs before full implementation)_(безопасно подключить слой уже сейчас)_(по умолчанию включать soft boot и graceful fallback)
export function getIntelFlags(cfg = window.APP_CONFIG || {}) {
  const disableKey = String(cfg.INTEL_LAYER_STORAGE_DISABLE_KEY || 'intel:disable'), devKey = String(cfg.INTEL_LAYER_STORAGE_DEV_KEY || 'intel:dev');
  const disConf = cfg.INTEL_LAYER_ENABLED === false, disStore = localStorage.getItem(disableKey) === '1', en = !disConf && !disStore;
  return { enabled: en, bootMode: String(cfg.INTEL_LAYER_BOOT_MODE || 'soft'), disableKey, devKey, profileIndexUrl: String(cfg.INTEL_LAYER_PROFILE_INDEX_URL || './data/track-profiles-index.json'), profileDir: String(cfg.INTEL_LAYER_PROFILE_DIR || './data/track-profiles/'), reason: en ? 'enabled' : (disConf ? 'config' : 'storage') };
}
export function setIntelDisabled(disabled, cfg = window.APP_CONFIG || {}) { localStorage.setItem(String(cfg.INTEL_LAYER_STORAGE_DISABLE_KEY || 'intel:disable'), disabled ? '1' : '0'); return disabled; }
export default { getIntelFlags, setIntelDisabled };
