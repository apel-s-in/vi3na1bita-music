import { trackProfiles } from './track-profiles.js';

const norm = source => ({
  tagline_ru: source?.tagline_ru || '',
  one_liner_ru: source?.one_liner_ru || '',
  mini_description_ru: source?.mini_description_ru || ''
});

export const trackPresentation = {
  async init() {
    return true;
  },

  async getPresentation(uid) {
    const profile = await trackProfiles.getProfile(uid);
    if (profile?.presentation) return norm(profile.presentation);
    return norm(trackProfiles.getPreview(uid)?.presentation);
  }
};

export default trackPresentation;
