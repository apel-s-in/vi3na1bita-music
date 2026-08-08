// Pure personal popularity and underexposure model.
// Не читает DOM, storage, сеть и не управляет playback.
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const clamp = value => Math.max(0, Math.min(1, num(value)));
const logRatio = (value, maximum) => maximum > 0 ? clamp(Math.log1p(num(value)) / Math.log1p(maximum)) : 0;

export const PERSONAL_POPULARITY_WEIGHTS = Object.freeze({
  listenTime: 0.35,
  fullListens: 0.25,
  completion: 0.2,
  focusRun: 0.15,
  favorite: 0.05
});

export const buildPersonalTasteAnchors = (rows = [], limit = 5) => {
  const source = (Array.isArray(rows) ? rows : []).filter(row => row?.uid);
  const maxima = {
    listenSeconds: Math.max(0, ...source.map(row => num(row.listenSeconds))),
    fullListens: Math.max(0, ...source.map(row => num(row.fullListens))),
    focusRunMax: Math.max(0, ...source.map(row => num(row.focusRunMax)))
  };
  return source.map(row => {
    const signals = {
      listenTime: logRatio(row.listenSeconds, maxima.listenSeconds),
      fullListens: logRatio(row.fullListens, maxima.fullListens),
      completion: clamp(row.averageCompletionRate),
      focusRun: logRatio(row.focusRunMax, maxima.focusRunMax),
      favorite: row.favorite === true ? 1 : 0
    };
    const popularity = Object.entries(PERSONAL_POPULARITY_WEIGHTS).reduce((sum, [key, weight]) => sum + signals[key] * weight, 0);
    return { ...row, signals, popularity };
  }).filter(row => row.popularity > 0)
    .sort((left, right) => right.popularity - left.popularity || left.uid.localeCompare(right.uid))
    .slice(0, Math.max(1, Number(limit) || 5));
};

export const getTasteDiscoverySignals = ({ candidate = {}, anchors = [], anchorSimilarity = 0 } = {}) => {
  const rows = Array.isArray(anchors) ? anchors : [];
  const maxima = {
    listenSeconds: Math.max(0, ...rows.map(row => num(row.listenSeconds))),
    fullListens: Math.max(0, ...rows.map(row => num(row.fullListens))),
    focusRunMax: Math.max(0, ...rows.map(row => num(row.focusRunMax)))
  };
  const exposure = logRatio(candidate.fullListens, maxima.fullListens) * 0.45 +
    logRatio(candidate.listenSeconds, maxima.listenSeconds) * 0.35 +
    logRatio(candidate.focusRunMax, maxima.focusRunMax) * 0.2;
  const underexposure = 1 - clamp(exposure);
  return {
    anchorSimilarity: clamp(anchorSimilarity),
    underexposure,
    tasteDiscoveryAffinity: clamp(anchorSimilarity) * underexposure
  };
};

export default { PERSONAL_POPULARITY_WEIGHTS, buildPersonalTasteAnchors, getTasteDiscoverySignals };
