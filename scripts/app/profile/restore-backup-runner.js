const sS = v => String(v == null ? '' : v).trim();

export const importBackupWithFallback = async ({ BackupVault, backup, mode = 'all' } = {}) => {
  if (!BackupVault || !backup) throw new Error('restore_runner_invalid_input');
  if (typeof BackupVault.importBackupObject !== 'function') throw new Error('restore_runner_import_api_missing');
  await BackupVault.importBackupObject(backup, mode);
  return true;
};

export const maybeApplyDeviceSettings = async ({
  BackupVault,
  disk,
  token,
  backup,
  inheritDeviceKey = null,
  asNewDevice = false,
  allowPlaybackSensitive = false
} = {}) => {
  if (asNewDevice || !BackupVault || !disk || !token) return false;
  if (typeof BackupVault.importDeviceSettingsObject !== 'function') return false;

  const deviceKey = sS(inheritDeviceKey || backup?.revision?.sourceDeviceStableId || '');
  if (!deviceKey) return false;

  try {
    const meta = await disk.getDeviceSettingsMeta?.(token, deviceKey).catch(() => null);
    if (!meta?.deviceStableId) return false;

    const doc = await disk.downloadDeviceSettings?.(token, deviceKey).catch(() => null);
    if (!doc?.deviceStableId) return false;

    await BackupVault.importDeviceSettingsObject(doc, { allowPlaybackSensitive: !!allowPlaybackSensitive });
    return true;
  } catch {
    return false;
  }
};

export const persistCloudMetaAfterRestore = async ({ disk, token, restoredBackup } = {}) => {
  const m = await disk.getMeta(token).catch(() => null);
  if (m) {
    localStorage.setItem('yandex:last_backup_check', JSON.stringify(m));
    localStorage.setItem('yandex:last_backup_meta', JSON.stringify(m));
  }
  localStorage.setItem('yandex:last_backup_local_ts', String(Number(restoredBackup?.revision?.timestamp || restoredBackup?.createdAt || Date.now())));
  return true;
};

export const markRestoreCompleted = async () => {
  try {
    const { markSyncReady, markRestoreOrSkipDone } = await import('../../analytics/backup-sync-engine.js');
    markSyncReady('restore_completed');
    try { markRestoreOrSkipDone('restore_completed'); } catch {}
  } catch {}
  return true;
};

export const refreshAfterRestore = async ({ reason = 'cloud_restore', keepCurrentAlbum = true } = {}) => {
  try {
    const { runPostRestoreRefresh } = await import('./yandex-runtime-refresh.js');
    await runPostRestoreRefresh({ reason, keepCurrentAlbum });
  } catch {}
  return true;
};

export const runBackupRestore = async ({
  BackupVault,
  disk,
  token,
  backup,
  mode = 'all',
  inheritDeviceKey = null,
  asNewDevice = false,
  allowPlaybackSensitive = false,
  refreshReason = 'cloud_restore',
  keepCurrentAlbum = true
} = {}) => {
  await importBackupWithFallback({ BackupVault, backup, mode });
  await maybeApplyDeviceSettings({
    BackupVault,
    disk,
    token,
    backup,
    inheritDeviceKey,
    asNewDevice,
    allowPlaybackSensitive
  });
  await persistCloudMetaAfterRestore({ disk, token, restoredBackup: backup });
  await markRestoreCompleted();
  await refreshAfterRestore({ reason: refreshReason, keepCurrentAlbum });
  return true;
};

export default {
  importBackupWithFallback,
  maybeApplyDeviceSettings,
  persistCloudMetaAfterRestore,
  markRestoreCompleted,
  refreshAfterRestore,
  runBackupRestore
};
