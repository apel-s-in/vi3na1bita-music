#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path';
const f = path.resolve('manifest.json'); if (!fs.existsSync(f)) process.exit(1);
const j = JSON.parse(fs.readFileSync(f, 'utf8')), errs = [];
['name','short_name','start_url','icons','display','theme_color','background_color'].forEach(k => { if (!(k in j)) errs.push(`Missing ${k}`); });
if (j.icons && (!Array.isArray(j.icons) || !j.icons.length)) errs.push('icons array err');
if (errs.length) { console.error('Failed:\n', errs.join('\n')); process.exit(2); }
