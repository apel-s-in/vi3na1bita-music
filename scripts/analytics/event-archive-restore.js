// UID.003_(Event log truth)_(restore должен уметь подтягивать archive segments)_(latest backup + archive + local events merge по eventId)
// UID.099_(Multi-device sync model)_(archive restore безопасно объединяет ветки)_(полная история постепенно уходит из latest)
// UID.100_(Backup snapshot as life capsule)_(restore preview показывает branches/noise/legacy/overlap)_(без автодаления истории)

import { normalizeEventList } from './backup-event-cleanup.js';
import { mergeEventLogs } from './stats-state.js';
import { isBackupSemanticNoiseEvent } from './event-contract.js';

const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const s = v => String(v == null ? '' : v).trim();

export const buildArchiveIndexDiagnostics = (items = []) => {
  const rows = Array.isArray(items) ? items : [], bm = new Map(), rangeSeen = new Map();
  let overlapSegments = 0, duplicateRanges = 0, legacySegments = 0;
  rows.forEach(x => {
    const bId = s(x.branchId || x.deviceStableId || 'legacy') || 'legacy', from = n(x.fromSeq), to = n(x.toSeq), key = `${bId}:${from}:${to}:${s(x.hash)}`;
    const b = bm.get(bId) || { branchId: bId, chainId: s(x.chainId || ''), deviceStableId: s(x.deviceStableId || ''), segments: 0, events: 0, size: 0, fromSeq: 0, toSeq: 0, legacySegments: 0 };
    b.segments++; b.events += n(x.eventCount); b.size += n(x.size); b.fromSeq = b.fromSeq ? Math.min(b.fromSeq, from) : from; b.toSeq = Math.max(b.toSeq, to);
    if (!s(x.branchId) || !s(x.chainId)) { legacySegments++; b.legacySegments++; }
    if (rangeSeen.has(key)) duplicateRanges++; else rangeSeen.set(key, x.path);
    for (const y of rows) if (y !== x && s(y.branchId || y.deviceStableId || 'legacy') === bId && from <= n(y.toSeq) && to >= n(y.fromSeq) && s(y.path) !== s(x.path) && s(y.hash) !== s(x.hash)) { overlapSegments++; break; }
    bm.set(bId, b);
  });
  return { branchesCount: bm.size, branches: [...bm.values()].sort((a,b)=>s(a.branchId).localeCompare(s(b.branchId))), legacySegments, duplicateRanges, overlapSegments };
};

const analyzeRawEvents = events => {
  const raw = Array.isArray(events) ? events : [], seen = new Set();
  let duplicateEvents = 0, noiseEvents = 0, legacyEvents = 0;
  raw.forEach(e => {
    const id = s(e?.eventId);
    if (id && seen.has(id)) duplicateEvents++; else if (id) seen.add(id);
    if (isBackupSemanticNoiseEvent(e)) noiseEvents++;
    if (!s(e?.eventHash) || !s(e?.chainId) || !n(e?.deviceSeq)) legacyEvents++;
  });
  const normalized = normalizeEventList(raw, { limit: 10000, dedupeAchievementUnlocks: false });
  return { rawEvents: raw.length, restoredEventCount: normalized.length, duplicateEvents, noiseEvents, legacyEvents, normalized };
};

export const readEventArchiveSummary = async ({ disk, token } = {}) => {
  if (!disk || !token) return { available: false, segmentsCount: 0, eventCount: 0, maxSeq: 0, head: '', items: [], branchesCount: 0, branches: [] };
  const idx = await (disk.getEventArchiveIndexViaProxy || disk.getEventArchiveIndex)?.call(disk, token).catch(() => null);
  const items = Array.isArray(idx?.items) ? idx.items : [], diag = buildArchiveIndexDiagnostics(items);
  return {
    available: items.length > 0,
    segmentsCount: items.length,
    eventCount: items.reduce((a, x) => a + n(x.eventCount), 0),
    maxSeq: Math.max(0, ...items.map(x => n(x.toSeq))),
    head: s(items[items.length - 1]?.hash || ''),
    items,
    ...diag
  };
};

export const downloadEventArchiveEvents = async ({ disk, token, limitSegments = 80, limitEvents = 12000 } = {}) => {
  const sum = await readEventArchiveSummary({ disk, token });
  if (!sum.available) return { ...sum, downloadedSegments: 0, downloadedEvents: 0, restoredEventCount: 0, events: [] };
  const items = [...sum.items].sort((a, b) => n(a.createdAt) - n(b.createdAt) || n(a.fromSeq) - n(b.fromSeq)).slice(-limitSegments);
  const segs = await Promise.all(items.map(it => (disk.downloadEventArchiveSegmentViaProxy || disk.downloadEventArchiveSegment)?.call(disk, token, it.path).catch(() => null)));
  const raw = segs.flatMap(x => Array.isArray(x?.events) ? x.events : []), an = analyzeRawEvents(raw);
  const events = limitEvents > 0 && an.normalized.length > limitEvents ? an.normalized.slice(-limitEvents) : an.normalized;
  return { ...sum, downloadedSegments: segs.filter(Boolean).length, downloadedEvents: raw.length, restoredEventCount: events.length, duplicateEvents: an.duplicateEvents, noiseEvents: an.noiseEvents, legacyEvents: an.legacyEvents, events };
};

export const enrichBackupWithEventArchive = async ({ disk, token, backup } = {}) => {
  if (!backup || !disk || !token) return backup;
  const arch = await downloadEventArchiveEvents({ disk, token }).catch(() => null);
  if (!arch?.events?.length) return backup;
  const warm = mergeEventLogs(Array.isArray(backup?.data?.eventLog?.warm) ? backup.data.eventLog.warm : [], arch.events);
  return { ...backup, data: { ...(backup.data || {}), eventLog: { ...(backup.data?.eventLog || {}), warm }, eventArchive: { available: true, segmentsCount: arch.segmentsCount, branchesCount: arch.branchesCount || 0, eventCount: arch.eventCount, downloadedEvents: arch.downloadedEvents, restoredEventCount: arch.restoredEventCount, duplicateEvents: arch.duplicateEvents || 0, noiseEvents: arch.noiseEvents || 0, legacyEvents: arch.legacyEvents || 0, overlapSegments: arch.overlapSegments || 0, maxSeq: arch.maxSeq, head: arch.head } } };
};

export default { buildArchiveIndexDiagnostics, readEventArchiveSummary, downloadEventArchiveEvents, enrichBackupWithEventArchive };
