#!/usr/bin/env node

import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
const albums = JSON.parse(fs.readFileSync('albums.json', 'utf8'))?.albums || [];
const FULL_PATH = 'data/listen-track-catalog.json';
const ENV_PATH = 'data/listen-track-catalog.env.json';
const FUNCTION_ENV_PATH = 'data/listen-track-catalog.function-env.json';
const CONCURRENCY = 4;
const safe = value => String(value == null ? '' : value).trim();
const probe = async url => {
  const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', url], { maxBuffer: 1024 * 1024, timeout: 120000 });
  const format = JSON.parse(stdout || '{}')?.format || {};
  const duration = Number(format.duration);
  const bytes = Number(format.size);
  if (!Number.isFinite(duration) || duration < 10 || !Number.isFinite(bytes) || bytes <= 0) {
    throw new Error(`invalid_media_metadata:${url}`);
  }
  return { duration: Math.round(duration * 1000) / 1000, bytes: Math.floor(bytes) };
};
const mapLimit = async (items, limit, worker) => {
  const results = new Array(items.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
};
const readAlbum = async album => {
  const base = safe(album.yandex_base || album.github_base || album.base);
  if (!base) {
    throw new Error(`album_base_missing:${album.key}`);
  }
  const baseUrl = base.endsWith('/') ? base : `${base}/`;
  const configUrl = new URL('config.json', baseUrl);
  const response = await fetch(configUrl);
  if (!response.ok) {
    throw new Error(`config_fetch_failed:${album.key}:${response.status}`);
  }
  const config = await response.json();
  const tracks = Array.isArray(config?.tracks) ? config.tracks : [];
  return tracks.map(track => ({ uid: safe(track.uid), title: safe(track.title), album: safe(album.key), albumTitle: safe(config.albumName || album.title), hiUrl: new URL(track.audio, baseUrl).toString(), loUrl: new URL(track.audio_low, baseUrl).toString() }));
};
const main = async () => {
  const albumTracks = await Promise.all(albums.map(readAlbum));
  const tracks = albumTracks.flat();
  if (!tracks.length) {
    throw new Error('listen_catalog_empty');
  }
  const duplicate = tracks.find((track, index) => tracks.findIndex(item => item.uid === track.uid) !== index);
  if (duplicate) {
    throw new Error(`duplicate_track_uid:${duplicate.uid}`);
  }
  const rows = await mapLimit(tracks, CONCURRENCY, async track => {
    if (!track.uid || !track.hiUrl || !track.loUrl) {
      throw new Error(`track_metadata_missing:${track.album}:${track.title}`);
    }
    console.log(`PROBE ${track.uid} · ${track.title}`);
    const [hi, lo] = await Promise.all([probe(track.hiUrl), probe(track.loUrl)]);
    const durationDifference = Math.abs(hi.duration - lo.duration);
    if (durationDifference > 1) {
      throw new Error(`duration_mismatch:${track.uid}:` + `${hi.duration}:${lo.duration}`);
    }
    const duration = Math.max(hi.duration, lo.duration);
    const trackVersion = crypto
      .createHash('sha256')
      .update(JSON.stringify({ uid: track.uid, duration, hiDuration: hi.duration, hiBytes: hi.bytes, loDuration: lo.duration, loBytes: lo.bytes }))
      .digest('hex')
      .slice(0, 32);
    return { uid: track.uid, trackVersion, title: track.title, album: track.album, albumTitle: track.albumTitle, duration, hi: { duration: hi.duration, bytes: hi.bytes, url: track.hiUrl }, lo: { duration: lo.duration, bytes: lo.bytes, url: track.loUrl } };
  });
  rows.sort((a, b) => a.album.localeCompare(b.album) || a.uid.localeCompare(b.uid));
  const compact = Object.fromEntries(rows.map(track => [track.uid, [track.duration, track.album, track.trackVersion]]));
  const albumKeys = [...new Set(rows.map(track => track.album))].sort();
  const functionEnv = Object.fromEntries(albumKeys.map(album => {
    const envKey = `LISTEN_TRACK_CATALOG_ALBUM_${album.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
    const value = Object.fromEntries(rows.filter(track => track.album === album).map(track => [track.uid, [track.duration, track.album, track.trackVersion]]));
    return [envKey, value];
  }));
  const generatedAt = new Date().toISOString();
  const trackLines = rows.map((track, index) => `    ${JSON.stringify(track)}${index < rows.length - 1 ? ',' : ''}`);
  const envLines = Object.entries(functionEnv).map(([key, value], index, all) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}${index < all.length - 1 ? ',' : ''}`);
  const fullJson = `{\n  "version": 1,\n  "generatedAt": ${JSON.stringify(generatedAt)},\n  "tracks": [\n${trackLines.join('\n')}\n  ]\n}\n`;
  const functionEnvJson = `{\n${envLines.join('\n')}\n}\n`;
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(FULL_PATH, fullJson, 'utf8');
  fs.writeFileSync(ENV_PATH, JSON.stringify(compact), 'utf8');
  fs.writeFileSync(FUNCTION_ENV_PATH, functionEnvJson, 'utf8');
  console.log(`Generated ${rows.length} tracks`);
  console.log(`Full: ${FULL_PATH}`);
  console.log(`Browser environment: ${ENV_PATH}`);
  console.log(`Cloud Function album variables: ${FUNCTION_ENV_PATH}`);
  Object.entries(functionEnv).forEach(([key, value]) => {
    console.log(`${key}: ${Object.keys(value).length} tracks, ${JSON.stringify(value).length} chars`);
  });
};
main().catch(error => {
  console.error(error);
  process.exit(2);
});
