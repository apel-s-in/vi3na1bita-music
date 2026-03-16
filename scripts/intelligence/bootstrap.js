/* INTELLIGENCE BOOTSTRAP — optional, no-op safe global contour for future intelligent layer. */
// UID.008_optional_intelligence_layer_(поднять независимый слой)_(для безопасного развития попутно с плеером)_(bootstrap attaches namespace only)
// UID.153_service_worker_intelligence_assets_(держать bootstrap как отдельный asset)_(для оффлайн-живучести)_(SW precache optional)
// UID.156_namespace_manifest_layer_(создать window.IntelligenceLayer)_(для ясного контура)_(single namespace with modules/flags/manifest/bridges)
// UID.169_comment_driven_scaffolding_(держать комментарии как вектор)_(для не потерять идеи)_(every module header contains UID anchors)

import INTELLIGENCE_FLAGS from './flags.js';
import INTELLIGENCE_MANIFEST from './manifest.js';
import { INTELLIGENCE_UID_ROADMAP_VERSION } from './uid-roadmap.js';
import { createIntelligenceBridges } from './bridges.js';
import taxonomyService from './taxonomy-service.js';
import trackProfileLoader from './track-profile-loader.js';
import trackPresentation from './track-presentation.js';
import trackRelations from './track-relations.js';
import listenerProfile from './listener-profile.js';
import sessionContext from './session-context.js';
import recommendationStrategies from './recommendation-strategies.js';
import recommendationReasons from './recommendation-reasons.js';
import recommendationMemory from './recommendation-memory.js';
import recommendationEngine from './recommendation-engine.js';
import collectionEngine from './collection-engine.js';
import providerCapabilities from './provider-capabilities.js';
import providerIdentity from './provider-identity.js';
import providerActions from './provider-actions.js';
import hybridSync from './hybrid-sync.js';
import telemetryMapper from './telemetry-mapper.js';
import globalInsights from './global-insights.js';
import aiAssistant from './ai-assistant.js';
import trackProfileModal from '../ui/track-profile-modal.js';

const MODULES = Object.freeze({
  taxonomyService,
  trackProfileLoader,
  trackPresentation,
  trackRelations,
  listenerProfile,
  sessionContext,
  recommendationStrategies,
  recommendationReasons,
  recommendationMemory,
  recommendationEngine,
  collectionEngine,
  providerCapabilities,
  providerIdentity,
  providerActions,
  hybridSync,
  telemetryMapper,
  globalInsights,
  aiAssistant,
  trackProfileModal
});

export async function initIntelligenceLayer({ W = window, D = document, config = {} } = {}) {
  if (W.__intelligenceLayer?.initialized) return W.__intelligenceLayer;

  const disabled = W.localStorage?.getItem(INTELLIGENCE_FLAGS.localStorageDisableKey) === '1';
  const debug = W.localStorage?.getItem(INTELLIGENCE_FLAGS.localStorageDebugKey) === '1';
  const bridges = createIntelligenceBridges();
  const layer = {
    initialized: true,
    enabled: !disabled && INTELLIGENCE_FLAGS.bootstrapEnabledByDefault,
    debug,
    flags: INTELLIGENCE_FLAGS,
    manifest: INTELLIGENCE_MANIFEST,
    roadmapVersion: INTELLIGENCE_UID_ROADMAP_VERSION,
    bridges,
    modules: MODULES,
    ui: { trackProfileModal },
    state: {
      bootedAt: Date.now(),
      disabled,
      errors: []
    }
  };

  W.__intelligenceLayer = layer;
  W.IntelligenceLayer = layer;

  try { bridges.onBootstrap?.(layer); } catch {}
  try { if (W.TrackRegistry) bridges.onTrackRegistryReady?.(W.TrackRegistry); } catch {}
  try { if (W.playerCore) bridges.onPlayerCoreReady?.(W.playerCore); } catch {}

  if (!layer.enabled) return layer;

  const initOrder = [
    taxonomyService,
    trackProfileLoader,
    trackPresentation,
    trackRelations,
    listenerProfile,
    sessionContext,
    recommendationReasons,
    recommendationMemory,
    recommendationEngine,
    collectionEngine,
    providerIdentity,
    providerActions,
    hybridSync,
    telemetryMapper,
    globalInsights,
    aiAssistant,
    trackProfileModal
  ];

  for (const mod of initOrder) {
    try { await mod?.initialize?.({ W, D, config, layer }); }
    catch (e) { layer.state.errors.push({ module: mod?.id || 'unknown', message: String(e?.message || e || 'error') }); }
  }

  try { bridges.onAppInitialized?.(layer); } catch {}
  return layer;
}

export default { initIntelligenceLayer, MODULES };
