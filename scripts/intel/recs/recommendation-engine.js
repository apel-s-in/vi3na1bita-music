// UID.054_(Recommendation engine core)_(собрать все рекомендации в одном месте)_(engine должен принимать context и возвращать explainable result)
// UID.055_(Recommendation strategies)_(легко расширять rec-логику)_(движок должен работать через набор scorer-модулей)
// UID.056_(Recommendation reasons)_(возвращать объяснения вместе с результатами)_(формировать reasonCode/humanText рядом с uid)
// UID.060_(Session-aware next-track strategy)_(подбирать следующий трек под текущую сессию)_(держать context slot в engine API)
// UID.061_(Community-driven recommendations)_(готовить future recs по похожим слушателям)_(оставить strategy hook, но пока без давления на runtime)
// UID.063_(Profile recs tab upgrade)_(иметь один источник recs для профиля и витрины)_(этот engine станет входом для Profile/Showcase/UI)

import { recommendationStrategies } from './recommendation-strategies.js';
import { getRecommendationReasonText } from './recommendation-reasons.js';
import { rediscovery } from './rediscovery.js';

const state = {
  lastResult: null
};

export const recommendationEngine = {
  async init() {
    return true;
  },

  async recommend({ limit = 12, context = 'generic' } = {}) {
    state.lastResult = {
      version: 'recommendation-result-v1',
      context,
      items: [],
      reasons: [],
      debug: {
        limit,
        strategies: Object.keys(recommendationStrategies)
      }
    };
    window.dispatchEvent(new CustomEvent('intel:recommendations:updated', { detail: state.lastResult }));
    return state.lastResult;
  },

  async explain(code) {
    return getRecommendationReasonText(code);
  },

  async getRediscovery() {
    return rediscovery.getCandidates();
  },

  getState() {
    return state.lastResult;
  }
};

export default recommendationEngine;
