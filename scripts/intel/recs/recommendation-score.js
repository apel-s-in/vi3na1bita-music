// Pure behavioral scoring for Recommendation Engine.
// Не читает storage, DOM, window, сеть и не управляет playback.
const num = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const clamp = value => Math.max(0, Math.min(1, num(value)));

export const RECOMMENDATION_SCORE_WEIGHTS = Object.freeze({
  semantic: 100,
  sessionAffinity: 10,
  confirmedAffinity: 4,
  favoriteAffinity: 4,
  feedbackAffinity: 5,
  discovery: 2,
  completion: 2,
  skipPenalty: -8,
  saturationPenalty: -6,
  exposurePenalty: -3
});

export const getRecommendationBehaviorSignals = ({
  fullListens = 0,
  validListens = 0,
  listenSeconds = 0,
  averageCompletionRate = 0,
  microSkips = 0,
  earlySkips = 0,
  analysisEligibleSessions = 0,
  favorite = false,
  serverAvailable = false
} = {}) => {
  const full = num(fullListens);
  const sessions = Math.max(1, num(analysisEligibleSessions));
  return {
    confirmedAffinity: serverAvailable ? clamp((num(validListens) + num(listenSeconds) / 1800) / 8) : 0,
    favoriteAffinity: favorite === true ? 1 : 0,
    discovery: full === 0 ? 1 : 0,
    completion: clamp(averageCompletionRate),
    skipPenalty: clamp((num(microSkips) + num(earlySkips)) / sessions),
    saturationPenalty: clamp(Math.max(0, full - 5) / 20)
  };
};

export const getRecommendationFeedbackSignals = ({
  shown = 0,
  clicked = 0,
  accepted = 0
} = {}) => {
  const views = num(shown);
  const clicks = num(clicked);
  const accepts = num(accepted);
  return {
    feedbackAffinity: clamp((accepts * 2 + clicks * 0.5) / 5),
    exposurePenalty: clamp(Math.max(0, views - clicks - accepts) / 8)
  };
};

export const composeRecommendationScore = ({
  semantic = 0,
  sessionAffinity = 0,
  confirmedAffinity = 0,
  favoriteAffinity = 0,
  feedbackAffinity = 0,
  discovery = 0,
  completion = 0,
  skipPenalty = 0,
  saturationPenalty = 0,
  exposurePenalty = 0,
  deterministicTie = 0
} = {}) => {
  const values = { semantic, sessionAffinity, confirmedAffinity, favoriteAffinity, feedbackAffinity, discovery, completion, skipPenalty, saturationPenalty, exposurePenalty };
  return Object.entries(RECOMMENDATION_SCORE_WEIGHTS).reduce((sum, [key, weight]) => sum + clamp(values[key]) * weight, num(deterministicTie));
};

export default { RECOMMENDATION_SCORE_WEIGHTS, getRecommendationBehaviorSignals, getRecommendationFeedbackSignals, composeRecommendationScore };
