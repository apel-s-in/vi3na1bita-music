#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const [key, ...rest] = argument.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));

const uid = String(args.uid || '').trim();
if (!/^[A-Za-z0-9._-]+$/.test(uid)) throw new Error('Usage: node scripts/ci/generate-track-profile-review-context.mjs --uid=VS-01');

const catalog = JSON.parse(fs.readFileSync('data/listen-track-catalog.json', 'utf8'));
const track = (catalog.tracks || []).find(item => String(item.uid || '').trim() === uid);
if (!track) throw new Error(`track_not_found:${uid}`);

const inputDir = path.resolve('.analysis/track-profiles', uid);
const outputDir = path.resolve('.meta/track-profile-review');
const outputFile = path.join(outputDir, `${uid}.txt`);
const requiredInputs = ['run-1.json', 'run-2.json', 'run-3.json', 'lyrics.txt'];
const frameworkFiles = [
  'data/taxonomy.json',
  'data/track-profile-vocabulary.json',
  'data/track-profiles/track-profile.template.json',
  'data/track-profiles/PROMPT.txt',
  'data/track-profiles/FINALIZE-PROMPT.txt',
  'data/track-profiles/README.txt',
  'scripts/ci/normalize-track-profile.mjs',
  'scripts/ci/validate-intel-profiles.mjs',
  'scripts/ci/generate-track-profiles-index.mjs',
  'scripts/intel/track/track-similarity.js',
  'scripts/intel/recs/recommendation-engine.js'
];

requiredInputs.forEach(name => {
  const file = path.join(inputDir, name);
  if (!fs.existsSync(file)) throw new Error(`analysis_input_missing:${uid}:${name}`);
});

const block = (label, source) => `//=================================================\n// FILE: /${label}\n${source.trimEnd()}\n\n`;
let context = `TRACKPROFILE TRIPLE-ANALYSIS REVIEW CONTEXT\n\n`;
context += `Цель: подготовить один финальный production TrackProfile из трёх независимых анализов, точного текста и авторских уточнений.\n\n`;
context += `КАНОНИЧЕСКИЕ МЕТАДАННЫЕ ТРЕКА\n\n`;
context += `${JSON.stringify({
  uid: track.uid,
  title: track.title,
  album: track.album,
  albumTitle: track.albumTitle,
  duration: track.duration,
  trackVersion: track.trackVersion
}, null, 2)}\n\n`;
context += `ВАЖНО: title, album, albumTitle, duration и trackVersion нужны только для проверки контекста и не записываются в TrackProfile.\n\n`;

frameworkFiles.forEach(relative => {
  if (!fs.existsSync(relative)) throw new Error(`framework_file_missing:${relative}`);
  context += block(relative, fs.readFileSync(relative, 'utf8'));
});

requiredInputs.forEach(name => {
  context += block(`.analysis/track-profiles/${uid}/${name}`, fs.readFileSync(path.join(inputDir, name), 'utf8'));
});

const notes = path.join(inputDir, 'notes.txt');
context += block(`.analysis/track-profiles/${uid}/notes.txt`, fs.existsSync(notes)
  ? fs.readFileSync(notes, 'utf8')
  : 'Авторские уточнения не предоставлены.');

const currentProfile = path.join('data/track-profiles', track.album, `${uid}.json`);
if (fs.existsSync(currentProfile)) {
  context += block(`data/track-profiles/${track.album}/${uid}.json`, fs.readFileSync(currentProfile, 'utf8'));
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputFile, context, 'utf8');
console.log(`Generated ${outputFile}`);
