// UID.038_(Track profile modal)_(дать отдельный UI-паспорт трека)_(не раздувать statistics-modal, а открывать отдельный modal layer)
// UID.036_(Track presentation layer)_(показывать card-ready данные)_(брать summary/presentation из semantic profile)
// UID.094_(No-paralysis rule)_(не ломать UX при отсутствии profile data)_(если данных нет — просто мягко вернуть false)
// UID.095_(Ownership boundary: legacy vs intel)_(track-profile-modal не должен становиться новой modal системой)_(этот модуль использует central window.Modals как host и не владеет общим UI/modal lifecycle)

import { trackProfiles } from '../track/track-profiles.js';
import { trackPresentation } from '../track/track-presentation.js';

export const trackProfileModal = {
  async init() {
    return true;
  },

  async open(uid) {
    const safeUid = String(uid || '').trim();
    if (!safeUid || !window.Modals?.open) return false;

    const profile = await trackProfiles.getProfile(safeUid);
    if (!profile) return false;

    const presentation = await trackPresentation.getPresentation(safeUid);
    window.Modals.open({
      title: 'Паспорт трека',
      maxWidth: 460,
      bodyHtml: `<div class="sm-center"><div class="sm-note">${window.Utils?.escapeHtml?.(presentation.one_liner_ru || presentation.short_ru || presentation.tagline_ru || '') || 'Semantic profile loaded'}</div></div>`
    });
    return true;
  }
};

export default trackProfileModal;
