import { BackupVault as DefaultBackupVault } from './backup-vault.js';
import { stableStringify, sha256Hex } from './backup-builders.js';
import { isBackupSemanticNoiseEvent } from './event-contract.js';
import { getSharedSnapshotLocalEntries } from './snapshot-contract.js';
import { recordSyncRevision } from './sync-revisions.js';
import { getCurrentEventArchiveBranch, getLocalEventArchiveWatermark, uploadLocalEventArchiveUntilCaughtUp } from './event-archive-sync.js';
import { AccountDataContext } from './account-data-boundary.js';
import { PROXY_UPLOAD_MAX_BYTES } from '../core/yandex-disk-transport.js';

const LS_SHARED_HASH = 'backup:last_shared_semantic_hash:v1', LS_DEVICE_HASH_PREFIX = 'backup:last_device_settings_hash:v1:', LS_LAST_HISTORY_AT = 'backup:last_history_upload_at:v1', LS_LOCAL_SUMMARY = 'backup:last_local_summary:v1', HISTORY_MIN_INTERVAL_MS = 86400000, CLOUD_EVENT_TAIL_LIMIT = 500, CLOUD_UPLOAD_BODY_BUDGET_BYTES = PROXY_UPLOAD_MAX_BYTES - 65536, CLOUD_BACKUP_PATH = 'app:/Backup/vi3na1bita_backup.vi3bak', HISTORY_MATERIAL_DOMAINS = new Set(['achievements','favorites','playlists','profile','devices','stats']);
const sS = v => String(v == null ? '' : v).trim(), sN = v => Number.isFinite(Number(v)) ? Number(v) : 0, jP = (raw, fb = null) => { try { return JSON.parse(raw); } catch { return fb; } };
const proxyUploadBodyBytes = backup => new TextEncoder().encode(JSON.stringify({ path: CLOUD_BACKUP_PATH, data: backup })).byteLength;

const normalizeDeviceForHash = d => ({ deviceStableId: sS(d?.deviceStableId), deviceHash: sS(d?.deviceHash), label: sS(d?.label), class: sS(d?.class), platform: sS(d?.platform), os: sS(d?.os), browser: sS(d?.browser), screen: sS(d?.screen), lang: sS(d?.lang), pwa: !!d?.pwa, firstSeenAt: sN(d?.firstSeenAt), retiredAt: sN(d?.retiredAt), authHistory: (Array.isArray(d?.authHistory) ? d.authHistory : []).map(x => ({ ts:sN(x?.ts), browser:sS(x?.browser), os:sS(x?.os), lang:sS(x?.lang), timezone:sS(x?.timezone), pwa:!!x?.pwa })).filter(x => x.ts > 0).slice(0,20), seenHashes: [...new Set((Array.isArray(d?.seenHashes) ? d.seenHashes : []).map(sS).filter(Boolean))].sort() });
const normalizeStatsForHash = rows => (Array.isArray(rows) ? rows : []).filter(r => r && typeof r === 'object' && sS(r.uid)).map(r => { const featuresUsed = { ...(r.featuresUsed || {}) }; Object.keys(featuresUsed).forEach(k => { if (String(k || '').startsWith('backup')) delete featuresUsed[k]; }); return { ...r, uid: sS(r.uid), featuresUsed }; }).sort((a, b) => sS(a.uid).localeCompare(sS(b.uid)));

export const buildSharedSemanticPayload = backup => ({ version: sS(backup?.version || backup?.revision?.version || '6.0'), ownerYandexId: sS(backup?.identity?.ownerYandexId || ''), devices: (Array.isArray(backup?.devices) ? backup.devices : []).map(normalizeDeviceForHash).sort((a, b) => a.deviceStableId.localeCompare(b.deviceStableId) || a.deviceHash.localeCompare(b.deviceHash)), data: { stats: normalizeStatsForHash(backup?.data?.stats), eventLog: { warm: (Array.isArray(backup?.data?.eventLog?.warm) ? backup.data.eventLog.warm : []).filter(x => x?.eventId && !isBackupSemanticNoiseEvent(x)) }, achievements: backup?.data?.achievements || {}, achievementState: backup?.data?.achievementState || {}, streaks: backup?.data?.streaks || {}, userProfile: backup?.data?.userProfile || {}, userProfileRpg: backup?.data?.userProfileRpg || {}, localStorage: getSharedSnapshotLocalEntries(backup?.data?.localStorage || {}), intel: backup?.data?.intel || {} } });

export const getSharedSemanticHash = async backup => await sha256Hex(stableStringify(buildSharedSemanticPayload(backup || {})));
export const getDeviceSettingsSemanticHash = async doc => await sha256Hex(stableStringify({ version: sS(doc?.version || '1.0'), ownerYandexId: sS(doc?.ownerYandexId || ''), deviceStableId: sS(doc?.deviceStableId || ''), deviceHash: sS(doc?.deviceHash || ''), sourceDeviceLabel: sS(doc?.sourceDeviceLabel || ''), sourceDeviceClass: sS(doc?.sourceDeviceClass || ''), sourcePlatform: sS(doc?.sourcePlatform || ''), localStorage: doc?.localStorage || {} }));

