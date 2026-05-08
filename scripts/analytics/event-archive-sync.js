// UID.003_(Event log truth)_(загружать новые ledger events отдельными archive сегментами)_(latest backup пока сохраняется, но история уже архивируется)
// UID.099_(Multi-device sync model)_(per-device seq watermark)_(каждое устройство догружает только свой хвост)
// UID.100_(Backup snapshot as life capsule)_(archive upload best-effort)_(ошибка архива не ломает основной backup)

import { metaDB as defaultMetaDB } from './meta-db.js';
import { readLocalEventLog } from './stats-state.js';
import { stableStringify, sha256Hex } from './backup-builders.js';
import { buildEventSegmentPath, normalizeEventArchiveSegment } from './event-archive-contract.js';

const LAST_SEQ_PREFIX = 'backup:event_archive:last_seq:v1:';
const LAST_HASH_PREFIX = 'backup:event_archive:last_hash:v1:';
const s = v => String(v == null ? '' : v).trim();
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;

const currentStableId = () => s(localStorage.getItem('deviceStableId') || '');
const lastKey = sid => `${LAST_SEQ_PREFIX}${sid || 'unknown'}`;
const hashKey = sid => `${LAST_HASH_PREFIX}${sid || 'unknown'}`;

export const getLocalEventArchiveWatermark = (deviceStableId = currentStableId()) => ({
  deviceStableId,
  lastSeq: n(localStorage.getItem(lastKey(deviceStableId)) || 0),
  lastHash: s(localStorage.getItem(hashKey(deviceStableId)) || '')
});

export const setLocalEventArchiveWatermark = ({ deviceStableId = currentStableId(), lastSeq = 0, lastHash = '' } = {}) => {
  try {
    localStorage.setItem(lastKey(deviceStableId), String(n(lastSeq)));
    if (lastHash) localStorage.setItem(hashKey(deviceStableId), s(lastHash));
  } catch {}
};

export const buildLocalEventArchiveDelta = async ({ db = defaultMetaDB, limit = 500 } = {}) => {
  const sid = currentStableId();
  if (!sid) return null;

  const wm = getLocalEventArchiveWatermark(sid);
  const all = await readLocalEventLog(db, { forceFlush: true }).catch(() => []);
  const events = (Array.isArray(all) ? all : [])
    .filter(e => s(e?.deviceStableId) === sid && n(e?.deviceSeq) > wm.lastSeq && s(e?.eventHash))
    .sort((a, b) => n(a.deviceSeq) - n(b.deviceSeq))
    .slice(0, limit);

  if (!events.length) return null;

  const fromSeq = n(events[0].deviceSeq), toSeq = n(events[events.length - 1].deviceSeq);
  const hash = await sha256Hex(stableStringify(events));
  const path = buildEventSegmentPath({ deviceStableId: sid, fromSeq, toSeq, hash });

  return normalizeEventArchiveSegment({
    path,
    createdAt: Date.now(),
    deviceStableId: sid,
    fromSeq,
    toSeq,
    eventCount: events.length,
    hash,
    events
  });
};

export const uploadLocalEventArchiveDelta = async ({ disk, token, db = defaultMetaDB } = {}) => {
  if (!disk?.uploadEventSegment || !token) return { ok: false, uploaded: false, reason: 'archive_transport_missing' };
  const seg = await buildLocalEventArchiveDelta({ db });
  if (!seg) return { ok: true, uploaded: false, reason: 'no_new_events' };

  const r = await disk.uploadEventSegment(token, seg);
  if (r?.ok) setLocalEventArchiveWatermark({ deviceStableId: seg.deviceStableId, lastSeq: seg.toSeq, lastHash: seg.hash });
  return { ok: !!r?.ok, uploaded: !!r?.ok, segment: seg, item: r?.item || null, reason: r?.ok ? 'uploaded' : (r?.reason || 'upload_failed') };
};

export default {
  getLocalEventArchiveWatermark,
  setLocalEventArchiveWatermark,
  buildLocalEventArchiveDelta,
  uploadLocalEventArchiveDelta
};
