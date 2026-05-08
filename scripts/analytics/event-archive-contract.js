// UID.003_(Event log truth)_(event archive хранит долгую историю сегментами)_(latest backup постепенно облегчается)
// UID.099_(Multi-device sync model)_(archive сегменты per-device/per-seq)_(дальше можно делать delta restore)
// UID.100_(Backup snapshot as life capsule)_(архив событий отдельно от snapshot)_(сохраняем историю без раздувания latest)

export const EVENT_ARCHIVE_DIR = 'app:/Backup/events';
export const EVENT_ARCHIVE_INDEX_PATH = `${EVENT_ARCHIVE_DIR}/index.json`;
export const EVENT_ARCHIVE_VERSION = '1.0';

const s = v => String(v == null ? '' : v).trim();
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const sid = v => s(v).replace(/[^A-Za-z0-9._-]/g, '') || 'unknown';

export const buildEventSegmentPath = ({ deviceStableId = '', fromSeq = 0, toSeq = 0, hash = '' } = {}) =>
  `${EVENT_ARCHIVE_DIR}/seg_${sid(deviceStableId)}_${n(fromSeq)}_${n(toSeq)}_${s(hash).slice(0, 16)}.json`;

export const normalizeEventArchiveSegment = raw => ({
  version: s(raw?.version || EVENT_ARCHIVE_VERSION) || EVENT_ARCHIVE_VERSION,
  createdAt: n(raw?.createdAt) || Date.now(),
  deviceStableId: sid(raw?.deviceStableId || ''),
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
      .sort((a, b) => n(a.deviceStableId.localeCompare?.(b.deviceStableId)) || n(a.fromSeq) - n(b.fromSeq))
  };
};

export default {
  EVENT_ARCHIVE_DIR,
  EVENT_ARCHIVE_INDEX_PATH,
  EVENT_ARCHIVE_VERSION,
  buildEventSegmentPath,
  normalizeEventArchiveSegment,
  buildEventArchiveIndexItem,
  normalizeEventArchiveIndex
};
