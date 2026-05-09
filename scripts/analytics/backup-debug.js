// UID.003_(Event log truth)_(runtime backup/archive diagnostics)_(inspect local/cloud/archive, compact estimate)
// UID.100_(Backup snapshot as life capsule)_(archive maintenance без автодаления)_(preview -> compact index -> ручная проверка кандидатов)
// UID.112_(Profile command center)_(window.BackupDebug.inspectLocal/inspectCloud/inspectArchive)_(без влияния на playback)

import { metaDB } from './meta-db.js';
import { BackupVault } from './backup-vault.js';
import { stableStringify } from './backup-builders.js';
import { normalizeEventList } from './backup-event-cleanup.js';
import { readLedgerCheckpoint } from './event-integrity.js';
import { getCurrentEventArchiveBranch, getLocalEventArchiveWatermark, getLocalDeviceMaxSeq } from './event-archive-sync.js';
import { readEventArchiveSummary, downloadEventArchiveEvents } from './event-archive-restore.js';
import { normalizeEventArchiveIndex } from './event-archive-contract.js';
import { isBackupSemanticNoiseEvent } from './event-contract.js';
import { buildArchiveMagicPlan, runArchiveMagicRepair } from './archive-maintenance.js';

const TAIL = 1500;
const s = v => String(v == null ? '' : v).trim();
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const bytesOf = v => new Blob([typeof v === 'string' ? v : stableStringify(v)]).size;
const human = b => window.Utils?.fmt?.bytes?.(b) || `${Math.round((Number(b) || 0) / 1024)} KB`;

export const estimateCompactBackup = async (backup, { tailLimit = TAIL } = {}) => {
  const b = backup || await BackupVault.buildBackupObject(), br = await getCurrentEventArchiveBranch({ db: metaDB }).catch(() => ({}));
  const events = Array.isArray(b?.data?.eventLog?.warm) ? b.data.eventLog.warm : [], wm = getLocalEventArchiveWatermark(br.branchId || ''), cutSeq = Math.max(0, n(wm.lastSeq) - n(tailLimit));
  const kept = !br.branchId || !n(wm.lastSeq) || cutSeq <= 0 ? events : events.filter(e => s(e?.deviceStableId) !== s(br.deviceStableId) || s(e?.chainId || '') !== s(br.chainId || '') || !n(e?.deviceSeq) || n(e.deviceSeq) > cutSeq || !s(e?.eventHash));
  const compact = { ...b, data: { ...(b.data || {}), eventLog: { ...(b.data?.eventLog || {}), warm: kept }, eventArchive: { ...(b.data?.eventArchive || {}), debugCompacted: kept.length < events.length, eventCountFull: events.length, eventCountInSnapshot: kept.length, compactTailLimit: n(tailLimit), archivedDeviceStableId: br.deviceStableId || '', archivedBranchId: br.branchId || '', archivedCurrentSeq: n(wm.lastSeq), archivedCurrentHash: s(wm.lastHash || '') } } };
  const beforeBytes = bytesOf(b), afterBytes = bytesOf(compact);
  return { beforeEvents: events.length, afterEvents: kept.length, removedEvents: events.length - kept.length, beforeBytes, afterBytes, beforeHuman: human(beforeBytes), afterHuman: human(afterBytes), savedBytes: beforeBytes - afterBytes, savedHuman: human(beforeBytes - afterBytes), compactPossible: kept.length < events.length, branch: br, archiveWatermark: wm, cutSeq, tailLimit: n(tailLimit) };
};

export const inspectLocal = async ({ buildBackup = true } = {}) => {
  window.dispatchEvent(new CustomEvent('analytics:forceFlush')); await new Promise(r => setTimeout(r, 140));
  const [hotRaw, warmRaw, ledger, br] = await Promise.all([metaDB.getEvents('events_hot').catch(() => []), metaDB.getEvents('events_warm').catch(() => []), readLedgerCheckpoint(metaDB).catch(() => null), getCurrentEventArchiveBranch({ db: metaDB }).catch(() => ({}))]);
  const all = normalizeEventList([...(warmRaw || []), ...(hotRaw || [])], { limit: 10000, sort: true, dedupeAchievementUnlocks: false }), curEvents = all.filter(e => s(e?.deviceStableId) === s(br.deviceStableId) && (!br.chainId || s(e?.chainId) === s(br.chainId)));
  const wm = getLocalEventArchiveWatermark(br.branchId || ''), maxSeq = await getLocalDeviceMaxSeq({ db: metaDB, deviceStableId: br.deviceStableId, chainId: br.chainId }).catch(() => 0);
  const backup = buildBackup ? await BackupVault.buildBackupObject().catch(() => null) : null, compact = backup ? await estimateCompactBackup(backup) : null;
  const res = { at: new Date().toISOString(), appVersion: window.APP_CONFIG?.APP_VERSION || '', branch: br, events: { hot: hotRaw?.length || 0, warm: warmRaw?.length || 0, total: all.length, currentBranch: curEvents.length, currentBranchMaxSeq: maxSeq }, archive: { watermark: wm, caughtUp: !!br.branchId && n(wm.lastSeq) >= n(maxSeq) }, ledger, backup: backup ? { estimatedBytes: bytesOf(backup), estimatedHuman: human(bytesOf(backup)), eventCountInSnapshot: backup?.data?.eventLog?.warm?.length || 0 } : null, compact };
  console.groupCollapsed('[BackupDebug] local'); console.info(res); console.table([{ hot: res.events.hot, warm: res.events.warm, total: res.events.total, branch: br.branchId || '—', maxSeq, archiveSeq: wm.lastSeq, caughtUp: res.archive.caughtUp, compactBefore: compact?.beforeEvents || 0, compactAfter: compact?.afterEvents || 0, sizeBefore: compact?.beforeHuman || '—', sizeAfter: compact?.afterHuman || '—' }]); console.groupEnd();
  return res;
};

