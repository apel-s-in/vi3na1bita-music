import { trackProfiles } from '../track/track-profiles.js';

const safe = value => String(value == null ? '' : value).trim();
const esc = value => window.Utils?.escapeHtml?.(safe(value)) || safe(value);
const percent = value => `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;
const DICTIONARY_TTL_MS = 12 * 60 * 60 * 1000;
let dictionariesPromise = null;

const fetchDictionary = (key, url) => window.Utils?.fetchCache?.getJson
  ? window.Utils.fetchCache.getJson({ key, url, ttlMs: DICTIONARY_TTL_MS, store: 'session', fetchInit: { cache: 'force-cache' } })
  : fetch(url, { cache: 'force-cache' }).then(response => response.ok ? response.json() : null);

const loadDictionaries = () => {
  if (dictionariesPromise) return dictionariesPromise;
  dictionariesPromise = Promise.all([
    fetchDictionary('intel:vocabulary:v2', './data/track-profile-vocabulary.json'),
    fetchDictionary('intel:taxonomy:v3', './data/taxonomy.json')
  ]).then(([vocabulary, taxonomy]) => ({ vocabulary: vocabulary || {}, taxonomy: taxonomy || {} })).catch(() => {
    dictionariesPromise = null;
    return { vocabulary: {}, taxonomy: {} };
  });
  return dictionariesPromise;
};

const shortTaxonomyLabel = value => safe(value).split(/[:.]/, 1)[0] || safe(value);
const labelFrom = (labels, key, taxonomy = false) => {
  const value = labels?.[key];
  return value ? taxonomy ? shortTaxonomyLabel(value) : safe(value) : safe(key);
};

const renderWeights = (title, values, labels = {}, limit = 10, taxonomy = false) => {
  const rows = Object.entries(values && typeof values === 'object' && !Array.isArray(values) ? values : {})
    .filter(([key, value]) => safe(key) && Number(value) > 0)
    .sort((left, right) => Number(right[1]) - Number(left[1]) || left[0].localeCompare(right[0]))
    .slice(0, limit);
  if (!rows.length) return '';
  return `<div class="stat-card"><div class="stat-title">${esc(title)}</div><ul class="stat-list">${rows.map(([key, value]) => `<li><span>${esc(labelFrom(labels, key, taxonomy))}</span><span>${esc(percent(value))}</span></li>`).join('')}</ul></div>`;
};

const renderTechnical = (music, vocabulary = {}) => {
  const confidence = music?.technicalConfidence || {};
  const valueWithConfidence = (value, field, suffix = '') => value == null || value === ''
    ? null
    : `${value}${suffix} · ${Math.round(Number(confidence[field] || 0) * 100)}%`;

  const rows = [
    ['BPM', valueWithConfidence(music?.bpm, 'bpm')],
    ['Темп', music?.tempoClass ? labelFrom(vocabulary.tempoClasses, music.tempoClass) : null],
    ['Тональность', music?.key && music?.mode ? `${labelFrom(vocabulary.keys, music.key)} · ${labelFrom(vocabulary.modes, music.mode)} · ${Math.round(Number(confidence.key || 0) * 100)}%` : null],
    ['Размер', music?.timeSignature ? labelFrom(vocabulary.timeSignatures, music.timeSignature) : null],
    ['Громкость', valueWithConfidence(music?.loudnessLufs, 'loudnessLufs', ' LUFS')],
    ['Динамический диапазон', valueWithConfidence(music?.dynamicRange, 'dynamicRange', ' дБ')],
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

    const [profile, dictionaries] = await Promise.all([
      trackProfiles.getProfile(cleanUid),
      loadDictionaries()
    ]);
    if (!profile) return false;

    const vocabulary = dictionaries.vocabulary || {};
    const taxonomy = dictionaries.taxonomy || {};
    const taxonomyItems = group => taxonomy.groups?.[group]?.items || {};
    const presentation = profile.presentation || {};
    const track = window.TrackRegistry?.getTrackByUid?.(cleanUid);
    const music = profile.musicAnalysis || {};
    const lyrics = profile.lyricAnalysis || {};
    const finalProfile = profile.finalProfile || {};

    window.Modals.open({
      title: 'Паспорт трека',
      maxWidth: 460,
      bodyHtml: `
        <div class="sm-center sm-mb20">
          <h3 class="sm-title">${esc(track?.title || cleanUid)}</h3>
          <div class="sm-sub">${esc(track?.album || window.TrackRegistry?.getAlbumTitle?.(track?.sourceAlbum) || '')}</div>
          <div class="sm-note">${esc(presentation.one_liner_ru || presentation.tagline_ru || 'Смысловой профиль загружен')}</div>
        </div>
        ${renderTechnical(music, vocabulary)}
        ${renderWeights('Инструменты', music.instrumentation, vocabulary.instrumentation)}
        ${renderWeights('Вокальные роли', music.vocalRoles, vocabulary.vocalRoles)}
        ${renderWeights('Подача вокала', music.vocalDelivery, vocabulary.vocalDelivery)}
        ${renderWeights('Аранжировка', music.arrangementTags, vocabulary.arrangementTags)}
        ${renderWeights('Продакшн', music.productionTags, vocabulary.productionTags)}
        ${music.arrangementDescription_ru ? `<div class="stat-card"><div class="stat-title">Аранжировка</div><div class="stat-sub">${esc(music.arrangementDescription_ru)}</div></div>` : ''}
        ${music.productionDescription_ru ? `<div class="stat-card"><div class="stat-title">Звучание</div><div class="stat-sub">${esc(music.productionDescription_ru)}</div></div>` : ''}
        ${lyrics.summary_ru ? `<div class="stat-card"><div class="stat-title">Смысл текста</div><div class="stat-sub">${esc(lyrics.summary_ru)}</div></div>` : ''}
        ${renderWeights('Жанры', finalProfile.genres, taxonomyItems('genres'), 10, true)}
        ${renderWeights('Стили', finalProfile.styles, taxonomyItems('styles'), 10, true)}
        ${renderWeights('Настроения', finalProfile.moods, taxonomyItems('moods'), 10, true)}
        ${renderWeights('Темы', finalProfile.themes, taxonomyItems('themes'), 10, true)}
        ${renderWeights('Сценарии', finalProfile.use_cases, taxonomyItems('use_cases'), 10, true)}
        ${renderWeights('Время суток', finalProfile.time_of_day, taxonomyItems('time_of_day'), 10, true)}
        ${renderWeights('Смысловые оси', finalProfile.axes, taxonomyItems('axes'), 18, true)}
        ${renderWeights('Предупреждения', finalProfile.warnings, taxonomyItems('content_warnings'), 10, true)}
      `
    });
    return true;
  }
};

export default trackProfileModal;
