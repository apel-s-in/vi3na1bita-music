// UID.003_(Event log truth)_(загружать ledger events отдельными archive сегментами)_(latest backup можно безопасно облегчать)
// UID.099_(Multi-device sync model)_(all-branches backfill + contiguous ranges)_(hard reset не плодит sparse/дырявые сегменты)
// UID.100_(Backup snapshot as life capsule)_(archive upload best-effort)_(ошибка архива не ломает основной backup)

import { metaDB as defaultMetaDB } from './meta-db.js';
import { readLocalEventLog } from './stats-state.js';
import { stableStringify, sha256Hex } from './backup-builders.js';
import { buildEventSegmentPath, normalizeEventArchiveSegment } from './event-archive-contract.js';
import { isBackupSemanticNoiseEvent } from './event-contract.js';
import { readLedgerCheckpoint } from './event-integrity.js';

const LAST_SEQ_PREFIX = 'backup:event_archive:last_seq:v2:';
const LAST_HASH_PREFIX = 'backup:event_archive:last_hash:v2:';
const s = v => String(v == null ? '' : v).trim();
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const safe = v => s(v).replace(/[^A-Za-z0-9._-]/g, '') || 'unknown';

const currentStableId = () => s(localStorage.getItem('deviceStableId') || '');
export const buildEventArchiveBranchId = ({ deviceStableId = '', chainId = '' } = {}) => safe(`${safe(deviceStableId)}_${s(chainId).replace(/^chain_/, '').slice(0, 12) || 'legacy'}`);
const lastKey = bid => `${LAST_SEQ_PREFIX}${bid || 'unknown'}`;
const hashKey = bid => `${LAST_HASH_PREFIX}${bid || 'unknown'}`;

const isArchivable = e => !!(e?.eventId && s(e.eventHash) && s(e.deviceStableId) && s(e.chainId) && n(e.deviceSeq) && !isBackupSemanticNoiseEvent(e));
const branchOfEvent = e => ({ deviceStableId: s(e.deviceStableId), chainId: s(e.chainId), branchId: buildEventArchiveBranchId(e) });

export const getCurrentEventArchiveBranch = async ({ db = defaultMetaDB } = {}) => {
  const cp = await readLedgerCheckpoint(db).catch(() => null), sid = currentStableId();
  return { deviceStableId: sid, chainId: s(cp?.chainId || ''), branchId: buildEventArchiveBranchId({ deviceStableId: sid, chainId: cp?.chainId || '' }) };
};

export const getLocalEventArchiveWatermark = (branchId = '') => ({
  branchId: s(branchId),
  lastSeq: n(localStorage.getItem(lastKey(branchId)) || 0),
  lastHash: s(localStorage.getItem(hashKey(branchId)) || '')
});

export const setLocalEventArchiveWatermark = ({ branchId = '', lastSeq = 0, lastHash = '' } = {}) => {
  try {
    if (!branchId) return;
    localStorage.setItem(lastKey(branchId), String(n(lastSeq)));
    if (lastHash) localStorage.setItem(hashKey(branchId), s(lastHash));
  } catch {}
};

export const syncWatermarkFromCloudIndex = async ({ disk, token, branchId = '' } = {}) => {
  if (!disk?.getEventArchiveIndex || !token || !branchId) return getLocalEventArchiveWatermark(branchId);
  const idx = await disk.getEventArchiveIndex(token).catch(() => null);
  const rows = (idx?.items || []).filter(x => s(x.branchId || '') === s(branchId));
  if (!rows.length) return getLocalEventArchiveWatermark(branchId);
  const best = rows.sort((a, b) => n(b.toSeq) - n(a.toSeq))[0], local = getLocalEventArchiveWatermark(branchId);
  if (n(best.toSeq) > n(local.lastSeq)) setLocalEventArchiveWatermark({ branchId, lastSeq: best.toSeq, lastHash: best.hash || '' });
  return getLocalEventArchiveWatermark(branchId);
};

export const getLocalDeviceMaxSeq = async ({ db = defaultMetaDB, deviceStableId = currentStableId(), chainId = '' } = {}) => {
  const sid = s(deviceStableId);
  if (!sid) return 0;
  const all = await readLocalEventLog(db, { forceFlush: true }).catch(() => []);
  return Math.max(0, ...(Array.isArray(all) ? all : []).filter(e => s(e?.deviceStableId) === sid && (!chainId || s(e?.chainId) === s(chainId))).map(e => n(e?.deviceSeq)));
};

const groupLocalArchivableEvents = async ({ db = defaultMetaDB } = {}) => {
  const all = await readLocalEventLog(db, { forceFlush: true }).catch(() => []);
  const by = new Map();
  (Array.isArray(all) ? all : []).filter(isArchivable).forEach(e => {
    const br = branchOfEvent(e);
    (by.get(br.branchId) || by.set(br.branchId, { ...br, events: [] }).get(br.branchId)).events.push(e);
  });
  [...by.values()].forEach(g => g.events.sort((a, b) => n(a.deviceSeq) - n(b.deviceSeq) || n(a.timestamp) - n(b.timestamp)));
  return [...by.values()].sort((a, b) => s(a.branchId).localeCompare(s(b.branchId)));
};

