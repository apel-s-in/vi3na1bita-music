// UID.003_(Event log truth)_(deep branch validation)_(hashes/prevHash/missing ranges/duplicates)
// UID.104_(Trust and eligibility state)_(branch status ok/sparse/duplicate/broken-chain/legacy)_(не блокирует локальный прогресс)
// UID.112_(Profile command center)_(archive branch можно проверить из профиля)_(только чтение archive segments)

import { stableStringify, sha256Hex } from './backup-builders.js';

const s = v => String(v == null ? '' : v).trim();
const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;

const hashEvent = async ev => {
  const { eventHash, ...rest } = ev || {};
  return await sha256Hex(stableStringify(rest));
};

const uniq = a => [...new Set((Array.isArray(a) ? a : []).map(s).filter(Boolean))];

export const listArchiveBranches = async ({ disk = window.YandexDisk, token = window.YandexAuth?.getToken?.() } = {}) => {
  const idx = await disk?.getEventArchiveIndex?.(token).catch(() => ({ items: [] }));
  const map = new Map();
  (idx?.items || []).forEach(x => {
    const id = s(x.branchId || x.deviceStableId || 'legacy') || 'legacy';
    const b = map.get(id) || { branchId:id, chainId:s(x.chainId || ''), deviceStableId:s(x.deviceStableId || ''), segments:0, events:0, fromSeq:0, toSeq:0, paths:[] };
    b.segments++; b.events += n(x.eventCount); b.fromSeq = b.fromSeq ? Math.min(b.fromSeq, n(x.fromSeq)) : n(x.fromSeq); b.toSeq = Math.max(b.toSeq, n(x.toSeq)); b.paths.push(s(x.path)); if (!b.chainId && x.chainId) b.chainId = s(x.chainId); if (!b.deviceStableId && x.deviceStableId) b.deviceStableId = s(x.deviceStableId);
    map.set(id, b);
  });
  return [...map.values()].sort((a,b)=>s(a.branchId).localeCompare(s(b.branchId)));
};

export const validateArchiveBranch = async ({ disk = window.YandexDisk, token = window.YandexAuth?.getToken?.(), branchId = '', maxSegments = 400 } = {}) => {
  if (!disk || !token) throw new Error('branch_validation_requires_disk_and_token');
  const bid = s(branchId);
  if (!bid) throw new Error('branch_id_required');
  const idx = await disk.getEventArchiveIndex(token).catch(() => ({ items: [] }));
  const items = (idx?.items || []).filter(x => s(x.branchId || x.deviceStableId || 'legacy') === bid).sort((a,b)=>n(a.fromSeq)-n(b.fromSeq)).slice(0, maxSegments);
  const segs = await Promise.all(items.map(it => disk.downloadEventArchiveSegment(token, it.path).catch(() => null)));
  const events = [], segmentIssues = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i], seg = segs[i], evs = Array.isArray(seg?.events) ? seg.events : [];
    const expectedHash = s(seg?.hash || it.hash), actualHash = evs.length ? await sha256Hex(stableStringify(evs)) : '';
    const seqs = evs.map(e => n(e.deviceSeq)).filter(Boolean).sort((a,b)=>a-b);
    const sparse = !!seqs.length && (seqs[0] !== n(it.fromSeq) || seqs[seqs.length - 1] !== n(it.toSeq) || seqs.length !== (n(it.toSeq) - n(it.fromSeq) + 1));
    if (!seg) segmentIssues.push({ path:it.path, code:'segment_download_failed' });
    else if (expectedHash && actualHash && expectedHash !== actualHash) segmentIssues.push({ path:it.path, code:'segment_hash_mismatch', expected:expectedHash, actual:actualHash });
    if (sparse) segmentIssues.push({ path:it.path, code:'sparse_segment', fromSeq:n(it.fromSeq), toSeq:n(it.toSeq), actualCount:seqs.length });
    events.push(...evs);
  }

  const eventIds = new Set(), seqSeen = new Set(), missingRanges = [], duplicateEventIds = [], duplicateSeq = [], brokenHashes = [], brokenLinks = [], legacyEvents = [];
  const rows = events.filter(e => e?.eventId).sort((a,b)=>n(a.deviceSeq)-n(b.deviceSeq) || n(a.timestamp)-n(b.timestamp));
  for (const e of rows) {
    const id = s(e.eventId), seq = n(e.deviceSeq), seqKey = `${s(e.deviceStableId)}::${s(e.chainId)}::${seq}`;
    if (eventIds.has(id)) duplicateEventIds.push(id); else eventIds.add(id);
    if (seq && seqSeen.has(seqKey)) duplicateSeq.push(seqKey); else if (seq) seqSeen.add(seqKey);
    if (!s(e.eventHash) || !s(e.chainId) || !seq) legacyEvents.push(id || `seq:${seq}`);
    if (s(e.eventHash) && await hashEvent(e) !== s(e.eventHash)) brokenHashes.push(id || `seq:${seq}`);
  }

  const groups = new Map();
  rows.filter(e => s(e.chainId) && n(e.deviceSeq)).forEach(e => {
    const k = `${s(e.deviceStableId)}::${s(e.chainId)}`;
    (groups.get(k) || groups.set(k, []).get(k)).push(e);
  });
  for (const list of groups.values()) {
    list.sort((a,b)=>n(a.deviceSeq)-n(b.deviceSeq));
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1], cur = list[i], gap = n(cur.deviceSeq) - n(prev.deviceSeq);
      if (gap > 1) missingRanges.push({ from:n(prev.deviceSeq) + 1, to:n(cur.deviceSeq) - 1 });
      if (gap === 1 && s(cur.prevHash) !== s(prev.eventHash)) brokenLinks.push({ eventId:s(cur.eventId), seq:n(cur.deviceSeq), expected:s(prev.eventHash), actual:s(cur.prevHash) });
    }
  }

  const status = brokenHashes.length || brokenLinks.length || segmentIssues.some(x => x.code === 'segment_hash_mismatch') ? 'broken-chain'
    : duplicateEventIds.length || duplicateSeq.length ? 'duplicate'
    : missingRanges.length || segmentIssues.some(x => x.code === 'sparse_segment') ? 'sparse'
    : legacyEvents.length === rows.length && rows.length ? 'legacy'
    : 'ok';

  return {
    ok: status === 'ok',
    status,
    branchId: bid,
    segments: items.length,
    downloadedSegments: segs.filter(Boolean).length,
    events: rows.length,
    uniqueEvents: eventIds.size,
    seqFrom: Math.min(...rows.map(e => n(e.deviceSeq)).filter(Boolean), 0) || 0,
    seqTo: Math.max(0, ...rows.map(e => n(e.deviceSeq))),
    segmentIssues,
    missingRanges,
    duplicateEventIds: uniq(duplicateEventIds),
    duplicateSeq: uniq(duplicateSeq),
    brokenHashes: uniq(brokenHashes),
    brokenLinks,
    legacyEvents: uniq(legacyEvents).slice(0, 50)
  };
};

export default { listArchiveBranches, validateArchiveBranch };
