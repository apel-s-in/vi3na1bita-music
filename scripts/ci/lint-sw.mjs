#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('service-worker.js');
if (!fs.existsSync(file)) {
  console.error('service-worker.js not found');
  process.exit(1);
}
const src = fs.readFileSync(file, 'utf8');

const errors = [];
const warns = [];

if (!/const\s+SW_VERSION\s*=\s*['"`]\d+\.\d+\.\d+['"`]/.test(src)) {
  errors.push('SW_VERSION is missing or has wrong format (x.y.z)');
}

const listeners = (name) => (src.match(new RegExp(`addEventListener\\(['"]${name}['"]`, 'g')) || []).length;
['install','activate','fetch'].forEach(ev => {
  const n = listeners(ev);
  if (n === 0) errors.push(`No ${ev} event listener`);
  if (n > 1) warns.push(`Multiple (${n}) ${ev} listeners`);
});

const consts = ['CORE_CACHE','RUNTIME_CACHE','MEDIA_CACHE','OFFLINE_CACHE','META_CACHE'];
consts.forEach(cn => {
  const n = (src.match(new RegExp(`\\bconst\\s+${cn}\\b`, 'g')) || []).length;
  if (n === 0) errors.push(`Missing const ${cn}`);
  if (n > 1) warns.push(`Duplicate const ${cn} (${n} times)`);
});

// Доп.проверки: DEFAULT_SW_CONFIG числовые лимиты и revalidateDays целочисленное
const cfgMatch = src.match(/const\s+DEFAULT_SW_CONFIG\s*=\s*\{([\s\S]*?)\};/);
if (cfgMatch) {
  const body = cfgMatch[1];
  const num = (key) => {
    const m = body.match(new RegExp(`${key}\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`));
    return m ? Number(m[1]) : null;
  };
  const revalidateDays = num('revalidateDays');
  if (!(Number.isInteger(revalidateDays) && revalidateDays > 0)) {
    errors.push('DEFAULT_SW_CONFIG.revalidateDays must be positive integer');
  }
  ['mediaMaxCacheMB','nonRangeMaxStoreMB','nonRangeMaxStoreMBSlow'].forEach(k => {
    const v = num(k);
    if (!(typeof v === 'number' && v > 0)) errors.push(`DEFAULT_SW_CONFIG.${k} must be positive number`);
  });
}

if (warns.length) {
  console.warn('SW linter warnings:\n - ' + warns.join('\n - '));
}
if (errors.length) {
  console.error('SW linter errors:\n - ' + errors.join('\n - '));
  process.exit(2);
}
console.log('Service Worker lint OK');
