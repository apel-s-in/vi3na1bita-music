#!/usr/bin/env node
import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const [key, ...rest] = argument.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));

const input = String(args.input || '').trim();
const output = String(args.output || '').trim();
const forcedUid = String(args.uid || '').trim();
if (!input || !fs.existsSync(input)) throw new Error('Usage: node scripts/ci/normalize-track-profile.mjs --input=file.json [--output=file.json] [--uid=VS-01]');

const vocabulary = JSON.parse(fs.readFileSync('data/track-profile-vocabulary.json', 'utf8'));
const profile = JSON.parse(fs.readFileSync(input, 'utf8'));
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const number = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = value => Math.max(0, Math.min(1, number(value, 0)));
const canonicalKey = value => String(value == null ? '' : value).trim();

const resolveAlias = (group, value) => {
  const raw = canonicalKey(value);
  const aliases = vocabulary.aliases?.[group] || {};
  return canonicalKey(aliases[raw] || aliases[raw.toLowerCase()] || raw);
};

const normalizeMap = (group, raw, canonical) => {
  const source = object(raw) ? raw : Array.isArray(raw) ? Object.fromEntries(raw.map(value => [value, 0.5])) : {};
  const allowed = new Set(Object.keys(canonical || {}));
  const normalized = {};

  Object.entries(source).forEach(([key, value]) => {
    const resolved = resolveAlias(group, key);
    if (!allowed.has(resolved)) {
      console.warn(`UNKNOWN ${group}.${key}`);
      return;
    }
    normalized[resolved] = Math.max(normalized[resolved] || 0, clamp(value));
  });

  return Object.fromEntries(Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right)));
};

const normalizeEnum = (group, value, canonical, fallback = null) => {
  if (value == null || value === '') return fallback;
  const resolved = resolveAlias(group, value);
  return Object.prototype.hasOwnProperty.call(canonical || {}, resolved) ? resolved : fallback;
};

const parseKeyAndMode = music => {
  const raw = canonicalKey(music.key);
  let key = raw;
  let mode = canonicalKey(music.mode).toLowerCase() || null;

  const compact = raw.match(/^([A-Ga-g])([#b]?)(?:\s*(major|minor|maj|min|m))?$/i);
  if (compact) {
    key = `${compact[1].toUpperCase()}${compact[2] || ''}`;
    const suffix = String(compact[3] || '').toLowerCase();
    if (suffix) mode = ['m', 'min', 'minor'].includes(suffix) ? 'minor' : 'major';
  } else {
    const words = raw.match(/^([A-Ga-g])([#b]?)\s+(major|minor)$/i);
    if (words) {
      key = `${words[1].toUpperCase()}${words[2] || ''}`;
      mode = words[3].toLowerCase();
    }
  }

  music.key = normalizeEnum('keys', key, vocabulary.keys);
  music.mode = normalizeEnum('modes', mode, vocabulary.modes);
};

profile.version = 'track-profile-v4';
profile.taxonomyVersion = 'taxonomy-v3';
profile.vocabularyVersion = 'track-profile-vocabulary-v2';
if (forcedUid) profile.uid = forcedUid;

const music = profile.musicAnalysis ||= {};
music.confidence = clamp(music.confidence);
music.bpm = number(music.bpm);
music.tempoClass = normalizeEnum('tempoClasses', music.tempoClass, vocabulary.tempoClasses);
parseKeyAndMode(music);
music.timeSignature = normalizeEnum('timeSignatures', music.timeSignature, vocabulary.timeSignatures);
music.loudnessLufs = number(music.loudnessLufs);
music.dynamicRange = number(music.dynamicRange);
music.technicalConfidence = {
  bpm: clamp(music.technicalConfidence?.bpm ?? (music.bpm == null ? 0 : 0.5)),
  key: clamp(music.technicalConfidence?.key ?? (music.key == null ? 0 : 0.5)),
  loudnessLufs: clamp(music.technicalConfidence?.loudnessLufs ?? (music.loudnessLufs == null ? 0 : 0.35)),
  dynamicRange: clamp(music.technicalConfidence?.dynamicRange ?? (music.dynamicRange == null ? 0 : 0.35))
};
music.instrumentation = normalizeMap('instrumentation', music.instrumentation, vocabulary.instrumentation);
music.vocalRoles = normalizeMap('vocalRoles', music.vocalRoles, vocabulary.vocalRoles);
music.vocalDelivery = normalizeMap('vocalDelivery', music.vocalDelivery, vocabulary.vocalDelivery);
music.arrangementTags = normalizeMap('arrangementTags', music.arrangementTags, vocabulary.arrangementTags);
music.productionTags = normalizeMap('productionTags', music.productionTags, vocabulary.productionTags);
music.vocalPresence = music.vocalPresence == null ? null : clamp(music.vocalPresence);

const lyrics = profile.lyricAnalysis ||= {};
lyrics.confidence = clamp(lyrics.confidence);
lyrics.language = normalizeEnum('languages', lyrics.language, vocabulary.languages, 'unknown');
lyrics.narrative ||= {};
lyrics.narrative.type = normalizeEnum('narrativeTypes', lyrics.narrative.type, vocabulary.narrativeTypes, 'none');
lyrics.narrative.perspective = normalizeEnum('narrativePerspectives', lyrics.narrative.perspective, vocabulary.narrativePerspectives, 'unspecified');

const text = `${JSON.stringify(profile, null, 2)}\n`;
if (output) {
  fs.writeFileSync(output, text, 'utf8');
  console.log(`Normalized ${input} → ${output}`);
} else {
  process.stdout.write(text);
}
