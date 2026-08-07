#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve('data/track-profiles');
const OUTPUT = path.resolve('data/track-profiles-index.json');
const catalog = JSON.parse(fs.readFileSync('data/listen-track-catalog.json', 'utf8'));
const catalogByUid = new Map((catalog.tracks || []).map(track => [String(track.uid || '').trim(), track]));
const files = [];

for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = path.join(ROOT, entry.name);
  for (const file of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!file.isFile() || !file.name.endsWith('.json')) continue;
    files.push({
      album: entry.name,
      absolute: path.join(directory, file.name),
      relative: `${entry.name}/${file.name}`
    });
  }
}

const items = {};
files.sort((left, right) => left.relative.localeCompare(right.relative)).forEach(({ album, absolute, relative }) => {
  const profile = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  const uid = String(profile?.uid || '').trim();
  const catalogTrack = catalogByUid.get(uid);

  if (!uid || path.basename(absolute) !== `${uid}.json`) throw new Error(`profile_uid_path_mismatch:${relative}`);
  if (!catalogTrack) throw new Error(`profile_uid_not_in_catalog:${uid}`);
  if (String(catalogTrack.album || '') !== album) throw new Error(`profile_album_mismatch:${uid}`);
  if (items[uid]) throw new Error(`duplicate_profile_uid:${uid}`);

  items[uid] = {
    uid,
    profilePath: relative,
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

const output = [
  '{',
  '  "version": "track-profiles-index-v4",',
  '  "taxonomyVersion": "taxonomy-v3",',
  '  "vocabularyVersion": "track-profile-vocabulary-v2",',
  `  "testData": ${Object.values(items).some(item => item.testData)},`,
  '  "items": {',
  ...rows,
  '  }',
  '}',
  ''
].join('\n');

fs.writeFileSync(OUTPUT, output, 'utf8');
console.log(`Generated ${OUTPUT} for ${Object.keys(items).length} TrackProfiles`);
