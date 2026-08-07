// Производное сходство TrackProfile.
// Сравнивает только канонические machine features и не управляет playback.
import { trackProfiles } from './track-profiles.js';

const safe = value => String(value == null ? '' : value).trim();
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const DIMENSIONS = Object.freeze({
  genres: 0.15,
  styles: 0.06,
  moods: 0.13,
  themes: 0.12,
  use_cases: 0.06,
  time_of_day: 0.03,
  axes: 0.17,
  instrumentation: 0.07,
  vocalRoles: 0.04,
  vocalDelivery: 0.03,
  arrangementTags: 0.035,
  productionTags: 0.025,
  bpm: 0.025,
  tonality: 0.02,
  loudnessLufs: 0.01,
  dynamicRange: 0.01
});

const vector = raw => raw && typeof raw === 'object' && !Array.isArray(raw)
  ? Object.fromEntries(Object.entries(raw).map(([key, value]) => [safe(key), num(value)]).filter(([key, value]) => key && value > 0))
  : {};

const cosine = (leftRaw, rightRaw) => {
  const left = vector(leftRaw);
  const right = vector(rightRaw);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  if (!keys.size || !Object.keys(left).length || !Object.keys(right).length) return null;

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
  return leftLength > 0 && rightLength > 0 ? dot / Math.sqrt(leftLength * rightLength) : null;
};

const axisSimilarity = (leftRaw, rightRaw) => {
  if (!leftRaw || !rightRaw) return null;
  const keys = [...new Set([...Object.keys(leftRaw), ...Object.keys(rightRaw)])];
  if (!keys.length) return null;
  return 1 - keys.reduce((sum, key) => sum + Math.abs(num(leftRaw[key]) - num(rightRaw[key])), 0) / keys.length;
};

const bpmSimilarity = (left, right) => {
  const a = Number(left?.musicAnalysis?.bpm);
  const b = Number(right?.musicAnalysis?.bpm);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const direct = Math.abs(a - b);
  const halfTime = Math.abs(a - b * 2);
  const doubleTime = Math.abs(a * 2 - b);
  return Math.max(0, 1 - Math.min(direct, halfTime, doubleTime) / 45);
};
const technicalSimilarity = (left, right, field, span) => {
  const a = Number(left?.musicAnalysis?.[field]);
  const b = Number(right?.musicAnalysis?.[field]);
  const confidenceA = num(left?.musicAnalysis?.technicalConfidence?.[field]);
  const confidenceB = num(right?.musicAnalysis?.technicalConfidence?.[field]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || confidenceA < 0.6 || confidenceB < 0.6) return null;
  return Math.max(0, 1 - Math.abs(a - b) / span);
};

const tonalitySimilarity = (left, right) => {
  const leftKey = safe(left?.musicAnalysis?.key);
  const rightKey = safe(right?.musicAnalysis?.key);
  const leftMode = safe(left?.musicAnalysis?.mode);
  const rightMode = safe(right?.musicAnalysis?.mode);
  if (!leftKey || !rightKey || !leftMode || !rightMode) return null;
  if (leftKey === rightKey && leftMode === rightMode) return 1;
  if (leftMode === rightMode) return 0.35;
  return 0;
};

const dimensionValue = (dimension, left, right) => {
  if (dimension === 'bpm') return bpmSimilarity(left, right);
  if (dimension === 'tonality') return tonalitySimilarity(left, right);
  if (dimension === 'loudnessLufs') return technicalSimilarity(left, right, 'loudnessLufs', 12);
  if (dimension === 'dynamicRange') return technicalSimilarity(left, right, 'dynamicRange', 15);
  if (dimension === 'axes') return axisSimilarity(left?.finalProfile?.axes, right?.finalProfile?.axes);
  if (dimension in (left?.finalProfile || {}) || dimension in (right?.finalProfile || {})) {
    return cosine(left?.finalProfile?.[dimension], right?.finalProfile?.[dimension]);
  }
  return cosine(left?.musicAnalysis?.[dimension], right?.musicAnalysis?.[dimension]);
};

export const scoreTrackSimilarity = (left, right) => {
  let score = 0;
  let coverage = 0;
  const breakdown = {};

  Object.entries(DIMENSIONS).forEach(([dimension, weight]) => {
    const value = dimensionValue(dimension, left, right);
    if (value == null) return;
    breakdown[dimension] = value;
    score += value * weight;
    coverage += weight;
  });

  const normalized = coverage > 0 ? score / coverage : 0;
  return {
    score: normalized * (0.7 + 0.3 * coverage),
    rawScore: normalized,
    coverage,
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
        return { uid: candidateUid, preview, ...similarity };
      })
      .filter(item => item.score >= Math.max(0, Number(minScore) || 0))
      .sort((left, right) => right.score - left.score || right.coverage - left.coverage || left.uid.localeCompare(right.uid))
      .slice(0, Math.max(1, Number(limit) || 3));
  }
};

export default trackSimilarity;
