// UID.036_(Track presentation layer)_(отделить карточную подачу от сырых данных)_(читать presentation/card fields из preview/full profile) UID.037_(Card overrides)_(разрешить ручную правку карточки)_(держать слой overrides отдельным от raw/final analysis) UID.039_(Share cards from profile)_(использовать умную подачу в UI и share)_(отдавать safe presentation snapshot для других модулей) UID.095_(Ownership boundary: legacy vs intel)_(не смешивать presentation и raw semantic truth)_(этот модуль только собирает UI-ready snapshot, но не меняет TrackProfile и не владеет карточным UI host)
import { trackProfiles } from './track-profiles.js';
const norm = (s = {}) => ({ hook_ru: s.hook_ru || '', tagline_ru: s.tagline_ru || s.tagline || '', one_liner_ru: s.one_liner_ru || '', short_ru: s.short_ru || '', hero_quote_ru: s.hero_quote_ru || '', badges: Array.isArray(s.badges) ? s.badges : [], chips: Array.isArray(s.chips) ? s.chips : [] });
export const trackPresentation = {
  async init() { return true; },
  async getPresentation(uid) { const f = await trackProfiles.getProfile(uid); if (f?.presentation) return norm(f.presentation); if (f?.summary || f?.card) return norm({ hook_ru: f.summary?.hook_ru || '', tagline_ru: f.card?.tagline_ru || '', one_liner_ru: f.summary?.one_liner_ru || '', short_ru: f.summary?.short_ru || '' }); const p = trackProfiles.getPreview(uid); return norm(p?.presentation || p || {}); }
};
export default trackPresentation;
