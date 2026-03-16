/* TRACK PROFILE LOADER — future compact/full TrackProfile access layer. */
// UID.025_track_profile_two_layer_(делить profile на index/full)_(для скорости и lazy loading)_(loader owns both entrypoints)
// UID.026_track_profiles_index_(держать compact index отдельно)_(для browse/recs/search)_(load/cached here)
// UID.027_track_profiles_full_(держать full profile отдельно)_(для modal/card/deep analysis)_(load per UID on demand)
// UID.154_lazy_load_heavy_profiles_(строго лениво грузить full profiles)_(для startup performance)_(only on request)

const noopAsync = async () => null;

export const trackProfileLoader = {
  id: 'track-profile-loader',
  version: '0.0.1-stub',
  ready: false,
  async initialize() { this.ready = true; return this; },
  async loadIndex() { return null; },
  async getIndex() { return null; },
  async hasProfile() { return false; },
  async getPreview() { return null; },
  async loadProfile() { return null; },
  async getProfile() { return null; },
  clearMemoryCache() {},
  teardown: noopAsync
};

export default trackProfileLoader;
