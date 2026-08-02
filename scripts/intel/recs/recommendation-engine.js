// Единый детерминированный Recommendation Engine.
// Возвращает кандидатов, но никогда не управляет playback.
import { metaDB } from '../../analytics/meta-db.js';
import { recommendationMemory } from '../../analytics/backup-domain-state.js';
import { getRecommendationReasonText } from './recommendation-reasons.js';

const safe = value => String(value == null ? '' : value).trim();
const scoreUid = (uid, seed) => {
  const text = `${seed}:${uid}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const state = { lastResult: null };

export const recommendationEngine = {
  async init() {
    await recommendationMemory.init();
    return true;
  },

  async recommend({ limit = 12, context = 'generic' } = {}) {
    const cleanContext = safe(context || 'generic');
    const stats = await metaDB.getAllStats().catch(() => []);
    const played = new Set(stats.filter(row => Number(row?.globalFullListenCount || 0) > 0).map(row => safe(row.uid)));
    const seed = new Date().toISOString().slice(0, 10);
    const candidates = (window.TrackRegistry?.getAllUids?.() || [])
      .map(safe)
      .filter(Boolean)
      .filter(uid => !played.has(uid))
      .map(uid => ({ uid, score: scoreUid(uid, seed), reasonCode: 'collection_fit' }))
      .sort((left, right) => left.score - right.score || left.uid.localeCompare(right.uid));

    const items = [];
    for (const candidate of candidates) {
      if (items.length >= Math.max(1, Number(limit) || 12)) break;
      if (!(await recommendationMemory.canShow(candidate.uid, cleanContext))) continue;
      items.push({
        ...candidate,
        reasonText: getRecommendationReasonText(candidate.reasonCode)
      });
    }

    state.lastResult = {
      version: 'recommendation-result-v2',
      context: cleanContext,
      generatedAt: Date.now(),
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

export default recommendationEngine;
