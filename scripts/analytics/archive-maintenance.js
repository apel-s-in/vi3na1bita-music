// UID.003_(Event log truth)_(canonical archive maintenance)_(merge latest+archive+local, contiguous ranges, dedupe by eventId)
// UID.099_(Multi-device sync model)_(hard reset branches cleanly consolidated)_(branchId = deviceStableId + chainId)
// UID.100_(Backup snapshot as life capsule)_(one magic button)_(optimize archive + delete obsolete + compact latest без потери истории)

import { metaDB } from './meta-db.js';
import { readLocalEventLog } from './stats-state.js';
import { normalizeEventList } from './backup-event-cleanup.js';
import { stableStringify, sha256Hex } from './backup-builders.js';
import { buildEventSegmentPath, normalizeEventArchiveIndex, normalizeEventArchiveSegment } from './event-archive-contract.js';
import { isBackupSemanticNoiseEvent } from './event-contract.js';
import { downloadEventArchiveEvents } from './event-archive-restore.js';
import { BackupVault } from './backup-vault.js';
import { uploadBackupBundle } from './backup-upload-runner.js';

const s = v => String(v == null ? '' : v).trim();
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const safe = v => s(v).replace(/[^A-Za-z0-9._-]/g, '') || 'unknown';
const branchIdOf = e => safe(`${safe(e?.deviceStableId || '')}_${s(e?.chainId || '').replace(/^chain_/, '').slice(0, 12) || 'legacy'}`);
const isArchivable = e => !!(e?.eventId && s(e.eventHash) && s(e.deviceStableId) && s(e.chainId) && n(e.deviceSeq) && !isBackupSemanticNoiseEvent(e));

const dedupeEvents = rows => {
  const m = new Map();
  normalizeEventList(rows, { limit: 50000, dropNoise: false, sort: true, dedupeAchievementUnlocks: false }).forEach(e => e?.eventId && !m.has(e.eventId) && m.set(e.eventId, e));
  return [...m.values()].sort((a, b) => n(a.timestamp) - n(b.timestamp) || n(a.deviceSeq) - n(b.deviceSeq));
};

const splitContiguous = (events, maxEvents = 500) => {
  const out = [];
  let cur = [], lastSeq = 0;
  for (const e of events) {
    const seq = n(e.deviceSeq);
    if (!cur.length || (seq === lastSeq + 1 && cur.length < maxEvents)) cur.push(e);
    else { out.push(cur); cur = [e]; }
    lastSeq = seq;
  }
  if (cur.length) out.push(cur);
  return out;
};

export const buildCanonicalArchiveSegmentsFromEvents = async (events = [], { maxEventsPerSegment = 500 } = {}) => {
  const byBranch = new Map();
  dedupeEvents(events).filter(isArchivable).forEach(e => {
    const bid = branchIdOf(e);
    (byBranch.get(bid) || byBranch.set(bid, []).get(bid)).push(e);
  });

  const segments = [];
  for (const [branchId, rows] of byBranch.entries()) {
    rows.sort((a, b) => n(a.deviceSeq) - n(b.deviceSeq) || n(a.timestamp) - n(b.timestamp));
    for (const part of splitContiguous(rows, maxEventsPerSegment)) {
      const fromSeq = n(part[0].deviceSeq), toSeq = n(part[part.length - 1].deviceSeq), hash = await sha256Hex(stableStringify(part));
      const path = buildEventSegmentPath({ deviceStableId: part[0].deviceStableId, branchId, fromSeq, toSeq, hash });
      segments.push({ ...normalizeEventArchiveSegment({ path, createdAt: Date.now(), deviceStableId: part[0].deviceStableId, branchId, chainId: s(part[0].chainId), fromSeq, toSeq, eventCount: part.length, hash, events: part }), path });
    }
  }

  return segments.sort((a, b) => s(a.branchId).localeCompare(s(b.branchId)) || n(a.fromSeq) - n(b.fromSeq));
};

