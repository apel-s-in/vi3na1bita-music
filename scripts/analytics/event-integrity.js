// UID.003_(Event log truth)_(event ledger v2 добавляет проверяемую цепочку событий)_(deviceSeq/prevHash/eventHash/checkpoint)
// UID.104_(Trust and eligibility state)_(ledger health — база будущего trust/prize слоя)_(локальный прогресс не блокируется, но подозрения видны)
// UID.109_(Yandex Cloud Functions validation layer)_(будущая server validation сможет проверять hash-chain)_(сейчас локальный фундамент без backend-зависимости)

import { metaDB as defaultMetaDB } from './meta-db.js';
import { normalizeEventList } from './backup-event-cleanup.js';

export const LEDGER_CHECKPOINT_KEY = 'event_ledger_checkpoint';
const CHAIN_ID_KEY = 'eventLedger:chainId:v1';
const s = v => String(v == null ? '' : v).trim();
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;

export const sortObj = v => Array.isArray(v) ? v.map(sortObj) : (!v || typeof v !== 'object') ? v : Object.keys(v).sort().reduce((a, k) => (a[k] = sortObj(v[k]), a), {});
export const stableStringify = v => JSON.stringify(sortObj(v));
export const sha256Hex = async v => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(v || ''))))].map(b => b.toString(16).padStart(2, '0')).join('');

const chainId = () => {
  try {
    let id = localStorage.getItem(CHAIN_ID_KEY);
    if (!id) localStorage.setItem(CHAIN_ID_KEY, id = `chain_${crypto.randomUUID()}`);
    return id;
  } catch { return `chain_${crypto.randomUUID()}`; }
};

export const normalizeLedgerCheckpoint = raw => ({
  version: 'ledger-v2',
  chainId: s(raw?.chainId) || chainId(),
  deviceSeq: Math.max(0, n(raw?.deviceSeq)),
  headHash: s(raw?.headHash || ''),
  deviceStableId: s(raw?.deviceStableId || localStorage.getItem('deviceStableId') || ''),
  deviceHash: s(raw?.deviceHash || localStorage.getItem('deviceHash') || ''),
  updatedAt: n(raw?.updatedAt) || 0
});

export const readLedgerCheckpoint = async (db = defaultMetaDB) =>
  normalizeLedgerCheckpoint((await db.getGlobal(LEDGER_CHECKPOINT_KEY).catch(() => null))?.value || {});

export const writeLedgerCheckpoint = async (db = defaultMetaDB, cp = {}) => {
  const row = normalizeLedgerCheckpoint(cp);
  await db.setGlobal(LEDGER_CHECKPOINT_KEY, row);
  try { window.dispatchEvent(new CustomEvent('event-ledger:checkpoint', { detail: row })); } catch {}
  return row;
};

const makeSourceClock = (ev, ts = Date.now()) => ev?.sourceClock && typeof ev.sourceClock === 'object' ? ev.sourceClock : {
  clientTs: n(ev?.timestamp || ts) || ts,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  offsetMin: new Date(n(ev?.timestamp || ts) || ts).getTimezoneOffset()
};

const ownerHash = async () => {
  const id = s(window.YandexAuth?.getProfile?.()?.yandexId || '');
  return id ? await sha256Hex(`ya:${id}`) : '';
};

export const hashEvent = async ev => {
  const { eventHash, ...rest } = ev || {};
  return await sha256Hex(stableStringify(rest));
};

export const buildLedgerEvents = async (events = [], { db = defaultMetaDB, checkpoint = null } = {}) => {
  let cp = normalizeLedgerCheckpoint(checkpoint || await readLedgerCheckpoint(db));
  const out = [], ownerYandexIdHash = await ownerHash().catch(() => '');
  for (const raw of Array.isArray(events) ? events : []) {
    if (!raw?.eventId) continue;
    const deviceSeq = cp.deviceSeq + 1;
    const ev = {
      ...raw,
      sourceClock: makeSourceClock(raw, raw.timestamp),
      chainId: cp.chainId,
      deviceSeq,
      prevHash: cp.headHash || '',
      ownerYandexIdHash
    };
    ev.eventHash = await hashEvent(ev);
    cp = normalizeLedgerCheckpoint({ ...cp, deviceSeq, headHash: ev.eventHash, deviceStableId: ev.deviceStableId || cp.deviceStableId, deviceHash: ev.deviceHash || cp.deviceHash, updatedAt: Date.now() });
    out.push(ev);
  }
  return { events: out, checkpoint: cp };
};

export const getLedgerHealth = async ({ db = defaultMetaDB, cloudMeta = null } = {}) => {
  const [hot, warm, cp] = await Promise.all([
    db.getEvents('events_hot').catch(() => []),
    db.getEvents('events_warm').catch(() => []),
    readLedgerCheckpoint(db).catch(() => normalizeLedgerCheckpoint({}))
  ]);
  const all = normalizeEventList([...(warm || []), ...(hot || [])], { limit: 10000, sort: true });
  const noHashCount = all.filter(e => !e.eventHash).length;
  const seqs = all.map(e => n(e.deviceSeq)).filter(Boolean);
  const maxSeqInEvents = Math.max(0, ...seqs);
  const cloudHead = s(cloudMeta?.eventLedgerHead || '');
  const cloudSeq = n(cloudMeta?.eventLedgerSeq);
  const branchState = !cloudHead ? 'cloud_unknown' : (cloudHead === cp.headHash ? 'same_head' : (cloudSeq > cp.deviceSeq ? 'cloud_ahead_or_diverged' : 'local_ahead_or_diverged'));
  const warnings = [
    !cp.headHash ? 'ledger checkpoint ещё не создан' : '',
    noHashCount ? `legacy-событий без eventHash: ${noHashCount}` : '',
    hot?.length ? `events_hot ожидают обработки: ${hot.length}` : '',
    maxSeqInEvents > cp.deviceSeq ? 'в событиях seq выше checkpoint' : '',
    cloudHead && cloudHead !== cp.headHash ? 'cloud ledger head отличается от локального' : ''
  ].filter(Boolean);
  return { checkpoint: cp, hotCount: hot?.length || 0, warmCount: warm?.length || 0, totalCount: all.length, noHashCount, maxSeqInEvents, branchState, cloudHead, cloudSeq, warnings };
};

export default { LEDGER_CHECKPOINT_KEY, stableStringify, sha256Hex, normalizeLedgerCheckpoint, readLedgerCheckpoint, writeLedgerCheckpoint, hashEvent, buildLedgerEvents, getLedgerHealth };