const persistMeta = ({ meta, backup, sharedHash } = {}) => { try { if (meta) { localStorage.setItem('yandex:last_backup_meta', JSON.stringify(meta)); localStorage.setItem('yandex:last_backup_check', JSON.stringify(meta)); localStorage.setItem('yandex:last_backup_check_ts', String(Date.now())); window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated')); } if (backup && sharedHash) localStorage.setItem('yandex:last_backup_local_ts', String(Number(backup?.revision?.timestamp || backup?.createdAt || Date.now()))); if (meta && sharedHash) localStorage.setItem(LS_LOCAL_SUMMARY, JSON.stringify(meta)); if (sharedHash) localStorage.setItem(LS_SHARED_HASH, sharedHash); } catch {} };

const rehashBackupObject = async b => {
  const eventLogHash = await sha256Hex(stableStringify(b?.data?.eventLog?.warm || [])), sharedStorageHash = await sha256Hex(stableStringify(b?.data?.localStorage || {})), payloadHash = await sha256Hex(stableStringify({ identity: b.identity, devices: b.devices || [], revision: b.revision || {}, data: b.data }));
  return { ...b, integrity: { ...(b.integrity || {}), payloadHash, ownerBinding: await sha256Hex(`${b?.identity?.ownerYandexId || 'anon'}::${b?.identity?.internalUserId || 'local'}::${payloadHash}`), eventLogHash, sharedStorageHash } };
};

const branchIdOfEvent = e => `${sS(e?.deviceStableId).replace(/[^A-Za-z0-9._-]/g, '') || 'unknown'}_${sS(e?.chainId || '').replace(/^chain_/, '').slice(0, 12) || 'legacy'}`;

const compactBackupForCloud = async (b, { disk = null, token = '' } = {}) => {
  const events = Array.isArray(b?.data?.eventLog?.warm) ? b.data.eventLog.warm : [];
  const beforeBytes = proxyUploadBodyBytes(b);

  if (beforeBytes <= CLOUD_UPLOAD_BODY_BUDGET_BYTES) return b;

  const idx = disk?.getEventArchiveIndex && token
    ? await disk.getEventArchiveIndex(token).catch(() => null)
    : null;
  const coverage = new Map();

  (idx?.items || []).forEach(item => {
    const branchId = sS(item?.branchId || '');
    const toSeq = sN(item?.toSeq);

    if (
      branchId &&
      toSeq > sN(coverage.get(branchId)?.toSeq)
    ) {
      coverage.set(branchId, {
        toSeq,
        hash: sS(item?.hash || '')
      });
    }
  });

  if (!coverage.size) {
    const branch = await getCurrentEventArchiveBranch()
      .catch(() => ({}));
    const watermark = getLocalEventArchiveWatermark(
      branch?.branchId || ''
    );

    if (branch?.branchId && sN(watermark.lastSeq)) {
      coverage.set(branch.branchId, {
        toSeq: sN(watermark.lastSeq),
        hash: sS(watermark.lastHash || '')
      });
    }
  }

  if (!coverage.size) {
    throw new Error(
      `backup_too_large_without_archive:${beforeBytes}:` +
      `${CLOUD_UPLOAD_BODY_BUDGET_BYTES}`
    );
  }

  const required = [];
  const archived = [];

  events.forEach(event => {
    const branchId = branchIdOfEvent(event);
    const coverageRow = coverage.get(branchId);
    const archivedSafely =
      !!coverageRow &&
      sN(event?.deviceSeq) > 0 &&
      !!sS(event?.eventHash) &&
      sN(event.deviceSeq) <= sN(coverageRow.toSeq);

    (archivedSafely ? archived : required).push(event);
  });

  const maxArchivedSeq = Math.max(
    0,
    ...[...coverage.values()].map(item => sN(item.toSeq))
  );
  const tailCandidates = [
    CLOUD_EVENT_TAIL_LIMIT,
    250,
    100,
    50,
    20,
    0
  ];

  for (const tailLimit of tailCandidates) {
    const archivedTail = tailLimit > 0
      ? archived.slice(-tailLimit)
      : [];
    const selected = new Set([
      ...required,
      ...archivedTail
    ]);
    const kept = events.filter(event => selected.has(event));
    const compacted = await rehashBackupObject({
      ...b,
      data: {
        ...(b.data || {}),
        eventLog: {
          ...(b.data?.eventLog || {}),
          warm: kept
        },
        eventArchive: {
          ...(b.data?.eventArchive || {}),
          latestCompacted: true,
          compactedAt: Date.now(),
          compactTailLimit: tailLimit,
          eventCountFull: events.length,
          eventCountInSnapshot: kept.length,
          archivedBranches: coverage.size,
          archivedCurrentSeq: maxArchivedSeq
        }
      },
      revision: {
        ...(b.revision || {}),
        eventCount: events.length
      }
    });
    const bodyBytes = proxyUploadBodyBytes(compacted);

    console.info('[BackupCompact]', {
      beforeEvents: events.length,
      afterEvents: kept.length,
      requiredEvents: required.length,
      archivedEvents: archived.length,
      archivedBranches: coverage.size,
      maxArchivedSeq,
      tailLimit,
      beforeBytes,
      bodyBytes,
      budgetBytes: CLOUD_UPLOAD_BODY_BUDGET_BYTES
    });

    if (bodyBytes <= CLOUD_UPLOAD_BODY_BUDGET_BYTES) {
      return compacted;
    }
  }

  throw new Error(
    `backup_too_large_after_safe_compaction:` +
    `${beforeBytes}:${proxyUploadBodyBytes(b)}:` +
    `${required.length}:${CLOUD_UPLOAD_BODY_BUDGET_BYTES}`
  );
};

export const uploadBackupBundle = async ({ disk, token, BackupVault = DefaultBackupVault, backup = null, force = false, uploadDevice = true, reason = 'autosave', syncLease = null } = {}) => {
  if (!disk || !token || !BackupVault) throw new Error('upload_runner_invalid_input');

  const boundary =
    await AccountDataContext.requireCurrentOwner();
  const b = backup || await BackupVault.buildBackupObject();

  if (
    sS(b?.identity?.ownerYandexId) !==
    sS(boundary.ownerYandexId)
  ) {
    throw new Error('backup_owner_context_changed');
  }

  const sharedHash = await getSharedSemanticHash(b);
  const shouldUploadShared =
    !!force ||
    sharedHash !==
      sS(localStorage.getItem(LS_SHARED_HASH) || '');
  let meta = jP(localStorage.getItem('yandex:last_backup_meta') || localStorage.getItem('yandex:last_backup_check') || 'null', null), uploadedShared = false, changedDomains = [], uploadedEventArchive = false, eventArchive = null;

  if (shouldUploadShared) {
    changedDomains = Array.isArray(jP(localStorage.getItem('backup:last_dirty_domains:v1') || '[]', [])) ? jP(localStorage.getItem('backup:last_dirty_domains:v1') || '[]', []).map(sS).filter(Boolean) : [];
    const materialHistory = changedDomains.some(d => HISTORY_MATERIAL_DOMAINS.has(sS(d)));
    const writeHistory = reason === 'manual_save' || (!!force && reason !== 'autosync') || (materialHistory && Date.now() - sN(localStorage.getItem(LS_LAST_HISTORY_AT) || 0) > HISTORY_MIN_INTERVAL_MS);

    if (typeof disk.uploadEventSegment === 'function') {
      eventArchive = await uploadLocalEventArchiveUntilCaughtUp({ disk, token, maxSegments: 20 }).catch(e => ({ ok: false, uploaded: false, reason: e?.message || 'event_archive_failed' }));
      uploadedEventArchive = !!eventArchive?.uploaded;
      if (uploadedEventArchive) changedDomains = [...new Set([...(changedDomains || []), 'eventArchive'])];
      console.info('[BackupArchive]', eventArchive);
    }

    const cloudBackup = await compactBackupForCloud(b, { disk, token });
    meta = await disk.upload(token, cloudBackup, { writeHistory, changedDomains, syncLease });
    uploadedShared = true; persistMeta({ meta, backup: b, sharedHash });
    if (writeHistory) try { localStorage.setItem(LS_LAST_HISTORY_AT, String(Date.now())); } catch {}
  }

  let uploadedDevice = false, deviceDoc = null, deviceHash = '';
  if (uploadDevice && typeof BackupVault.buildDeviceSettingsObject === 'function' && typeof disk.uploadDeviceSettings === 'function') {
    try {
      deviceDoc = await BackupVault.buildDeviceSettingsObject();
      if (deviceDoc?.deviceStableId && Object.keys(deviceDoc?.localStorage || {}).length) {
        deviceHash = await getDeviceSettingsSemanticHash(deviceDoc);
        const key = `${LS_DEVICE_HASH_PREFIX}${deviceDoc.deviceStableId}`;
        if (force || deviceHash !== sS(localStorage.getItem(key) || '')) { await disk.uploadDeviceSettings(token, { ...deviceDoc, semanticHash: deviceHash }); uploadedDevice = true; try { localStorage.setItem(key, deviceHash); } catch {} }
      }
    } catch {}
  }

  if (!uploadedShared && meta) persistMeta({ meta });
  if (uploadedShared) try { window.eventLogger?.log?.('BACKUP_CREATED', null, { reason, uploadedShared, uploadedDevice, uploadedEventArchive, checksum: b?.integrity?.payloadHash || '' }); } catch {}
  recordSyncRevision({ hash: sharedHash, domains: changedDomains, uploadedShared, uploadedDevice, uploadedEventArchive, reason, ok: true });
  return { ok: true, reason, backup: b, meta, uploadedShared, uploadedDevice, uploadedEventArchive, eventArchive, sharedHash, deviceHash, deviceDoc };
};

export default { buildSharedSemanticPayload, getSharedSemanticHash, getDeviceSettingsSemanticHash, uploadBackupBundle };
