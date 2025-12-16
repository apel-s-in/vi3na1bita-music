#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const fail = (msg) => { console.error(msg); process.exit(2); };
const warn = (msg) => { console.warn(msg); };

// 1) albums.json базовая проверка
const albumsFile = path.resolve('albums.json');
if (!fs.existsSync(albumsFile)) fail('albums.json not found');
let albums;
try {
  const raw = fs.readFileSync(albumsFile, 'utf8');
  const j = JSON.parse(raw);
  if (!j || !Array.isArray(j.albums)) fail('albums.json: "albums" must be an array');
  albums = j.albums;
} catch (e) {
  fail('albums.json is not valid JSON: ' + e.message);
}
albums.forEach((a, i) => {
  if (!a.key || !a.title || !a.base) fail(`albums.json: album[${i}] must contain key/title/base`);
  if (typeof a.key !== 'string' || typeof a.title !== 'string' || typeof a.base !== 'string') {
    fail(`albums.json: album[${i}] key/title/base must be strings`);
  }
  if (!/^https?:\/\//i.test(a.base)) {
    fail(`albums.json: album[${i}].base must be absolute http(s) url`);
  }
  if (!/\/$/.test(a.base)) {
    warn(`albums.json: album[${i}].base should end with "/" (got: ${a.base})`);
  }
});

// 1.5) Уникальность ключей альбомов
{
  const keys = albums.map(a => a.key);
  const uniq = new Set(keys);
  if (uniq.size !== keys.length) {
    const dup = keys.filter((k, idx) => keys.indexOf(k) !== idx);
    fail(`albums.json: duplicate album keys: ${Array.from(new Set(dup)).join(', ')}`);
  }
}

// 2) Проверка центральных галерей и index.json наличия/структуры
const galleryRoot = path.resolve('albums/gallery');
const required = ['00','01','02','news'];
required.forEach(id => {
  const dir = path.join(galleryRoot, id);
  const idx = path.join(dir, 'index.json');
  if (!fs.existsSync(dir)) fail(`albums/gallery/${id} directory missing`);
  if (!fs.existsSync(idx)) fail(`albums/gallery/${id}/index.json missing`);
  try {
    const raw = fs.readFileSync(idx, 'utf8');
    const j = JSON.parse(raw);
    const items = Array.isArray(j.items) ? j.items : (Array.isArray(j) ? j : []);
    if (!Array.isArray(items)) fail(`albums/gallery/${id}/index.json: items must be array`);
    if (items.length === 0) warn(`albums/gallery/${id}/index.json: items is empty`);
    // Локальные пути — проверяем существование файлов (если относительные)
    items.forEach((it, k) => {
      const check = (p) => {
        if (!p || /^https?:\/\//i.test(p)) return;
        const rel = p.replace(/^\.\//, '');
        const fp = path.resolve(rel);
        if (!fs.existsSync(fp)) warn(`Missing file referenced from gallery ${id} item[${k}]: ${p}`);
      };
      if (typeof it === 'string') check(it);
      else if (it && typeof it === 'object') {
        if (it.src) check(it.src);
        if (it.formats) Object.values(it.formats).forEach(check);
      }
    });
  } catch (e) {
    fail(`albums/gallery/${id}/index.json invalid JSON: ${e.message}`);
  }
});

// 3) custom.json sw конфиг: revalidateDays целое число
const customFile = path.resolve('custom.json');
if (fs.existsSync(customFile)) {
  try {
    const raw = fs.readFileSync(customFile, 'utf8');
    const j = JSON.parse(raw);
    if (j && j.sw) {
      const d = j.sw.revalidateDays;
      if (!(Number.isInteger(d) && d > 0)) {
        fail('custom.json.sw.revalidateDays must be positive integer');
      }
      ['mediaMaxCacheMB','nonRangeMaxStoreMB','nonRangeMaxStoreMBSlow'].forEach(key => {
        const v = j.sw[key];
        if (!(typeof v === 'number' && v > 0)) fail(`custom.json.sw.${key} must be positive number`);
      });
      if (typeof j.sw.allowUnknownSize !== 'boolean') {
        fail('custom.json.sw.allowUnknownSize must be boolean');
      }
    }
  } catch (e) {
    fail('custom.json invalid JSON: ' + e.message);
  }
}
// 4) Опционально: проверить уникальность uid в удалённых config.json (НЕ фейлим билд из-за сети)
{
  // Node 20: fetch доступен. Если вдруг его нет — просто предупреждаем.
  const hasFetch = typeof fetch === 'function';
  if (!hasFetch) {
    warn('fetch() is not available in this Node runtime; skip remote config.json uid checks');
  } else {
    for (const a of albums) {
      const base = a.base.endsWith('/') ? a.base : `${a.base}/`;
      const url = `${base}config.json`;

      try {
        const r = await fetch(url, { cache: 'no-cache' });
        if (!r.ok) {
          warn(`remote config.json not reachable for "${a.key}": HTTP ${r.status} (${url})`);
          continue;
        }

        const cfg = await r.json();
        const tracks = Array.isArray(cfg?.tracks) ? cfg.tracks : null;
        if (!tracks) {
          warn(`remote config.json "${a.key}": tracks must be array (${url})`);
          continue;
        }

        const seen = new Set();
        const dups = new Set();
        let missing = 0;

        for (const t of tracks) {
          const uid = String(t?.uid || '').trim();
          if (!uid) {
            missing++;
            continue;
          }
          if (seen.has(uid)) dups.add(uid);
          seen.add(uid);
        }

        if (missing > 0) {
          warn(`remote config.json "${a.key}": ${missing} track(s) have empty uid (${url})`);
        }
        if (dups.size > 0) {
          warn(`remote config.json "${a.key}": duplicate uid(s): ${Array.from(dups).join(', ')} (${url})`);
        }
      } catch (e) {
        warn(`remote config.json check failed for "${a.key}": ${e?.message || e} (${url})`);
      }
    }
  }
}

console.log('Content validation OK');
