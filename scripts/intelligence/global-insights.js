/* GLOBAL INSIGHTS — future cohort/similar-listeners/community compare layer. */
// UID.113_global_track_aggregates_(подготовить global aggregates)_(для community/trends)_(future remote aggregates consumer)
// UID.114_cohort_segmentation_(подготовить cohort segmentation)_(для similar users)_(cohort hints and ids)
// UID.115_similar_listeners_layer_(подготовить similar listeners)_(для community recs)_(future similarity hooks)
// UID.116_user_vs_community_layer_(подготовить compare layer)_(для insight blocks)_(user-vs-community hints)

const noopAsync = async () => null;

export const globalInsights = {
  id: 'global-insights',
  version: '0.0.1-stub',
  ready: false,
  async initialize() { this.ready = true; return this; },
  async getCohortHints() { return []; },
  async getUserVsCommunity() { return null; },
  async getTrackGlobalStats() { return null; },
  teardown: noopAsync
};

export default globalInsights;
