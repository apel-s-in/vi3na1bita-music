/* COLLECTION ENGINE — future per-track collectible state builder. */
// UID.060_track_collection_state_(ввести track collection state)_(для collectible UX)_(user-specific state builder)
// UID.085_collection_badges_layer_(ввести badges)_(для красивых карточек и mastery)_(listened/favorite/clip/stems/minus/lossless/veteran)
// UID.086_track_completion_percent_(ввести completionPercent)_(для прогрессии трека)_(derive from badges and milestones)

const noopAsync = async () => null;

export const collectionEngine = {
  id: 'collection-engine',
  version: '0.0.1-stub',
  ready: false,
  async initialize() { this.ready = true; return this; },
  async getTrackState() { return null; },
  async getBadges() { return []; },
  async getCompletionPercent() { return 0; },
  teardown: noopAsync
};

export default collectionEngine;
