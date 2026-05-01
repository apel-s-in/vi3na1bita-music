import { BackupVault as DefaultBackupVault } from './backup-vault.js';
import { stableStringify, sha256Hex } from './backup-builders.js';
import { isBackupSemanticNoiseEvent } from './event-contract.js';
import { getSharedSnapshotLocalEntries } from './snapshot-contract.js';

const LS_SHARED_HASH = 'backup:last_shared_semantic_hash:v1';
const LS_DEVICE_HASH_PREFIX = 'backup:last_device_settings_hash:v1:';
const LS_LAST_HISTORY_AT = 'backup:last_history_upload_at:v1';
const LS_LOCAL_SUMMARY = 'backup:last_local_summary:v1';
const HISTORY_MIN_INTERVAL_MS = 6 * 3600 * 1000;

const sS = v => String(v == null ? '' : v).trim();
const sN = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const jP = (raw, fb = null) => { try { return JSON.parse(raw); } catch { return fb; } };

const normalizeDeviceForHash = d => ({
  deviceStableId: sS(d?.deviceStableId),
  deviceHash: sS(d?.deviceHash),
  label: sS(d?.label),
  class: sS(d?.class),
  platform: sS(d?.platform),
  firstSeenAt: sN(d?.firstSeenAt),
  seenHashes: [...new Set((Array.isArray(d?.seenHashes) ? d.seenHashes : []).map(sS).filter(Boolean))].sort()
});

const normalizeStatsForHash = rows => (Array.isArray(rows) ? rows : [])
  .filter(r => r && typeof r === 'object' && sS(r.uid))
  .map(r => {
    const featuresUsed = { ...(r.featuresUsed || {}) };
    Object.keys(featuresUsed).forEach(k => { if (String(k || '').startsWith('backup')) delete featuresUsed[k]; });
    return { ...r, uid: sS(r.uid), featuresUsed };
  })
  .sort((a, b) => sS(a.uid).localeCompare(sS(b.uid)));

export const buildSharedSemanticPayload = backup => {
  const data = backup?.data || {};
  return {
    version: sS(backup?.version || backup?.revision?.version || '6.0'),
    ownerYandexId: sS(backup?.identity?.ownerYandexId || ''),
    devices: (Array.isArray(backup?.devices) ? backup.devices : []).map(normalizeDeviceForHash).sort((a, b) => a.deviceStableId.localeCompare(b.deviceStableId) || a.deviceHash.localeCompare(b.deviceHash)),
    data: {
      stats: normalizeStatsForHash(data.stats),
      eventLog: { warm: (Array.isArray(data?.eventLog?.warm) ? data.eventLog.warm : []).filter(x => x?.eventId && !isBackupSemanticNoiseEvent(x)) },
      achievements: data.achievements || {},
      streaks: data.streaks || {},
      userProfile: data.userProfile || {},
      userProfileRpg: data.userProfileRpg || {},
      localStorage: getSharedSnapshotLocalEntries(data.localStorage || {}),
      intel: data.intel || {}
    }
  };
};

export const getSharedSemanticHash = async backup =>
  await sha256Hex(stableStringify(buildSharedSemanticPayload(backup || {})));

export const getDeviceSettingsSemanticHash = async doc =>
  await sha256Hex(stableStringify({
    version: sS(doc?.version || '1.0'),
    ownerYandexId: sS(doc?.ownerYandexId || ''),
    deviceStableId: sS(doc?.deviceStableId || ''),
    deviceHash: sS(doc?.deviceHash || ''),
    sourceDeviceLabel: sS(doc?.sourceDeviceLabel || ''),
    sourceDeviceClass: sS(doc?.sourceDeviceClass || ''),
    sourcePlatform: sS(doc?.sourcePlatform || ''),
    localStorage: doc?.localStorage || {}
  }));

const readCachedMeta = () =>
  jP(localStorage.getItem('yandex:last_backup_meta') || localStorage.getItem('yandex:last_backup_check') || 'null', null);

