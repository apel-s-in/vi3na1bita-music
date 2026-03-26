// scripts/app/profile/yandex-actions.js
// Обработчики пользовательских действий с Яндекс-авторизацией из профиля.

import { BackupVault } from '../../analytics/backup-vault.js';
import { YandexDisk } from '../../core/yandex-disk.js';

export function initYandexActions() {
  window._handleYaAction = async (action, container, rerender) => {
    const ya = window.YandexAuth;
    const disk = YandexDisk;
    if (!ya) return;

    if (action === 'login') {
      ya.login();
      return;
    }

    if (action === 'logout') {
      window.Modals?.confirm?.({
        title: 'Выйти из аккаунта?',
        textHtml: 'Локальный прогресс сохранится. Только облачная синхронизация отключится.',
        confirmText: 'Выйти', cancelText: 'Отмена',
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

    if (action === 'save-backup') {
      const token = ya.getToken();
      if (!token || !ya.isTokenAlive()) {
        window.NotificationSystem?.warning('Сессия истекла. Войдите снова.');
        return;
      }
      if (!window.NetPolicy?.isNetworkAllowed?.() ?? !navigator.onLine) {
        window.NotificationSystem?.error('Нет подключения к сети.');
        return;
      }
      window.NotificationSystem?.info('Сохраняем на Яндекс Диск...');
      try {
        const backup = await BackupVault.buildBackupObject();
        await disk.upload(token, backup);
        window.NotificationSystem?.success('Прогресс сохранён на Яндекс Диск ✅');
        if (window.eventLogger) {
          window.eventLogger.log('FEATURE_USED', 'global', { feature: 'backup' });
          window.dispatchEvent(new CustomEvent('analytics:forceFlush'));
        }
      } catch (e) {
        const msg = String(e?.message || '');
        if (msg.includes('401') || msg.includes('403')) {
          window.NotificationSystem?.warning('Сессия истекла. Войдите снова.');
        } else {
          window.NotificationSystem?.error('Ошибка сохранения: ' + msg);
        }
      }
      return;
    }

    if (action === 'restore-backup') {
      const token = ya.getToken();
      if (!token || !ya.isTokenAlive()) {
        window.NotificationSystem?.warning('Сессия истекла. Войдите снова.');
        return;
      }
      window.Modals?.confirm?.({
        title: 'Восстановить прогресс?',
        textHtml: 'Данные с Яндекс Диска объединятся с локальными. Текущий прогресс не будет потерян.',
        confirmText: 'Восстановить', cancelText: 'Отмена',
        onConfirm: async () => {
          window.NotificationSystem?.info('Загружаем резервную копию...');
          try {
            const data = await disk.download(token);
            if (!data) {
              window.NotificationSystem?.warning('Резервная копия не найдена на Диске.');
              return;
            }
            await BackupVault.importData(new Blob([JSON.stringify(data)]));
            window.NotificationSystem?.success('Прогресс восстановлен ✅ Обновляем...');
            setTimeout(() => window.location.reload(), 1500);
          } catch (e) {
            window.NotificationSystem?.error('Ошибка восстановления: ' + String(e?.message || ''));
          }
        }
      });
      return;
    }
  };
}

export default { initYandexActions };
