import { bindCurrentInstallToDeviceStableId, ensureCurrentDeviceRegistryRow } from '../../core/device-linking.js';
import { getDeviceSettingsSemanticHash } from '../../analytics/backup-upload-runner.js';
import { saveRestoreRecoverySnapshot, restoreRecoverySnapshot } from '../../analytics/backup-recovery.js';
import { enrichBackupWithEventArchive } from '../../analytics/event-archive-restore.js';
import { adoptLedgerCheckpointFromEvents } from '../../analytics/event-integrity.js';
import { pickDeviceSettingsRestoreKey } from './restore-decision.js';

export const importBackupWithFallback = async ({ BackupVault: bV, backup: b, mode: m = 'all' } = {}) => {
  if (!bV || !b) throw new Error('restore_runner_invalid_input');
  if (typeof bV.importBackupObject !== 'function') throw new Error('restore_runner_import_api_missing');
  await bV.importBackupObject(b, m);
  return true;
};

export const maybeApplyDeviceSettings = async ({ BackupVault: bV, disk: d, token: t, backup: b, inheritDeviceKey: iK = null, asNewDevice: aN = false, skipDeviceSettings: sDS = false, allowPlaybackSensitive: aPS = false } = {}) => {
  if (sDS || !bV || !d || !t || typeof bV.importDeviceSettingsObject !== 'function') return false;
  const k = pickDeviceSettingsRestoreKey({ backup: b, inheritDeviceKey: iK, asNewDevice: aN });
  if (!k) return false;
  try {
    const m = await d.getDeviceSettingsMeta?.(t, k).catch(() => null);
    if (!m?.deviceStableId) return false;
    if (m?.semanticHash && typeof bV.buildDeviceSettingsObject === 'function') {
      const lD = await bV.buildDeviceSettingsObject().catch(() => null);
      const lH = lD ? await getDeviceSettingsSemanticHash(lD).catch(() => '') : '';
      if (lH && lH === m.semanticHash) return false;
    }
    const doc = await d.downloadDeviceSettings?.(t, k).catch(() => null);
    if (!doc?.deviceStableId) return false;
    await bV.importDeviceSettingsObject(doc, { allowPlaybackSensitive: !!aPS });
    return true;
  } catch { return false; }
};

export const persistCloudMetaAfterRestore = async ({ disk: d, token: t, restoredBackup: rB } = {}) => {
  const m = await d.getMeta(t).catch(() => null);
  if (m) {
    const j = JSON.stringify(m);
    localStorage.setItem('yandex:last_backup_check', j);
    localStorage.setItem('yandex:last_backup_meta', j);
    localStorage.setItem('backup:last_local_summary:v1', j);
    localStorage.setItem('yandex:last_backup_check_ts', String(Date.now()));
  }
  localStorage.setItem('yandex:last_backup_local_ts', String(Number(rB?.revision?.timestamp || rB?.createdAt || Date.now())));
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

export const refreshAfterRestore = async ({ reason: r = 'cloud_restore', keepCurrentAlbum: kCA = true } = {}) => {
  try {
    const { runPostRestoreRefresh } = await import('./yandex-runtime-refresh.js');
    await runPostRestoreRefresh({ reason: r, keepCurrentAlbum: kCA });
  } catch {}
  return true;
};

export const runBackupRestore = async ({ BackupVault: bV, disk: d, token: t, backup: b, mode: m = 'all', inheritDeviceKey: iK = null, asNewDevice: aN = false, skipDeviceSettings: sDS = false, allowPlaybackSensitive: aPS = false, refreshReason: rR = 'cloud_restore', keepCurrentAlbum: kCA = true } = {}) => {
  await saveRestoreRecoverySnapshot({ BackupVault: bV, reason: rR }).catch(() => false);
  try {
    const eff = await enrichBackupWithEventArchive({ disk: d, token: t, backup: b }).catch(() => b);
    await importBackupWithFallback({ BackupVault: bV, backup: eff, mode: m });
    await maybeApplyDeviceSettings({ BackupVault: bV, disk: d, token: t, backup: eff, inheritDeviceKey: iK, asNewDevice: aN, skipDeviceSettings: sDS, allowPlaybackSensitive: aPS });

    if (iK && !aN) {
      const p = (Array.isArray(eff?.devices) ? eff.devices : []).find(x => String(x?.deviceStableId || '').trim() === String(iK || '').trim()) || null;
      await bindCurrentInstallToDeviceStableId({ deviceStableId: iK, label: p?.label || '', deviceClass: p?.class || '', platform: p?.platform || '', registry: eff?.devices || [] }).catch(() => null);
    } else if (aN) {
      await ensureCurrentDeviceRegistryRow({ registry: eff?.devices || [] }).catch(() => null);
    }

    await adoptLedgerCheckpointFromEvents({ deviceStableId: localStorage.getItem('deviceStableId') || '', reason: 'after_restore_adopt_branch' }).catch(() => null);
    await persistCloudMetaAfterRestore({ disk: d, token: t, restoredBackup: eff });
    await markRestoreCompleted();
    try { window.eventLogger?.log?.('RESTORE_APPLIED', null, { mode: m, refreshReason: rR, asNewDevice: !!aN, skipDeviceSettings: !!sDS, archiveMerged: !!eff?.data?.eventArchive?.available }); } catch {}
    await refreshAfterRestore({ reason: rR, keepCurrentAlbum: kCA });
    return true;
  } catch (e) {
    window.Modals?.confirm?.({
      title: 'Ошибка восстановления',
      textHtml: `Restore не завершился: ${window.Utils?.escapeHtml?.(String(e?.message || '')) || ''}<br><br>Вернуть локальное состояние, сохранённое перед восстановлением?`,
      confirmText: 'Откатить',
      cancelText: 'Оставить как есть',
      onConfirm: async () => {
        try {
          await restoreRecoverySnapshot({ BackupVault: bV });
          window.NotificationSystem?.success?.('Локальное состояние восстановлено ✅');
        } catch (err) {
          window.NotificationSystem?.error?.('Откат не удался: ' + String(err?.message || ''));
        }
      }
    });
    throw e;
  }
};

export default { importBackupWithFallback, maybeApplyDeviceSettings, persistCloudMetaAfterRestore, markRestoreCompleted, refreshAfterRestore, runBackupRestore };