const persistMeta = ({ meta, backup, sharedHash } = {}) => {
  try {
    if (meta) {
      localStorage.setItem('yandex:last_backup_meta', JSON.stringify(meta));
      localStorage.setItem('yandex:last_backup_check', JSON.stringify(meta));
      localStorage.setItem('yandex:last_backup_check_ts', String(Date.now()));
      window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));
    }
    if (backup && sharedHash) localStorage.setItem('yandex:last_backup_local_ts', String(Number(backup?.revision?.timestamp || backup?.createdAt || Date.now())));
    if (meta && sharedHash) localStorage.setItem(LS_LOCAL_SUMMARY, JSON.stringify(meta));
    if (sharedHash) localStorage.setItem(LS_SHARED_HASH, sharedHash);
  } catch {}
};

export const uploadBackupBundle = async ({
  disk,
  token,
  BackupVault = DefaultBackupVault,
  backup = null,
  force = false,
  uploadDevice = true,
  reason = 'autosave'
} = {}) => {
  if (!disk || !token || !BackupVault) throw new Error('upload_runner_invalid_input');

  const b = backup || await BackupVault.buildBackupObject();
  const sharedHash = await getSharedSemanticHash(b);
  const prevSharedHash = sS(localStorage.getItem(LS_SHARED_HASH) || '');
  const shouldUploadShared = !!force || sharedHash !== prevSharedHash;

  let meta = readCachedMeta();
  let uploadedShared = false;

  if (shouldUploadShared) {
    const lastHistoryAt = sN(localStorage.getItem(LS_LAST_HISTORY_AT) || 0);
    const writeHistory = !!force || reason === 'manual_save' || Date.now() - lastHistoryAt > HISTORY_MIN_INTERVAL_MS;
    const dirtyRaw = jP(localStorage.getItem('backup:last_dirty_domains:v1') || '[]', []);
    const changedDomains = Array.isArray(dirtyRaw) ? dirtyRaw.map(sS).filter(Boolean) : [];
    meta = await disk.upload(token, b, { writeHistory, changedDomains });
    uploadedShared = true;
    persistMeta({ meta, backup: b, sharedHash });
    if (writeHistory) try { localStorage.setItem(LS_LAST_HISTORY_AT, String(Date.now())); } catch {}
  }

  let uploadedDevice = false;
  let deviceDoc = null;
  let deviceHash = '';

  if (uploadDevice && typeof BackupVault.buildDeviceSettingsObject === 'function' && typeof disk.uploadDeviceSettings === 'function') {
    try {
      deviceDoc = await BackupVault.buildDeviceSettingsObject();
      if (deviceDoc?.deviceStableId && Object.keys(deviceDoc?.localStorage || {}).length) {
        deviceHash = await getDeviceSettingsSemanticHash(deviceDoc);
        const key = `${LS_DEVICE_HASH_PREFIX}${deviceDoc.deviceStableId}`;
        const prevDeviceHash = sS(localStorage.getItem(key) || '');
        if (force || deviceHash !== prevDeviceHash) {
          await disk.uploadDeviceSettings(token, deviceDoc);
          uploadedDevice = true;
          try { localStorage.setItem(key, deviceHash); } catch {}
        }
      }
    } catch {}
  }

  if (!uploadedShared && meta) persistMeta({ meta });
  if (uploadedShared) {
    try { window.eventLogger?.log?.('BACKUP_CREATED', null, { reason, uploadedShared, uploadedDevice, checksum: b?.integrity?.payloadHash || '' }); } catch {}
  }

  return {
    ok: true,
    reason,
    backup: b,
    meta,
    uploadedShared,
    uploadedDevice,
    sharedHash,
    deviceHash,
    deviceDoc
  };
};

export default {
  buildSharedSemanticPayload,
  getSharedSemanticHash,
  getDeviceSettingsSemanticHash,
  uploadBackupBundle
};
