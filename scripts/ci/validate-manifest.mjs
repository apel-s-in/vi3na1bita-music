#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('manifest.json');
if (!fs.existsSync(file)) {
  console.error('manifest.json not found');
  process.exit(1);
}
const raw = fs.readFileSync(file, 'utf8');
let json;
try {
  json = JSON.parse(raw);
} catch (e) {
  console.error('manifest.json is not valid JSON:', e.message);
  process.exit(1);
}
const errors = [];
function req(key) { if (!(key in json)) errors.push(`Missing key: ${key}`); }

req('name');
req('short_name');
req('start_url');
req('icons');

if (json.icons && !Array.isArray(json.icons)) {
  errors.push('icons must be an array');
}
if (Array.isArray(json.icons) && json.icons.length === 0) {
  errors.push('icons must contain at least one icon');
}
if (!json.display) errors.push('Missing key: display');
if (!json.theme_color) errors.push('Missing key: theme_color');
if (!json.background_color) errors.push('Missing key: background_color');

if (errors.length) {
  console.error('Manifest validation failed:\n - ' + errors.join('\n - '));
  process.exit(2);
}
console.log('Manifest validation OK');
