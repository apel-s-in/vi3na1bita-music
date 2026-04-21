import { BackupVault } from '../../analytics/backup-vault.js';
import { YandexDisk } from '../../core/yandex-disk.js';
import { getLocalBackupUiSnapshot, compareLocalVsCloud } from '../../analytics/backup-summary.js';
import { openRestorePreviewModal, openRestoreVersionPickerModal } from './yandex-modals.js';

const sS = v => String(v == null ? '' : v).trim();

const getLocalProfile = fallback => {
  try {
    return JSON.parse(localStorage.getItem('profile:last_snapshot') || 'null') || fallback || { name: 'Слушатель' };
  } catch {
    return fallback || { name: 'Слушатель' };
  }
};

const persistCloudMetaAfterRestore = async ({ disk, token, restoredBackup }) => {
  const m = await disk.getMeta(token).catch(() => null);
  if (m) {
    localStorage.setItem('yandex:last_backup_check', JSON.stringify(m));
    localStorage.setItem('yandex:last_backup_meta', JSON.stringify(m));
  }
  localStorage.setItem('yandex:last_backup_local_ts', String(Number(restoredBackup?.revision?.timestamp || restoredBackup?.createdAt || Date.now())));
};

const markRestoreCompleted = async () => {
  try {
    const { markSyncReady, markRestoreOrSkipDone } = await import('../../analytics/backup-sync-engine.js');
    markSyncReady('restore_completed');
    try { markRestoreOrSkipDone('restore_completed'); } catch {}
  } catch {}
};

const refreshAfterRestore = async reason => {
  try {
    const { runPostRestoreRefresh } = await import('./yandex-runtime-refresh.js');
    await runPostRestoreRefresh({ reason: reason || 'cloud_restore', keepCurrentAlbum: true });
  } catch {}
};

export async function openYandexRestoreFlow({
  token,
  disk = YandexDisk,
  notify = window.NotificationSystem,
  rerender,
  localProfile,
  autoPickedPath = null,
  inheritDeviceKey = null,
  asNewDevice = false,
  skipPreview = false,
  applyMode = 'all'
} = {}) {
  if (!token) throw new Error('no_token');
  const [items, meta] = await Promise.all([disk.listBackups(token).catch(() => []), disk.getMeta(token).catch(() => null)]);
  if (!meta) throw new Error('backup_not_found');
  const local = getLocalProfile(localProfile);
  const localSummary = getLocalBackupUiSnapshot({ name: local?.name || 'Слушатель' });
  const cmp = compareLocalVsCloud(localSummary, meta);

  const runRestoreWithPath = async (pickedPath) => {
    if (!pickedPath) return;
    notify?.info('Скачивание резервной копии...');
    try {
      const data = await disk.download(token, pickedPath);
      if (!data) throw new Error('backup_not_found');

      const applyData = async (mode) => {
        try {
          await BackupVault.importData(new Blob([JSON.stringify(data)]), mode || 'all');
          await persistCloudMetaAfterRestore({ disk, token, restoredBackup: data });
          await markRestoreCompleted();
          await refreshAfterRestore(asNewDevice ? 'cloud_restore_new_device' : 'cloud_restore');
          notify?.success(`Восстановление завершено ✅ ${asNewDevice ? '(новое устройство)' : (cmp?.state === 'cloud_richer_new_device' ? '(облако выглядело как источник для нового устройства)' : '')}`);
          rerender?.();
        } catch (e) {
          const msg = sS(e?.message || '');
          if (msg.includes('restore_owner_mismatch')) notify?.error('Этот backup принадлежит другому Яндекс-аккаунту.');
          else if (msg.includes('restore_requires_yandex_login')) notify?.warning('Для восстановления нужен вход в Яндекс.');
          else if (msg.includes('backup_integrity_failed')) notify?.error('Файл backup повреждён или изменён.');
          else notify?.error('Ошибка восстановления: ' + msg);
        }
      };

      if (skipPreview) {
        await applyData(applyMode || 'all');
      } else {
        openRestorePreviewModal(data, async (mode) => applyData(mode));
      }
    } catch (e) {
      const msg = sS(e?.message || '');
      console.error('[Yandex restore flow failed]', e);
      if (msg.includes('disk_forbidden')) notify?.error('Нет доступа к Яндекс Диску. Попробуйте: Выйти → Войти заново (кнопка «Переподключить права»).');
      else if (msg.includes('backup_not_found') || msg.includes('not_found')) notify?.warning('Выбранная облачная копия не найдена.');
      else if (msg.includes('proxy_failed_or_timeout')) notify?.error('Cloud Function не отвечает. Повторите позже или используйте «Из файла».');
      else notify?.error('Ошибка скачивания backup: ' + msg);
    }
  };

  if (autoPickedPath) {
    await runRestoreWithPath(String(autoPickedPath).trim() || meta?.path || null);
  } else {
    openRestoreVersionPickerModal(items?.length ? items : [meta], async (pickedPath) => runRestoreWithPath(pickedPath));
  }

  return {
    ok: true,
    compareState: cmp?.state || 'unknown',
    hasHistory: Array.isArray(items) && items.length > 0,
    inheritDeviceKey: inheritDeviceKey || null,
    asNewDevice: !!asNewDevice
  };
}

export default { openYandexRestoreFlow };
