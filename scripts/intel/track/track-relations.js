// UID.034_(Track relations graph)_(не ограничиваться одним similar_tracks)_(подготовить единый доступ к связям между треками) UID.035_(Similar tracks)_(дать быстрый блок похожих песен)_(читать related/similar из preview/full profile) UID.041_(Showcase semantic filters)_(готовить витрину к умным связям)_(отдавать relation sets как data-layer без UI логики) UID.095_(Ownership boundary: legacy vs intel)_(не делать relations слоем orchestration)_(track-relations только читает graph data, а не решает playback/order/navigation самостоятельно)
import { trackProfiles } from './track-profiles.js';
export const trackRelations = {
  async init() { return true; },
  async getRelations(uid) { const f = await trackProfiles.getProfile(uid); if (f?.relations && typeof f.relations === 'object') return f.relations; return trackProfiles.getPreview(uid)?.relations || {}; },
  async getSimilar(uid) { const r = await this.getRelations(uid); if (Array.isArray(r.similar_tracks)) return r.similar_tracks; const p = trackProfiles.getPreview(uid); return Array.isArray(p?.similar_tracks) ? p.similar_tracks : []; }
};
export default trackRelations;
