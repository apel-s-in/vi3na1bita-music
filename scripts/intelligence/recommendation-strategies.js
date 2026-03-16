/* RECOMMENDATION STRATEGIES — future scorer registry for modular recommendation growth. */
// UID.091_recommendation_strategies_registry_(держать стратегии отдельно)_(для расширяемости)_(new scorers append here only)
// UID.094_taste_fit_recommendations_(strategy placeholder)_(для user taste matching)_(listenerProfile vs finalProfile)
// UID.095_mood_fit_recommendations_(strategy placeholder)_(для emotional matching)_(moods+axes)
// UID.096_theme_fit_recommendations_(strategy placeholder)_(для смыслового matching)_(themes+storytelling)
// UID.097_use_case_fit_recommendations_(strategy placeholder)_(для сценарного matching)_(use_cases + context)
// UID.099_rediscovery_recommendations_(strategy placeholder)_(для forgotten hits)_(recall prior affinity)
// UID.100_exploration_recommendations_(strategy placeholder)_(для hidden gems)_(novel compatible candidates)
// UID.103_community_recommendations_(strategy placeholder)_(для cohort/similar listeners)_(future global aggregates)

const scoreZero = () => 0;

export const recommendationStrategies = {
  id: 'recommendation-strategies',
  version: '0.0.1-stub',
  registry: Object.freeze({
    tasteFit: scoreZero,
    moodFit: scoreZero,
    themeFit: scoreZero,
    useCaseFit: scoreZero,
    audioSimilarity: scoreZero,
    rediscovery: scoreZero,
    exploration: scoreZero,
    collectionDriven: scoreZero,
    sessionNext: scoreZero,
    communityFit: scoreZero
  })
};

export default recommendationStrategies;
