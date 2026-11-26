#!/usr/bin/env node
import fs from 'node:fs';

const fail = message => { console.error(message); process.exit(2); };
const albums = JSON.parse(fs.readFileSync('albums.json', 'utf8')).albums;
const seen = new Set();
for (const album of albums) {
  if (!album.key || seen.has(album.key)) fail(`invalid_or_duplicate_album:${album.key || 'missing'}`);
  seen.add(album.key);
  if (album.jsdelivr_repo || album.jsdelivr_commit) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(album.jsdelivr_repo || '')) fail(`invalid_jsdelivr_repo:${album.key}`);
    if (!/^[a-f0-9]{40}$/i.test(album.jsdelivr_commit || '')) fail(`invalid_immutable_jsdelivr_commit:${album.key}`);
  }
}
const registry = fs.readFileSync('scripts/app/track-registry.js', 'utf8');
const archive = registry.indexOf("provider: 'archive'");
const jsdelivr = registry.indexOf("provider: 'jsdelivr'");
const github = registry.indexOf("provider: 'github'");
const yandex = registry.indexOf("provider: 'yandex'");
if (!(archive >= 0 && archive < jsdelivr && jsdelivr < github && github < yandex)) fail('audio_provider_order_must_be_archive_jsdelivr_github_yandex');
if (!registry.includes('blob.size < 1024')) fail('tiny_audio_payload_guard_missing');
const html = fs.readFileSync('index.html', 'utf8');
for (const directive of ['media-src', 'connect-src']) {
  const value = html.match(new RegExp(`${directive}\\s+([^;]+)`))?.[1] || '';
  if (!value.includes('https://cdn.jsdelivr.net')) fail(`csp_missing_jsdelivr:${directive}`);
}
console.log(`jsDelivr contract: OK (${albums.length} albums, immutable pins validated)`);
