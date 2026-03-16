/* INTELLIGENCE FLAGS — safe toggle layer for optional bootstrap and staged rollout. */
// UID.008_optional_intelligence_layer_(держать слой отключаемым)_(для безопасного rollout/rollback)_(через bootstrap flags + localStorage kill switch)
// UID.155_disabled_layer_fallback_(обеспечить корректное отключение)_(для нулевого влияния на текущий плеер)_(если disable flag=1 то только namespace+no-op)
// UID.156_namespace_manifest_layer_(создать единый namespace настроек слоя)_(для прозрачной отладки)_(window.IntelligenceLayer.flags)

export const INTELLIGENCE_FLAGS = Object.freeze({
  version: 'intelligence-flags-v1',
  localStorageDisableKey: 'intelligence:disable',
  localStorageDebugKey: 'intelligence:debug',
  bootstrapEnabledByDefault: true,
  commentOnlyBootstrap: true,
  lazyTrackProfiles: true,
  lazyTrackProfileModal: true,
  lazyRecommendations: true,
  telemetryEnabledByDefault: false,
  aiEnabledByDefault: false,
  communityEnabledByDefault: false,
  providerActionsEnabledByDefault: false
});

export default INTELLIGENCE_FLAGS;
