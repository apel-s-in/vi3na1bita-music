// UID.034_(Track relations graph)_(не ограничиваться одним similar_tracks)_(подготовить единый доступ к связям между треками)
// UID.035_(Similar tracks)_(дать быстрый блок похожих песен)_(читать related/similar из preview/full profile)
// UID.041_(Showcase semantic filters)_(готовить витрину к умным связям)_(отдавать relation sets как data-layer без UI логики)
// UID.095_(Ownership boundary: legacy vs intel)_(не делать relations слоем orchestration)_(track-relations только читает graph data, а не решает playback/order/navigation самостоятельно)

import { trackProfiles } from './track-profiles.js';

export const trackRelations = {
  async init() {
    return true;
  },

  async getRelations(uid) {
    const full = await trackProfiles.getProfile(uid);
    if (full?.relations && typeof full.relations === 'object') return full.relations;
    const preview = trackProfiles.getPreview(uid);
    return preview?.relations || {};
  },

  async getSimilar(uid) {
    const relations = await this.getRelations(uid);
    if (Array.isArray(relations.similar_tracks)) return relations.similar_tracks;
    const preview = trackProfiles.getPreview(uid);
    return Array.isArray(preview?.similar_tracks) ? preview.similar_tracks : [];
  }
};

export default trackRelations;
