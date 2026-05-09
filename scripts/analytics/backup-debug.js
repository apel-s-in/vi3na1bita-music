// UID.003_(Event log truth)_(runtime backup diagnostics)_(inspect local/cloud event window, archive watermark, compact estimate)
// UID.100_(Backup snapshot as life capsule)_(compact backup должен быть проверяемым из консоли)_(без влияния на playback)
// UID.112_(Profile command center)_(debug helpers для поддержки backup/sync)_(window.BackupDebug.inspectLocal/inspectCloud)

import { metaDB } from './meta-db.js';
import { BackupVault } from './backup-vault.js';
import { stableStringify } from './backup-builders.js';
import { normalizeEventList } from './backup-event-cleanup.js';
import { readLedgerCheckpoint } from './event-integrity.js';
import { getLocalEventArchiveWatermark, getLocalDeviceMaxSeq } from './event-archive-sync.js';
import { readEventArchiveSummary } from './event-archive-restore.js';

const TAIL = 1500;
const s = v => String(v == null ? '' : v).trim();
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const bytesOf = v => new Blob([typeof v === 'string' ? v : stableStringify(v)]).size;
const human = b => window.Utils?.fmt?.bytes?.(b) || `${Math.round((Number(b) || 0) / 1024)} KB`;

export const estimateCompactBackup = async (backup, { tailLimit = TAIL } = {}) => {
  const b = backup || await BackupVault.buildBackupObject();
  const events = Array.isArray(b?.data?.eventLog?.warm) ? b.data.eventLog.warm : [];
  const sid = s(localStorage.getItem('deviceStableId') || '');
  const wm = getLocalEventArchiveWatermark(sid);
  const cutSeq = Math.max(0, n(wm.lastSeq) - n(tailLimit));
  const kept = !sid || !n(wm.lastSeq) || cutSeq <= 0 ? events : events.filter(e => s(e?.deviceStableId) !== sid || !n(e?.deviceSeq) || n(e.deviceSeq) > cutSeq || !s(e?.eventHash));
  const compact = { ...b, data: { ...(b.data || {}), eventLog: { ...(b.data?.eventLog || {}), warm: kept }, eventArchive: { ...(b.data?.eventArchive || {}), debugCompacted: kept.length < events.length, eventCountFull: events.length, eventCountInSnapshot: kept.length, compactTailLimit: n(tailLimit), archivedDeviceStableId: sid, archivedCurrentSeq: n(wm.lastSeq), archivedCurrentHash: s(wm.lastHash || '') } } };
  const beforeBytes = bytesOf(b), afterBytes = bytesOf(compact);
  return { beforeEvents: events.length, afterEvents: kept.length, removedEvents: events.length - kept.length, beforeBytes, afterBytes, beforeHuman: human(beforeBytes), afterHuman: human(afterBytes), savedBytes: beforeBytes - afterBytes, savedHuman: human(beforeBytes - afterBytes), compactPossible: kept.length < events.length, deviceStableId: sid, archiveWatermark: wm, cutSeq, tailLimit: n(tailLimit) };
};