export const inspectCloud = async (token = window.YandexAuth?.getToken?.(), { includeBackup = true } = {}) => {
  const disk = window.YandexDisk; if (!disk || !token) throw new Error('backup_debug_cloud_requires_disk_and_token');
  const [meta, archive, list] = await Promise.all([disk.getMeta(token).catch(e => ({ error: e?.message || 'meta_failed' })), readEventArchiveSummary({ disk, token }).catch(e => ({ available: false, error: e?.message || 'archive_failed', items: [] })), disk.listBackups?.(token).catch(() => [])]);
  let backup = null, compact = null;
  if (includeBackup && meta?.path !== undefined) { backup = await disk.download(token, meta.path || null).catch(e => ({ error: e?.message || 'download_failed' })); if (backup && !backup.error) compact = await estimateCompactBackup(backup).catch(() => null); }
  const size = backup && !backup.error ? bytesOf(backup) : 0;
  const res = { at: new Date().toISOString(), meta, archive, list: Array.isArray(list) ? { count: list.length, items: list.map(x => ({ path: x.path, sizeHuman: x.sizeHuman, timestamp: x.timestamp, isLatest: x.isLatest })) } : { count: 0, items: [] }, downloadedBackup: backup?.error ? { error: backup.error } : (backup ? { estimatedBytes: size, estimatedHuman: human(size), snapshotEvents: backup?.data?.eventLog?.warm?.length || 0, eventCountFull: backup?.data?.eventArchive?.eventCountFull || 0 } : null), compactEstimate: compact };
  console.groupCollapsed('[BackupDebug] cloud'); console.info(res); console.table([{ metaEvents: meta?.eventCount || 0, metaSize: meta?.sizeHuman || '—', archiveBranches: archive?.branchesCount || 0, archiveSegments: archive?.segmentsCount || 0, archiveEvents: archive?.eventCount || 0, snapshotEvents: res.downloadedBackup?.snapshotEvents || 0, downloadedSize: res.downloadedBackup?.estimatedHuman || '—' }]); console.groupEnd();
  return res;
};

