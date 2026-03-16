#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path';
const fail = m => { console.error(m); process.exit(2); };
const af = path.resolve('albums.json'); if (!fs.existsSync(af)) fail('albums.json missing');
const albs = JSON.parse(fs.readFileSync(af, 'utf8'))?.albums; if (!Array.isArray(albs)) fail('albums must be array');
albs.forEach((a, i) => { if (!a.key || !a.title || (!a.base && !a.yandex_base && !a.github_base)) fail(`album[${i}] missing fields`); if (!/^https?:\/\//i.test(a.base || a.yandex_base || a.github_base)) fail(`album[${i}] base invalid`); });
if (new Set(albs.map(a => a.key)).size !== albs.length) fail('duplicate keys');
['00','01','02','03'].forEach(id => { const iF = path.join(path.resolve('albums/gallery', id), 'index.json'); if (!fs.existsSync(iF)) fail(`gallery ${id} missing`); try { const it = JSON.parse(fs.readFileSync(iF, 'utf8'))?.items || []; if (!Array.isArray(it)) fail('items not array'); } catch { fail(`gallery ${id} invalid json`); } });