export const inspectLocal = async ({ buildBackup = true } = {}) => {
  window.dispatchEvent(new CustomEvent('analytics:forceFlush'));
  await new Promise(r => setTimeout(r, 140));
  const [hotRaw, warmRaw, ledger] = await Promise.all([
    metaDB.getEvents('events_hot').catch(() => []),
    metaDB.getEvents('events_warm').catch(() => []),
    readLedgerCheckpoint(metaDB).catch(() => null)
  ]);
  const all = normalizeEventList([...(warmRaw || []), ...(hotRaw || [])], { limit: 10000, sort: true, dedupeAchievementUnlocks: false });
  const sid = s(localStorage.getItem('deviceStableId') || '');
  const curEvents = all.filter(e => s(e?.deviceStableId) === sid);
  const wm = getLocalEventArchiveWatermark(sid);
  const maxSeq = await getLocalDeviceMaxSeq({ db: metaDB, deviceStableId: sid }).catch(() => 0);
  const backup = buildBackup ? await BackupVault.buildBackupObject().catch(() => null) : null;
  const compact = backup ? await estimateCompactBackup(backup) : null;
  const res = {
    at: new Date().toISOString(),
    appVersion: window.APP_CONFIG?.APP_VERSION || '',
    deviceStableId: sid,
    events: { hot: hotRaw?.length || 0, warm: warmRaw?.length || 0, total: all.length, currentDevice: curEvents.length, currentDeviceMaxSeq: maxSeq },
    archive: { watermark: wm, caughtUp: !!sid && n(wm.lastSeq) >= n(maxSeq) },
    ledger,
    backup: backup ? { estimatedBytes: bytesOf(backup), estimatedHuman: human(bytesOf(backup)), eventCountInSnapshot: backup?.data?.eventLog?.warm?.length || 0 } : null,
    compact
  };
  console.groupCollapsed('[BackupDebug] local');
  console.info(res);
  console.table([{ hot: res.events.hot, warm: res.events.warm, total: res.events.total, currentDevice: res.events.currentDevice, maxSeq, archiveSeq: wm.lastSeq, caughtUp: res.archive.caughtUp, compactBefore: compact?.beforeEvents || 0, compactAfter: compact?.afterEvents || 0, sizeBefore: compact?.beforeHuman || '—', sizeAfter: compact?.afterHuman || '—' }]);
  console.groupEnd();
  return res;
};

export const inspectCloud = async (token = window.YandexAuth?.getToken?.(), { includeBackup = true } = {}) => {
  const disk = window.YandexDisk;
  if (!disk || !token) throw new Error('backup_debug_cloud_requires_disk_and_token');
  const [meta, archive, list] = await Promise.all([
    disk.getMeta(token).catch(e => ({ error: e?.message || 'meta_failed' })),
    readEventArchiveSummary({ disk, token }).catch(e => ({ available: false, error: e?.message || 'archive_failed', items: [] })),
    disk.listBackups?.(token).catch(() => [])
  ]);
  let backup = null, compact = null;
  if (includeBackup && meta?.path !== undefined) {
    backup = await disk.download(token, meta.path || null).catch(e => ({ error: e?.message || 'download_failed' }));
    if (backup && !backup.error) compact = await estimateCompactBackup(backup).catch(() => null);
  }
  const size = backup && !backup.error ? bytesOf(backup) : 0;
  const res = {
    at: new Date().toISOString(),
    meta,
    archive: { available: !!archive?.available, segmentsCount: archive?.segmentsCount || 0, eventCount: archive?.eventCount || 0, maxSeq: archive?.maxSeq || 0, head: archive?.head || '', error: archive?.error || '' },
    list: Array.isArray(list) ? { count: list.length, items: list.map(x => ({ path: x.path, sizeHuman: x.sizeHuman, timestamp: x.timestamp, isLatest: x.isLatest })) } : { count: 0, items: [] },
    downloadedBackup: backup?.error ? { error: backup.error } : (backup ? { estimatedBytes: size, estimatedHuman: human(size), snapshotEvents: backup?.data?.eventLog?.warm?.length || 0, eventCountFull: backup?.data?.eventArchive?.eventCountFull || 0 } : null),
    compactEstimate: compact
  };
  console.groupCollapsed('[BackupDebug] cloud');
  console.info(res);
  console.table([{ metaEvents: meta?.eventCount || 0, metaSize: meta?.sizeHuman || '—', archiveSegments: res.archive.segmentsCount, archiveEvents: res.archive.eventCount, archiveMaxSeq: res.archive.maxSeq, snapshotEvents: res.downloadedBackup?.snapshotEvents || 0, downloadedSize: res.downloadedBackup?.estimatedHuman || '—' }]);
  console.groupEnd();
  return res;
};

export const BackupDebug = { inspectLocal, inspectCloud, estimateCompactBackup };
if (typeof window !== 'undefined') window.BackupDebug = BackupDebug;
export default BackupDebug;
