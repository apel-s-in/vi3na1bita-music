// scripts/app/profile/yandex-actions.js
// Обработчики пользовательских действий с Яндекс-авторизацией из профиля.

import { BackupVault } from '../../analytics/backup-vault.js';
import { YandexDisk } from '../../core/yandex-disk.js';
import { openBackupInfoModal, openBackupFoundModal, openRestorePreviewModal } from './yandex-modals.js';

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
      window.NotificationSystem?.info('Сохраняем на Яндекс Диск...');
      try {
        const backup = await BackupVault.buildBackupObject();
        const meta = await disk.upload(token, backup);
        try {
          localStorage.setItem('yandex:last_backup_meta', JSON.stringify(meta));
          localStorage.setItem('yandex:last_backup_local_ts', String(backup.timestamp || Date.now()));
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
        const data = await disk.download(token);
        if (!data) return window.NotificationSystem?.warning('Резервная копия не найдена на Диске.');
        openRestorePreviewModal(data, async mode => {
          try {
            await BackupVault.importData(new Blob([JSON.stringify(data)]), mode || 'all');
            window.NotificationSystem?.success('Прогресс восстановлен ✅ Обновляем...');
            setTimeout(() => window.location.reload(), 1500);
          } catch (e) {
            window.NotificationSystem?.error('Ошибка восстановления: ' + String(e?.message || ''));
          }
        });
      } catch (e) {
        window.NotificationSystem?.error('Ошибка восстановления: ' + String(e?.message || ''));
      }
    }
  };
}
export default { initYandexActions };
