// UID.005_(Soft-disable intel layer)_(не парализовать приложение при проблемах)_(делать один мягкий bootstrap с graceful fallback)
// UID.019_(Compact TrackProfile index)_(дать единый entrypoint semantic слоя)_(инициализировать track profile loader и связанные сервисы)
// UID.044_(ListenerProfile core)_(дать единый entrypoint user-intelligence слоя)_(инициализировать listener/collection/recs сервисы)
// UID.069_(Internal user identity)_(дать единый entrypoint provider/sync слоя)_(инициализировать identity/consents/hybrid-sync сервисы)
// UID.081_(Telemetry mapper)_(подготовить безопасную внешнюю аналитику)_(подключить mapper как отдельный no-op сервис)
// UID.092_(Incremental rollout order)_(сохранить staged внедрение)_(здесь концентрируется только wiring, а не heavy business logic)
// UID.093_(Roadmap markers in touched files)_(не терять вектор реализации)_(bootstrap собирает и публикует весь новый контур в window.Intel)

import { INTEL_ROADMAP_VERSION } from './roadmap.js';
import { getIntelFlags, setIntelDisabled } from './flags.js';
import { INTEL_CONTRACTS } from './shared/contracts.js';
import { intelBus } from './shared/bus.js';
import { intelGuards } from './shared/guards.js';
import { trackProfiles } from './track/track-profiles.js';
import { trackPresentation } from './track/track-presentation.js';
import { trackRelations } from './track/track-relations.js';
import { listenerProfile } from './listener/listener-profile.js';
import { listenerCollection } from './listener/listener-collection.js';
import { recommendationEngine } from './recs/recommendation-engine.js';
import { recommendationStrategies } from './recs/recommendation-strategies.js';
import { providerConsents } from './providers/provider-consents.js';
import { providerIdentity } from './providers/provider-identity.js';
import { hybridSync } from './providers/hybrid-sync.js';
import { providerActions } from './providers/provider-actions.js';
import { telemetryMapper } from './telemetry/telemetry-mapper.js';
import { cohorts } from './community/cohorts.js';
import { similarListeners } from './community/similar-listeners.js';
import { communityStats } from './community/community-stats.js';
import { trackProfileModal } from './ui/track-profile-modal.js';
import { profileInsights } from './ui/profile-insights.js';
import { showcaseSemantic } from './ui/showcase-semantic.js';

let booted = false;

export async function initIntelBootstrap({ W = window, D = document, C = W.APP_CONFIG || {} } = {}) {
  if (booted && W.Intel) return W.Intel;

  const flags = getIntelFlags(C);
  const api = {
    version: 'intel-layer-v1',
    roadmapVersion: INTEL_ROADMAP_VERSION,
    flags,
    contracts: INTEL_CONTRACTS,
    bus: intelBus,
    guards: intelGuards,
    trackProfiles,
    trackPresentation,
    trackRelations,
    listenerProfile,
    listenerCollection,
    recommendationEngine,
    recommendationStrategies,
    providerConsents,
    providerIdentity,
    hybridSync,
    providerActions,
    telemetryMapper,
    cohorts,
    similarListeners,
    communityStats,
    ui: {
      trackProfileModal,
      profileInsights,
      showcaseSemantic
    },
    disable() {
      setIntelDisabled(true, C);
      intelBus.emit('disabled', { reason: 'manual' });
      return true;
    },
    enable() {
      setIntelDisabled(false, C);
      intelBus.emit('ready', { reason: 'manual-enable-request' });
      return true;
    }
  };

  W.Intel = api;
  W.IntelLayer = api;

  if (!flags.enabled) {
    booted = true;
    intelBus.emit('disabled', { reason: flags.reason });
    return api;
  }

  await Promise.allSettled([
    trackProfiles.init(api),
    trackPresentation.init(api),
    trackRelations.init(api),
    listenerProfile.init(api),
    listenerCollection.init(api),
    recommendationEngine.init(api),
    providerConsents.init(api),
    providerIdentity.init(api),
    hybridSync.init(api),
    providerActions.init(api),
    telemetryMapper.init(api),
    cohorts.init(api),
    similarListeners.init(api),
    communityStats.init(api),
    trackProfileModal.init(api),
    profileInsights.init(api),
    showcaseSemantic.init(api)
  ]);

  booted = true;
  intelBus.emit('ready', { version: api.version, roadmapVersion: INTEL_ROADMAP_VERSION });
  return api;
}

export default { initIntelBootstrap };
