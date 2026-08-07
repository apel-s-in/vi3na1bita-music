// Локальный детерминированный Recommendation Engine.
// Только возвращает кандидатов и никогда не управляет playback.
import { metaDB } from '../../analytics/meta-db.js';
import { recommendationMemory, getRecommendationControls } from '../../analytics/backup-domain-state.js';
import { getIntelFlags } from '../flags.js';
import { listenerProfile } from '../listener/listener-profile.js';
import { trackProfiles } from '../track/track-profiles.js';
import { scoreTrackSimilarity } from '../track/track-similarity.js';
import { getRecommendationReasonText } from './recommendation-reasons.js';
import { resolveRecommendationDataSource } from './recommendation-data-source.js';
import { composeRecommendationScore, getRecommendationBehaviorSignals } from './recommendation-score.js';

const safe = value => String(value == null ? '' : value).trim();
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const state = { lastResult: null };

const scoreUid = (uid, seed) => {
  const text = `${seed}:${uid}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const vector = raw => raw && typeof raw === 'object' && !Array.isArray(raw)
  ? Object.fromEntries(Object.entries(raw).map(([key, value]) => [safe(key), num(value)]).filter(([key, value]) => key && value > 0))
  : {};

const preferenceVector = rows => Object.fromEntries(
  (Array.isArray(rows) ? rows : [])
    .map(item => [safe(item?.key), num(item?.weight)])
    .filter(([key, weight]) => key && weight > 0)
);

const similarity = (preferences, candidate) => {
  const keys = new Set([...Object.keys(preferences), ...Object.keys(candidate)]);
  if (!keys.size) return 0;
  let dot = 0;
  let left = 0;
  let right = 0;
  keys.forEach(key => {
    const a = num(preferences[key]);
    const b = num(candidate[key]);
    dot += a * b;
    left += a * a;
    right += b * b;
  });
  return left > 0 && right > 0 ? dot / Math.sqrt(left * right) : 0;
};

const profileSection = (preview, key) =>
  preview?.finalProfile?.[key] || preview?.[key] || {};

const blockedByControls = (preview, controls) => {
  const warnings = new Set([
    ...Object.keys(vector(profileSection(preview, 'warnings'))),
    ...(Array.isArray(preview?.contentWarnings) ? preview.contentWarnings.map(safe) : [])
  ]);
  const themes = vector(profileSection(preview, 'themes'));
  const axes = vector(profileSection(preview, 'axes'));

  if (controls.noExplicit && (warnings.has('explicit_language') || warnings.has('sexual_content'))) return true;
  if (controls.noHorror && (warnings.has('strong_horror') || num(axes.spookiness) >= 0.55)) return true;
  if (controls.noPolitics && (num(themes.politics) >= 0.4 || num(themes.protest) >= 0.4 || num(themes.social_critique) >= 0.4)) return true;
  if (controls.familyMode && (warnings.size > 0 || num(axes.family_friendly) < 0.55)) return true;
  return false;
};

const buildListenerVectors = listener => {
  const preferences = listener?.preferences || {};
  return Object.fromEntries(['genres', 'styles', 'moods', 'themes', 'use_cases', 'axes'].map(key => [key, preferenceVector(preferences[key])]));
};

const semanticScore = (preview, preferences) => {
  if (!preview) return { total: 0, breakdown: {} };
  const breakdown = {
    genres: similarity(preferences.genres, vector(profileSection(preview, 'genres'))),
    styles: similarity(preferences.styles, vector(profileSection(preview, 'styles'))),
    moods: similarity(preferences.moods, vector(profileSection(preview, 'moods'))),
    themes: similarity(preferences.themes, vector(profileSection(preview, 'themes'))),
    use_cases: similarity(preferences.use_cases, vector(profileSection(preview, 'use_cases'))),
    axes: similarity(preferences.axes, vector(profileSection(preview, 'axes')))
  };
  return {
    total: breakdown.genres * 0.2 + breakdown.styles * 0.08 + breakdown.moods * 0.25 + breakdown.themes * 0.2 + breakdown.use_cases * 0.12 + breakdown.axes * 0.15,
    breakdown
  };
};

const semanticReason = breakdown => {
  const ranked = [
    ['lyric_theme_similarity', num(breakdown?.themes)],
    ['mood_fit', num(breakdown?.moods)],
    ['use_case_fit', num(breakdown?.use_cases)]
  ].sort((left, right) => right[1] - left[1]);
  return ranked[0][1] >= 0.25 ? ranked[0][0] : 'taste_fit';
};

export const recommendationEngine = {
  async init() {
    await recommendationMemory.init();
    return true;
  },

  async recommend({ limit = 12, context = 'generic' } = {}) {
    const flags = getIntelFlags();
    const cleanContext = safe(context || 'generic');

    if (!flags.recommendationsEnabled) {
      state.lastResult = {
        version: 'recommendation-result-v3',
        context: cleanContext,
        generatedAt: Date.now(),
        disabled: true,
        reason: flags.reason,
        items: []
      };
      return state.lastResult;
    }

    const stats = await metaDB.getAllStats().catch(() => []);
    const source = resolveRecommendationDataSource(stats);
    const index = await trackProfiles.ensureIndex().catch(() => ({
      version: 'track-profiles-index-v4',
      items: {}
    }));
    const listener = source.fullIntel
      ? await listenerProfile.get().catch(() => null)
      : null;
    const listenerVectors = buildListenerVectors(listener);
    const controls = getRecommendationControls();
    const seed = new Date().toISOString().slice(0, 10);
    const currentUid = safe(window.playerCore?.getCurrentTrackUid?.());
    const currentPreview = currentUid ? index?.items?.[currentUid] || trackProfiles.getPreview(currentUid) : null;

    const candidates = Object.entries(index?.items || {})
      .filter(([uid]) => safe(uid) && uid !== currentUid)
      .map(([uid, preview]) => {
        if (blockedByControls(preview, controls)) return null;
        const semantic = semanticScore(preview, listenerVectors);
        const canonical = source.canonicalByUid.get(uid) || {};
        const local = source.localByUid.get(uid) || {};
            ...behavior,
            authority: source.authority,
        const reasonCode = sessionAffinity >= 0.72
          ? 'session_next'
          : semantic.total >= 0.12
            ? semanticReason(semantic.breakdown)
            : discovery
              ? 'discovery_unplayed'
              : 'semantic_preview';
        return {
          uid,
          score,
          reasonCode,
          breakdown: {
            semantic: semantic.total,
            sessionAffinity,
            sessionCoverage: num(sessionSimilarity?.coverage),
            ...behavior,
            authority: source.authority,
            ...semantic.breakdown
          }
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.score - left.score || left.uid.localeCompare(right.uid));

    const items = [];
    for (const candidate of candidates) {
      if (items.length >= Math.max(1, Number(limit) || 12)) break;
      if (!(await recommendationMemory.canShow(candidate.uid, cleanContext))) continue;
      items.push({ ...candidate, reasonText: getRecommendationReasonText(candidate.reasonCode) });
    }

    state.lastResult = {
      version: 'recommendation-result-v3',
      context: cleanContext,
      generatedAt: Date.now(),
      disabled: false,
      mode: source.mode,
      authority: source.authority,
      fullIntel: source.fullIntel,
      serverAvailable: source.serverAvailable,
      serverCorrected: source.serverCorrected === true,
      items
    };
    window.dispatchEvent(new CustomEvent('intel:recommendations:updated', { detail: state.lastResult }));
    return state.lastResult;
  },

  explain(code) {
    return getRecommendationReasonText(code);
  },

  getState() {
    return state.lastResult;
  }
};

export { scoreUid };
export default recommendationEngine;
