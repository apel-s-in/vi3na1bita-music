/* INTELLIGENCE MANIFEST — canonical module map and connection plan. */
// UID.013_track_registry_anchor_(связать intelligent layer с TrackRegistry)_(для единой точки правды)_(через bridges+module map)
// UID.090_recommendation_engine_core_(держать rec engine отдельным модулем)_(для расширяемости)_(manifest lists module ownership and connection points)
// UID.156_namespace_manifest_layer_(держать карту модулей явно)_(для понятного сопровождения)_(id/path/connects/use-cases)

export const INTELLIGENCE_MANIFEST = Object.freeze({
  version: 'intelligence-manifest-v1',
  root: 'scripts/intelligence',
  optional: true,
  data: {
    trackProfilesIndex: 'data/track-profiles-index.json',
    trackProfilesDir: 'data/track-profiles/'
  },
  modules: [
    { id: 'bridges', path: 'scripts/intelligence/bridges.js', connects: ['scripts/app.js'] },
    { id: 'taxonomyService', path: 'scripts/intelligence/taxonomy-service.js', connects: ['data/taxonomy.json'] },
    { id: 'trackProfileLoader', path: 'scripts/intelligence/track-profile-loader.js', connects: ['scripts/app/track-registry.js', 'data/track-profiles-index.json'] },
    { id: 'trackPresentation', path: 'scripts/intelligence/track-presentation.js', connects: ['scripts/ui/track-profile-modal.js', 'scripts/analytics/share-generator.js'] },
    { id: 'trackRelations', path: 'scripts/intelligence/track-relations.js', connects: ['scripts/app/showcase/index.js'] },
    { id: 'listenerProfile', path: 'scripts/intelligence/listener-profile.js', connects: ['scripts/analytics/meta-db.js', 'scripts/app/profile/view.js'] },
    { id: 'sessionContext', path: 'scripts/intelligence/session-context.js', connects: ['src/PlayerCore.js', 'scripts/analytics/session-tracker.js'] },
    { id: 'recommendationStrategies', path: 'scripts/intelligence/recommendation-strategies.js', connects: ['scripts/intelligence/recommendation-engine.js'] },
    { id: 'recommendationReasons', path: 'scripts/intelligence/recommendation-reasons.js', connects: ['scripts/intelligence/recommendation-engine.js'] },
    { id: 'recommendationMemory', path: 'scripts/intelligence/recommendation-memory.js', connects: ['scripts/analytics/meta-db.js'] },
    { id: 'recommendationEngine', path: 'scripts/intelligence/recommendation-engine.js', connects: ['scripts/app/showcase/index.js', 'scripts/app/profile/view.js'] },
    { id: 'collectionEngine', path: 'scripts/intelligence/collection-engine.js', connects: ['scripts/analytics/share-generator.js', 'scripts/ui/track-profile-modal.js'] },
    { id: 'providerCapabilities', path: 'scripts/intelligence/provider-capabilities.js', connects: ['scripts/intelligence/provider-identity.js'] },
    { id: 'providerIdentity', path: 'scripts/intelligence/provider-identity.js', connects: ['scripts/analytics/cloud-sync.js', 'scripts/app/profile/view.js'] },
    { id: 'providerActions', path: 'scripts/intelligence/provider-actions.js', connects: ['scripts/app/profile/view.js'] },
    { id: 'hybridSync', path: 'scripts/intelligence/hybrid-sync.js', connects: ['scripts/analytics/backup-vault.js', 'scripts/analytics/cloud-sync.js'] },
    { id: 'telemetryMapper', path: 'scripts/intelligence/telemetry-mapper.js', connects: ['scripts/analytics/event-logger.js'] },
    { id: 'globalInsights', path: 'scripts/intelligence/global-insights.js', connects: ['scripts/app/profile/view.js', 'scripts/app/showcase/index.js'] },
    { id: 'aiAssistant', path: 'scripts/intelligence/ai-assistant.js', connects: ['scripts/ui/track-profile-modal.js', 'scripts/app/profile/view.js'] },
    { id: 'trackProfileModal', path: 'scripts/ui/track-profile-modal.js', connects: ['scripts/ui/statistics-modal.js'] }
  ]
});

export default INTELLIGENCE_MANIFEST;
