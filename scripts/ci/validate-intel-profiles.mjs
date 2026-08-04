#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const fail = message => {
  console.error(`❌ ${message}`);
  process.exit(2);
};
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const indexPath = 'data/track-profiles-index.json';
const indexSource = fs.readFileSync(indexPath, 'utf8');
const index = read(indexPath);
const taxonomy = read('data/taxonomy.json');
const catalog = read('data/listen-track-catalog.json');
const knownUids = new Set((catalog.tracks || []).map(item => String(item.uid || '')));
const groups = taxonomy.groups || {};
const semanticGroups = ['genres', 'styles', 'moods', 'themes', 'use_cases', 'time_of_day', 'axes', 'content_warnings'];
const albums = new Set((JSON.parse(fs.readFileSync('albums.json', 'utf8')).albums || []).map(item => String(item.key || '')).filter(Boolean));
const templatePath = 'data/track-profiles/track-profile.template.json';
if (!fs.existsSync(templatePath)) fail('Отсутствует эталонный track-profile.template.json');
const template = read(templatePath);
if (template.uid !== '__TEMPLATE__' || template.status !== 'template' || template.version !== 'track-profile-v2') fail('Некорректный эталон TrackProfile');
if (fs.existsSync('data/recommendation-calendar.json')) fail('Праздничный recommendation-calendar должен быть удалён');
if ('events' in (template.finalProfile || {}) || 'seasonality' in (template.finalProfile || {})) fail('Эталон TrackProfile содержит удалённые календарные поля');
if ('relations' in template) fail('Эталон TrackProfile содержит производные UID-связи');
if ('updatedAt' in template) fail('Эталон TrackProfile содержит изменяемый updatedAt');
if (template.musicAnalysis?.embedding || template.lyricAnalysis?.embedding) fail('Эталон TrackProfile содержит model-specific embedding');

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
  const escapedUid = uid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const itemLine = new RegExp(`^    "${escapedUid}": \\{.*\\},?$`, 'm');
  if (!itemLine.test(indexSource)) fail(`${uid}: preview должен занимать одну строку index`);
  if (!knownUids.has(uid)) fail(`${uid}: отсутствует в listening catalog`);
  if (preview.uid !== uid) fail(`${uid}: preview uid mismatch`);

  const catalogTrack = (catalog.tracks || []).find(item => String(item.uid || '') === uid);
  const album = String(preview.album || catalogTrack?.album || '');
  const profilePath = String(preview.profilePath || '');

  if (!albums.has(album)) fail(`${uid}: неизвестный album key ${album}`);
  if (profilePath !== `${album}/${uid}.json`) fail(`${uid}: profilePath должен быть ${album}/${uid}.json`);

  const file = path.join('data/track-profiles', profilePath);
  if (!fs.existsSync(file)) fail(`${uid}: отсутствует full profile ${profilePath}`);

  const rootLegacyFile = path.join('data/track-profiles', `${uid}.json`);
  if (fs.existsSync(rootLegacyFile)) fail(`${uid}: full profile остался в корне track-profiles`);

  const profile = read(file);
  if (profile.uid !== uid) fail(`${uid}: full profile uid mismatch`);
  if (profile.album !== album) fail(`${uid}: album folder/profile mismatch`);
  if (profile.version !== 'track-profile-v2') fail(`${uid}: требуется track-profile-v2`);
  if (profile.taxonomyVersion !== index.taxonomyVersion) fail(`${uid}: taxonomy version mismatch`);
  if (profile.trackVersion !== catalogTrack?.trackVersion) fail(`${uid}: trackVersion не соответствует listening catalog`);
  if (preview.trackVersion !== profile.trackVersion) fail(`${uid}: preview/full trackVersion mismatch`);
  if ('relations' in profile || 'relations' in preview) fail(`${uid}: производные relations запрещены в постоянном профиле`);
  if ('updatedAt' in profile) fail(`${uid}: постоянный профиль не должен содержать updatedAt`);
  if (index.testData === true && (profile.testData !== true || profile.status !== 'test_fixture')) fail(`${uid}: тестовый профиль не помечен явно`);

  const finalProfile = profile.finalProfile || {};
  const previewProfile = preview.finalProfile || {};
  if ('events' in finalProfile || 'seasonality' in finalProfile) fail(`${uid}: full profile содержит удалённые календарные поля`);
  if ('events' in previewProfile || 'seasonality' in previewProfile) fail(`${uid}: preview содержит удалённые календарные поля`);
  semanticGroups.forEach(group => {
    const sourceKey = group === 'content_warnings' ? 'warnings' : group;
    validateWeights(uid, group, finalProfile[sourceKey] || {});
  });

  const axes = finalProfile.axes || {};
  const requiredAxes = Object.keys(groups.axes?.items || {});
  if (requiredAxes.some(key => !Number.isFinite(Number(axes[key])))) fail(`${uid}: заполнены не все постоянные axes`);
}

console.log(`✅ Validated ${Object.keys(items).length} TrackProfiles`);
