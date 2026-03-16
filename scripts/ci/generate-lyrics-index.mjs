#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path';
const R = process.cwd(), AF = path.resolve(R, 'albums.json'), OF = path.resolve(R, 'data/lyrics-index-v1.json');
const nS = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim(), tok = s => nS(s).split(' ').filter(w => w.length > 1);

async function main() {
  if (!fs.existsSync(AF)) process.exit(2);
  const albs = JSON.parse(fs.readFileSync(AF, 'utf8'))?.albums || [], meta = {}, idx = {}, errs = [];
  let tT = 0, tTx = 0;

  for (const a of albs) {
    const aK = String(a?.key || '').trim(), aT = String(a?.title || '').trim(), b = String(a?.yandex_base || a?.github_base || a?.base || '').trim();
    if (!aK || !b) continue;
    try {
      const bU = b.endsWith('/') ? b : `${b}/`, cfg = await (await fetch(`${bU}config.json`)).json(), trks = cfg?.tracks || [];
      tT += trks.length;
      for (let i = 0; i < trks.length; i++) {
        const u = String(trks[i].uid || '').trim(); if (!u) continue;
        meta[u] = { t: trks[i].title || `Трек ${i + 1}`, a: aT || String(cfg?.albumName || ''), k: aK, n: i + 1 };
        if (!trks[i].fulltext) continue;
        const txt = await (await fetch(new URL(trks[i].fulltext, bU).toString())).text(); tTx++;
        [...tok(txt), ...tok(meta[u].t), ...tok(meta[u].a)].forEach(k => (idx[k] = idx[k] || new Set()).add(u));
      }
    } catch (e) { errs.push(`${aK}: ${e.message}`); }
  }

  const iO = Object.fromEntries(Object.entries(idx).map(([k, v]) => [k, [...v].sort()]));
  fs.mkdirSync(path.dirname(OF), { recursive: true });
  fs.writeFileSync(OF, JSON.stringify({ v: 1, buildTs: Date.now(), meta, idx: iO }), 'utf8');
  if (errs.length) console.warn('Warnings:', errs.slice(0, 50));
}
main().catch(() => process.exit(2));
