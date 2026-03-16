#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const required = [
  'scripts/intelligence/bootstrap.js',
  'scripts/intelligence/flags.js',
  'scripts/intelligence/manifest.js',
  'scripts/intelligence/uid-roadmap.js',
  'scripts/intelligence/bridges.js',
  'scripts/intelligence/track-profile-loader.js',
  'scripts/intelligence/listener-profile.js',
  'scripts/intelligence/recommendation-engine.js',
  'scripts/intelligence/provider-identity.js',
  'scripts/intelligence/hybrid-sync.js',
  'scripts/ui/track-profile-modal.js',
  'data/track-profiles-index.json',
  'data/track-profiles/_stub.profile.json'
];

const missing = required.filter(rel => !fs.existsSync(path.resolve(rel)));
if (missing.length) {
  console.error('Missing intelligence files:\n' + missing.join('\n'));
  process.exit(2);
}

for (const rel of ['data/track-profiles-index.json', 'data/track-profiles/_stub.profile.json']) {
  try { JSON.parse(fs.readFileSync(path.resolve(rel), 'utf8')); }
  catch (e) {
    console.error(`Invalid JSON in ${rel}: ${e.message}`);
    process.exit(2);
  }
}

console.log('Intelligence scaffold validation passed.');
