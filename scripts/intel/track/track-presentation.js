// UID.036_(Track presentation layer)_(отделить карточную подачу от сырых данных)_(читать presentation/card fields из preview/full profile)
// UID.037_(Card overrides)_(разрешить ручную правку карточки)_(держать слой overrides отдельным от raw/final analysis)
// UID.039_(Share cards from profile)_(использовать умную подачу в UI и share)_(отдавать safe presentation snapshot для других модулей)

import { trackProfiles } from './track-profiles.js';

function normalizePresentation(source = {}) {
  return {
    hook_ru: source.hook_ru || '',
    tagline_ru: source.tagline_ru || source.tagline || '',
    one_liner_ru: source.one_liner_ru || '',
    short_ru: source.short_ru || '',
    hero_quote_ru: source.hero_quote_ru || '',
    badges: Array.isArray(source.badges) ? source.badges : [],
    chips: Array.isArray(source.chips) ? source.chips : []
  };
}

export const trackPresentation = {
  async init() {
    return true;
  },

  async getPresentation(uid) {
    const full = await trackProfiles.getProfile(uid);
    if (full?.presentation) return normalizePresentation(full.presentation);
    if (full?.summary || full?.card) {
      return normalizePresentation({
        hook_ru: full.summary?.hook_ru || '',
        tagline_ru: full.card?.tagline_ru || '',
        one_liner_ru: full.summary?.one_liner_ru || '',
        short_ru: full.summary?.short_ru || ''
      });
    }
    const preview = trackProfiles.getPreview(uid);
    return normalizePresentation(preview?.presentation || preview || {});
  }
};

export default trackPresentation;
