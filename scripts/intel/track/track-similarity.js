// Производное сходство TrackProfile.
// Не хранит UID-связи, не выполняет сеть самостоятельно и не управляет playback.
import { trackProfiles } from './track-profiles.js';

const safe = value => String(value == null ? '' : value).trim();
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const DIMENSIONS = Object.freeze({
  genres: 0.24,
  styles: 0.1,
  moods: 0.2,
  themes: 0.2,
  use_cases: 0.1,
  time_of_day: 0.06,
  axes: 0.1
});

const vector = raw => raw && typeof raw === 'object' && !Array.isArray(raw)
  ? Object.fromEntries(Object.entries(raw).map(([key, value]) => [safe(key), num(value)]).filter(([key, value]) => key && value > 0))
  : {};

const cosine = (leftRaw, rightRaw) => {
  const left = vector(leftRaw);
  const right = vector(rightRaw);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  if (!keys.size) return null;

  let dot = 0;
  let leftLength = 0;
  let rightLength = 0;
  keys.forEach(key => {
    const a = num(left[key]);
    const b = num(right[key]);
    dot += a * b;
    leftLength += a * a;
    rightLength += b * b;
  });

  return leftLength > 0 && rightLength > 0
    ? dot / Math.sqrt(leftLength * rightLength)
    : null;
};

export const scoreTrackSimilarity = (left, right) => {
  const leftProfile = left?.finalProfile || {};
  const rightProfile = right?.finalProfile || {};
  let score = 0;
  let usedWeight = 0;
  const breakdown = {};

  Object.entries(DIMENSIONS).forEach(([dimension, weight]) => {
    const value = cosine(leftProfile[dimension], rightProfile[dimension]);
    if (value == null) return;
    breakdown[dimension] = value;
    score += value * weight;
    usedWeight += weight;
  });

  return {
    score: usedWeight > 0 ? score / usedWeight : 0,
    coverage: usedWeight,
    breakdown
  };
};

export const trackSimilarity = {
  async init() {
    return true;
  },

  async getSimilar(uid, { limit = 3, index = null, minScore = 0.05 } = {}) {
    const cleanUid = safe(uid);
    const profileIndex = index || await trackProfiles.ensureIndex();
    const source = profileIndex?.items?.[cleanUid];
    if (!source) return [];

    return Object.entries(profileIndex.items || {})
      .filter(([candidateUid]) => candidateUid !== cleanUid)
      .map(([candidateUid, preview]) => {
        const similarity = scoreTrackSimilarity(source, preview);
        return {
          uid: candidateUid,
          preview,
          score: similarity.score,
          coverage: similarity.coverage,
          breakdown: similarity.breakdown
        };
      })
      .filter(item => item.score >= Math.max(0, Number(minScore) || 0))
      .sort((left, right) => right.score - left.score || left.uid.localeCompare(right.uid))
      .slice(0, Math.max(1, Number(limit) || 3));
  }
};

export default trackSimilarity;
