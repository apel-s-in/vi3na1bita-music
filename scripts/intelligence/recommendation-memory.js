/* RECOMMENDATION MEMORY — future persistence for shown/accepted/dismissed recommendations. */
// UID.070_recommendation_memory_layer_(ввести recommendation memory)_(для не повторять одинаковое)_(state store owner)
// UID.120_recommendation_interaction_tracking_(логировать interaction lifecycle)_(для улучшения engine и аналитики)_(shown/clicked/accepted/dismissed)

const noopAsync = async () => null;

export const recommendationMemory = {
  id: 'recommendation-memory',
  version: '0.0.1-stub',
  ready: false,
  async initialize() { this.ready = true; return this; },
  async markShown() { return null; },
  async markClicked() { return null; },
  async markAccepted() { return null; },
  async markDismissed() { return null; },
  async getCooldowns() { return []; },
  teardown: noopAsync
};

export default recommendationMemory;
