import { trackProfiles } from '../track/track-profiles.js';
import { trackPresentation } from '../track/track-presentation.js';

const safe = value => String(value == null ? '' : value).trim();
const esc = value => window.Utils?.escapeHtml?.(safe(value)) || safe(value);
const percent = value => `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;

const renderWeights = (title, values, limit = 8) => {
  const rows = Object.entries(values && typeof values === 'object' && !Array.isArray(values) ? values : {})
    .filter(([key, value]) => safe(key) && Number(value) > 0)
    .sort((left, right) => Number(right[1]) - Number(left[1]) || left[0].localeCompare(right[0]))
    .slice(0, limit);

  if (!rows.length) return '';
  return `<div class="stat-card"><div class="stat-title">${esc(title)}</div><ul class="stat-list">${rows.map(([key, value]) => `<li><span>${esc(key)}</span><span>${esc(percent(value))}</span></li>`).join('')}</ul></div>`;
};

export const trackProfileModal = {
  async init() {
    return true;
  },

  async open(uid) {
    const cleanUid = safe(uid);
    if (!cleanUid || !window.Modals?.open) return false;

    const profile = await trackProfiles.getProfile(cleanUid);
    if (!profile) return false;

    const presentation = await trackPresentation.getPresentation(cleanUid);
    const track = window.TrackRegistry?.getTrackByUid?.(cleanUid);
    const testData = profile.testData === true || profile.status === 'test_fixture';
    const finalProfile = profile.finalProfile || {};
    const similar = Array.isArray(profile.relations?.similar_tracks)
      ? profile.relations.similar_tracks
      : [];

    window.Modals.open({
      title: `Паспорт трека${testData ? ' · TEST' : ''}`,
      maxWidth: 460,
      bodyHtml: `
        <div class="sm-center sm-mb20">
          <h3 class="sm-title">${esc(track?.title || profile.title || cleanUid)}</h3>
          <div class="sm-sub">${esc(profile.albumTitle || track?.album || '')}</div>
          <div class="sm-note">${esc(presentation.one_liner_ru || presentation.short_ru || presentation.tagline_ru || 'Semantic profile loaded')}</div>
        </div>
        ${testData ? '<div class="stat-card"><div class="stat-sub">Демонстрационные данные для проверки INTEL. Не являются фактическим анализом трека.</div></div>' : ''}
        ${renderWeights('Жанры', finalProfile.genres)}
        ${renderWeights('Настроения', finalProfile.moods)}
        ${renderWeights('Темы', finalProfile.themes)}
        ${renderWeights('Сценарии', finalProfile.use_cases)}
        ${renderWeights('Время суток', finalProfile.time_of_day)}
        ${renderWeights('Смысловые оси', finalProfile.axes, 12)}
        ${renderWeights('Предупреждения', finalProfile.warnings)}
        <div class="stat-card">
          <div class="stat-title">Источник</div>
          <div class="stat-sub">Music: ${esc(profile.musicAnalysis?.source || '—')} · verified: ${profile.musicAnalysis?.verified === true ? 'да' : 'нет'}</div>
          <div class="stat-sub">Lyrics: ${esc(profile.lyricAnalysis?.source || '—')} · verified: ${profile.lyricAnalysis?.verified === true ? 'да' : 'нет'}</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">Похожие UID</div>
          <div class="stat-sub">${similar.length ? esc(similar.join(' · ')) : 'Проверенные связи пока отсутствуют'}</div>
        </div>
      `
    });
    return true;
  }
};

export default trackProfileModal;
