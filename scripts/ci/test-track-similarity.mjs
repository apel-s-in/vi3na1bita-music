#!/usr/bin/env node
import assert from 'node:assert/strict';
import { scoreTonalitySimilarity, scoreTrackSimilarity, TRACK_SIMILARITY_WEIGHTS } from '../intel/track/track-similarity.js';

const profile = ({ loudnessLufs, dynamicRange, confidence, bpmConfidence = 0.9, keyConfidence = 0.9 }) => ({
  musicAnalysis: {
    bpm: 128,
    key: 'F_sharp',
    mode: 'minor',
    loudnessLufs,
    dynamicRange,
    technicalConfidence: {
      bpm: bpmConfidence,
      key: keyConfidence,
      loudnessLufs: confidence,
      dynamicRange: confidence
    },
    instrumentation: { electric_guitar: 0.8 },
    vocalRoles: { mixed_duet: 0.8 },
    vocalDelivery: { expressive: 0.8 },
    arrangementTags: { dynamic_contrast: 0.8 },
    productionTags: { dense: 0.8 }
  },
  finalProfile: {
    genres: { alternative_rock: 0.8 },
    styles: { anthemic: 0.7 },
    moods: { energetic: 0.8 },
    themes: { conflict: 0.7 },
    use_cases: { driving: 0.7 },
    time_of_day: { evening: 0.6 },
    axes: { energy: 0.8, valence: 0.3 }
  }
});

const trusted = scoreTrackSimilarity(
  profile({ loudnessLufs: -6.5, dynamicRange: 6, confidence: 0.8 }),
  profile({ loudnessLufs: -7, dynamicRange: 7, confidence: 0.8 })
);
assert.equal(typeof trusted.breakdown.loudnessLufs, 'number');
assert.equal(typeof trusted.breakdown.dynamicRange, 'number');

const uncertain = scoreTrackSimilarity(
  profile({ loudnessLufs: -6.5, dynamicRange: 6, confidence: 0.4 }),
  profile({ loudnessLufs: -7, dynamicRange: 7, confidence: 0.8 })
);
assert.equal('loudnessLufs' in uncertain.breakdown, false);
assert.equal('dynamicRange' in uncertain.breakdown, false);
assert.ok(trusted.coverage > uncertain.coverage);

const uncertainTempo = scoreTrackSimilarity(
  profile({ loudnessLufs: -6.5, dynamicRange: 6, confidence: 0.8, bpmConfidence: 0.4, keyConfidence: 0.4 }),
  profile({ loudnessLufs: -7, dynamicRange: 7, confidence: 0.8 })
);
assert.equal('bpm' in uncertainTempo.breakdown, false);
assert.equal('tonality' in uncertainTempo.breakdown, false);
assert.ok(trusted.coverage > uncertainTempo.coverage);

const tonal = (key, mode, confidence = 1) => ({
  musicAnalysis: {
    key,
    mode,
    technicalConfidence: { key: confidence }
  }
});

assert.ok(Math.abs(Object.values(TRACK_SIMILARITY_WEIGHTS).reduce((sum, weight) => sum + weight, 0) - 1) < 1e-12);
assert.equal(scoreTonalitySimilarity(tonal('A', 'minor'), tonal('A', 'minor')), 1);
assert.equal(scoreTonalitySimilarity(tonal('A', 'minor'), tonal('C', 'major')), 0.9);
assert.equal(scoreTonalitySimilarity(tonal('A', 'minor'), tonal('A', 'major')), 0.78);
assert.equal(scoreTonalitySimilarity(tonal('A', 'minor'), tonal('E', 'minor')), 0.72);
assert.equal(scoreTonalitySimilarity(tonal('A', 'minor', 0.4), tonal('A', 'minor')), null);

console.log('✅ Technical and harmonic TrackProfile similarity passed');
