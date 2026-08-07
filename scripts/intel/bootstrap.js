// Опциональная интеллектуальная надстройка.
// Не владеет playback, статистикой, Backup или пользовательским профилем.
import { INTEL_ROADMAP_VERSION } from './roadmap.js';
import { getIntelFlags, setIntelDisabled } from './flags.js';
import { INTEL_CONTRACTS } from './shared/contracts.js';
import { intelBus } from './shared/bus.js';
import { intelGuards } from './shared/guards.js';

let booted = false;
let bootPromise = null;

const emptyApi = flags => ({
  version: 'intel-layer-v2',
  roadmapVersion: INTEL_ROADMAP_VERSION,
  status: flags.enabled ? 'loading' : 'disabled',
  flags,
  contracts: INTEL_CONTRACTS,
  bus: intelBus,
  guards: intelGuards,
  trackProfiles: null,
  trackSimilarity: null,
  listenerProfile: null,
  recommendationEngine: null,
  ui: { trackProfileModal: null },
  disable() {
    setIntelDisabled(true);
    this.flags = getIntelFlags();
    this.status = 'disabled';
    intelBus.emit('disabled', { reason: 'manual' });
    return true;
  },
  async enable() {
    setIntelDisabled(false);
    return initIntelBootstrap({ force: true });
  }
});

export const resetIntelBootstrap = () => {
  booted = false;
  bootPromise = null;
};

export const initIntelBootstrap = async ({ W = window, C = W.APP_CONFIG || {}, force = false } = {}) => {
  if (booted && W.Intel && !force) return W.Intel;
  if (bootPromise && !force) return bootPromise;
  if (force) resetIntelBootstrap();

  bootPromise = (async () => {
    const flags = getIntelFlags(C);
    const api = emptyApi(flags);
    W.Intel = api;
    W.IntelLayer = api;

    if (!flags.enabled) {
      booted = true;
      intelBus.emit('disabled', { reason: flags.reason });
      return api;
    }

    try {
      const [
        { trackProfiles },
        { trackSimilarity },
        { listenerProfile },
        { recommendationEngine },
        { trackProfileModal }
      ] = await Promise.all([
        import('./track/track-profiles.js'),
        import('./track/track-similarity.js'),
        import('./listener/listener-profile.js'),
        import('./recs/recommendation-engine.js'),
        import('./ui/track-profile-modal.js')
      ]);

      Object.assign(api, {
        trackProfiles,
        trackSimilarity,
        listenerProfile,
        recommendationEngine,
        ui: { trackProfileModal }
      });

      const initialized = await Promise.allSettled([
        trackProfiles.init(api),
        trackSimilarity.init(api),
        listenerProfile.init(api),
        recommendationEngine.init(api),
        trackProfileModal.init(api)
      ]);
      const failures = initialized.filter(item => item.status === 'rejected');

      api.status = failures.length ? 'degraded' : 'ready';
      api.failures = failures.map(item => String(item.reason?.message || item.reason || 'intel_init_failed'));
      booted = true;
      intelBus.emit('ready', {
        version: api.version,
        roadmapVersion: INTEL_ROADMAP_VERSION,
        status: api.status,
        failures: api.failures
      });
      return api;
    } catch (error) {
      api.status = 'disabled';
      api.error = String(error?.message || error || 'intel_boot_failed');
      booted = true;
      intelBus.emit('disabled', { reason: 'boot_failed', error: api.error });
      return api;
    }
  })().finally(() => {
    bootPromise = null;
  });

  return bootPromise;
};

export default { initIntelBootstrap, resetIntelBootstrap };
