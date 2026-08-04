#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const fail = message => {
  console.error(`❌ ${message}`);
  process.exit(2);
};
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const safe = value => String(value == null ? '' : value).trim();
const keys = value => new Set(Object.keys(value || {}));
const indexPath = 'data/track-profiles-index.json';
const templatePath = 'data/track-profiles/track-profile.template.json';
const vocabularyPath = 'data/track-profile-vocabulary.json';
const indexSource = fs.readFileSync(indexPath, 'utf8');
const index = read(indexPath);
const template = read(templatePath);
const vocabulary = read(vocabularyPath);
const taxonomy = read('data/taxonomy.json');
const catalog = read('data/listen-track-catalog.json');
const catalogByUid = new Map((catalog.tracks || []).map(track => [safe(track.uid), track]));
const threshold = Number(taxonomy.defaults?.threshold_store || 0.05);
const semanticGroups = ['genres', 'styles', 'moods', 'themes', 'use_cases', 'time_of_day'];
const bannedKeys = new Set(['trackVersion', 'title', 'album', 'albumTitle', 'durationSec', 'source', 'analyzer', 'analyzedAt', 'generatedAt', 'updatedAt', 'provenance', 'verified', 'loudnessLufs', 'dynamicRange', 'dynamicRangeLra', 'relations', 'embedding']);
const machinePattern = /^[a-z][a-z0-9_]*$/;
const allowedTopKeys = new Set(['version', 'taxonomyVersion', 'vocabularyVersion', 'uid', 'status', 'testData', 'musicAnalysis', 'lyricAnalysis', 'finalProfile', 'presentation']);

if (template.version !== 'track-profile-v3' || template.uid !== '__TEMPLATE__' || template.status !== 'template') fail('Некорректный TrackProfile template v3');
if (taxonomy.taxonomyVersion !== 'taxonomy-v3') fail('Требуется taxonomy-v3');
if (vocabulary.version !== 'track-profile-vocabulary-v1') fail('Некорректный audio vocabulary');
if (index.version !== 'track-profiles-index-v3') fail('Требуется track-profiles-index-v3');
if (index.taxonomyVersion !== taxonomy.taxonomyVersion) fail('Index taxonomy version mismatch');
if (index.vocabularyVersion !== vocabulary.version) fail('Index vocabulary version mismatch');

const walkBanned = (uid, value, prefix = '') => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkBanned(uid, item, `${prefix}[${index}]`));
    return;
  }
  if (!object(value)) return;
  Object.entries(value).forEach(([key, item]) => {
    if (bannedKeys.has(key)) fail(`${uid}: запрещённое поле ${prefix ? `${prefix}.` : ''}${key}`);
    walkBanned(uid, item, prefix ? `${prefix}.${key}` : key);
  });
};

const validateMachineMap = (uid, name, values, vocabularyValues) => {
  if (!object(values)) fail(`${uid}: ${name} должен быть object`);
  const allowed = keys(vocabularyValues);
  Object.entries(values).forEach(([key, weight]) => {
    if (!machinePattern.test(key)) fail(`${uid}: ${name}.${key} не является canonical snake_case ID`);
    if (!allowed.has(key)) fail(`${uid}: неизвестный ${name}.${key}`);
    if (!Number.isFinite(Number(weight)) || Number(weight) < threshold || Number(weight) > 1) fail(`${uid}: некорректный вес ${name}.${key}`);
  });
};

const validateTaxonomyMap = (uid, group, values) => {
  if (!object(values)) fail(`${uid}: ${group} должен быть object`);
  const allowed = keys(taxonomy.groups?.[group]?.items);
  Object.entries(values).forEach(([key, weight]) => {
    if (!allowed.has(key)) fail(`${uid}: неизвестный ${group}.${key}`);
    if (!Number.isFinite(Number(weight)) || Number(weight) < threshold || Number(weight) > 1) fail(`${uid}: некорректный вес ${group}.${key}`);
  });
};

const validateRussianText = (uid, name, value) => {
  if (typeof value !== 'string') fail(`${uid}: ${name} должен быть string`);
  if (/[A-Za-z]/.test(value)) fail(`${uid}: ${name} содержит английский текст`);
};

const validateRussianArray = (uid, name, values) => {
  if (!Array.isArray(values)) fail(`${uid}: ${name} должен быть array`);
  values.forEach((value, index) => validateRussianText(uid, `${name}[${index}]`, value));
};

const validateNullableEnum = (uid, name, value, allowed) => {
  if (value == null) return;
  if (!allowed.has(String(value))) fail(`${uid}: неизвестное значение ${name}=${value}`);
};

const items = index.items || {};
if (!Object.keys(items).length) fail('TrackProfile index пуст');

