import { trackProfiles } from './track-profiles.js';
export const trackRelations = {
  async init() { return true; },
  async getRelations(uid) { const f = await trackProfiles.getProfile(uid); if (f?.relations && typeof f.relations === 'object') return f.relations; return trackProfiles.getPreview(uid)?.relations || {}; },
  async getSimilar(uid) { const r = await this.getRelations(uid); if (Array.isArray(r.similar_tracks)) return r.similar_tracks; const p = trackProfiles.getPreview(uid); return Array.isArray(p?.similar_tracks) ? p.similar_tracks : []; }
};
export default trackRelations;
