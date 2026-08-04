#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const fail = message => {
  console.error(`❌ ${message}`);
  process.exit(2);
};
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const index = read('data/track-profiles-index.json');
const taxonomy = read('data/taxonomy.json');
const catalog = read('data/listen-track-catalog.json');
const knownUids = new Set((catalog.tracks || []).map(item => String(item.uid || '')));
const groups = taxonomy.groups || {};
const semanticGroups = ['genres', 'moods', 'themes', 'use_cases', 'events', 'seasonality', 'time_of_day', 'axes', 'content_warnings'];

const validateWeights = (uid, group, values) => {
  if (!values || typeof values !== 'object' || Array.isArray(values)) fail(`${uid}: ${group} должен быть object`);
  const known = new Set(Object.keys(groups[group]?.items || {}));
  Object.entries(values).forEach(([key, weight]) => {
    if (!known.has(key)) fail(`${uid}: неизвестный ${group}.${key}`);
    if (!Number.isFinite(Number(weight)) || Number(weight) < 0 || Number(weight) > 1) fail(`${uid}: некорректный вес ${group}.${key}`);
  });
};

const items = index.items || {};
if (!Object.keys(items).length) {
  console.log('INTEL TrackProfile index is empty');
  process.exit(0);
}

for (const [uid, preview] of Object.entries(items)) {
  if (!knownUids.has(uid)) fail(`${uid}: отсутствует в listening catalog`);
  if (preview.uid !== uid) fail(`${uid}: preview uid mismatch`);
  const file = path.join('data/track-profiles', `${uid}.json`);
  if (!fs.existsSync(file)) fail(`${uid}: отсутствует full profile`);
  const profile = read(file);
  if (profile.uid !== uid) fail(`${uid}: full profile uid mismatch`);
  if (profile.taxonomyVersion !== index.taxonomyVersion) fail(`${uid}: taxonomy version mismatch`);
  if (index.testData === true && (profile.testData !== true || profile.status !== 'test_fixture')) fail(`${uid}: тестовый профиль не помечен явно`);

  const finalProfile = profile.finalProfile || {};
  semanticGroups.forEach(group => {
    const sourceKey = group === 'content_warnings' ? 'warnings' : group;
    validateWeights(uid, group, finalProfile[sourceKey] || {});
  });

  const similar = profile.relations?.similar_tracks || [];
  if (!Array.isArray(similar) || similar.some(item => !knownUids.has(String(item)))) fail(`${uid}: invalid similar_tracks`);
}

console.log(`✅ Validated ${Object.keys(items).length} TrackProfiles`);
