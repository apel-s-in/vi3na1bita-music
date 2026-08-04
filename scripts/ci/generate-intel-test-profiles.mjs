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
    version: 'track-profile-v3',
    taxonomyVersion: 'taxonomy-v3',
    vocabularyVersion: 'track-profile-vocabulary-v1',
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

const profileFiles = [];
for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = path.join(ROOT, entry.name);
  fs.readdirSync(directory, { withFileTypes: true })
    .filter(file => file.isFile() && file.name.endsWith('.json'))
    .forEach(file => profileFiles.push({
      album: entry.name,
      file: path.join(directory, file.name),
      relativePath: `${entry.name}/${file.name}`
    }));
}

const items = {};
profileFiles
  .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  .forEach(({ file, relativePath }) => {
    const profile = readJson(file);
    const uid = String(profile?.uid || '').trim();
    if (!uid || path.basename(file) !== `${uid}.json`) throw new Error(`profile_uid_path_mismatch:${relativePath}`);

    items[uid] = {
      uid,
      profilePath: relativePath,
      status: String(profile.status || ''),
      testData: profile.testData === true,
      musicAnalysis: profile.musicAnalysis || {},
      finalProfile: profile.finalProfile || {},
      presentation: profile.presentation || {}
    };
  });

const rows = Object.entries(items).map(([uid, item], index, all) =>
  `    ${JSON.stringify(uid)}: ${JSON.stringify(item)}${index < all.length - 1 ? ',' : ''}`
);

const indexJson = [
  '{',
  '  "version": "track-profiles-index-v3",',
  '  "taxonomyVersion": "taxonomy-v3",',
  '  "vocabularyVersion": "track-profile-vocabulary-v1",',
  `  "testData": ${Object.values(items).some(item => item.testData)},`,
  '  "items": {',
  ...rows,
  '  }',
  '}',
  ''
].join('\n');

fs.writeFileSync(INDEX_PATH, indexJson, 'utf8');
console.log(`Generated index for ${Object.keys(items).length} TrackProfiles`);
