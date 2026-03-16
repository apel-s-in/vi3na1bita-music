/* RECOMMENDATION REASONS — future explainability layer. */
// UID.092_recommendation_reason_model_(ввести reason model)_(для explainability и доверия)_(machine reasons live here)
// UID.093_recommendation_human_explanations_(ввести human explanations)_(для UI и AI assistant)_(convert scores to readable text)
// UID.144_ai_recommendation_explanations_(подготовить AI explanation bridge)_(для richer why-this-track)_(consume reason payloads here)

const noopAsync = async () => null;

export const recommendationReasons = {
  id: 'recommendation-reasons',
  version: '0.0.1-stub',
  ready: false,
  async initialize() { this.ready = true; return this; },
  buildMachineReasons() { return []; },
  buildHumanExplanation() { return ''; },
  async explain() { return null; },
  teardown: noopAsync
};

export default recommendationReasons;