for (const [uid, preview] of Object.entries(items)) {
  if (!catalogByUid.has(uid)) fail(`${uid}: отсутствует в listening catalog`);
  if (preview.uid !== uid) fail(`${uid}: preview uid mismatch`);

  const escapedUid = uid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp(`^    "${escapedUid}": \\{.*\\},?$`, 'm').test(indexSource)) fail(`${uid}: preview должен занимать одну строку`);

  const album = safe(catalogByUid.get(uid)?.album);
  const expectedPath = `${album}/${uid}.json`;
  if (preview.profilePath !== expectedPath) fail(`${uid}: profilePath должен быть ${expectedPath}`);

  const file = path.join('data/track-profiles', expectedPath);
  if (!fs.existsSync(file)) fail(`${uid}: отсутствует ${file}`);
  const profile = read(file);

  if (profile.uid !== uid) fail(`${uid}: full profile uid mismatch`);
  if (profile.version !== 'track-profile-v3') fail(`${uid}: требуется track-profile-v3`);
  if (profile.taxonomyVersion !== taxonomy.taxonomyVersion) fail(`${uid}: taxonomy version mismatch`);
  if (profile.vocabularyVersion !== vocabulary.version) fail(`${uid}: vocabulary version mismatch`);
  if (![...allowedTopKeys].every(key => key in profile) || Object.keys(profile).some(key => !allowedTopKeys.has(key))) fail(`${uid}: top-level структура не совпадает с v3`);
  if (!['analyzed', 'test_fixture'].includes(profile.status)) fail(`${uid}: недопустимый status`);
  if (profile.status === 'test_fixture' && profile.testData !== true) fail(`${uid}: fixture должен иметь testData=true`);
  if (profile.status === 'analyzed' && profile.testData !== false) fail(`${uid}: analyzed должен иметь testData=false`);

  walkBanned(uid, profile);

  const music = profile.musicAnalysis;
  const lyrics = profile.lyricAnalysis;
  const finalProfile = profile.finalProfile;
  if (!object(music) || !object(lyrics) || !object(finalProfile)) fail(`${uid}: отсутствуют обязательные analysis sections`);

  if (!Number.isFinite(Number(music.confidence)) || Number(music.confidence) < 0 || Number(music.confidence) > 1) fail(`${uid}: music confidence вне 0..1`);
  if (music.bpm != null && (!Number.isFinite(Number(music.bpm)) || Number(music.bpm) < 30 || Number(music.bpm) > 260)) fail(`${uid}: BPM вне допустимого диапазона`);
  validateNullableEnum(uid, 'tempoClass', music.tempoClass, keys(vocabulary.tempoClasses));
  validateNullableEnum(uid, 'key', music.key, keys(vocabulary.keys));
  validateNullableEnum(uid, 'mode', music.mode, keys(vocabulary.modes));
  validateNullableEnum(uid, 'timeSignature', music.timeSignature, keys(vocabulary.timeSignatures));

  validateMachineMap(uid, 'instrumentation', music.instrumentation, vocabulary.instrumentation);
  validateMachineMap(uid, 'vocalRoles', music.vocalRoles, vocabulary.vocalRoles);
  validateMachineMap(uid, 'vocalDelivery', music.vocalDelivery, vocabulary.vocalDelivery);
  validateMachineMap(uid, 'arrangementTags', music.arrangementTags, vocabulary.arrangementTags);
  validateMachineMap(uid, 'productionTags', music.productionTags, vocabulary.productionTags);

  if (music.vocalPresence != null && (!Number.isFinite(Number(music.vocalPresence)) || Number(music.vocalPresence) < 0 || Number(music.vocalPresence) > 1)) fail(`${uid}: vocalPresence вне 0..1`);
  validateRussianText(uid, 'arrangementDescription_ru', music.arrangementDescription_ru);
  validateRussianText(uid, 'productionDescription_ru', music.productionDescription_ru);

  if (!Number.isFinite(Number(lyrics.confidence)) || Number(lyrics.confidence) < 0 || Number(lyrics.confidence) > 1) fail(`${uid}: lyric confidence вне 0..1`);
  validateNullableEnum(uid, 'language', lyrics.language, keys(vocabulary.languages));
  validateRussianText(uid, 'summary_ru', lyrics.summary_ru);
  validateRussianArray(uid, 'keywords_ru', lyrics.keywords_ru);
  validateRussianArray(uid, 'entities_ru', lyrics.entities_ru);
  validateRussianArray(uid, 'scenes_ru', lyrics.scenes_ru);
  validateRussianArray(uid, 'sensitiveContentNotes_ru', lyrics.sensitiveContentNotes_ru);

  validateNullableEnum(uid, 'narrative.type', lyrics.narrative?.type, keys(vocabulary.narrativeTypes));
  validateNullableEnum(uid, 'narrative.perspective', lyrics.narrative?.perspective, keys(vocabulary.narrativePerspectives));
  validateRussianText(uid, 'narrative.arc_ru', lyrics.narrative?.arc_ru);
  validateRussianArray(uid, 'narrative.characters_ru', lyrics.narrative?.characters_ru);

  semanticGroups.forEach(group => validateTaxonomyMap(uid, group, finalProfile[group]));
  validateTaxonomyMap(uid, 'content_warnings', finalProfile.warnings);

  const axisKeys = Object.keys(taxonomy.groups?.axes?.items || {});
  if (!object(finalProfile.axes) || Object.keys(finalProfile.axes).length !== axisKeys.length) fail(`${uid}: axes должны содержать все канонические оси`);
  axisKeys.forEach(key => {
    const value = Number(finalProfile.axes[key]);
    if (!Number.isFinite(value) || value < 0 || value > 1) fail(`${uid}: axis ${key} вне 0..1`);
  });

  validateRussianText(uid, 'presentation.tagline_ru', profile.presentation?.tagline_ru);
  validateRussianText(uid, 'presentation.one_liner_ru', profile.presentation?.one_liner_ru);
  validateRussianText(uid, 'presentation.mini_description_ru', profile.presentation?.mini_description_ru);
}

console.log(`✅ Validated ${Object.keys(items).length} TrackProfiles v3`);
