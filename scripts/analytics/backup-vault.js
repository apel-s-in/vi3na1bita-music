// scripts/analytics/backup-vault.js
// UID.003_(Event log truth)_(держать backup честным и пересчитываемым)_(backup должен оставаться event-log-centric) // UID.073_(Hybrid sync orchestrator)_(подготовить backup как transport-слой для multi-provider sync)_(future orchestration жить отдельно от vault) // UID.089_(Future MetaDB stores)_(расширить backup listener/provider/recommendation/collection state)_(когда intel stores начнут наполняться, vault должен включить их без ломки формата) // UID.099_(Multi-device sync model)_(готовить deterministic merge без дублей)_(backup должен знать owner/devices/revision) // UID.100_(Backup snapshot as life capsule)_(сделать один канонический файл пользователя)_(manual/cloud backup используют один и тот же формат)
import DeviceRegistry from './device-registry.js';
import { normalizeCloudBackupMeta } from './cloud-contract.js';
import { buildFullBackupObject, buildDeviceSettingsObject } from './backup-builders.js';
import { applyBackupImportObject, applyDeviceSettingsObject } from './backup-importers.js';

export class BackupVault {
  static async buildBackupObject() { return buildFullBackupObject(); }
  static async buildDeviceSettingsObject() { return buildDeviceSettingsObject(); }
  static async importBackupObject(backup, mode = 'all') {
    if (!backup || typeof backup !== 'object') throw new Error('invalid_backup_object');
    await applyBackupImportObject(backup, mode);
    return true;
  }
  static async importDeviceSettingsObject(device, options = {}) { return applyDeviceSettingsObject(device, options); }
  static summarizeBackupObject(backup) {
    const storage = backup?.data?.localStorage || {};
    let playlists = [];
    try {
      playlists = JSON.parse(storage['sc3:playlists'] || '[]');
    } catch {}
    const devices = Array.isArray(backup?.devices) ? DeviceRegistry.normalizeDeviceRegistry(backup.devices) : [];
    return normalizeCloudBackupMeta({
      timestamp: Number(backup?.revision?.timestamp || backup?.createdAt || 0),
      appVersion: String(backup?.revision?.appVersion || 'unknown'),
      statsCount: Array.isArray(backup?.data?.stats) ? backup.data.stats.filter(row => row?.uid && row.uid !== 'global').length : 0,
      eventCount: Number(backup?.data?.eventArchive?.eventCountFull || backup?.data?.eventArchive?.eventCount || 0) || (Array.isArray(backup?.data?.eventLog?.warm) ? backup.data.eventLog.warm.length : 0),
      achievementsCount: 0,
      favoritesCount: 0,
      level: 1,
      xp: 0,
      playlistsCount: Array.isArray(playlists) ? playlists.filter(item => !item?.deletedAt).length : 0,
      profileName: String(backup?.data?.userProfile?.name || 'Слушатель'),
      ownerYandexId: String(backup?.identity?.ownerYandexId || ''),
      devicesCount: devices.length,
      deviceStableCount: DeviceRegistry.countDeviceStableIds(devices),
      checksum: String(backup?.integrity?.payloadHash || ''),
      eventLedgerHead: String(backup?.integrity?.eventLedgerHead || backup?.revision?.eventLedgerHead || ''),
      eventLedgerSeq: Number(backup?.integrity?.eventLedgerSeq || backup?.revision?.eventLedgerSeq || 0),
      eventLedgerDeviceStableId: String(backup?.integrity?.eventLedgerDeviceStableId || backup?.revision?.eventLedgerDeviceStableId || ''),
      archivableLedgerHead: String(backup?.integrity?.archivableLedgerHead || backup?.revision?.archivableLedgerHead || ''),
      archivableLedgerSeq: Number(backup?.integrity?.archivableLedgerSeq || backup?.revision?.archivableLedgerSeq || 0),
      archivableLedgerDeviceStableId: String(backup?.integrity?.archivableLedgerDeviceStableId || backup?.revision?.archivableLedgerDeviceStableId || ''),
      archivableLedgerChainId: String(backup?.integrity?.archivableLedgerChainId || backup?.revision?.archivableLedgerChainId || ''),
      archivableEventCount: Number(backup?.integrity?.archivableEventCount || backup?.revision?.archivableEventCount || 0),
      eventLogHash: String(backup?.integrity?.eventLogHash || backup?.revision?.eventLogHash || ''),
      sharedStorageHash: String(backup?.integrity?.sharedStorageHash || backup?.revision?.sharedStorageHash || ''),
      version: String(backup?.version || backup?.revision?.version || 'unknown'),
      sourceDeviceStableId: String(backup?.revision?.sourceDeviceStableId || ''),
      sourceDeviceLabel: String(backup?.revision?.sourceDeviceLabel || ''),
      sourceDeviceClass: String(backup?.revision?.sourceDeviceClass || ''),
      sourcePlatform: String(backup?.revision?.sourcePlatform || '')
    });
  }
}