const buildDeltaForBranch = async ({ group, watermarkSeq = 0, limit = 500 } = {}) => {
  const rows = (group?.events || []).filter(e => n(e.deviceSeq) > n(watermarkSeq));
  if (!rows.length) return null;
  const picked = [];
  let lastSeq = 0;
  for (const e of rows) {
    const seq = n(e.deviceSeq);
    if (!picked.length) { picked.push(e); lastSeq = seq; continue; }
    if (seq !== lastSeq + 1 || picked.length >= limit) break;
    picked.push(e); lastSeq = seq;
  }
  if (!picked.length) return null;
  const fromSeq = n(picked[0].deviceSeq), toSeq = n(picked[picked.length - 1].deviceSeq), hash = await sha256Hex(stableStringify(picked));
  const path = buildEventSegmentPath({ deviceStableId: group.deviceStableId, branchId: group.branchId, fromSeq, toSeq, hash });
  return { ...normalizeEventArchiveSegment({ path, createdAt: Date.now(), deviceStableId: group.deviceStableId, branchId: group.branchId, chainId: group.chainId, fromSeq, toSeq, eventCount: picked.length, hash, events: picked }), path };
};

export const buildLocalEventArchiveDelta = async ({ db = defaultMetaDB, limit = 500 } = {}) => {
  const cur = await getCurrentEventArchiveBranch({ db });
  const groups = await groupLocalArchivableEvents({ db });
  const g = groups.find(x => x.branchId === cur.branchId);
  if (!g) return null;
  const wm = getLocalEventArchiveWatermark(g.branchId);
  return await buildDeltaForBranch({ group: g, watermarkSeq: wm.lastSeq, limit });
};

export const uploadLocalEventArchiveDelta = async ({ disk, token, db = defaultMetaDB } = {}) => {
  if (!disk?.uploadEventSegment || !token) return { ok: false, uploaded: false, reason: 'archive_transport_missing' };
  const seg = await buildLocalEventArchiveDelta({ db });
  if (!seg) return { ok: true, uploaded: false, reason: 'no_new_events' };
  const r = await disk.uploadEventSegment(token, seg);
  if (r?.ok) setLocalEventArchiveWatermark({ branchId: seg.branchId, lastSeq: seg.toSeq, lastHash: seg.hash });
  return { ok: !!r?.ok, uploaded: !!r?.ok, segment: seg, item: r?.item || null, reason: r?.ok ? 'uploaded' : (r?.reason || 'upload_failed') };
};

export const uploadLocalEventArchiveUntilCaughtUp = async ({ disk, token, db = defaultMetaDB, maxSegments = 20, limit = 500 } = {}) => {
  if (!disk?.uploadEventSegment || !token) return { ok: false, uploaded: false, reason: 'archive_transport_missing' };
  const groups = await groupLocalArchivableEvents({ db });
  if (disk?.getEventArchiveIndex) await Promise.all(groups.map(g => syncWatermarkFromCloudIndex({ disk, token, branchId: g.branchId }).catch(() => null)));

  let uploadedSegments = 0, uploadedEvents = 0, last = null;
  for (let i = 0; i < maxSegments; i++) {
    let did = false;
    for (const g of groups) {
      if (uploadedSegments >= maxSegments) break;
      const wm = getLocalEventArchiveWatermark(g.branchId);
      const seg = await buildDeltaForBranch({ group: g, watermarkSeq: wm.lastSeq, limit }).catch(() => null);
      if (!seg) continue;
      last = await disk.uploadEventSegment(token, seg).catch(e => ({ ok: false, reason: e?.message || 'upload_failed' }));
      if (!last?.ok) break;
      setLocalEventArchiveWatermark({ branchId: seg.branchId, lastSeq: seg.toSeq, lastHash: seg.hash });
      uploadedSegments++; uploadedEvents += n(seg.eventCount); did = true;
    }
    if (!did || last?.ok === false) break;
  }

  const branchStats = groups.map(g => {
    const wm = getLocalEventArchiveWatermark(g.branchId), maxSeq = Math.max(0, ...g.events.map(e => n(e.deviceSeq)));
    return { branchId: g.branchId, chainId: g.chainId, deviceStableId: g.deviceStableId, events: g.events.length, maxSeq, watermarkSeq: wm.lastSeq, caughtUp: n(wm.lastSeq) >= n(maxSeq) };
  });
  const cur = await getCurrentEventArchiveBranch({ db }).catch(() => ({}));
  const curStat = branchStats.find(x => x.branchId === cur.branchId) || null;

  return { ok: !last || last.ok !== false, uploaded: uploadedSegments > 0, uploadedSegments, uploadedEvents, branch: cur, branches: branchStats, watermark: curStat ? getLocalEventArchiveWatermark(curStat.branchId) : {}, maxSeq: curStat?.maxSeq || 0, caughtUp: branchStats.every(x => x.caughtUp), reason: last?.reason || (uploadedSegments ? 'uploaded' : 'no_new_events') };
};

export default { buildEventArchiveBranchId, getCurrentEventArchiveBranch, getLocalEventArchiveWatermark, setLocalEventArchiveWatermark, syncWatermarkFromCloudIndex, getLocalDeviceMaxSeq, buildLocalEventArchiveDelta, uploadLocalEventArchiveDelta, uploadLocalEventArchiveUntilCaughtUp };
