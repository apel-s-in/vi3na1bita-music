// Контракт только активных INTEL-компонентов.
export const INTEL_CONTRACTS = Object.freeze({
  version: 'intel-contracts-v2',
  taxonomyVersion: 'taxonomy-v3',
  trackProfileVersion: 'track-profile-v4',
  vocabularyVersion: 'track-profile-vocabulary-v2',
  profileIndexUrl: './data/track-profiles-index.json',
  profileDir: './data/track-profiles/',
  stores: Object.freeze({
    listenerProfile: 'listener_profile',
    recommendationState: 'recommendation_state',
    intelRuntime: 'intel_runtime'
  }),
  events: Object.freeze([
    'intel:ready',
    'intel:disabled',
    'intel:track-profiles:index-ready',
    'intel:listener-profile:updated',
    'intel:recommendations:updated'
  ]),
  ownership: Object.freeze({
    playback: 'PlayerCore',
    statistics: 'analytics',
    backup: 'Backup V7',
    intelligence: 'optional-derived-layer'
  })
});

export default INTEL_CONTRACTS;
