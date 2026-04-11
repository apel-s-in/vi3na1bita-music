import { BackupVault } from '../../analytics/backup-vault.js';
import { YandexDisk } from '../../core/yandex-disk.js';
import { openBackupInfoModal, openBackupFoundModal, openRestorePreviewModal, openManualRestoreHelpModal } from './yandex-modals.js';

let _cachedBackupFile = null;

function pickBackupFile(useCache = false) {
  if (useCache && _cachedBackupFile) {
    return Promise.resolve(_cachedBackupFile);
  }
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.vi3bak,application/json';
    inp.onchange = () => {
      const file = inp.files?.[0] || null;
      if (file) _cachedBackupFile = file;
      resolve(file);
    };
    inp.click();
  });
}

function clearCachedBackupFile() { _cachedBackupFile = null; }

export function initYandexActions() {
  window._handleYaAction = async (action, container, rerender) => {
    const ya = window.YandexAuth;
    const disk = YandexDisk;
    if (!ya) return;

    if (action === 'login') return ya.login();

    if (action === 'logout') {
      window.Modals?.confirm?.({
        title: 'Выйти из аккаунта?',
        textHtml: 'Локальный прогресс сохранится. Только облачная синхронизация отключится.',
        confirmText: 'Выйти',
        cancelText: 'Отмена',
        onConfirm: () => { ya.logout(); rerender?.(); }
      });
      return;
    }

    if (action === 'rename') {
      const profile = ya.getProfile();
      if (!profile) return;
      window.Utils?.profileModals?.promptName?.({
        title: 'Изменить имя',
        value: profile.displayName || '',
        btnText: 'Сохранить',
        onSubmit: name => {
          ya.updateDisplayName(name);
          rerender?.();
          window.NotificationSystem?.success('Имя обновлено');
        }
      });
      return;
    }

    if (action === 'backup-info') return openBackupInfoModal();

    if (action === 'backup-export-manual') {
      try {
        await BackupVault.exportData();
        window.NotificationSystem?.success('Backup-файл сохранён на устройство ✅');
      } catch (e) {
        window.NotificationSystem?.error('Ошибка сохранения файла: ' + String(e?.message || ''));
      }
      return;
    }

    if (action === 'backup-import-manual') {
      const token = ya.getToken();
      if (!token || !ya.isTokenAlive()) return window.NotificationSystem?.warning('Для восстановления нужен вход в Яндекс.');
      try {
        const file = await pickBackupFile(true);
        if (!file) return;
        await BackupVault.importData(file, 'all');
        clearCachedBackupFile();
        window.NotificationSystem?.success('Backup восстановлен ✅ Обновляем...');
        setTimeout(() => window.location.reload(), 1400);
      } catch (e) {
        const msg = String(e?.message || '');
        if (msg.includes('restore_owner_mismatch')) window.NotificationSystem?.error('Этот backup принадлежит другому Яндекс-аккаунту.');
        else if (msg.includes('restore_requires_yandex_login')) window.NotificationSystem?.warning('Сначала войдите в Яндекс.');
        else if (msg.includes('backup_integrity_failed')) window.NotificationSystem?.error('Файл backup повреждён или изменён.');
        else window.NotificationSystem?.error('Ошибка импорта backup: ' + msg);
      }
      return;
    }

    if (action === 'check-backup') {
      const token = ya.getToken();
      if (!token || !ya.isTokenAlive()) return window.NotificationSystem?.warning('Сессия истекла. Войдите снова.');
      window.NotificationSystem?.info('Проверяем облачную копию...');
      try {
        const [exists, meta] = await Promise.all([disk.checkExists(token), disk.getMeta(token).catch(() => null)]);
        if (!exists) {
          try { localStorage.removeItem('yandex:last_backup_check'); } catch {}
          window.NotificationSystem?.warning('Облачная резервная копия не найдена.');
          rerender?.();
          return;
        }
        try { if (meta) localStorage.setItem('yandex:last_backup_check', JSON.stringify(meta)); } catch {}
        rerender?.();
        openBackupFoundModal(meta);
      } catch (e) {
        window.NotificationSystem?.error('Не удалось проверить резервную копию: ' + String(e?.message || ''));
      }
      return;
    }

    if (action === 'save-backup') {
      const token = ya.getToken();
      if (!token || !ya.isTokenAlive()) return window.NotificationSystem?.warning('Сессия истекла. Войдите снова.');
      if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return window.NotificationSystem?.error('Нет подключения к сети.');
      window.NotificationSystem?.info('Сохраняем единый backup на Яндекс Диск...');
      try {
        const backup = await BackupVault.buildBackupObject();
        const meta = await disk.upload(token, backup);
        try {
          localStorage.setItem('yandex:last_backup_meta', JSON.stringify(meta));
          localStorage.setItem('yandex:last_backup_local_ts', String(Number(backup?.revision?.timestamp || backup?.createdAt || Date.now())));
        } catch {}
        window.NotificationSystem?.success('Прогресс сохранён на Яндекс Диск ✅');
        if (window.eventLogger) {
          window.eventLogger.log('FEATURE_USED', 'global', { feature: 'backup' });
          window.dispatchEvent(new CustomEvent('analytics:forceFlush'));
        }
        rerender?.();
      } catch (e) {
        const msg = String(e?.message || '');
        if (msg.includes('401') || msg.includes('403')) window.NotificationSystem?.warning('Сессия истекла. Войдите снова.');
        else window.NotificationSystem?.error('Ошибка сохранения: ' + msg);
      }
      return;
    }

    if (action === 'restore-backup') {
      const token = ya.getToken();
      if (!token || !ya.isTokenAlive()) return window.NotificationSystem?.warning('Сессия истекла. Войдите снова.');
      window.NotificationSystem?.info('Загружаем резервную копию...');
      try {
        const data = await disk.download(token).catch(async e => {
          const msg = String(e?.message || '');
          const hint = String(e?.payload?.hint || '');

          if (msg.includes('disk_forbidden') || msg.includes('disk_auth_error') || msg.includes('token_invalid_or_expired')) {
            window.Modals?.confirm?.({
              title: 'Нужно переподключить Яндекс',
              textHtml: `${hint || 'Текущему токену не хватает прав на папку приложения Яндекс.Диска.'}<br><br>Это всё ещё <b>одна и та же авторизация</b>, просто нужно заново выдать корректные права.`,
              confirmText: 'Переподключить',
              cancelText: 'Отмена',
              onConfirm: () => {
                ya.logout();
                setTimeout(() => ya.login({ forceConfirm: true }), 250);
              }
            });
            throw new Error('__handled__');
          }

          throw e;
        });
        if (!data) return window.NotificationSystem?.warning('Резервная копия не найдена на Диске.');
        openRestorePreviewModal(data, async mode => {
          try {
            await BackupVault.importData(new Blob([JSON.stringify(data)]), mode || 'all');
            window.NotificationSystem?.success('Прогресс восстановлен ✅ Обновляем...');
            setTimeout(() => window.location.reload(), 1500);
          } catch (e) {
            const msg = String(e?.message || '');
            if (msg.includes('restore_owner_mismatch')) window.NotificationSystem?.error('Этот backup принадлежит другому Яндекс-аккаунту.');
            else window.NotificationSystem?.error('Ошибка восстановления: ' + msg);
          }
        });
      } catch (e) {
        if (String(e?.message || '').includes('download_cors_fallback_required')) {
          const href = e?.downloadHref || await disk.getDownloadLink(token).catch(() => null);
          openManualRestoreHelpModal(href, async () => {
            const file = await pickBackupFile();
            if (!file) return;
            try {
              await BackupVault.importData(file, 'all');
              window.NotificationSystem?.success('Backup восстановлен ✅ Обновляем...');
              setTimeout(() => window.location.reload(), 1500);
            } catch (err) {
              const msg = String(err?.message || '');
              if (msg.includes('restore_owner_mismatch')) window.NotificationSystem?.error('Этот backup принадлежит другому Яндекс-аккаунту.');
              else if (msg.includes('backup_integrity_failed')) window.NotificationSystem?.error('Файл backup повреждён или изменён.');
              else window.NotificationSystem?.error('Ошибка импорта backup: ' + msg);
            }
          });
        } else if (String(e?.message || '') !== '__handled__') {
          window.NotificationSystem?.error('Ошибка восстановления: ' + String(e?.message || ''));
        }
      }
    }
  };
}
export default { initYandexActions };
