import { BackupVault as DefaultBackupVault } from './backup-vault.js';
import { stableStringify, sha256Hex } from './backup-builders.js';
import { isBackupSemanticNoiseEvent } from './event-contract.js';
import { getSharedSnapshotLocalEntries } from './snapshot-contract.js';
import { recordSyncRevision } from './sync-revisions.js';
import { getCurrentEventArchiveBranch, getLocalEventArchiveWatermark, uploadLocalEventArchiveUntilCaughtUp } from './event-archive-sync.js';

const LS_SHARED_HASH = 'backup:last_shared_semantic_hash:v1', LS_DEVICE_HASH_PREFIX = 'backup:last_device_settings_hash:v1:', LS_LAST_HISTORY_AT = 'backup:last_history_upload_at:v1', LS_LOCAL_SUMMARY = 'backup:last_local_summary:v1', HISTORY_MIN_INTERVAL_MS = 86400000, CLOUD_EVENT_TAIL_LIMIT = 1500, HISTORY_MATERIAL_DOMAINS = new Set(['achievements','favorites','playlists','profile','devices','stats']);
const sS = v => String(v == null ? '' : v).trim(), sN = v => Number.isFinite(Number(v)) ? Number(v) : 0, jP = (raw, fb = null) => { try { return JSON.parse(raw); } catch { return fb; } };

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

const compactBackupForCloud = async b => {
  const events = Array.isArray(b?.data?.eventLog?.warm) ? b.data.eventLog.warm : [], br = await getCurrentEventArchiveBranch().catch(() => ({}));
  if (!br?.branchId || events.length <= CLOUD_EVENT_TAIL_LIMIT) return b;
  const wm = getLocalEventArchiveWatermark(br.branchId), cutSeq = Math.max(0, sN(wm.lastSeq) - CLOUD_EVENT_TAIL_LIMIT);
  if (!sN(wm.lastSeq) || cutSeq <= 0) return b;
  const kept = events.filter(e => sS(e?.deviceStableId) !== sS(br.deviceStableId) || sS(e?.chainId || '') !== sS(br.chainId || '') || !sN(e?.deviceSeq) || sN(e.deviceSeq) > cutSeq || !sS(e?.eventHash));
  if (kept.length >= events.length) return b;
  const out = { ...b, data: { ...(b.data || {}), eventLog: { ...(b.data?.eventLog || {}), warm: kept }, eventArchive: { ...(b.data?.eventArchive || {}), latestCompacted: true, compactedAt: Date.now(), compactTailLimit: CLOUD_EVENT_TAIL_LIMIT, eventCountFull: events.length, eventCountInSnapshot: kept.length, archivedDeviceStableId: sS(br.deviceStableId), archivedBranchId: sS(br.branchId), archivedCurrentSeq: sN(wm.lastSeq), archivedCurrentHash: sS(wm.lastHash || '') } }, revision: { ...(b.revision || {}), eventCount: events.length } };
  console.info('[BackupCompact]', { beforeEvents: events.length, afterEvents: kept.length, branchId: br.branchId, archivedSeq: wm.lastSeq, tailLimit: CLOUD_EVENT_TAIL_LIMIT });
  return await rehashBackupObject(out);
};

export const uploadBackupBundle = async ({ disk, token, BackupVault = DefaultBackupVault, backup = null, force = false, uploadDevice = true, reason = 'autosave', syncLease = null } = {}) => {
  if (!disk || !token || !BackupVault) throw new Error('upload_runner_invalid_input');
  const b = backup || await BackupVault.buildBackupObject(), sharedHash = await getSharedSemanticHash(b), shouldUploadShared = !!force || sharedHash !== sS(localStorage.getItem(LS_SHARED_HASH) || '');
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

    const cloudBackup = await compactBackupForCloud(b);
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
