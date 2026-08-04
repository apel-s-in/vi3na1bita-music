import { trackProfiles } from '../track/track-profiles.js';
import { trackPresentation } from '../track/track-presentation.js';

const safe = value => String(value == null ? '' : value).trim();
const esc = value => window.Utils?.escapeHtml?.(safe(value)) || safe(value);
const percent = value => `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;

const renderWeights = (title, values, limit = 10) => {
  const rows = Object.entries(values && typeof values === 'object' && !Array.isArray(values) ? values : {})
    .filter(([key, value]) => safe(key) && Number(value) > 0)
    .sort((left, right) => Number(right[1]) - Number(left[1]) || left[0].localeCompare(right[0]))
    .slice(0, limit);
  if (!rows.length) return '';
  return `<div class="stat-card"><div class="stat-title">${esc(title)}</div><ul class="stat-list">${rows.map(([key, value]) => `<li><span>${esc(key)}</span><span>${esc(percent(value))}</span></li>`).join('')}</ul></div>`;
};

const renderTechnical = music => {
  const rows = [
    ['BPM', music?.bpm],
    ['Темп', music?.tempoClass],
    ['Тональность', music?.key && music?.mode ? `${music.key} · ${music.mode}` : null],
    ['Размер', music?.timeSignature],
    ['Вокал', music?.vocalPresence == null ? null : percent(music.vocalPresence)]
  ].filter(([, value]) => value != null && value !== '');

  return rows.length
    ? `<div class="stat-card"><div class="stat-title">Музыкальные характеристики</div><ul class="stat-list">${rows.map(([label, value]) => `<li><span>${esc(label)}</span><span>${esc(value)}</span></li>`).join('')}</ul></div>`
    : '';
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
    const music = profile.musicAnalysis || {};
    const lyrics = profile.lyricAnalysis || {};
    const finalProfile = profile.finalProfile || {};

    window.Modals.open({
      title: `Паспорт трека${testData ? ' · TEST' : ''}`,
      maxWidth: 460,
      bodyHtml: `
        <div class="sm-center sm-mb20">
          <h3 class="sm-title">${esc(track?.title || cleanUid)}</h3>
          <div class="sm-sub">${esc(track?.album || window.TrackRegistry?.getAlbumTitle?.(track?.sourceAlbum) || '')}</div>
          <div class="sm-note">${esc(presentation.one_liner_ru || presentation.tagline_ru || 'Смысловой профиль загружен')}</div>
        </div>
        ${testData ? '<div class="stat-card"><div class="stat-sub">Демонстрационные данные. Не являются фактическим анализом трека.</div></div>' : ''}
        ${renderTechnical(music)}
        ${renderWeights('Инструменты', music.instrumentation)}
        ${renderWeights('Вокальные роли', music.vocalRoles)}
        ${renderWeights('Подача вокала', music.vocalDelivery)}
        ${renderWeights('Аранжировка', music.arrangementTags)}
        ${renderWeights('Продакшн', music.productionTags)}
        ${music.arrangementDescription_ru ? `<div class="stat-card"><div class="stat-title">Аранжировка</div><div class="stat-sub">${esc(music.arrangementDescription_ru)}</div></div>` : ''}
        ${music.productionDescription_ru ? `<div class="stat-card"><div class="stat-title">Звучание</div><div class="stat-sub">${esc(music.productionDescription_ru)}</div></div>` : ''}
        ${lyrics.summary_ru ? `<div class="stat-card"><div class="stat-title">Смысл текста</div><div class="stat-sub">${esc(lyrics.summary_ru)}</div></div>` : ''}
        ${renderWeights('Жанры', finalProfile.genres)}
        ${renderWeights('Стили', finalProfile.styles)}
        ${renderWeights('Настроения', finalProfile.moods)}
        ${renderWeights('Темы', finalProfile.themes)}
        ${renderWeights('Сценарии', finalProfile.use_cases)}
        ${renderWeights('Время суток', finalProfile.time_of_day)}
        ${renderWeights('Смысловые оси', finalProfile.axes, 18)}
        ${renderWeights('Предупреждения', finalProfile.warnings)}
      `
    });
    return true;
  }
};

export default trackProfileModal;
