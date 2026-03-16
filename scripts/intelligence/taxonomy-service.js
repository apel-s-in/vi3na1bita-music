/* TAXONOMY SERVICE — future canonical access to taxonomy-v2 and tag validation. */
// UID.031_taxonomy_v2_canonical_(держать taxonomy единой)_(для предсказуемых тегов во всём приложении)_(future loader/validator here)
// UID.032_weighted_tag_model_(держать веса 0..1)_(для рекомендаций и осей)_(normalize and validate here)
// UID.042_recommendation_controls_layer_(держать rec controls рядом с taxonomy)_(для family/sleep/no_explicit режимов)_(consume taxonomy groups safely)

const noopAsync = async () => null;

export const taxonomyService = {
  id: 'taxonomy-service',
  version: '0.0.1-stub',
  ready: false,
  taxonomyVersion: 'taxonomy-v2',
  async initialize() { this.ready = true; return this; },
  async load() { return null; },
  async getGroup() { return null; },
  isValidTag() { return false; },
  normalizeWeight(value) { return Math.max(0, Math.min(1, Number(value) || 0)); },
  getRecommendationControls() { return []; },
  teardown: noopAsync
};

export default taxonomyService;
