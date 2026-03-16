#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path';
const f = path.resolve('service-worker.js'); if (!fs.existsSync(f)) process.exit(1);
const s = fs.readFileSync(f, 'utf8'), errs = [], wrns = [];
if (!/const\s+SW_VERSION\s*=\s*['"`]\d+\.\d+\.\d+['"`]/.test(s)) errs.push('SW_VERSION fmt err');
['install','activate','fetch'].forEach(e => { const n = (s.match(new RegExp(`addEventListener\\(['"]${e}['"]`, 'g')) || []).length; if (!n) errs.push(`No ${e}`); else if (n > 1) wrns.push(`Mult ${e}`); });
['CORE_CACHE','RUNTIME_CACHE','MEDIA_CACHE','OFFLINE_CACHE','META_CACHE'].forEach(c => { const n = (s.match(new RegExp(`\\bconst\\s+${c}\\b`, 'g')) || []).length; if (!n) errs.push(`No ${c}`); });
const cfg = s.match(/const\s+DEFAULT_SW_CONFIG\s*=\s*\{([\s\S]*?)\};/);
if (cfg) { const v = k => Number((cfg[1].match(new RegExp(`${k}\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`)) || [])[1]); if (!Number.isInteger(v('revalidateDays')) || v('revalidateDays') <= 0) errs.push('revalidateDays err'); ['mediaMaxCacheMB','nonRangeMaxStoreMB','nonRangeMaxStoreMBSlow'].forEach(k => { if (!(v(k) > 0)) errs.push(`${k} err`); }); }
if (errs.length) { console.error('Errors:', errs); process.exit(2); }