export const buildArchiveMaintenancePlan = async ({ disk = window.YandexDisk, token = window.YandexAuth?.getToken?.(), limitSegments = 120 } = {}) => {
  if (!disk || !token) throw new Error('archive_inspect_requires_disk_and_token');
  const remote = disk.inspectEventArchive ? await disk.inspectEventArchive(token).catch(() => null) : null;
  const sum = await downloadEventArchiveEvents({ disk, token, limitSegments, limitEvents: 20000 }).catch(() => null);
  const items = remote?.index?.items || sum?.items || [], downloadedPaths = new Set((sum?.items || []).slice(-limitSegments).map(x => s(x.path)));
  const seenRangeHash = new Set(), seenEvent = new Set(), candidateRemove = new Map(), segmentStats = new Map();

  for (const it of items) {
    const seg = downloadedPaths.has(s(it.path)) ? await (disk.downloadEventArchiveSegmentViaProxy || disk.downloadEventArchiveSegment)?.call(disk, token, it.path).catch(() => null) : null;
    const evs = Array.isArray(seg?.events) ? seg.events : [], useful = evs.filter(e => e?.eventId && !isBackupSemanticNoiseEvent(e));
    let dupEvents = 0; evs.forEach(e => { const id = s(e?.eventId); if (id && seenEvent.has(id)) dupEvents++; else if (id) seenEvent.add(id); });
    const rh = `${s(it.branchId || it.deviceStableId || 'legacy')}:${n(it.fromSeq)}:${n(it.toSeq)}:${s(it.hash)}`;
    const reason = seenRangeHash.has(rh) ? 'duplicate_range_hash' : (seg && useful.length === 0 ? 'noise_or_empty_segment' : '');
    seenRangeHash.add(rh);
    if (reason) candidateRemove.set(s(it.path), { path: s(it.path), reason, events: evs.length, usefulEvents: useful.length, size: n(it.size), sizeHuman: human(it.size) });
    segmentStats.set(s(it.path), { path: s(it.path), events: evs.length, usefulEvents: useful.length, noiseEvents: evs.filter(isBackupSemanticNoiseEvent).length, duplicateEvents: dupEvents, downloaded: !!seg });
  }

  const compactItems = items.filter(x => !candidateRemove.has(s(x.path)));
  const compactIndex = normalizeEventArchiveIndex({ version: '1.2-compact-index', updatedAt: Date.now(), items: compactItems });
  const plan = { at: new Date().toISOString(), remote, summary: sum || {}, branches: remote?.branches || sum?.branches || [], totals: remote?.totals || {}, downloadedSegments: sum?.downloadedSegments || 0, restoredEventCount: sum?.restoredEventCount || 0, noiseEvents: sum?.noiseEvents || 0, legacyEvents: sum?.legacyEvents || 0, duplicateEvents: sum?.duplicateEvents || 0, candidateRemovePaths: [...candidateRemove.values()], segmentStats: [...segmentStats.values()], compactIndex, beforeItems: items.length, afterItems: compactIndex.items.length };
  console.groupCollapsed('[BackupDebug] archive'); console.info(plan); console.table((plan.branches || []).map(b => ({ branchId: b.branchId, chainId: b.chainId || '—', segments: b.segments, fromSeq: b.fromSeq, toSeq: b.toSeq, events: b.events, size: b.sizeHuman || human(b.size) }))); console.groupEnd();
  return plan;
};

export const inspectArchive = async (token = window.YandexAuth?.getToken?.(), opts = {}) => buildArchiveMaintenancePlan({ token, ...opts });

export const createCompactArchiveIndex = async (token = window.YandexAuth?.getToken?.(), opts = {}) => {
  const disk = window.YandexDisk; if (!disk?.uploadEventArchiveIndex) throw new Error('uploadEventArchiveIndex_missing');
  const plan = await buildArchiveMaintenancePlan({ disk, token, ...opts });
  await disk.uploadEventArchiveIndex(token, plan.compactIndex);
  console.info('[BackupDebug] compact archive index written', { beforeItems: plan.beforeItems, afterItems: plan.afterItems, candidateRemove: plan.candidateRemovePaths.length });
  return { ok: true, plan };
};

export const rebuildArchiveIndexFromFiles = async (token = window.YandexAuth?.getToken?.()) => {
  const disk = window.YandexDisk; if (!disk?.listEventArchiveFiles || !disk?.uploadEventArchiveIndex) throw new Error('archive_file_rebuild_api_missing');
  const scan = await disk.listEventArchiveFiles(token);
  const index = normalizeEventArchiveIndex({ version:'1.3-rebuilt-from-files', updatedAt:Date.now(), items:scan?.items || [] });
  await disk.uploadEventArchiveIndex(token, index);
  console.info('[BackupDebug] archive index rebuilt from files', { files: scan?.items?.length || 0, indexItems: index.items.length });
  return { ok:true, scan, index };
};

export const deleteArchiveSegments = async (token = window.YandexAuth?.getToken?.(), paths = []) => {
  const disk = window.YandexDisk; if (!disk?.deleteEventArchiveSegments) throw new Error('archive_delete_api_missing');
  const clean = [...new Set((Array.isArray(paths) ? paths : []).map(s).filter(Boolean))];
  if (!clean.length) return { ok:false, reason:'no_paths', deleted:0 };
  const res = await disk.deleteEventArchiveSegments(token, clean);
  const rebuilt = await rebuildArchiveIndexFromFiles(token).catch(e => ({ ok:false, error:e?.message || 'rebuild_failed' }));
  console.info('[BackupDebug] archive segments deleted', { requested: clean.length, deleted: res?.deleted || 0, rebuilt: !!rebuilt?.ok });
  return { ok:!!res?.ok, deleteResult:res, rebuilt };
};

export const magicArchiveRepair = async (token = window.YandexAuth?.getToken?.(), opts = {}) => await runArchiveMagicRepair({ token, ...opts });
export const inspectArchiveMagicPlan = async (token = window.YandexAuth?.getToken?.(), opts = {}) => await buildArchiveMagicPlan({ token, ...opts });

export const BackupDebug = { inspectLocal, inspectCloud, inspectArchive, estimateCompactBackup, buildArchiveMaintenancePlan, createCompactArchiveIndex, rebuildArchiveIndexFromFiles, deleteArchiveSegments, inspectArchiveMagicPlan, magicArchiveRepair };
if (typeof window !== 'undefined') window.BackupDebug = BackupDebug;
export default BackupDebug;
