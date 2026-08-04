#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_ROOT = path.resolve('data/track-profiles');
const INDEX_PATH = path.resolve('data/track-profiles-index.json');
const album = 'v-ssore';
const albumTitle = 'В Ссоре';
const OUTPUT_DIR = path.join(OUTPUT_ROOT, album);

const specs = [
  ['VS-01', 'Живой', ['rock'], ['uplifting', 'energetic'], ['dreams_goals', 'heroism'], { energy: .78, valence: .66, arousal: .72, epicness: .64, family_friendly: .82 }],
  ['VS-02', 'Клаустрофобия', ['alternative_rock'], ['anxious', 'tense'], ['mental_health', 'self_reflection'], { energy: .62, valence: .22, arousal: .8, tension: .88, family_friendly: .55 }],
  ['VS-03', 'В ссоре', ['rock', 'pop'], ['angry', 'bitter'], ['love', 'breakup'], { energy: .74, valence: .28, arousal: .76, aggressiveness: .58, romance_intensity: .66 }],
  ['VS-04', 'Тише', ['ballad_pop'], ['calm', 'melancholic'], ['self_reflection', 'love'], { energy: .3, valence: .38, melancholy: .74, warmth: .62, family_friendly: .9 }],
  ['VS-05', 'Мирись', ['pop', 'rock'], ['hopeful', 'romantic'], ['love', 'friendship'], { energy: .58, valence: .76, romance_intensity: .8, warmth: .84, family_friendly: .95 }],
  ['VS-06', 'Monsieur Жор', ['rock'], ['funny', 'ironic'], ['humor', 'satire'], { energy: .7, valence: .68, humor: .9, storytelling: .55, family_friendly: .72 }],
  ['VS-07', 'Закатай губу', ['alternative_rock'], ['rebellious', 'sarcastic'], ['self_reflection', 'social_critique'], { energy: .82, valence: .42, aggressiveness: .72, humor: .55, socialness: .58 }],
  ['VS-08', 'Царевна', ['orchestral_pop', 'rock'], ['whimsical', 'epic'], ['magic_fantasy', 'storytelling'], { energy: .64, valence: .62, epicness: .86, storytelling: .9, family_friendly: .88 }],
  ['VS-09', 'Печаль', ['ballad_pop'], ['sad', 'melancholic'], ['loss_grief', 'self_reflection'], { energy: .24, valence: .14, melancholy: .94, warmth: .42, family_friendly: .85 }],
  ['VS-10', 'Любовь и Ненависть', ['rock', 'alternative_rock'], ['heartbroken', 'angry'], ['love', 'heartbreak'], { energy: .76, valence: .2, arousal: .8, romance_intensity: .9, tension: .74 }]
];

const weighted = values => Object.fromEntries(values.map((value, index) => [value, Math.max(.55, .85 - index * .15)]));
const similar = index => [specs[(index + 1) % specs.length][0], specs[(index + specs.length - 1) % specs.length][0]];

const build = (spec, index) => {
  const [uid, title, genres, moods, themes, axes] = spec;
  const finalProfile = {
    genres: weighted(genres),
    moods: weighted(moods),
    themes: weighted(themes),
    use_cases: { background: .55, walking: .5 },
    time_of_day: {},
    axes,
    warnings: {}
  };
  const presentation = {
    tagline_ru: `Тестовый профиль: ${title}`,
    hook_ru: 'Демонстрационная semantic-карточка',
    one_liner_ru: 'Произвольные данные для проверки технической работы INTEL.',
    mini_description_ru: 'Не является правдивым анализом музыки или текста.',
    hero_quote_ru: '',
    badges: ['TEST'],
    chips: [...genres, ...moods].slice(0, 4)
  };
  return {
    version: 'track-profile-v1',
    taxonomyVersion: 'taxonomy-v2',
    uid,
    title,
    album,
    albumTitle,
    status: 'test_fixture',
    testData: true,
    generatedAt: new Date().toISOString(),
    musicAnalysis: {
      source: 'test_fixture',
      verified: false,
      bpm: null,
      key: null,
      genres: finalProfile.genres,
      moods: finalProfile.moods,
      axes
    },
    lyricAnalysis: {
      source: 'test_fixture',
      verified: false,
      summary_ru: 'Демонстрационное описание. Требуется ручная замена правдивым анализом.',
      themes: finalProfile.themes,
      warnings: {}
    },
    finalProfile,
    presentation,
    relations: {
      similar_tracks: similar(index),
      relation_types: {
        semantic_preview: similar(index)
      }
    }
  };
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const profiles = specs.map(build);

profiles.forEach(profile => {
  const legacyPath = path.join(OUTPUT_ROOT, `${profile.uid}.json`);
  if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath);
  fs.writeFileSync(path.join(OUTPUT_DIR, `${profile.uid}.json`), `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
});

const items = Object.fromEntries(profiles.map(profile => [profile.uid, {
  uid: profile.uid,
  title: profile.title,
  album: profile.album,
  albumTitle: profile.albumTitle,
  profilePath: `${profile.album}/${profile.uid}.json`,
  status: profile.status,
  testData: true,
  finalProfile: profile.finalProfile,
  presentation: profile.presentation,
  relations: profile.relations
}]));

const generatedAt = new Date().toISOString();
const itemRows = Object.entries(items)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([uid, item], index, rows) => `    ${JSON.stringify(uid)}: ${JSON.stringify(item)}${index < rows.length - 1 ? ',' : ''}`);

const indexJson = [
  '{',
  '  "version": "track-profiles-index-v1",',
  `  "generatedAt": ${JSON.stringify(generatedAt)},`,
  '  "taxonomyVersion": "taxonomy-v2",',
  '  "testData": true,',
  '  "items": {',
  ...itemRows,
  '  }',
  '}',
  ''
].join('\n');

fs.writeFileSync(INDEX_PATH, indexJson, 'utf8');

console.log(`Generated ${profiles.length} explicit test TrackProfiles`);
