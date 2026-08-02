import { clearBackupV7Dirty, syncBackupV7 } from '../../analytics/backup-sync-engine.js';
import { openBackupInfoModal } from './backup-info-modal.js';
import { renderSyncLogRow } from './profile-render-kit.js';

const openSyncLogModal = async () => {
  const { readSyncRevisions } = await import('../../analytics/sync-revisions.js');
  const rows = readSyncRevisions();
  window.Modals?.open?.({
    title: 'Журнал синхронизации',
    maxWidth: 420,
    bodyHtml: rows.length ? `<div class="sync-log-list">${rows.map(renderSyncLogRow).join('')}</div>` : '<div class="fav-empty">Журнал синхронизации пока пуст</div>'
  });
};

const reconnectRights = ({ ya, rerender }) => window.Modals?.confirm?.({
  title: 'Переподключить права Яндекса?',
  textHtml: 'Приложение выполнит локальный выход и при следующем входе попросит заново подтвердить доступ к папке приложения на Яндекс Диске.',
  confirmText: 'Переподключить',
  cancelText: 'Отмена',
  onConfirm: () => {
    try {
      window.eventLogger?.log?.('AUTH_EVENT', null, { action: 'reconnect_rights_requested', status: 'confirm' });
    } catch {}
    ya.logout();
    rerender?.();
    setTimeout(() => ya.login({ forceConfirm: true }), 250);
  }
});

const syncNow = async ({ ya, notify, rerender }) => {
  if (!ya.getToken() || !ya.isTokenAlive()) return notify?.warning?.('Сессия истекла. Войдите снова.');
  if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return notify?.error?.('Нет подключения к сети.');

  notify?.info?.('Сохраняем новые данные v7…');

  try {
    const result = await syncBackupV7({ reason: 'manual_save', includeSettings: true });
    clearBackupV7Dirty();
    const quarantined = Array.isArray(result.quarantine) ? result.quarantine.length : 0;
    const remaining = Number(result.pull?.remaining || 0);
    const pages = Number(result.pull?.pages || 1);
    const suffix = quarantined
      ? ` · изолировано цепочек: ${quarantined}`
      : remaining > 0
        ? ` · осталось ranges: ${remaining}`
        : '';
    notify?.success?.(`Синхронизация завершена ✅ Загружено: ${result.push.uploaded}, получено: ${result.pull.applied}, страниц: ${pages}${suffix}`);
    rerender?.();
  } catch (error) {
    const message = String(error?.message || '');
    if (/oauth|401/i.test(message)) notify?.error?.('Сессия истекла. Войдите снова.');
    else if (/revoked/i.test(message)) notify?.error?.('Это устройство отозвано в настройках аккаунта.');
    else if (/chain_gap|hash_mismatch|quarantine/i.test(message)) notify?.error?.('V7 chain требует проверки целостности.');
    else notify?.error?.(`Ошибка синхронизации: ${message}`);
  }
};

export function initYandexActions() {
  window._handleYaAction = async (action, container, rerender) => {
    const ya = window.YandexAuth;
    const notify = window.NotificationSystem;
    const modals = window.Modals;
    if (!ya) return;

    const handlers = {
      login: () => ya.login(),
      logout: () => modals?.confirm?.({
        title: 'Выйти из аккаунта?',
        textHtml: 'Локальный account vault сохранится. Облачная синхронизация и серверные функции будут отключены до следующего входа.',
        confirmText: 'Выйти',
        cancelText: 'Отмена',
        onConfirm: () => {
          ya.logout();
          rerender?.();
          notify?.info?.('Следующий вход запросит подтверждение Яндекса заново');
        }
      }),
      rename: () => {
        const profile = ya.getProfile();
        if (!profile) return;
        window.Utils?.profileModals?.promptName?.({
          title: 'Изменить имя',
          value: profile.displayName || '',
          btnText: 'Сохранить',
          onSubmit: value => {
            ya.updateDisplayName(value);
            rerender?.();
            notify?.success?.('Имя обновлено');
          }
        });
      },
      'backup-info': openBackupInfoModal,
      'sync-log': openSyncLogModal,
      'reconnect-rights': () => reconnectRights({ ya, rerender }),
      'save-backup': () => syncNow({ ya, notify, rerender })
    };

    return handlers[action]?.();
  };
}

export default { initYandexActions };
