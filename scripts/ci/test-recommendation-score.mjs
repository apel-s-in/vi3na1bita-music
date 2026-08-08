#!/usr/bin/env node
import assert from 'node:assert/strict';
import { composeRecommendationScore, getRecommendationBehaviorSignals, getRecommendationFeedbackSignals, RECOMMENDATION_SCORE_WEIGHTS } from '../intel/recs/recommendation-score.js';
import { buildPersonalTasteAnchors, getTasteDiscoverySignals } from '../intel/recs/taste-discovery.js';

const discovery = getRecommendationBehaviorSignals({ fullListens: 0 });
assert.equal(discovery.discovery, 1);
assert.equal(discovery.saturationPenalty, 0);

const familiar = getRecommendationBehaviorSignals({ fullListens: 5, favorite: true });
assert.equal(familiar.discovery, 0);
assert.equal(familiar.favoriteAffinity, 1);
assert.equal(familiar.saturationPenalty, 0);

const saturated = getRecommendationBehaviorSignals({ fullListens: 15 });
assert.equal(saturated.saturationPenalty, 0.5);
assert.equal(getRecommendationBehaviorSignals({ fullListens: 25 }).saturationPenalty, 1);

const behavior = getRecommendationBehaviorSignals({
  fullListens: 2,
  validListens: 4,
  listenSeconds: 3600,
  averageCompletionRate: 0.8,
  microSkips: 2,
  earlySkips: 1,
  analysisEligibleSessions: 4,
  favorite: true,
  serverAvailable: true
});
assert.equal(behavior.confirmedAffinity, 0.75);
assert.equal(behavior.favoriteAffinity, 1);
assert.equal(behavior.completion, 0.8);
assert.equal(behavior.skipPenalty, 0.75);

const acceptedFeedback = getRecommendationFeedbackSignals({ shown: 3, clicked: 2, accepted: 1 });
assert.equal(acceptedFeedback.feedbackAffinity, 0.6);
assert.equal(acceptedFeedback.exposurePenalty, 0);

const ignoredFeedback = getRecommendationFeedbackSignals({ shown: 8, clicked: 0, accepted: 0 });
assert.equal(ignoredFeedback.feedbackAffinity, 0);
assert.equal(ignoredFeedback.exposurePenalty, 1);

const anchors = buildPersonalTasteAnchors([
  { uid: 'A', listenSeconds: 10000, fullListens: 20, averageCompletionRate: 0.95, focusRunMax: 12, favorite: true },
  { uid: 'B', listenSeconds: 5000, fullListens: 10, averageCompletionRate: 0.8, focusRunMax: 6 },
  { uid: 'C', listenSeconds: 100, fullListens: 0, averageCompletionRate: 0.2, focusRunMax: 1 }
], 2);
assert.deepEqual(anchors.map(row => row.uid), ['A', 'B']);

const underplayed = getTasteDiscoverySignals({
  candidate: { listenSeconds: 100, fullListens: 0, focusRunMax: 1 },
  anchors,
  anchorSimilarity: 0.9
});
const overplayed = getTasteDiscoverySignals({
  candidate: { listenSeconds: 10000, fullListens: 20, focusRunMax: 12 },
  anchors,
  anchorSimilarity: 0.9
});
assert.ok(underplayed.tasteDiscoveryAffinity > overplayed.tasteDiscoveryAffinity);

const neutralScore = composeRecommendationScore({ semantic: 0.5 });
const favoriteScore = composeRecommendationScore({ semantic: 0.5, favoriteAffinity: 1 });
const discoveryScore = composeRecommendationScore({ semantic: 0.5, discovery: 1 });
const saturatedScore = composeRecommendationScore({ semantic: 0.5, saturationPenalty: 1 });
const acceptedScore = composeRecommendationScore({ semantic: 0.5, feedbackAffinity: 1 });
const ignoredScore = composeRecommendationScore({ semantic: 0.5, exposurePenalty: 1 });
const tasteDiscoveryScore = composeRecommendationScore({ semantic: 0.5, tasteDiscoveryAffinity: 1 });
assert.equal(favoriteScore - neutralScore, RECOMMENDATION_SCORE_WEIGHTS.favoriteAffinity);
assert.equal(discoveryScore - neutralScore, RECOMMENDATION_SCORE_WEIGHTS.discovery);
assert.equal(saturatedScore - neutralScore, RECOMMENDATION_SCORE_WEIGHTS.saturationPenalty);
assert.equal(acceptedScore - neutralScore, RECOMMENDATION_SCORE_WEIGHTS.feedbackAffinity);
assert.equal(ignoredScore - neutralScore, RECOMMENDATION_SCORE_WEIGHTS.exposurePenalty);
assert.equal(tasteDiscoveryScore - neutralScore, RECOMMENDATION_SCORE_WEIGHTS.tasteDiscoveryAffinity);

console.log('✅ Pure recommendation discovery, favorite and saturation scoring passed');
