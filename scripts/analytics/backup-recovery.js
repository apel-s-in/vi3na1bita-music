// UID.100_(Backup snapshot as life capsule)_(перед restore сохранять recovery snapshot)_(можно откатиться при ошибке)
// UID.094_(No-paralysis rule)_(recovery не трогает playback напрямую)_(только backup import + post refresh)

import { metaDB } from './meta-db.js';

const KEY = 'restore_recovery_snapshot';

export const saveRestoreRecoverySnapshot = async ({ BackupVault, reason = 'before_restore' } = {}) => {
  if (!BackupVault?.buildBackupObject) return false;
  try {
    const backup = await BackupVault.buildBackupObject();
    await metaDB.setGlobal(KEY, { savedAt: Date.now(), reason, backup });
    return true;
  } catch {
    return false;
  }
};

export const restoreRecoverySnapshot = async ({ BackupVault, reason = 'restore_failed_rollback' } = {}) => {
  const rec = (await metaDB.getGlobal(KEY).catch(() => null))?.value;
  if (!rec?.backup || !BackupVault?.importBackupObject) return false;
  await BackupVault.importBackupObject(rec.backup, 'all');
  try {
    const { runPostRestoreRefresh } = await import('../app/profile/yandex-runtime-refresh.js');
    await runPostRestoreRefresh({ reason, keepCurrentAlbum: true });
  } catch {}
  return true;
};

export const getRestoreRecoverySnapshotInfo = async () => {
  const rec = (await metaDB.getGlobal(KEY).catch(() => null))?.value;
  return rec ? { savedAt: rec.savedAt || 0, reason: rec.reason || '' } : null;
};

export default { saveRestoreRecoverySnapshot, restoreRecoverySnapshot, getRestoreRecoverySnapshotInfo };
