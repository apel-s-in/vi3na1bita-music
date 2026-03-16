/* RECOMMENDATION ENGINE — future modular ranking engine for profile/showcase/track contexts. */
// UID.090_recommendation_engine_core_(ввести recommendation engine)_(для настоящих персональных recs)_(single orchestrator module)
// UID.091_recommendation_strategies_registry_(использовать registry стратегий)_(для лёгкого расширения)_(engine consumes strategies not UI)
// UID.092_recommendation_reason_model_(возвращать reasons вместе с recs)_(для explainability)_(score+reasons+human text)
// UID.111_profile_for_you_block_(первый consumer engine = profile tab)_(для быстрой ценности)_(replace random recs safely)
// UID.104_showcase_semantic_hub_(второй consumer engine = Showcase)_(для semantic browsing)_(consume engine lazily)

const noopAsync = async () => null;

export const recommendationEngine = {
  id: 'recommendation-engine',
  version: '0.0.1-stub',
  ready: false,
  async initialize() { this.ready = true; return this; },
  async recommendForUser() { return []; },
  async recommendForTrack() { return []; },
  async recommendForSession() { return []; },
  async explainResult() { return null; },
  teardown: noopAsync
};

export default recommendationEngine;
