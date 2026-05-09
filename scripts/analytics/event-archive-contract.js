// UID.003_(Event log truth)_(event archive хранит долгую историю сегментами)_(latest backup постепенно облегчается)
// UID.099_(Multi-device sync model)_(archive сегменты per-device/per-chain/per-seq)_(hard reset создаёт новую ветку, а не конфликт seq)
// UID.100_(Backup snapshot as life capsule)_(архив событий отдельно от snapshot)_(сохраняем историю без раздувания latest)

export const EVENT_ARCHIVE_DIR = 'app:/Backup/events';
export const EVENT_ARCHIVE_INDEX_PATH = `${EVENT_ARCHIVE_DIR}/index.json`;
export const EVENT_ARCHIVE_VERSION = '1.1';

const s = v => String(v == null ? '' : v).trim();
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const safeId = v => s(v).replace(/[^A-Za-z0-9._-]/g, '') || 'unknown';

export const buildEventSegmentPath = ({ deviceStableId = '', branchId = '', fromSeq = 0, toSeq = 0, hash = '' } = {}) => {
  const branch = safeId(branchId || deviceStableId);
  return `${EVENT_ARCHIVE_DIR}/seg_${branch}_${n(fromSeq)}_${n(toSeq)}_${s(hash).slice(0, 16)}.json`;
};

export const normalizeEventArchiveSegment = raw => ({
  version: s(raw?.version || EVENT_ARCHIVE_VERSION) || EVENT_ARCHIVE_VERSION,
  createdAt: n(raw?.createdAt) || Date.now(),
  deviceStableId: safeId(raw?.deviceStableId || ''),
  branchId: safeId(raw?.branchId || raw?.archiveBranchId || raw?.deviceStableId || ''),
  chainId: s(raw?.chainId || ''),
  fromSeq: n(raw?.fromSeq),
  toSeq: n(raw?.toSeq),
  eventCount: n(raw?.eventCount),
  hash: s(raw?.hash || ''),
  events: Array.isArray(raw?.events) ? raw.events.filter(e => e?.eventId) : []
});

export const buildEventArchiveIndexItem = seg => {
  const x = normalizeEventArchiveSegment(seg);
  return {
    path: s(seg?.path || buildEventSegmentPath(x)),
    deviceStableId: x.deviceStableId,
    branchId: x.branchId,
    chainId: x.chainId,
    fromSeq: x.fromSeq,
    toSeq: x.toSeq,
    eventCount: x.eventCount || x.events.length,
    hash: x.hash,
    createdAt: x.createdAt
  };
};

export const normalizeEventArchiveIndex = raw => {
  const rows = Array.isArray(raw?.items) ? raw.items : (Array.isArray(raw) ? raw : []);
  return {
    version: EVENT_ARCHIVE_VERSION,
    updatedAt: Date.now(),
    items: [...new Map(rows.map(buildEventArchiveIndexItem).filter(x => x.path).map(x => [x.path, x])).values()]
      .sort((a, b) => String(a.branchId || a.deviceStableId).localeCompare(String(b.branchId || b.deviceStableId)) || n(a.fromSeq) - n(b.fromSeq))
  };
};

export default { EVENT_ARCHIVE_DIR, EVENT_ARCHIVE_INDEX_PATH, EVENT_ARCHIVE_VERSION, buildEventSegmentPath, normalizeEventArchiveSegment, buildEventArchiveIndexItem, normalizeEventArchiveIndex };
