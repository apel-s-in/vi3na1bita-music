#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const jsFile = path.resolve('src/PlayerCore.js');
const tsFile = path.resolve('src/PlayerCore.ts');

function read(p){ if(!fs.existsSync(p)){ console.error(`File not found: ${p}`); process.exit(2);} return fs.readFileSync(p,'utf8'); }
const js = read(jsFile);
const ts = read(tsFile);

function extractSnapshotKeys(src) {
  const m = src.match(/getPlaylistSnapshot\([\s\S]*?\)\s*\{[\s\S]*?return\s*\([\s\S]*?\.map\(\s*\w+\s*=>\s*\(\{\s*([\s\S]*?)\}\)\)\s*\)/);
  if (!m) return null;
  const body = m[1];
  const keys = new Set();
  for (const prop of body.split('\n')) {
    const mm = prop.match(/^\s*([a-zA-Z_][\w]*)\s*:/);
    if (mm) keys.add(mm[1]);
  }
  return [...keys];
}

function extractTsTrackFields(src) {
  const m = src.match(/export\s+type\s+PlayerTrack\s*=\s*\{([\s\S]*?)\};/);
  if (!m) return null;
  const body = m[1];
  const keys = new Set();
  for (const line of body.split('\n')) {
    const mm = line.match(/^\s*([a-zA-Z_][\w]*)\s*:/);
    if (mm) keys.add(mm[1]);
  }
  return [...keys];
}

const jsKeys = extractSnapshotKeys(js) || [];
const tsKeys = extractSnapshotKeys(ts) || [];
const tsTrack = extractTsTrackFields(ts) || [];

const expected = ['title','artist','album','cover','lyrics','src','fulltext'];

function fail(msg){ console.error('validate-playercore:', msg); process.exit(2); }

function sameSet(a,b){ const A=new Set(a), B=new Set(b); if (A.size!==B.size) return false; for (const k of A) if(!B.has(k)) return false; return true; }

if (!sameSet(jsKeys, expected)) {
  fail(`PlayerCore.js getPlaylistSnapshot keys mismatch. Got: [${jsKeys.join(', ')}], expected: [${expected.join(', ')}]`);
}
if (!sameSet(tsKeys, expected)) {
  fail(`PlayerCore.ts getPlaylistSnapshot keys mismatch. Got: [${tsKeys.join(', ')}], expected: [${expected.join(', ')}]`);
}

// track type must contain at least listed fields (some optional)
const requiredInTrack = ['src','title','artist','album','cover','lyrics','fulltext'];
const miss = requiredInTrack.filter(k => !tsTrack.includes(k));
if (miss.length) {
  fail(`PlayerCore.ts PlayerTrack is missing fields: ${miss.join(', ')}`);
}

console.log('PlayerCore JS/TS validation OK');
