/* TRACK RELATIONS — future relation graph beyond similar_tracks. */
// UID.053_track_relation_graph_(ввести relation graph)_(для richer discovery и переходов)_(module will own relation types)
// UID.054_audio_similarity_relation_(держать audio similarity)_(для похожего звучания)_(future embeddings edges)
// UID.055_lyric_similarity_relation_(держать lyric similarity)_(для похожего смысла)_(themes/keywords/entities edges)
// UID.057_transition_fit_relation_(держать transition fit)_(для хороших переходов между треками)_(sequence-aware edges)
// UID.059_same_universe_relation_(держать same-universe)_(для внутренних миров/циклов)_(manual+semantic links)

const noopAsync = async () => null;

export const trackRelations = {
  id: 'track-relations',
  version: '0.0.1-stub',
  ready: false,
  async initialize() { this.ready = true; return this; },
  async getSimilar() { return []; },
  async getRelations() { return []; },
  async getTransitionCandidates() { return []; },
  async getUniverseLinks() { return []; },
  teardown: noopAsync
};

export default trackRelations;