export const buildArchiveMagicPlan = async ({ disk = window.YandexDisk, token = window.YandexAuth?.getToken?.(), includeLocal = true } = {}) => {
  if (!disk || !token) throw new Error('archive_magic_requires_disk_and_token');

  const [localEvents, cloudBackup, archive, oldIndex, fileScan] = await Promise.all([
    includeLocal ? readLocalEventLog(metaDB, { forceFlush: true }).catch(() => []) : Promise.resolve([]),
    disk.download?.(token, null).catch(() => null),
    downloadEventArchiveEvents({ disk, token, limitSegments: 1000, limitEvents: 50000 }).catch(() => ({ events: [], items: [] })),
    disk.getEventArchiveIndex?.(token).catch(() => ({ items: [] })),
    disk.listEventArchiveFiles?.(token).catch(() => ({ items: [] }))
  ]);

  const latestEvents = Array.isArray(cloudBackup?.data?.eventLog?.warm) ? cloudBackup.data.eventLog.warm : [];
  const merged = dedupeEvents([...(localEvents || []), ...latestEvents, ...(archive?.events || [])]);
  const canonicalEvents = merged.filter(isArchivable);
  const segments = await buildCanonicalArchiveSegmentsFromEvents(canonicalEvents);

  const canonicalPaths = new Set(segments.map(x => s(x.path)));
  const oldPaths = new Set([...(oldIndex?.items || []), ...(fileScan?.items || [])].map(x => s(x.path)).filter(Boolean));
  const obsoletePaths = [...oldPaths].filter(p => p && !canonicalPaths.has(p) && /^app:\/Backup\/events\/seg_[A-Za-z0-9._-]+_\d+_\d+_[A-Za-z0-9._-]+\.json$/.test(p));

  const branches = new Map();
  segments.forEach(x => {
    const b = branches.get(x.branchId) || { branchId: x.branchId, chainId: x.chainId, deviceStableId: x.deviceStableId, segments: 0, events: 0, fromSeq: 0, toSeq: 0 };
    b.segments++; b.events += n(x.eventCount); b.fromSeq = b.fromSeq ? Math.min(b.fromSeq, n(x.fromSeq)) : n(x.fromSeq); b.toSeq = Math.max(b.toSeq, n(x.toSeq));
    branches.set(x.branchId, b);
  });

  return {
    ok: true,
    at: new Date().toISOString(),
    localEvents: localEvents.length,
    latestEvents: latestEvents.length,
    archiveEvents: archive?.events?.length || 0,
    mergedEvents: merged.length,
    canonicalEvents: canonicalEvents.length,
    beforeSegments: oldPaths.size,
    afterSegments: segments.length,
    obsoletePaths,
    segments,
    index: normalizeEventArchiveIndex({ version: '1.4-canonical', updatedAt: Date.now(), items: segments }),
    branches: [...branches.values()].sort((a, b) => s(a.branchId).localeCompare(s(b.branchId)))
  };
};

export const runArchiveMagicRepair = async ({ disk = window.YandexDisk, token = window.YandexAuth?.getToken?.(), deleteObsolete = true, saveLatest = true, notify = true } = {}) => {
  if (!disk || !token) throw new Error('archive_magic_requires_disk_and_token');
  const plan = await buildArchiveMagicPlan({ disk, token });

  const existing = await disk.listEventArchiveFiles?.(token).catch(() => ({ items: [] }));
  const existingPaths = new Set((existing?.items || []).map(x => s(x.path)));

  let uploadedSegments = 0;
  for (const seg of plan.segments) {
    if (existingPaths.has(s(seg.path))) continue;
    const r = await disk.uploadEventSegment(token, seg);
    if (r?.ok) uploadedSegments++;
  }

  await disk.uploadEventArchiveIndex(token, plan.index);

  let deleteResult = null;
  if (deleteObsolete && plan.obsoletePaths.length && disk.deleteEventArchiveSegments) {
    deleteResult = await disk.deleteEventArchiveSegments(token, plan.obsoletePaths.slice(0, 50)).catch(e => ({ ok: false, error: e?.message || 'delete_failed', deleted: 0 }));
    const scan = await disk.listEventArchiveFiles(token).catch(() => ({ items: [] }));
    await disk.uploadEventArchiveIndex(token, normalizeEventArchiveIndex({ version: '1.4-after-delete-rebuild', updatedAt: Date.now(), items: scan?.items || plan.index.items }));
  }

  let latestSave = null;
  if (saveLatest) latestSave = await uploadBackupBundle({ disk, token, BackupVault, force: true, uploadDevice: true, reason: 'autosync' }).catch(e => ({ ok: false, error: e?.message || 'latest_save_failed' }));

  const out = { ok: true, plan, uploadedSegments, deleteResult, latestSave };
  console.info('[ArchiveMagic]', out);
  if (notify) window.NotificationSystem?.success?.(`Archive починен: ${plan.beforeSegments} → ${plan.afterSegments} segments ✅`);
  return out;
};

export default { buildCanonicalArchiveSegmentsFromEvents, buildArchiveMagicPlan, runArchiveMagicRepair };
