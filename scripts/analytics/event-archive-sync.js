// UID.003_(Event log truth)_(загружать новые ledger events отдельными archive сегментами)_(latest backup теперь можно безопасно облегчать)
// UID.099_(Multi-device sync model)_(per-device/per-chain seq watermark)_(hard reset создаёт новую ветку archive)
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
const branchFrom = ({ deviceStableId = '', chainId = '' } = {}) => safe(`${safe(deviceStableId)}_${s(chainId).replace(/^chain_/, '').slice(0, 12) || 'legacy'}`);
const lastKey = bid => `${LAST_SEQ_PREFIX}${bid || 'unknown'}`;
const hashKey = bid => `${LAST_HASH_PREFIX}${bid || 'unknown'}`;

export const getCurrentEventArchiveBranch = async ({ db = defaultMetaDB } = {}) => {
  const cp = await readLedgerCheckpoint(db).catch(() => null), sid = currentStableId();
  return { deviceStableId: sid, chainId: s(cp?.chainId || ''), branchId: branchFrom({ deviceStableId: sid, chainId: cp?.chainId || '' }) };
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
  const rows = (idx?.items || []).filter(x => s(x.branchId || '').trim() === s(branchId));
  if (!rows.length) return getLocalEventArchiveWatermark(branchId);
  const best = rows.sort((a, b) => n(b.toSeq) - n(a.toSeq))[0];
  const local = getLocalEventArchiveWatermark(branchId);
  if (n(best.toSeq) > n(local.lastSeq)) setLocalEventArchiveWatermark({ branchId, lastSeq: best.toSeq, lastHash: best.hash || '' });
  return getLocalEventArchiveWatermark(branchId);
};

export const getLocalDeviceMaxSeq = async ({ db = defaultMetaDB, deviceStableId = currentStableId(), chainId = '' } = {}) => {
  const sid = s(deviceStableId);
  if (!sid) return 0;
  const all = await readLocalEventLog(db, { forceFlush: true }).catch(() => []);
  return Math.max(0, ...(Array.isArray(all) ? all : []).filter(e => s(e?.deviceStableId) === sid && (!chainId || s(e?.chainId) === s(chainId))).map(e => n(e?.deviceSeq)));
};

export const buildLocalEventArchiveDelta = async ({ db = defaultMetaDB, limit = 500 } = {}) => {
  const br = await getCurrentEventArchiveBranch({ db });
  if (!br.deviceStableId || !br.branchId) return null;
  const wm = getLocalEventArchiveWatermark(br.branchId), all = await readLocalEventLog(db, { forceFlush: true }).catch(() => []);
  const events = (Array.isArray(all) ? all : [])
    .filter(e => s(e?.deviceStableId) === br.deviceStableId && s(e?.chainId || '') === s(br.chainId || '') && n(e?.deviceSeq) > wm.lastSeq && s(e?.eventHash) && !isBackupSemanticNoiseEvent(e))
    .sort((a, b) => n(a.deviceSeq) - n(b.deviceSeq))
    .slice(0, limit);
  if (!events.length) return null;
  const fromSeq = n(events[0].deviceSeq), toSeq = n(events[events.length - 1].deviceSeq), hash = await sha256Hex(stableStringify(events));
  const path = buildEventSegmentPath({ deviceStableId: br.deviceStableId, branchId: br.branchId, fromSeq, toSeq, hash });
  return normalizeEventArchiveSegment({ path, createdAt: Date.now(), deviceStableId: br.deviceStableId, branchId: br.branchId, chainId: br.chainId, fromSeq, toSeq, eventCount: events.length, hash, events });
};

export const uploadLocalEventArchiveDelta = async ({ disk, token, db = defaultMetaDB } = {}) => {
  if (!disk?.uploadEventSegment || !token) return { ok: false, uploaded: false, reason: 'archive_transport_missing' };
  const seg = await buildLocalEventArchiveDelta({ db });
  if (!seg) return { ok: true, uploaded: false, reason: 'no_new_events' };
  const r = await disk.uploadEventSegment(token, seg);
  if (r?.ok) setLocalEventArchiveWatermark({ branchId: seg.branchId, lastSeq: seg.toSeq, lastHash: seg.hash });
  return { ok: !!r?.ok, uploaded: !!r?.ok, segment: seg, item: r?.item || null, reason: r?.ok ? 'uploaded' : (r?.reason || 'upload_failed') };
};

export const uploadLocalEventArchiveUntilCaughtUp = async ({ disk, token, db = defaultMetaDB, maxSegments = 20 } = {}) => {
  const br = await getCurrentEventArchiveBranch({ db });
  await syncWatermarkFromCloudIndex({ disk, token, branchId: br.branchId }).catch(() => null);
  let uploadedSegments = 0, uploadedEvents = 0, last = null;
  for (let i = 0; i < maxSegments; i++) {
    last = await uploadLocalEventArchiveDelta({ disk, token, db }).catch(e => ({ ok: false, uploaded: false, reason: e?.message || 'archive_failed' }));
    if (!last?.uploaded) break;
    uploadedSegments++;
    uploadedEvents += n(last?.segment?.eventCount);
  }
  const wm = getLocalEventArchiveWatermark(br.branchId), maxSeq = await getLocalDeviceMaxSeq({ db, deviceStableId: br.deviceStableId, chainId: br.chainId }).catch(() => 0);
  return { ok: !last || last.ok !== false, uploaded: uploadedSegments > 0, uploadedSegments, uploadedEvents, branch: br, watermark: wm, maxSeq, caughtUp: !!br.branchId && n(wm.lastSeq) >= n(maxSeq), reason: last?.reason || (uploadedSegments ? 'uploaded' : 'no_new_events') };
};

export default { getCurrentEventArchiveBranch, getLocalEventArchiveWatermark, setLocalEventArchiveWatermark, syncWatermarkFromCloudIndex, getLocalDeviceMaxSeq, buildLocalEventArchiveDelta, uploadLocalEventArchiveDelta, uploadLocalEventArchiveUntilCaughtUp };
