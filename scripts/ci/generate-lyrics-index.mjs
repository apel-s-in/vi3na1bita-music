#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ALBUMS_FILE = path.resolve(ROOT, 'albums.json');
const OUT_FILE = path.resolve(ROOT, 'data/lyrics-index-v1.json');

const escRe = /[^\p{L}\p{N}\s]+/gu;

function normStr(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(escRe, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s) {
  const t = normStr(s);
  if (!t) return [];
  return t.split(' ').filter(w => w.length >= 2);
}

async function fetchText(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

async function fetchJson(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

function ensureDirForFile(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function uniq(arr) {
  return [...new Set(arr)];
}

async function main() {
  if (!fs.existsSync(ALBUMS_FILE)) {
    console.error('albums.json not found at', ALBUMS_FILE);
    process.exit(2);
  }

  const albumsJson = JSON.parse(fs.readFileSync(ALBUMS_FILE, 'utf8'));
  const albums = Array.isArray(albumsJson?.albums) ? albumsJson.albums : [];

  const meta = {};
  const idx = {}; // token -> Set(uids) during build

  const errors = [];
  let totalTracks = 0;
  let totalTexts = 0;

  for (const a of albums) {
    const albumKey = String(a?.key || '').trim();
    const albumTitle = String(a?.title || '').trim();
    const base = String(a?.base || '').trim();
    if (!albumKey || !base) continue;

    const baseUrl = base.endsWith('/') ? base : `${base}/`;
    const cfgUrl = `${baseUrl}config.json`;

    let cfg;
    try {
      cfg = await fetchJson(cfgUrl);
    } catch (e) {
      errors.push(`config.json failed: ${albumKey} (${cfgUrl}) -> ${e.message}`);
      continue;
    }

    const tracks = Array.isArray(cfg?.tracks) ? cfg.tracks : [];
    totalTracks += tracks.length;

    for (let i = 0; i < tracks.length; i++) {
      const tr = tracks[i] || {};
      const uid = String(tr.uid || '').trim();
      if (!uid) continue;

      const title = String(tr.title || `Трек ${i + 1}`);
      meta[uid] = { t: title, a: albumTitle || String(cfg?.albumName || ''), k: albumKey, n: i + 1 };

      // Берём fulltext (txt), как ты описал структуру
      const rel = String(tr.fulltext || '').trim();
      if (!rel) continue;

      const url = new URL(rel, baseUrl).toString();

      let text = '';
      try {
        text = await fetchText(url);
      } catch (e) {
        errors.push(`fulltext failed: uid=${uid} (${url}) -> ${e.message}`);
        continue;
      }

      totalTexts++;
      const toks = tokenize(text);
      toks.forEach(tok => {
        if (!idx[tok]) idx[tok] = new Set();
        idx[tok].add(uid);
      });

      // Дополнительно индексируем title+album (чтобы “строки из имени” работали даже если нет текста)
      tokenize(title).forEach(tok => {
        if (!idx[tok]) idx[tok] = new Set();
        idx[tok].add(uid);
      });
      tokenize(albumTitle).forEach(tok => {
        if (!idx[tok]) idx[tok] = new Set();
        idx[tok].add(uid);
      });
    }
  }

  // Convert Sets -> sorted arrays (stable)
  const idxOut = {};
  for (const [tok, set] of Object.entries(idx)) {
    idxOut[tok] = uniq([...set]).sort();
  }

  const payload = {
    v: 1,
    buildTs: Date.now(),
    meta,
    idx: idxOut
  };

  ensureDirForFile(OUT_FILE);
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload), 'utf8');

  console.log('[lyrics-index] albums:', albums.length);
  console.log('[lyrics-index] tracks:', totalTracks);
  console.log('[lyrics-index] texts fetched:', totalTexts);
  console.log('[lyrics-index] tokens:', Object.keys(idxOut).length);
  console.log('[lyrics-index] out:', OUT_FILE);

  // Не фейлим билд из-за пары отсутствующих текстов, но показываем warnings
  if (errors.length) {
    console.warn('\n[lyrics-index] WARNINGS:\n- ' + errors.slice(0, 50).join('\n- '));
    if (errors.length > 50) console.warn(`[lyrics-index] ... +${errors.length - 50} more`);
  }
}

main().catch((e) => {
  console.error('[lyrics-index] fatal:', e);
  process.exit(2);
});
