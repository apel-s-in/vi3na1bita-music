import { trackProfiles } from '../track/track-profiles.js';
import { trackPresentation } from '../track/track-presentation.js';
export const trackProfileModal = {
  async init() { return true; },
  async open(uid) { const u = String(uid || '').trim(); if (!u || !window.Modals?.open) return false; const p = await trackProfiles.getProfile(u); if (!p) return false; const pr = await trackPresentation.getPresentation(u); window.Modals.open({ title: 'Паспорт трека', maxWidth: 460, bodyHtml: `<div class="sm-center"><div class="sm-note">${window.Utils?.escapeHtml?.(pr.one_liner_ru || pr.short_ru || pr.tagline_ru || '') || 'Semantic profile loaded'}</div></div>` }); return true; }
};
export default trackProfileModal;
