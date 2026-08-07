#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('data/track-profiles');
const INDEX_PATH = path.resolve('data/track-profiles-index.json');
const album = 'v-ssore';
const outputDir = path.join(ROOT, album);

const specs = [
  ['VS-01', ['rock'], ['uplifting', 'energetic'], ['dreams_goals', 'heroism'], { energy: .78, valence: .66, arousal: .72, epicness: .64, family_friendly: .82 }],
  ['VS-02', ['alternative_rock'], ['anxious', 'tense'], ['mental_health', 'self_reflection'], { energy: .62, valence: .22, arousal: .8, tension: .88, family_friendly: .55 }],
  ['VS-03', ['rock', 'pop'], ['angry', 'bitter'], ['conflict', 'communication'], { energy: .74, valence: .28, arousal: .76, aggressiveness: .58, romance_intensity: .42 }],
  ['VS-04', ['ballad_pop'], ['calm', 'melancholic'], ['self_reflection', 'love'], { energy: .3, valence: .38, melancholy: .74, warmth: .62, family_friendly: .9 }],
  ['VS-05', ['pop', 'rock'], ['hopeful', 'romantic'], ['love', 'friendship'], { energy: .58, valence: .76, romance_intensity: .8, warmth: .84, family_friendly: .95 }],
  ['VS-06', ['rock'], ['funny', 'ironic'], ['humor', 'satire'], { energy: .7, valence: .68, humor: .9, storytelling: .55, family_friendly: .72 }],
  ['VS-07', ['alternative_rock'], ['rebellious', 'sarcastic'], ['self_reflection', 'social_critique'], { energy: .82, valence: .42, aggressiveness: .72, humor: .55, socialness: .58 }],
  ['VS-08', ['orchestral_pop', 'rock'], ['whimsical', 'epic'], ['magic_fantasy', 'storytelling'], { energy: .64, valence: .62, epicness: .86, storytelling: .9, family_friendly: .88 }],
  ['VS-09', ['ballad_pop'], ['sad', 'melancholic'], ['loss_grief', 'self_reflection'], { energy: .24, valence: .14, melancholy: .94, warmth: .42, family_friendly: .85 }],
  ['VS-10', ['rock', 'alternative_rock'], ['heartbroken', 'angry'], ['love', 'heartbreak'], { energy: .76, valence: .2, arousal: .8, romance_intensity: .9, tension: .74 }]
];

const axes = ['energy', 'valence', 'arousal', 'danceability', 'acousticness', 'instrumentalness', 'aggressiveness', 'melancholy', 'romance_intensity', 'humor', 'socialness', 'epicness', 'warmth', 'brightness', 'tension', 'storytelling', 'spookiness', 'family_friendly'];
const weighted = values => Object.fromEntries(values.map((value, index) => [value, Math.max(.55, .85 - index * .15)]));
const fullAxes = values => Object.fromEntries(axes.map(key => [key, Number(values?.[key] || 0)]));

const buildFixture = spec => {
  const [uid, genres, moods, themes, values] = spec;
  return {
    version: 'track-profile-v4',
    taxonomyVersion: 'taxonomy-v3',
    vocabularyVersion: 'track-profile-vocabulary-v2',
    uid,
    status: 'test_fixture',
    testData: true,
    musicAnalysis: {
      confidence: 0,
      bpm: null,
      tempoClass: null,
      key: null,
      mode: null,
      timeSignature: null,
      loudnessLufs: null,
      dynamicRange: null,
      technicalConfidence: { bpm: 0, key: 0, loudnessLufs: 0, dynamicRange: 0 },
      instrumentation: {},
      vocalPresence: null,
      vocalRoles: {},
      vocalDelivery: {},
      arrangementTags: {},
      productionTags: {},
      arrangementDescription_ru: '',
      productionDescription_ru: ''
    },
    lyricAnalysis: {
      confidence: 0,
      language: 'unknown',
      summary_ru: 'Демонстрационный профиль без фактического анализа.',
      keywords_ru: [],
      entities_ru: [],
      scenes_ru: [],
      narrative: { type: 'none', perspective: 'unspecified', arc_ru: '', characters_ru: [] },
      sensitiveContentNotes_ru: []
    },
    finalProfile: {
      genres: weighted(genres),
      styles: {},
      moods: weighted(moods),
      themes: weighted(themes),
      use_cases: { background: .55, walking: .5 },
      time_of_day: {},
      axes: fullAxes(values),
      warnings: {}
    },
    presentation: {
      tagline_ru: 'Временный демонстрационный профиль.',
      one_liner_ru: 'Произвольные данные только для проверки технической работы интеллектуального слоя.',
      mini_description_ru: 'Не является фактическим анализом музыки или текста.'
    }
  };
};

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

fs.mkdirSync(outputDir, { recursive: true });

specs.forEach(spec => {
  const file = path.join(outputDir, `${spec[0]}.json`);
  let current = null;
  try {
    current = readJson(file);
  } catch {}

  if (current?.status === 'analyzed' && current?.testData === false) {
    console.log(`KEEP ${spec[0]} analyzed`);
    return;
  }

  writeJson(file, buildFixture(spec));
  console.log(`FIXTURE ${spec[0]}`);
});
console.log('Fixtures updated. Run generate-track-profiles-index.mjs to rebuild the shared index.');
