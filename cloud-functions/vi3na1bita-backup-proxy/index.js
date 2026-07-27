'use strict';
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');
const ALLOWED_ORIGINS = ['https://vi3na1bita.website.yandexcloud.net', 'https://apel-s-in.github.io', 'http://localhost:4173', 'http://127.0.0.1:4173'];
const API = 'https://cloud-api.yandex.net/v1/disk';
const APP_ROOT = 'app:/Backup';
const BACKUP_PATH = `${APP_ROOT}/vi3na1bita_backup.vi3bak`;
const META_PATH = `${APP_ROOT}/vi3na1bita_backup_meta.json`;
const VERSION_RE = /^app:\/Backup\/vi3na1bita_backup(?:_[A-Za-z0-9._-]+)?\.vi3bak$/;
const META_ONLY_TIMEOUT_MS = 10000;
const DEFAULT_TIMEOUT_MS = 20000;
const DOWNLOAD_TIMEOUT_MS = 25000;
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_BODY_BYTES = 12 * 1024 * 1024;
const DEVICE_SETTINGS_DIR = `${APP_ROOT}/device-settings`;
const DEVICE_SETTINGS_INDEX_PATH = `${DEVICE_SETTINGS_DIR}/index.json`;
const EVENT_ARCHIVE_DIR = `${APP_ROOT}/events`;
const EVENT_ARCHIVE_INDEX_PATH = `${EVENT_ARCHIVE_DIR}/index.json`;
const EVENT_SEGMENT_RE = /^app:\/Backup\/events\/seg_[A-Za-z0-9._-]+_\d+_\d+_[A-Za-z0-9._-]+\.json$/;
const DEVICE_SETTINGS_FILE_RE = /^app:\/Backup\/device-settings\/[A-Za-z0-9._-]+\.json$/;
const ALLOWED_MODES = new Set([
  'ping',
  'meta',
  'list',
  'download',
  'device_index',
  'device_meta',
  'device_download',
  'event_index',
  'event_download',
  'archive_inspect',
  'archive_list_files',
  'archive_delete_segments',
  'upload_meta',
  'upload_backup',
  'upload_device_settings',
  'upload_event_segment',
  'ledger_verify',
  'lease_get',
  'lease_acquire',
  'lease_release'
]);
const SIGNALING_URL = String(process.env.SIGNALING_URL || '').trim();
const BACKUP_RECEIPT_SECRET = String(process.env.BACKUP_RECEIPT_SECRET || '').trim();
const BACKUP_RECEIPT_OUTBOX_PATH = `${APP_ROOT}/pending-backup-receipts.json`;
const BACKUP_RECEIPT_OUTBOX_LIMIT = 100;
const BACKUP_RECEIPT_OUTBOX_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const BACKUP_RECEIPT_FLUSH_LIMIT = 20;
const safeString = v => String(v == null ? '' : v).trim();
const safeNum = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const nowTs = () => Date.now();
const makeRequestId = () => `ydp_${nowTs().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const normalizeErrMessage = e => safeString(e?.message || 'unknown_error');
function extractTokenFromHeader(authHeaderRaw) {
  const raw = safeString(authHeaderRaw);
  if (!raw) return '';
  return raw.replace(/^(Bearer|OAuth)\s+/i, '').trim();
}
function extractAnyToken(event) {
  const hdrs = event?.headers || {};
  let authHeader = '';
  let xHeader = '';
  for (const k of Object.keys(hdrs || {})) {
    const kk = String(k || '').toLowerCase();
    if (kk === 'authorization') authHeader = hdrs[k];
    if (kk === 'x-yandex-auth') xHeader = hdrs[k];
  }
  return extractTokenFromHeader(xHeader) || extractTokenFromHeader(authHeader) || getQuery(event, 'token');
}
const corsHeaders = origin => {
  const isAllowed = ALLOWED_ORIGINS.includes(origin);
  return { 'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0], 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, X-Yandex-Auth, Content-Type, Accept', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
};
const json = (statusCode, cors, body, extraHeaders = {}) => ({ statusCode, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders }, body: JSON.stringify(body) });
const humanSize = bytes => {
  const n = safeNum(bytes);
  if (n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};
function httpsPut(url, body = '', customHeaders = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return reject(new Error('invalid_url'));
    }
    const payload = Buffer.from(String(body || ''), 'utf8');
    const req = https.request({ hostname: parsedUrl.hostname, path: parsedUrl.pathname + parsedUrl.search, method: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length, ...customHeaders } }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', x => (data += x));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', e => reject(e));
    req.write(payload);
    req.end();
  });
}
function httpsPostJson(url, data = {}, customHeaders = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return reject(new Error('invalid_url'));
    }
    const body = Buffer.from(JSON.stringify(data || {}), 'utf8');
    const req = https.request({ hostname: parsedUrl.hostname, path: parsedUrl.pathname + parsedUrl.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': body.length, Accept: 'application/json', ...customHeaders } }, res => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', chunk => (responseBody += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: responseBody }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
function httpsDelete(url, customHeaders = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return reject(new Error('invalid_url'));
    }
    const req = https.request({ hostname: parsedUrl.hostname, path: parsedUrl.pathname + parsedUrl.search, method: 'DELETE', headers: { Accept: 'application/json, text/plain, */*', ...customHeaders } }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', x => (data += x));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', e => reject(e));
    req.end();
  });
}
function httpsGet(url, customHeaders = {}, maxRedirects = 5, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return reject(new Error('invalid_url'));
    }
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' + 'AppleWebKit/537.36 (KHTML, like Gecko) ' + 'Chrome/120.0.0.0 Safari/537.36', 'Accept': 'application/json, text/plain, */*', ...customHeaders }
    };
    const req = https.request(options, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
        res.resume();
        let nextUrl;
        try {
          nextUrl = new URL(res.headers.location, url).toString();
        } catch {
          return reject(new Error('bad_redirect_url'));
        }
        const nextHeaders = { ...customHeaders };
        delete nextHeaders.Authorization;
        delete nextHeaders.authorization;
        return httpsGet(nextUrl, nextHeaders, maxRedirects - 1, timeoutMs)
          .then(resolve)
          .catch(reject);
      }
      let data = '';
      let byteCount = 0;
      res.setEncoding('utf8');
      res.on('data', chunk => {
        byteCount += Buffer.byteLength(chunk, 'utf8');
        if (byteCount > MAX_BODY_BYTES) {
          req.destroy();
          reject(new Error('response_too_large'));
          return;
        }
        data += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', err => {
      const msg = normalizeErrMessage(err);
      if (msg === 'timeout') return reject(new Error('timeout'));
      if (msg === 'response_too_large') return reject(new Error('response_too_large'));
      reject(new Error(msg || 'network_error'));
    });
    req.end();
  });
}
const safeParse = str => {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
};
const sortObj = v =>
  Array.isArray(v)
    ? v.map(sortObj)
    : !v || typeof v !== 'object'
      ? v
      : Object.keys(v)
          .sort()
          .reduce((a, k) => ((a[k] = sortObj(v[k])), a), {});
const stableStringify = v => JSON.stringify(sortObj(v));
const sha256Hex = v =>
  crypto
    .createHash('sha256')
    .update(String(v || ''), 'utf8')
    .digest('hex');
const verifyBackupPayloadHash = b => {
  const expected = safeString(b?.integrity?.payloadHash || '');
  if (!expected) return { ok: false, reason: 'payload_hash_missing' };
  const actual = sha256Hex(stableStringify({ identity: b?.identity, devices: b?.devices || [], revision: b?.revision || {}, data: b?.data }));
  return { ok: actual === expected, expected, actual, reason: actual === expected ? 'ok' : 'payload_hash_mismatch' };
};
const verifyEventHashes = events => {
  const rows = Array.isArray(events) ? events.filter(e => e?.eventId && e?.eventHash) : [];
  let checked = 0,
    broken = 0;
  for (const ev of rows) {
    const { eventHash, ...rest } = ev || {};
    checked++;
    if (sha256Hex(stableStringify(rest)) !== safeString(eventHash)) broken++;
  }
  return { checked, broken, ok: broken === 0 };
};
async function readYandexOwnerId(token) {
  const response = await httpsGet('https://login.yandex.ru/info?format=json', { Authorization: `OAuth ${token}`, Accept: 'application/json' }, 0, META_ONLY_TIMEOUT_MS);
  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: response.status, error: 'bad_yandex_oauth' };
  }
  if (response.status !== 200) {
    return { ok: false, status: response.status, error: 'yandex_identity_unavailable' };
  }
  const profile = safeParse(response.body);
  const yandexId = safeString(profile?.id);
  return yandexId ? { ok: true, yandexId } : { ok: false, status: 502, error: 'bad_yandex_profile' };
}
async function validateBackupUpload(token, backup) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    return { ok: false, status: 400, error: 'backup_object_required' };
  }
  if (safeString(backup.version) !== '6.0' || !backup.identity || !backup.data || !backup.integrity) {
    return { ok: false, status: 400, error: 'backup_schema_invalid' };
  }
  const payloadCheck = verifyBackupPayloadHash(backup);
  if (!payloadCheck.ok) {
    return { ok: false, status: 409, error: payloadCheck.reason, payload: payloadCheck };
  }
  const identity = await readYandexOwnerId(token);
  if (!identity.ok) return identity;
  const ownerYandexId = safeString(backup.identity.ownerYandexId);
  if (!ownerYandexId || ownerYandexId !== identity.yandexId) {
    return { ok: false, status: 403, error: 'backup_owner_mismatch' };
  }
  const internalUserId = safeString(backup.identity.internalUserId);
  const expectedOwnerBinding = sha256Hex([ownerYandexId || 'anon', internalUserId || 'local', payloadCheck.actual].join('::'));
  if (safeString(backup.integrity.ownerBinding) !== expectedOwnerBinding) {
    return { ok: false, status: 409, error: 'backup_owner_binding_mismatch' };
  }
  const events = Array.isArray(backup?.data?.eventLog?.warm) ? backup.data.eventLog.warm : [];
  if (events.length > 10000) {
    return { ok: false, status: 413, error: 'backup_event_limit_exceeded' };
  }
  const eventHashes = verifyEventHashes(events);
  if (!eventHashes.ok) {
    return { ok: false, status: 409, error: 'backup_event_hash_mismatch', eventHashes };
  }
  return { ok: true, ownerYandexId, payloadHash: payloadCheck.actual, eventHashes };
}
async function emitBackupAchievementReceipt(validation) {
  if (!SIGNALING_URL || !BACKUP_RECEIPT_SECRET || !validation?.ownerYandexId || !validation?.payloadHash) {
    return { ok: false, skipped: true, reason: 'backup_receipt_not_configured' };
  }
  const response = await httpsPostJson(SIGNALING_URL, { action: 'backup_achievement_receipt', ownerYandexId: validation.ownerYandexId, payloadHash: validation.payloadHash }, { 'X-Vi3-Backup-Secret': BACKUP_RECEIPT_SECRET }, META_ONLY_TIMEOUT_MS);
  const data = safeParse(response.body) || {};
  return { ok: response.status >= 200 && response.status < 300 && data.ok === true, status: response.status, duplicate: data.duplicate === true, shadow: data.shadow !== false, receiptId: safeString(data.receiptId), error: safeString(data.error) };
}
function normalizeBackupReceiptOutbox(raw = {}, ownerYandexId = '') {
  const owner = safeString(ownerYandexId);
  const cutoff = nowTs() - BACKUP_RECEIPT_OUTBOX_TTL_MS;
  const source = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
  const items = [
    ...new Map(
      source
        .map(item => {
          const itemOwner = safeString(item?.ownerYandexId);
          const payloadHash = safeString(item?.payloadHash).toLowerCase();
          const queuedAt = safeNum(item?.queuedAt) || nowTs();
          if (!itemOwner || itemOwner !== owner || !/^[a-f0-9]{64}$/.test(payloadHash) || queuedAt < cutoff) {
            return null;
          }
          const id = `backup_${sha256Hex(`${itemOwner}:${payloadHash}`).slice(0, 40)}`;
          return [id, { id, ownerYandexId: itemOwner, payloadHash, queuedAt, attempts: Math.max(0, Math.floor(safeNum(item?.attempts))), lastAttemptAt: Math.max(0, safeNum(item?.lastAttemptAt)), lastError: safeString(item?.lastError).slice(0, 200) }];
        })
        .filter(Boolean)
    ).values()
  ]
    .sort((left, right) => left.queuedAt - right.queuedAt)
    .slice(-BACKUP_RECEIPT_OUTBOX_LIMIT);
  return { version: 1, ownerYandexId: owner, updatedAt: nowTs(), items };
}
async function readBackupReceiptOutbox(token, ownerYandexId) {
  const result = await downloadJsonResourceByPath(token, BACKUP_RECEIPT_OUTBOX_PATH, { link: 'backup_receipt_outbox_link', parse: 'backup_receipt_outbox_link_parse', file: 'backup_receipt_outbox_file', json: 'backup_receipt_outbox_json' });
  if (result.type === 'not_found') {
    return { exists: false, outbox: normalizeBackupReceiptOutbox({}, ownerYandexId) };
  }
  if (result.type !== 'ok') {
    throw new Error(`backup_receipt_outbox_read_failed:${result.type}`);
  }
  return { exists: true, outbox: normalizeBackupReceiptOutbox(result.data, ownerYandexId) };
}
async function writeBackupReceiptOutbox(token, outbox) {
  await ensureDiskDir(token, APP_ROOT).catch(() => false);
  const result = await uploadJsonResourceByPath(token, BACKUP_RECEIPT_OUTBOX_PATH, outbox);
  if (!result.ok) {
    throw new Error('backup_receipt_outbox_write_failed');
  }
  return true;
}
async function flushBackupAchievementReceipts(token, validation) {
  if (!SIGNALING_URL || !BACKUP_RECEIPT_SECRET) {
    return emitBackupAchievementReceipt(validation);
  }
  let stored;
  try {
    stored = await readBackupReceiptOutbox(token, validation.ownerYandexId);
  } catch (error) {
    const direct = await emitBackupAchievementReceipt(validation).catch(sendError => ({ ok: false, skipped: false, error: normalizeErrMessage(sendError) }));
    return { ...direct, durable: false, outboxError: normalizeErrMessage(error) };
  }
  const currentId = `backup_${sha256Hex(`${validation.ownerYandexId}:${validation.payloadHash}`).slice(0, 40)}`;
  const rows = new Map(stored.outbox.items.map(item => [item.id, item]));
  if (!rows.has(currentId)) {
    rows.set(currentId, { id: currentId, ownerYandexId: validation.ownerYandexId, payloadHash: validation.payloadHash, queuedAt: nowTs(), attempts: 0, lastAttemptAt: 0, lastError: '' });
  }
  const ordered = [...rows.values()].sort((left, right) => left.queuedAt - right.queuedAt);
  const pending = [];
  const results = [];
  let delivered = 0;
  for (let index = 0; index < ordered.length; index++) {
    const item = ordered[index];
    if (index >= BACKUP_RECEIPT_FLUSH_LIMIT) {
      pending.push(item);
      continue;
    }
    let result;
    try {
      result = await emitBackupAchievementReceipt(item);
    } catch (error) {
      result = { ok: false, skipped: false, error: normalizeErrMessage(error) };
    }
    results.push({ id: item.id, ok: result.ok === true, duplicate: result.duplicate === true, status: safeNum(result.status), error: safeString(result.error) });
    if (result.ok || result.duplicate) {
      delivered++;
      continue;
    }
    pending.push({ ...item, attempts: item.attempts + 1, lastAttemptAt: nowTs(), lastError: safeString(result.error || result.reason || `http_${result.status || 0}`).slice(0, 200) });
  }
  const nextOutbox = normalizeBackupReceiptOutbox({ items: pending }, validation.ownerYandexId);
  if (stored.exists || nextOutbox.items.length) {
    await writeBackupReceiptOutbox(token, nextOutbox);
  }
  const currentResult = results.find(item => item.id === currentId) || null;
  return { ok: nextOutbox.items.length === 0 && currentResult?.ok === true, durable: true, delivered, pending: nextOutbox.items.length, current: currentResult, results };
}
function validateEventSegmentUpload(segment) {
  if (!segment || typeof segment !== 'object' || !Array.isArray(segment.events)) {
    return { ok: false, status: 400, error: 'event_segment_invalid' };
  }
  if (segment.events.length < 1 || segment.events.length > 500) {
    return { ok: false, status: 413, error: 'event_segment_size_invalid' };
  }
  const expected = safeString(segment.hash);
  const actual = sha256Hex(stableStringify(segment.events));
  if (!expected || expected !== actual) {
    return { ok: false, status: 409, error: 'event_segment_hash_mismatch' };
  }
  const hashes = verifyEventHashes(segment.events);
  if (!hashes.ok) {
    return { ok: false, status: 409, error: 'event_hash_mismatch' };
  }
  return { ok: true, hashes };
}
async function readLatestBackupForVerify(token) {
  const r = await downloadBackup(token, BACKUP_PATH);
  if (r.type !== 'ok') return { ok: false, reason: r.type, raw: r };
  return { ok: true, backup: r.data };
}
function buildLedgerVerifyResult(backup) {
  const payload = verifyBackupPayloadHash(backup);
  const events = normalizeVerifyEvents(Array.isArray(backup?.data?.eventLog?.warm) ? backup.data.eventLog.warm : []);
  const eventHashes = verifyEventHashes(events);
  const eventChain = verifyEventChain(events);
  const cp = backup?.data?.ledger || {};
  const archivableLedgerHead = safeString(backup?.integrity?.archivableLedgerHead || backup?.revision?.archivableLedgerHead || '');
  const archivableLedgerSeq = safeNum(backup?.integrity?.archivableLedgerSeq || backup?.revision?.archivableLedgerSeq || 0);
  const archivableReachable = !archivableLedgerHead || events.some(e => safeString(e?.eventHash) === archivableLedgerHead);
  const res = {
    ok: !!payload.ok && !!eventHashes.ok && !!eventChain.ok && !!archivableReachable,
    payload,
    eventHashes,
    eventChain,
    eventCountInSnapshot: events.length,
    eventCountFull: safeNum(backup?.data?.eventArchive?.eventCountFull || events.length),
    compacted: !!backup?.data?.eventArchive?.latestCompacted,
    ledgerHead: safeString(backup?.integrity?.eventLedgerHead || backup?.revision?.eventLedgerHead || cp.headHash || ''),
    ledgerSeq: safeNum(backup?.integrity?.eventLedgerSeq || backup?.revision?.eventLedgerSeq || cp.deviceSeq || 0),
    archivableLedgerHead,
    archivableLedgerSeq,
    archivableLedgerDeviceStableId: safeString(backup?.integrity?.archivableLedgerDeviceStableId || backup?.revision?.archivableLedgerDeviceStableId || ''),
    archivableLedgerChainId: safeString(backup?.integrity?.archivableLedgerChainId || backup?.revision?.archivableLedgerChainId || ''),
    archivableEventCount: safeNum(backup?.integrity?.archivableEventCount || backup?.revision?.archivableEventCount || 0),
    archivableReachable,
    ownerYandexId: safeString(backup?.identity?.ownerYandexId || ''),
    checksum: safeString(backup?.integrity?.payloadHash || '')
  };
  return { ...res, status: res.ok ? 'verified' : 'suspicious' };
}
const normalizeVerifyEvents = rows => {
  const m = new Map();
  (Array.isArray(rows) ? rows : []).forEach(e => e?.eventId && !m.has(e.eventId) && m.set(e.eventId, e));
  return [...m.values()].sort((a, b) => safeNum(a.timestamp) - safeNum(b.timestamp) || safeNum(a.deviceSeq) - safeNum(b.deviceSeq));
};
function verifyEventChain(events) {
  const groups = new Map();
  normalizeVerifyEvents(events)
    .filter(e => safeString(e?.chainId) && safeNum(e?.deviceSeq) && safeString(e?.eventHash))
    .forEach(e => {
      const k = `${safeString(e.deviceStableId)}::${safeString(e.chainId)}`;
      (groups.get(k) || groups.set(k, []).get(k)).push(e);
    });
  let chains = 0,
    checkedLinks = 0,
    brokenLinks = 0;
  for (const list of groups.values()) {
    chains++;
    list.sort((a, b) => safeNum(a.deviceSeq) - safeNum(b.deviceSeq));
    for (let i = 1; i < list.length; i++) {
      if (safeNum(list[i].deviceSeq) !== safeNum(list[i - 1].deviceSeq) + 1) continue;
      checkedLinks++;
      if (safeString(list[i].prevHash) !== safeString(list[i - 1].eventHash)) brokenLinks++;
    }
  }
  return { ok: brokenLinks === 0, chains, checkedLinks, brokenLinks };
}
async function readEventArchiveForVerify(token, { limitSegments = 300, limitEvents = 50000 } = {}) {
  const idx = await downloadJsonResourceByPath(token, EVENT_ARCHIVE_INDEX_PATH, { link: 'verify_event_index_link', parse: 'verify_event_index_parse', file: 'verify_event_index_file', json: 'verify_event_index_json' }).catch(() => null);
  const items = Array.isArray(idx?.data?.items) ? idx.data.items : [];
  const picked = [...items].sort((a, b) => safeNum(a.createdAt) - safeNum(b.createdAt)).slice(-limitSegments);
  const segs = await Promise.all(picked.map(x => downloadJsonResourceByPath(token, safeString(x.path), { link: 'verify_event_segment_link', parse: 'verify_event_segment_parse', file: 'verify_event_segment_file', json: 'verify_event_segment_json' }).catch(() => null)));
  const events = normalizeVerifyEvents(segs.flatMap(x => (Array.isArray(x?.data?.events) ? x.data.events : []))).slice(-limitEvents);
  return { available: items.length > 0, segmentsCount: items.length, downloadedSegments: segs.filter(x => x?.type === 'ok').length, eventCount: events.length, maxSeq: Math.max(0, ...events.map(e => safeNum(e.deviceSeq))), events };
}
async function readLatestBackupWithArchiveForVerify(token) {
  const rb = await readLatestBackupForVerify(token);
  if (!rb.ok) return rb;
  const archive = await readEventArchiveForVerify(token).catch(() => ({ available: false, events: [] }));
  const latestEvents = Array.isArray(rb.backup?.data?.eventLog?.warm) ? rb.backup.data.eventLog.warm : [];
  const events = normalizeVerifyEvents([...latestEvents, ...(archive.events || [])]);
  const backup = {
    ...rb.backup,
    data: {
      ...(rb.backup.data || {}),
      eventLog: { ...(rb.backup.data?.eventLog || {}), warm: events },
      eventArchive: { ...(rb.backup.data?.eventArchive || {}), serverVerifyArchive: { available: !!archive.available, segmentsCount: archive.segmentsCount || 0, downloadedSegments: archive.downloadedSegments || 0, eventCount: archive.eventCount || 0, maxSeq: archive.maxSeq || 0 } }
    }
  };
  return { ok: true, backup, archive };
}
async function listDiskFolderItems(token, path, { pageLimit = 200, maxItems = 2000 } = {}) {
  const out = [];
  for (let offset = 0; offset < maxItems; offset += pageLimit) {
    const r = await getDiskJson(`${API}/resources?path=${encodeURIComponent(path)}&limit=${pageLimit}&offset=${offset}`, token, META_ONLY_TIMEOUT_MS).catch(() => null);
    const items = Array.isArray(r?.json?._embedded?.items) ? r.json._embedded.items : [];
    out.push(...items);
    if (!items.length || items.length < pageLimit) break;
  }
  return out.slice(0, maxItems);
}
function parseArchiveSegmentFileItem(file, oldByPath = new Map()) {
  const path = safeString(file?.path || '');
  if (!EVENT_SEGMENT_RE.test(path)) return null;
  const name = safeString(file?.name || path.split('/').pop() || '');
  const m = name.match(/^seg_([A-Za-z0-9._-]+)_(\d+)_(\d+)_([A-Za-z0-9._-]+)\.json$/);
  if (!m) return null;
  const old = oldByPath.get(path) || {};
  return {
    path,
    name,
    deviceStableId: safeString(old.deviceStableId || ''),
    branchId: safeString(old.branchId || m[1] || 'legacy'),
    chainId: safeString(old.chainId || ''),
    fromSeq: safeNum(old.fromSeq || m[2]),
    toSeq: safeNum(old.toSeq || m[3]),
    eventCount: safeNum(old.eventCount || 0),
    hash: safeString(old.hash || m[4]),
    createdAt: safeNum(old.createdAt || (file.created ? Date.parse(file.created) : 0) || (file.modified ? Date.parse(file.modified) : 0)),
    modified: file.modified || null,
    size: safeNum(file.size),
    sizeHuman: humanSize(file.size)
  };
}
async function listArchiveFilesForIndex(token) {
  const idxRes = await downloadJsonResourceByPath(token, EVENT_ARCHIVE_INDEX_PATH, { link: 'archive_list_index_link', parse: 'archive_list_index_parse', file: 'archive_list_index_file', json: 'archive_list_index_json' }).catch(() => null);
  const oldItems = Array.isArray(idxRes?.data?.items) ? idxRes.data.items : [];
  const oldByPath = new Map(oldItems.map(x => [safeString(x.path), x]));
  const diskItems = await listDiskFolderItems(token, EVENT_ARCHIVE_DIR, { pageLimit: 200, maxItems: 2000 }).catch(() => []);
  const items = diskItems
    .map(x => parseArchiveSegmentFileItem(x, oldByPath))
    .filter(Boolean)
    .sort((a, b) => safeString(a.branchId).localeCompare(safeString(b.branchId)) || safeNum(a.fromSeq) - safeNum(b.fromSeq));
  const totalSize = items.reduce((a, x) => a + safeNum(x.size), 0);
  return { exists: diskItems.length > 0, items, totals: { files: items.length, size: totalSize, sizeHuman: humanSize(totalSize), oldIndexItems: oldItems.length } };
}
function sanitizeArchiveDeletePaths(paths) {
  return [...new Set((Array.isArray(paths) ? paths : []).map(safeString).filter(p => EVENT_SEGMENT_RE.test(p)))].slice(0, 50);
}
async function deleteArchiveSegments(token, paths = []) {
  const good = sanitizeArchiveDeletePaths(paths),
    results = [];
  for (const path of good) {
    const r = await httpsDelete(`${API}/resources?path=${encodeURIComponent(path)}&permanently=false`, { Authorization: `OAuth ${token}` }, META_ONLY_TIMEOUT_MS).catch(e => ({ status: 0, body: safeString(e?.message) }));
    results.push({ path, ok: [200, 202, 204, 404].includes(Number(r.status)), status: Number(r.status), raw: safeString(r.body).slice(0, 200) });
  }
  return { requested: Array.isArray(paths) ? paths.length : 0, deleted: results.filter(x => x.ok).length, results };
}
async function inspectEventArchive(token) {
  const idxRes = await downloadJsonResourceByPath(token, EVENT_ARCHIVE_INDEX_PATH, { link: 'archive_inspect_index_link', parse: 'archive_inspect_index_parse', file: 'archive_inspect_index_file', json: 'archive_inspect_index_json' }).catch(() => null);
  const rawIndex = idxRes?.type === 'ok' && idxRes.data && typeof idxRes.data === 'object' ? idxRes.data : { version: '1.1', updatedAt: 0, items: [] };
  const rawItems = Array.isArray(rawIndex.items) ? rawIndex.items : [];
  const diskItems = await listDiskFolderItems(token, EVENT_ARCHIVE_DIR, { pageLimit: 200, maxItems: 2000 }).catch(() => []);
  const sizeMap = new Map(diskItems.map(x => [safeString(x.path), { size: safeNum(x.size), sizeHuman: humanSize(x.size), modified: x.modified || null, name: safeString(x.name) }]));
  const items = rawItems.map(x => ({ ...x, ...(sizeMap.get(safeString(x.path)) || {}) }));
  const bm = new Map();
  items.forEach(x => {
    const k = safeString(x.branchId || x.deviceStableId || 'legacy') || 'legacy';
    const b = bm.get(k) || { branchId: k, chainId: safeString(x.chainId || ''), deviceStableId: safeString(x.deviceStableId || ''), segments: 0, events: 0, size: 0, fromSeq: 0, toSeq: 0, legacySegments: 0 };
    b.segments++;
    b.events += safeNum(x.eventCount);
    b.size += safeNum(x.size);
    b.fromSeq = b.fromSeq ? Math.min(b.fromSeq, safeNum(x.fromSeq)) : safeNum(x.fromSeq);
    b.toSeq = Math.max(b.toSeq, safeNum(x.toSeq));
    if (!safeString(x.branchId) || !safeString(x.chainId)) b.legacySegments++;
    bm.set(k, b);
  });
  const branches = [...bm.values()].map(b => ({ ...b, sizeHuman: humanSize(b.size) })).sort((a, b) => safeString(a.branchId).localeCompare(safeString(b.branchId)));
  const totalSize = items.reduce((a, x) => a + safeNum(x.size), 0);
  return { exists: idxRes?.type === 'ok', index: { ...rawIndex, items }, branches, totals: { branches: branches.length, segments: items.length, events: items.reduce((a, x) => a + safeNum(x.eventCount), 0), size: totalSize, sizeHuman: humanSize(totalSize), diskFiles: diskItems.length } };
}
const getQuery = (event, key) => {
  const q = event.queryStringParameters || {};
  return safeString(q[key]);
};
const normalizeBackupItem = (item, meta = null, opts = {}) => {
  const path = safeString(item?.path);
  const isLatest = path === BACKUP_PATH;
  const fallbackName = isLatest ? 'vi3na1bita_backup.vi3bak' : safeString(path.split('/').pop() || '');
  return {
    path,
    name: safeString(item?.name || fallbackName),
    timestamp: opts.enrichFromMeta && safeNum(meta?.timestamp) ? safeNum(meta.timestamp) : item?.modified ? Date.parse(item.modified) || 0 : safeNum(item?.timestamp),
    modified: item?.modified || null,
    size: safeNum(item?.size),
    sizeHuman: humanSize(item?.size),
    appVersion: safeString(meta?.appVersion || item?.appVersion || 'unknown'),
    version: safeString(meta?.version || item?.version || 'unknown'),
    schemaVersion: opts.enrichFromMeta ? safeString(meta?.schemaVersion || meta?.version || item?.schemaVersion || item?.version || '6.0') : safeString(item?.schemaVersion || item?.version || 'unknown'),
    changedDomains: opts.enrichFromMeta && Array.isArray(meta?.changedDomains) ? meta.changedDomains.map(safeString).filter(Boolean) : [],
    lastHistoryAt: opts.enrichFromMeta ? safeNum(meta?.lastHistoryAt || 0) : safeNum(item?.lastHistoryAt || 0),
    checksum: opts.enrichFromMeta ? safeString(meta?.checksum || item?.checksum || '') : safeString(item?.checksum || ''),
    eventLedgerHead: opts.enrichFromMeta ? safeString(meta?.eventLedgerHead || item?.eventLedgerHead || '') : safeString(item?.eventLedgerHead || ''),
    eventLedgerSeq: opts.enrichFromMeta ? safeNum(meta?.eventLedgerSeq || item?.eventLedgerSeq || 0) : safeNum(item?.eventLedgerSeq || 0),
    eventLedgerDeviceStableId: opts.enrichFromMeta ? safeString(meta?.eventLedgerDeviceStableId || item?.eventLedgerDeviceStableId || '') : safeString(item?.eventLedgerDeviceStableId || ''),
    archivableLedgerHead: opts.enrichFromMeta ? safeString(meta?.archivableLedgerHead || item?.archivableLedgerHead || '') : safeString(item?.archivableLedgerHead || ''),
    archivableLedgerSeq: opts.enrichFromMeta ? safeNum(meta?.archivableLedgerSeq || item?.archivableLedgerSeq || 0) : safeNum(item?.archivableLedgerSeq || 0),
    archivableLedgerDeviceStableId: opts.enrichFromMeta ? safeString(meta?.archivableLedgerDeviceStableId || item?.archivableLedgerDeviceStableId || '') : safeString(item?.archivableLedgerDeviceStableId || ''),
    archivableLedgerChainId: opts.enrichFromMeta ? safeString(meta?.archivableLedgerChainId || item?.archivableLedgerChainId || '') : safeString(item?.archivableLedgerChainId || ''),
    archivableEventCount: opts.enrichFromMeta ? safeNum(meta?.archivableEventCount || item?.archivableEventCount || 0) : safeNum(item?.archivableEventCount || 0),
    eventLogHash: opts.enrichFromMeta ? safeString(meta?.eventLogHash || item?.eventLogHash || '') : safeString(item?.eventLogHash || ''),
    sharedStorageHash: opts.enrichFromMeta ? safeString(meta?.sharedStorageHash || item?.sharedStorageHash || '') : safeString(item?.sharedStorageHash || ''),
    ownerYandexId: opts.enrichFromMeta ? safeString(meta?.ownerYandexId || item?.ownerYandexId || '') : safeString(item?.ownerYandexId || ''),
    latestPath: opts.enrichFromMeta ? safeString(meta?.latestPath || BACKUP_PATH) : safeString(item?.latestPath || ''),
    historyPath: opts.enrichFromMeta ? safeString(meta?.historyPath || '') : safeString(item?.historyPath || ''),
    profileName: opts.enrichFromMeta ? safeString(meta?.profileName || item?.profileName || 'Слушатель') : safeString(item?.profileName || ''),
    sourceDeviceStableId: opts.enrichFromMeta ? safeString(meta?.sourceDeviceStableId || item?.sourceDeviceStableId || '') : safeString(item?.sourceDeviceStableId || ''),
    sourceDeviceLabel: opts.enrichFromMeta ? safeString(meta?.sourceDeviceLabel || item?.sourceDeviceLabel || '') : safeString(item?.sourceDeviceLabel || ''),
    sourceDeviceClass: opts.enrichFromMeta ? safeString(meta?.sourceDeviceClass || item?.sourceDeviceClass || '') : safeString(item?.sourceDeviceClass || ''),
    sourcePlatform: opts.enrichFromMeta ? safeString(meta?.sourcePlatform || item?.sourcePlatform || '') : safeString(item?.sourcePlatform || ''),
    level: opts.enrichFromMeta ? safeNum(meta?.level || item?.level || 0) : safeNum(item?.level || 0),
    xp: opts.enrichFromMeta ? safeNum(meta?.xp || item?.xp || 0) : safeNum(item?.xp || 0),
    achievementsCount: opts.enrichFromMeta ? safeNum(meta?.achievementsCount || item?.achievementsCount || 0) : safeNum(item?.achievementsCount || 0),
    favoritesCount: opts.enrichFromMeta ? safeNum(meta?.favoritesCount || item?.favoritesCount || 0) : safeNum(item?.favoritesCount || 0),
    playlistsCount: opts.enrichFromMeta ? safeNum(meta?.playlistsCount || item?.playlistsCount || 0) : safeNum(item?.playlistsCount || 0),
    statsCount: opts.enrichFromMeta ? safeNum(meta?.statsCount || item?.statsCount || 0) : safeNum(item?.statsCount || 0),
    eventCount: opts.enrichFromMeta ? safeNum(meta?.eventCount || item?.eventCount || 0) : safeNum(item?.eventCount || 0),
    devicesCount: opts.enrichFromMeta ? safeNum(meta?.devicesCount || item?.devicesCount || 0) : safeNum(item?.devicesCount || 0),
    deviceStableCount: opts.enrichFromMeta ? safeNum(meta?.deviceStableCount || item?.deviceStableCount || 0) : safeNum(item?.deviceStableCount || 0),
    syncLease: opts.enrichFromMeta && meta?.syncLease && typeof meta.syncLease === 'object' ? meta.syncLease : null,
    isLatest
  };
};
const makeSummary = (latest, items = [], diskUsageBytes = 0) => {
  if (!latest) {
    return { exists: false, latest: null, items: [], diskUsageBytes, diskUsageHuman: humanSize(diskUsageBytes) };
  }
  return { exists: true, latest: { ...latest, diskUsageBytes, diskUsageHuman: humanSize(diskUsageBytes) }, items, diskUsageBytes, diskUsageHuman: humanSize(diskUsageBytes) };
};
async function getDiskJson(url, token, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const res = await httpsGet(url, { Authorization: `OAuth ${token}` }, 5, timeoutMs);
  if (res.status === 401 || res.status === 403) {
    console.log(`[DISK ${res.status}]`, url, '→', safeString(res.body).slice(0, 300));
  }
  return { ...res, json: safeParse(res.body), rawBody: res.body };
}
async function downloadJsonBySignedHref(href, timeoutMs = META_ONLY_TIMEOUT_MS) {
  const res = await httpsGet(href, {}, 5, timeoutMs);
  if (res.status !== 200) return null;
  return safeParse(res.body);
}
async function uploadJsonResourceByPath(token, path, data) {
  const linkRes = await getDiskJson(`${API}/resources/upload?path=${encodeURIComponent(path)}&overwrite=true`, token, META_ONLY_TIMEOUT_MS);
  if (linkRes.status !== 200 || !linkRes.json?.href) return { ok: false, status: linkRes.status, raw: safeString(linkRes.rawBody).slice(0, 300) };
  const putRes = await httpsPut(linkRes.json.href, JSON.stringify(data), {}, META_ONLY_TIMEOUT_MS);
  return { ok: putRes.status >= 200 && putRes.status < 300, status: putRes.status, raw: safeString(putRes.body).slice(0, 300) };
}
const normalizeLease = raw =>
  raw && typeof raw === 'object' ? { revision: safeString(raw.revision || ''), deviceStableId: safeString(raw.deviceStableId || ''), deviceHash: safeString(raw.deviceHash || ''), startedAt: safeNum(raw.startedAt), expiresAt: safeNum(raw.expiresAt), reason: safeString(raw.reason || '') } : null;
const sameLeaseOwner = (lease, deviceStableId, deviceHash) => !!lease && ((deviceStableId && lease.deviceStableId === deviceStableId) || (deviceHash && lease.deviceHash === deviceHash));
const leaseActive = lease => !!lease && safeNum(lease.expiresAt) > nowTs() + 1000;
async function ensureDiskDir(token, path) {
  const p = safeString(path);
  if (!p) return false;
  const chk = await getDiskJson(`${API}/resources?path=${encodeURIComponent(p)}`, token, META_ONLY_TIMEOUT_MS).catch(() => null);
  if (chk?.status === 200 || chk?.status === 409) return true;
  if (chk && chk.status !== 404) return false;
  const res = await httpsPut(`${API}/resources?path=${encodeURIComponent(p)}`, '', { Authorization: `OAuth ${token}` }, META_ONLY_TIMEOUT_MS).catch(() => null);
  return !!res && (res.status === 201 || res.status === 200 || res.status === 409);
}
async function writeMetaJson(token, meta) {
  await ensureDiskDir(token, APP_ROOT).catch(() => false);
  return uploadJsonResourceByPath(token, META_PATH, meta || {});
}
async function getLeaseState(token) {
  const metaRead = await readMetaJson(token).catch(() => ({ ok: false, data: null }));
  const meta = metaRead?.data && typeof metaRead.data === 'object' ? metaRead.data : {};
  return { meta, lease: normalizeLease(meta.syncLease) };
}
async function acquireLease(token, event) {
  const deviceStableId = sanitizeDeviceStableId(getQuery(event, 'deviceStableId'));
  const deviceHash = safeString(getQuery(event, 'deviceHash'));
  const reason = safeString(getQuery(event, 'reason') || 'sync');
  const ttlMs = Math.max(10000, Math.min(120000, safeNum(getQuery(event, 'ttlMs')) || 45000));
  const { meta, lease } = await getLeaseState(token);
  if (leaseActive(lease) && !sameLeaseOwner(lease, deviceStableId, deviceHash)) return { ok: false, status: 409, reason: 'lease_busy', lease };
  const revision = `lease_${nowTs().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const nextLease = { revision, deviceStableId, deviceHash, startedAt: nowTs(), expiresAt: nowTs() + ttlMs, reason };
  const wr = await writeMetaJson(token, { ...meta, syncLease: nextLease });
  if (!wr.ok) return { ok: false, status: 502, reason: 'lease_write_failed', raw: wr.raw };
  return { ok: true, status: 200, lease: nextLease };
}
async function releaseLease(token, event) {
  const deviceStableId = sanitizeDeviceStableId(getQuery(event, 'deviceStableId'));
  const deviceHash = safeString(getQuery(event, 'deviceHash'));
  const revision = safeString(getQuery(event, 'revision'));
  const { meta, lease } = await getLeaseState(token);
  if (!lease) return { ok: true, released: false, lease: null };
  const ownerOk = sameLeaseOwner(lease, deviceStableId, deviceHash);
  const revOk = !revision || lease.revision === revision;
  if (!ownerOk || !revOk) return { ok: false, status: 409, reason: 'lease_owner_or_revision_mismatch', lease };
  const wr = await writeMetaJson(token, { ...meta, syncLease: null });
  if (!wr.ok) return { ok: false, status: 502, reason: 'lease_release_failed', raw: wr.raw };
  return { ok: true, released: true, lease: null };
}
async function readMetaJson(token) {
  try {
    const metaFileRes = await getDiskJson(`${API}/resources/download?path=${encodeURIComponent(META_PATH)}`, token, META_ONLY_TIMEOUT_MS);
    if (metaFileRes.status === 404) return { ok: true, exists: false, data: null };
    if (metaFileRes.status !== 200 || !metaFileRes.json?.href) {
      return { ok: false, exists: false, error: 'meta_download_link_error', status: metaFileRes.status, raw: safeString(metaFileRes.rawBody).slice(0, 300) };
    }
    const data = await downloadJsonBySignedHref(metaFileRes.json.href, META_ONLY_TIMEOUT_MS);
    return { ok: !!data, exists: !!data, data: data || null, error: data ? null : 'meta_signed_download_invalid' };
  } catch (e) {
    return { ok: false, exists: false, data: null, error: normalizeErrMessage(e) || 'meta_read_failed' };
  }
}
async function getLatestBackupMeta(token, { withMeta = false } = {}) {
  const latestRes = await getDiskJson(`${API}/resources?path=${encodeURIComponent(BACKUP_PATH)}`, token, META_ONLY_TIMEOUT_MS);
  if (latestRes.status === 401 || latestRes.status === 403) {
    return { error: latestRes.status === 401 ? 'disk_auth_error' : 'disk_forbidden', status: latestRes.status, raw: safeString(latestRes.rawBody).slice(0, 500), stage: 'meta_resource_request', path: BACKUP_PATH };
  }
  if (latestRes.status === 404) return { exists: false, latest: null };
  if (latestRes.status !== 200) {
    return { error: 'disk_meta_error', status: latestRes.status, raw: safeString(latestRes.rawBody).slice(0, 500), stage: 'meta_resource_request', path: BACKUP_PATH };
  }
  let metaData = null,
    degradedMeta = false;
  if (withMeta) {
    const metaRead = await readMetaJson(token).catch(() => ({ ok: false, data: null }));
    metaData = metaRead?.data || null;
    degradedMeta = !!(metaRead && metaRead.ok === false);
  }
  const latest = normalizeBackupItem({ path: latestRes.json?.path || BACKUP_PATH, name: 'vi3na1bita_backup.vi3bak', modified: latestRes.json?.modified || null, size: safeNum(latestRes.json?.size) }, metaData, { enrichFromMeta: true });
  return { exists: true, latest, degradedMeta };
}
async function listBackups(token) {
  const [latestMetaResult, folderRes] = await Promise.all([getLatestBackupMeta(token, { withMeta: true }).catch(() => ({ exists: false, latest: null, degradedMeta: true })), getDiskJson(`${API}/resources?path=${encodeURIComponent(APP_ROOT)}&limit=100`, token)]);
  if (latestMetaResult?.error) {
    // Если meta вернула 403, но folder вернул 404 — значит app:/Backup ещё не создана, а не "нет прав"
    if (latestMetaResult.error === 'disk_forbidden' && folderRes.status === 404) {
      return { items: [], summary: makeSummary(null, [], 0), degradedMeta: true };
    }
    // Если folder доступен, но latest meta деградировала по timeout/5xx — не валим весь list
    if (folderRes.status !== 200) return latestMetaResult;
  }
  if (folderRes.status === 401 || folderRes.status === 403) {
    return { error: folderRes.status === 401 ? 'disk_auth_error' : 'disk_forbidden', status: folderRes.status, raw: safeString(folderRes.rawBody).slice(0, 500), stage: 'list_folder_request', path: APP_ROOT };
  }
  if (folderRes.status === 404) {
    return { items: [], summary: makeSummary(null, [], 0), degradedMeta: !!latestMetaResult?.degradedMeta };
  }
  if (folderRes.status !== 200) {
    return { error: 'disk_list_error', status: folderRes.status, raw: safeString(folderRes.rawBody).slice(0, 500), stage: 'list_folder_request', path: APP_ROOT };
  }
  const embedded = folderRes.json?._embedded?.items;
  const allItems = Array.isArray(embedded) ? embedded : [];
  const diskUsageBytes = allItems.reduce((sum, x) => sum + safeNum(x?.size), 0);
  const versioned = allItems
    .filter(x => VERSION_RE.test(safeString(x.path)) && safeString(x.path) !== BACKUP_PATH)
    .map(x => normalizeBackupItem(x, null, { enrichFromMeta: false }))
    .sort((a, b) => safeNum(b.timestamp) - safeNum(a.timestamp))
    .slice(0, 5);
  const latest = latestMetaResult.exists && latestMetaResult.latest ? { ...latestMetaResult.latest, diskUsageBytes, diskUsageHuman: humanSize(diskUsageBytes) } : null;
  const items = [...(latest ? [latest] : []), ...versioned];
  return { items, summary: makeSummary(latest, items, diskUsageBytes), degradedMeta: !!latestMetaResult?.degradedMeta };
}
function sanitizeSelectedPath(selectedPath) {
  const path = safeString(selectedPath);
  if (!path || path === BACKUP_PATH) return BACKUP_PATH;
  if (path === META_PATH) return BACKUP_PATH;
  return VERSION_RE.test(path) ? path : BACKUP_PATH;
}
function sanitizeDeviceStableId(deviceStableId) {
  return safeString(deviceStableId).replace(/[^A-Za-z0-9._-]/g, '');
}
function buildDeviceSettingsCloudPath(deviceStableId) {
  const sid = sanitizeDeviceStableId(deviceStableId);
  return sid ? `${DEVICE_SETTINGS_DIR}/${sid}.json` : '';
}
function sanitizeEventSegmentPath(path) {
  const p = safeString(path);
  return EVENT_SEGMENT_RE.test(p) ? p : '';
}
function parentDiskDir(path) {
  const p = safeString(path);
  const i = p.lastIndexOf('/');
  return i > 0 ? p.slice(0, i) : '';
}
function sanitizeUploadPath(mode, path) {
  const p = safeString(path);
  if (mode === 'upload_meta') return META_PATH;
  if (mode === 'upload_backup') return VERSION_RE.test(p) ? p : BACKUP_PATH;
  if (mode === 'upload_device_settings') return p === DEVICE_SETTINGS_INDEX_PATH || DEVICE_SETTINGS_FILE_RE.test(p) ? p : '';
  if (mode === 'upload_event_segment') return p === EVENT_ARCHIVE_INDEX_PATH || EVENT_SEGMENT_RE.test(p) ? p : '';
  return '';
}
function parseEventJsonBody(event) {
  const raw = event?.body || '';
  if (!raw) return { ok: false, status: 400, error: 'empty_body' };
  const text = event?.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : String(raw);
  if (Buffer.byteLength(text, 'utf8') > MAX_UPLOAD_BODY_BYTES) return { ok: false, status: 413, error: 'upload_body_too_large' };
  const data = safeParse(text);
  if (!data || typeof data !== 'object') return { ok: false, status: 400, error: 'invalid_json_body' };
  return { ok: true, data };
}
function resolveUploadPayload(mode, body) {
  if (!body || typeof body !== 'object') return null;
  if (mode === 'upload_meta') return body.meta || body.data || body;
  return body.data || body.backup || body.device || body.segment || body.index || null;
}
async function getDeviceSettingsMeta(token, deviceStableId) {
  const path = buildDeviceSettingsCloudPath(deviceStableId);
  if (!path) return { exists: false, device: null };
  const res = await getDiskJson(`${API}/resources?path=${encodeURIComponent(path)}`, token, META_ONLY_TIMEOUT_MS);
  if (res.status === 401 || res.status === 403) {
    return { error: res.status === 401 ? 'disk_auth_error' : 'disk_forbidden', status: res.status, raw: safeString(res.rawBody).slice(0, 500), stage: 'device_meta_resource_request', path };
  }
  if (res.status === 404) return { exists: false, device: null };
  if (res.status !== 200) {
    return { error: 'device_meta_error', status: res.status, raw: safeString(res.rawBody).slice(0, 500), stage: 'device_meta_resource_request', path };
  }
  return { exists: true, device: { path, timestamp: res.json?.modified ? Date.parse(res.json.modified) || 0 : 0, modified: res.json?.modified || null, size: safeNum(res.json?.size), deviceStableId: sanitizeDeviceStableId(deviceStableId) } };
}
async function downloadJsonResourceByPath(token, path, stages = {}) {
  if (!path) return { type: 'not_found', path: '' };
  const linkRes = await httpsGet(`${API}/resources/download?path=${encodeURIComponent(path)}`, { Authorization: `OAuth ${token}` }, 5, DEFAULT_TIMEOUT_MS);
  if (linkRes.status === 404) return { type: 'not_found', path };
  if (linkRes.status === 401) return { type: 'auth', status: 401, path, raw: safeString(linkRes.body).slice(0, 500) };
  if (linkRes.status === 403) return { type: 'forbidden', status: 403, path, raw: safeString(linkRes.body).slice(0, 500), stage: stages.link || 'download_link_request' };
  if (linkRes.status !== 200) return { type: 'api_error', status: linkRes.status, path, raw: safeString(linkRes.body).slice(0, 500), stage: stages.link || 'download_link_request' };
  const linkData = safeParse(linkRes.body);
  const downloadUrl = linkData?.href;
  if (!downloadUrl) return { type: 'bad_link', path, raw: safeString(linkRes.body).slice(0, 200), stage: stages.parse || 'download_link_parse' };
  let fileRes;
  try {
    fileRes = await httpsGet(downloadUrl, {}, 5, DOWNLOAD_TIMEOUT_MS);
  } catch (e) {
    if (safeString(e?.message) === 'response_too_large') return { type: 'too_large', status: 413, path, raw: 'backup_file_too_large', stage: stages.file || 'download_file' };
    return { type: 'download_failed', status: 0, path, raw: safeString(e.message || 'unknown_error'), stage: stages.file || 'download_file' };
  }
  if (fileRes.status !== 200) return { type: 'download_failed', status: fileRes.status, path, raw: safeString(fileRes.body).slice(0, 200), stage: stages.file || 'download_file' };
  const parsed = safeParse(fileRes.body);
  if (!parsed) return { type: 'invalid_json', path, stage: stages.json || 'download_file_parse' };
  return { type: 'ok', path, data: parsed };
}
async function downloadDeviceSettings(token, deviceStableId) {
  const path = buildDeviceSettingsCloudPath(deviceStableId);
  if (!path) return { type: 'not_found', path: '' };
  return downloadJsonResourceByPath(token, path, { link: 'device_download_link_request', parse: 'device_download_link_parse', file: 'device_download_file', json: 'device_download_file_parse' });
}
async function downloadBackup(token, selectedPath) {
  const path = sanitizeSelectedPath(selectedPath);
  return downloadJsonResourceByPath(token, path, { link: 'download_link_request', parse: 'download_link_parse', file: 'download_file', json: 'download_file_parse' });
}
module.exports.handler = async event => {
  const requestId = makeRequestId();
  const hdrs = event.headers || {};
  const origin = hdrs.origin || hdrs.Origin || '';
  const cors = corsHeaders(origin);
  const reply = (statusCode, body, extraHeaders = {}) => json(statusCode, cors, body, { 'X-Request-Id': requestId, ...extraHeaders });
  const enrichBody = (mode, body = {}) => ({ ...body, _proxyMeta: { requestId, mode, ts: nowTs() } });
  const replyDiskError = (modeName, result, { defaultStage = 'resource_request', defaultPath = '' } = {}) => {
    if (result?.error === 'disk_auth_error') {
      return reply(401, enrichBody(modeName, { error: result.error, hint: 'Yandex OAuth token expired or rejected. User needs to re-login.', status: result.status, raw: result.raw, stage: result.stage || defaultStage, path: result.path || defaultPath, authValidationDegraded: !!valid.degraded }));
    }
    if (result?.error === 'disk_forbidden') {
      return reply(403, enrichBody(modeName, { error: result.error, hint: 'Token lacks disk scope. Re-authorize and confirm disk access.', status: result.status, raw: result.raw, stage: result.stage || defaultStage, path: result.path || defaultPath, authValidationDegraded: !!valid.degraded }));
    }
    if (result?.error) {
      return reply(502, enrichBody(modeName, { error: result.error, status: result.status, raw: result.raw, stage: result.stage || defaultStage, path: result.path || defaultPath, authValidationDegraded: !!valid.degraded }));
    }
    return null;
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...cors, 'X-Request-Id': requestId }, body: '' };
  }
  const mode = getQuery(event, 'mode') || 'download';
  if (!ALLOWED_MODES.has(mode)) {
    return reply(400, enrichBody(mode, { error: 'bad_mode', allowedModes: [...ALLOWED_MODES] }));
  }
  if (mode === 'ping') {
    return reply(200, enrichBody('ping', { ok: true, mode: 'ping', service: 'vi3na1bita-backup-proxy', time: nowTs() }));
  }
  const token = extractAnyToken(event);
  if (!token) return reply(401, enrichBody(mode, { error: 'no_token' }));
  const valid = { ok: true, degraded: false };
  if (mode === 'meta') {
    try {
      const result = await getLatestBackupMeta(token, { withMeta: true });
      const errResp = replyDiskError('meta', result, { defaultStage: 'meta_resource_request', defaultPath: BACKUP_PATH });
      if (errResp) return errResp;
      return reply(200, enrichBody('meta', { ...result, degraded: !!result?.degradedMeta, authValidationDegraded: !!valid.degraded }));
    } catch (e) {
      return reply(500, enrichBody('meta', { error: 'meta_proxy_error', message: safeString(e?.message), authValidationDegraded: !!valid.degraded }));
    }
  }
  if (mode === 'lease_get') {
    try {
      const st = await getLeaseState(token);
      return reply(200, enrichBody('lease_get', { ok: true, lease: st.lease }));
    } catch (e) {
      return reply(500, enrichBody('lease_get', { error: 'lease_get_error', message: safeString(e?.message) }));
    }
  }
  if (mode === 'lease_acquire') {
    try {
      const r = await acquireLease(token, event);
      return reply(r.status || (r.ok ? 200 : 409), enrichBody('lease_acquire', r));
    } catch (e) {
      return reply(500, enrichBody('lease_acquire', { error: 'lease_acquire_error', message: safeString(e?.message) }));
    }
  }
  if (mode === 'lease_release') {
    try {
      const r = await releaseLease(token, event);
      return reply(r.status || (r.ok ? 200 : 409), enrichBody('lease_release', r));
    } catch (e) {
      return reply(500, enrichBody('lease_release', { error: 'lease_release_error', message: safeString(e?.message) }));
    }
  }
  if (mode === 'ledger_verify') {
    try {
      const rb = await readLatestBackupWithArchiveForVerify(token);
      if (!rb.ok) return reply(200, enrichBody('ledger_verify', { ok: false, status: 'unavailable', reason: rb.reason }));
      return reply(200, enrichBody('ledger_verify', { ...buildLedgerVerifyResult(rb.backup), archive: rb.archive || null }));
    } catch (e) {
      return reply(500, enrichBody('ledger_verify', { ok: false, status: 'error', error: 'ledger_verify_error', message: safeString(e?.message) }));
    }
  }
  if (mode.startsWith('upload_')) {
    try {
      if (event.httpMethod !== 'POST') return reply(405, enrichBody(mode, { error: 'method_not_allowed', expected: 'POST' }));
      const parsed = parseEventJsonBody(event);
      if (!parsed.ok) return reply(parsed.status || 400, enrichBody(mode, { error: parsed.error }));
      const body = parsed.data || {};
      const path = sanitizeUploadPath(mode, getQuery(event, 'path') || body.path || '');
      if (!path) return reply(400, enrichBody(mode, { error: 'bad_upload_path' }));
      const payload = resolveUploadPayload(mode, body);
      if (!payload || typeof payload !== 'object') return reply(400, enrichBody(mode, { error: 'bad_upload_payload', path }));
      let backupValidation = null;
      if (mode === 'upload_backup') {
        backupValidation = await validateBackupUpload(token, payload);
        if (!backupValidation.ok) {
          return reply(backupValidation.status || 409, enrichBody(mode, { ok: false, error: backupValidation.error, validation: backupValidation }));
        }
      }
      if (mode === 'upload_event_segment' && path !== EVENT_ARCHIVE_INDEX_PATH) {
        const validation = validateEventSegmentUpload(payload);
        if (!validation.ok) {
          return reply(validation.status || 409, enrichBody(mode, { ok: false, error: validation.error, validation }));
        }
      }
      await ensureDiskDir(token, APP_ROOT).catch(() => false);
      const pd = parentDiskDir(path);
      if (pd && pd !== APP_ROOT) await ensureDiskDir(token, pd).catch(() => false);
      const wr = await uploadJsonResourceByPath(token, path, payload);
      if (!wr.ok) return reply(502, enrichBody(mode, { error: 'upload_proxy_write_failed', path, status: wr.status, raw: wr.raw }));
      const rewardReceipt = mode === 'upload_backup' && path === BACKUP_PATH && backupValidation?.ok ? await flushBackupAchievementReceipts(token, backupValidation).catch(error => ({ ok: false, durable: false, pending: 0, error: normalizeErrMessage(error) })) : null;
      return reply(200, enrichBody(mode, { ok: true, path, status: wr.status, rewardReceipt }));
    } catch (e) {
      return reply(500, enrichBody(mode, { error: 'upload_proxy_error', message: safeString(e?.message), authValidationDegraded: !!valid.degraded }));
    }
  }
  if (mode === 'archive_inspect') {
    try {
      return reply(200, enrichBody('archive_inspect', { ok: true, archive: await inspectEventArchive(token) }));
    } catch (e) {
      return reply(500, enrichBody('archive_inspect', { ok: false, error: 'archive_inspect_error', message: safeString(e?.message), authValidationDegraded: !!valid.degraded }));
    }
  }
  if (mode === 'archive_list_files') {
    try {
      return reply(200, enrichBody('archive_list_files', { ok: true, archive: await listArchiveFilesForIndex(token) }));
    } catch (e) {
      return reply(500, enrichBody('archive_list_files', { ok: false, error: 'archive_list_files_error', message: safeString(e?.message), authValidationDegraded: !!valid.degraded }));
    }
  }
  if (mode === 'archive_delete_segments') {
    try {
      if (event.httpMethod !== 'POST') return reply(405, enrichBody('archive_delete_segments', { ok: false, error: 'method_not_allowed', expected: 'POST' }));
      const parsed = parseEventJsonBody(event);
      if (!parsed.ok) return reply(parsed.status || 400, enrichBody('archive_delete_segments', { ok: false, error: parsed.error }));
      const paths = sanitizeArchiveDeletePaths(parsed.data?.paths || []);
      if (!paths.length) return reply(400, enrichBody('archive_delete_segments', { ok: false, error: 'no_valid_segment_paths' }));
      return reply(200, enrichBody('archive_delete_segments', { ok: true, ...(await deleteArchiveSegments(token, paths)) }));
    } catch (e) {
      return reply(500, enrichBody('archive_delete_segments', { ok: false, error: 'archive_delete_segments_error', message: safeString(e?.message), authValidationDegraded: !!valid.degraded }));
    }
  }
  if (mode === 'event_index') {
    try {
      const result = await downloadJsonResourceByPath(token, EVENT_ARCHIVE_INDEX_PATH, { link: 'event_index_link_request', parse: 'event_index_link_parse', file: 'event_index_file', json: 'event_index_file_parse' });
      if (result.type === 'not_found') return reply(200, enrichBody('event_index', { exists: false, index: { version: '1.0', updatedAt: 0, items: [] } }));
      if (result.type === 'auth') return reply(401, enrichBody('event_index', { error: 'disk_auth_error', raw: result.raw }));
      if (result.type === 'forbidden') return reply(403, enrichBody('event_index', { error: 'disk_forbidden', raw: result.raw, stage: result.stage || 'unknown' }));
      if (result.type !== 'ok') return reply(200, enrichBody('event_index', { exists: false, reason: result.type, index: { version: '1.0', updatedAt: 0, items: [] } }));
      return reply(200, enrichBody('event_index', { exists: true, index: result.data }));
    } catch (e) {
      return reply(500, enrichBody('event_index', { error: 'event_index_proxy_error', message: safeString(e?.message), authValidationDegraded: !!valid.degraded }));
    }
  }
  if (mode === 'event_download') {
    try {
      const path = sanitizeEventSegmentPath(getQuery(event, 'path'));
      if (!path) return reply(400, enrichBody('event_download', { error: 'bad_event_segment_path' }));
      const result = await downloadJsonResourceByPath(token, path, { link: 'event_download_link_request', parse: 'event_download_link_parse', file: 'event_download_file', json: 'event_download_file_parse' });
      if (result.type === 'not_found') return reply(200, enrichBody('event_download', { exists: false, segment: null, reason: 'event_segment_not_found', path }));
      if (result.type === 'auth') return reply(401, enrichBody('event_download', { error: 'disk_auth_error', path, raw: result.raw }));
      if (result.type === 'forbidden') return reply(403, enrichBody('event_download', { error: 'disk_forbidden', path, raw: result.raw, stage: result.stage || 'unknown' }));
      if (result.type !== 'ok') return reply(502, enrichBody('event_download', { error: result.type, status: result.status, path, raw: result.raw, stage: result.stage || 'unknown' }));
      return reply(200, enrichBody('event_download', { exists: true, segment: result.data, path }));
    } catch (e) {
      return reply(500, enrichBody('event_download', { error: 'event_download_proxy_error', message: safeString(e?.message), authValidationDegraded: !!valid.degraded }));
    }
  }
  if (mode === 'device_index') {
    try {
      const result = await downloadJsonResourceByPath(token, DEVICE_SETTINGS_INDEX_PATH, { link: 'device_index_link_request', parse: 'device_index_link_parse', file: 'device_index_file', json: 'device_index_file_parse' });
      if (result.type === 'not_found') return reply(200, enrichBody('device_index', { exists: false, index: { version: '1.0', updatedAt: 0, items: [] } }));
      if (result.type === 'auth') return reply(401, enrichBody('device_index', { error: 'disk_auth_error', raw: result.raw }));
      if (result.type === 'forbidden') return reply(403, enrichBody('device_index', { error: 'disk_forbidden', raw: result.raw, stage: result.stage || 'unknown' }));
      if (result.type !== 'ok') return reply(200, enrichBody('device_index', { exists: false, reason: result.type, index: { version: '1.0', updatedAt: 0, items: [] } }));
      return reply(200, enrichBody('device_index', { exists: true, index: result.data }));
    } catch (e) {
      return reply(500, enrichBody('device_index', { error: 'device_index_proxy_error', message: safeString(e?.message), authValidationDegraded: !!valid.degraded }));
    }
  }
  if (mode === 'device_meta') {
    try {
      const deviceStableId = getQuery(event, 'deviceStableId');
      const result = await getDeviceSettingsMeta(token, deviceStableId);
      const errResp = replyDiskError('device_meta', result, { defaultStage: 'device_meta_resource_request', defaultPath: '' });
      if (errResp) return errResp;
      return reply(200, enrichBody('device_meta', { ...result, authValidationDegraded: !!valid.degraded }));
    } catch (e) {
      return reply(500, enrichBody('device_meta', { error: 'device_meta_proxy_error', message: safeString(e?.message), authValidationDegraded: !!valid.degraded }));
    }
  }
  if (mode === 'list') {
    try {
      const result = await listBackups(token);
      const errResp = replyDiskError('list', result, { defaultStage: 'list_folder_request', defaultPath: APP_ROOT });
      if (errResp) return errResp;
      return reply(200, enrichBody('list', { ...result, degraded: !!result?.degradedMeta, authValidationDegraded: !!valid.degraded }));
    } catch (e) {
      return reply(500, enrichBody('list', { error: 'list_proxy_error', message: safeString(e?.message), authValidationDegraded: !!valid.degraded }));
    }
  }
  try {
    if (mode === 'device_download') {
      const deviceStableId = getQuery(event, 'deviceStableId');
      const result = await downloadDeviceSettings(token, deviceStableId);
      if (result.type === 'not_found') return reply(200, enrichBody('device_download', { exists: false, device: null, reason: 'device_settings_not_found', path: result.path || '' }));
      if (result.type === 'auth') return reply(401, enrichBody('device_download', { error: 'disk_auth_error', path: result.path || '', raw: result.raw }));
      if (result.type === 'forbidden') return reply(403, enrichBody('device_download', { error: 'disk_forbidden', path: result.path || '', raw: result.raw, stage: result.stage || 'unknown' }));
      if (result.type === 'api_error' && Number(result.status) === 409) return reply(200, enrichBody('device_download', { exists: false, device: null, reason: 'device_settings_temporarily_unavailable', status: result.status, path: result.path || '', raw: result.raw, stage: result.stage || 'unknown' }));
      if (result.type === 'api_error') return reply(502, enrichBody('device_download', { error: 'disk_api_error', status: result.status, path: result.path || '', raw: result.raw, stage: result.stage || 'unknown' }));
      if (result.type === 'bad_link') return reply(502, enrichBody('device_download', { error: 'no_href', path: result.path || '', raw: result.raw, stage: result.stage || 'unknown' }));
      if (result.type === 'download_failed' && Number(result.status) === 409) return reply(200, enrichBody('device_download', { exists: false, device: null, reason: 'device_settings_temporarily_unavailable', status: result.status, path: result.path || '', raw: result.raw, stage: result.stage || 'unknown' }));
      if (result.type === 'download_failed') return reply(502, enrichBody('device_download', { error: 'download_failed', status: result.status, path: result.path || '', raw: result.raw, stage: result.stage || 'unknown' }));
      if (result.type === 'too_large') return reply(200, enrichBody('device_download', { exists: false, device: null, reason: 'device_settings_too_large', status: result.status, path: result.path || '', stage: result.stage || 'unknown' }));
      if (result.type === 'invalid_json') return reply(200, enrichBody('device_download', { exists: false, device: null, reason: 'invalid_json_in_device_settings', path: result.path || '', stage: result.stage || 'unknown' }));
      return reply(200, enrichBody('device_download', { ...result.data, _downloadMeta: { selectedPath: result.path || '', authValidationDegraded: !!valid.degraded } }));
    }
    const selectedPath = getQuery(event, 'path') || BACKUP_PATH;
    const result = await downloadBackup(token, selectedPath);
    if (result.type === 'not_found') {
      return reply(404, enrichBody('download', { error: 'not_found', reason: 'backup_not_found', path: result.path || BACKUP_PATH }));
    }
    if (result.type === 'auth') {
      return reply(401, enrichBody('download', { error: 'disk_auth_error', path: result.path || BACKUP_PATH, raw: result.raw }));
    }
    if (result.type === 'forbidden') {
      return reply(403, enrichBody('download', { error: 'disk_forbidden', path: result.path || BACKUP_PATH, raw: result.raw, stage: result.stage || 'unknown' }));
    }
    if (result.type === 'api_error') {
      return reply(502, enrichBody('download', { error: 'disk_api_error', status: result.status, path: result.path || BACKUP_PATH, raw: result.raw, stage: result.stage || 'unknown' }));
    }
    if (result.type === 'bad_link') {
      return reply(502, enrichBody('download', { error: 'no_href', path: result.path || BACKUP_PATH, raw: result.raw, stage: result.stage || 'unknown' }));
    }
    if (result.type === 'too_large') {
      return reply(413, enrichBody('download', { error: 'backup_file_too_large', status: result.status, path: result.path || BACKUP_PATH, raw: result.raw, stage: result.stage || 'unknown' }));
    }
    if (result.type === 'download_failed') {
      return reply(502, enrichBody('download', { error: 'download_failed', status: result.status, path: result.path || BACKUP_PATH, raw: result.raw, stage: result.stage || 'unknown' }));
    }
    if (result.type === 'invalid_json') {
      return reply(502, enrichBody('download', { error: 'invalid_json_in_backup', path: result.path || BACKUP_PATH, stage: result.stage || 'unknown' }));
    }
    return reply(200, enrichBody('download', { ...result.data, _downloadMeta: { selectedPath: result.path || BACKUP_PATH, authValidationDegraded: !!valid.degraded } }));
  } catch (e) {
    return reply(500, enrichBody('download', { error: 'proxy_error', message: safeString(e?.message) }));
  }
};
