// UID.003_(Event log truth)_(restore должен уметь подтягивать archive segments)_(latest backup + archive + local events merge по eventId)
// UID.099_(Multi-device sync model)_(archive restore безопасно объединяет ветки)_(полная история постепенно уходит из latest)
// UID.100_(Backup snapshot as life capsule)_(restore preview показывает наличие archive)_(segments/events/maxSeq/head)

import { normalizeEventList } from './backup-event-cleanup.js';
import { mergeEventLogs } from './stats-state.js';

const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const s = v => String(v == null ? '' : v).trim();

export const readEventArchiveSummary = async ({ disk, token } = {}) => {
  if (!disk || !token) return { available: false, segmentsCount: 0, eventCount: 0, maxSeq: 0, head: '', items: [] };
  const idx = await (disk.getEventArchiveIndexViaProxy || disk.getEventArchiveIndex)?.call(disk, token).catch(() => null);
  const items = Array.isArray(idx?.items) ? idx.items : [];
  return {
    available: items.length > 0,
    segmentsCount: items.length,
    eventCount: items.reduce((a, x) => a + n(x.eventCount), 0),
    maxSeq: Math.max(0, ...items.map(x => n(x.toSeq))),
    head: s(items[items.length - 1]?.hash || ''),
    items
  };
};

export const downloadEventArchiveEvents = async ({ disk, token, limitSegments = 50, limitEvents = 10000 } = {}) => {
  const sum = await readEventArchiveSummary({ disk, token });
  if (!sum.available) return { ...sum, events: [] };
  const items = [...sum.items].sort((a, b) => n(a.fromSeq) - n(b.fromSeq)).slice(-limitSegments);
  const segs = await Promise.all(items.map(it =>
    (disk.downloadEventArchiveSegmentViaProxy || disk.downloadEventArchiveSegment)?.call(disk, token, it.path).catch(() => null)
  ));
  const events = normalizeEventList(segs.flatMap(x => Array.isArray(x?.events) ? x.events : []), { limit: limitEvents, dedupeAchievementUnlocks: false });
  return { ...sum, downloadedSegments: segs.filter(Boolean).length, downloadedEvents: events.length, events };
};

export const enrichBackupWithEventArchive = async ({ disk, token, backup } = {}) => {
  if (!backup || !disk || !token) return backup;
  const arch = await downloadEventArchiveEvents({ disk, token }).catch(() => null);
  if (!arch?.events?.length) return backup;
  const warm = mergeEventLogs(Array.isArray(backup?.data?.eventLog?.warm) ? backup.data.eventLog.warm : [], arch.events);
  return { ...backup, data: { ...(backup.data || {}), eventLog: { ...(backup.data?.eventLog || {}), warm }, eventArchive: { available: true, segmentsCount: arch.segmentsCount, eventCount: arch.eventCount, downloadedEvents: arch.downloadedEvents, maxSeq: arch.maxSeq, head: arch.head } } };
};

export default { readEventArchiveSummary, downloadEventArchiveEvents, enrichBackupWithEventArchive };
