import { syncBackupV7 } from '../../analytics/backup-v7-sync.js';
import { openBackupInfoModal } from './backup-info-modal.js';
import { renderSyncLogRow, esc } from './profile-render-kit.js';

const openSyncLogModal = async () => {
  const { readSyncRevisions } = await import('../../analytics/sync-revisions.js');
  const rows = readSyncRevisions();
  window.Modals?.open?.({
    title: 'Журнал синхронизации',
    maxWidth: 420,
    bodyHtml: rows.length ? `<div class="sync-log-list">${rows.map(renderSyncLogRow).join('')}</div>` : '<div class="fav-empty">Журнал синхронизации пока пуст</div>'
  });
};

const openLegacyCloudCleanupModal = async () => {
  if (!window.Modals?.open) return;
  const modal = window.Modals.open({ title: 'Очистка старого Backup v6', maxWidth: 430, strictClose: true, bodyHtml: '<div class="fav-empty">Проверяем старые файлы на Яндекс Диске…</div>' });

  try {
    const { cleanupLegacyBackupV6 } = await import('../../analytics/backup-v7-sync.js');
    const preview = await cleanupLegacyBackupV6();
    const bytes = window.Utils?.fmt?.bytes?.(preview.knownFileBytes || 0) || `${Math.round(Number(preview.knownFileBytes || 0) / 1024)} KB`;
    const rows = (preview.candidates || []).map(item => `<div class="profile-list-item"><div style="font-size:20px">${item.type === 'dir' ? '📁' : '📄'}</div><div class="log-info"><div class="log-title">${esc(item.name)}</div><div class="log-desc">${item.type === 'dir' ? 'размер будет освобождён вместе со всем содержимым' : window.Utils?.fmt?.bytes?.(item.size || 0) || item.size || 0}</div></div></div>`).join('');

    if (!modal.isConnected) return;

    modal.querySelector('.modal-body').innerHTML = preview.count
      ? `<div class="modal-confirm-text">Найдено legacy-ресурсов: <b>${preview.count}</b>.<br>Известный размер отдельных файлов: <b>${esc(bytes)}</b>.<br><br>Папки <b>events</b> и <b>device-settings</b> могут занимать дополнительное место.</div><div style="display:flex;flex-direction:column;gap:7px;max-height:230px;overflow:auto">${rows}</div><div class="yandex-auth-note" style="color:#ffb74d">Удаление необратимо. Текущий <b>app:/Backup/v7</b> защищён и удалён не будет.</div><label style="display:block;margin-top:12px;color:#9db7dd;font-size:12px">Для подтверждения введите <b>УДАЛИТЬ</b></label><input type="text" id="legacy-cleanup-confirm" class="pm-name-inp" autocomplete="off" placeholder="УДАЛИТЬ"><button type="button" class="om-btn om-btn--danger om-fullw" id="legacy-cleanup-run" ${preview.ready ? '' : 'disabled'}>${preview.ready ? 'Удалить Backup v6 навсегда' : 'Backup v7 ещё не готов'}</button>`
      : '<div class="fav-empty">Старые Backup v6, events и device-settings не найдены.</div>';

    const button = modal.querySelector('#legacy-cleanup-run');
    button?.addEventListener('click', async () => {
      const input = modal.querySelector('#legacy-cleanup-confirm');
      if (String(input?.value || '').trim().toUpperCase() !== 'УДАЛИТЬ') {
        window.NotificationSystem?.warning?.('Введите слово УДАЛИТЬ');
        input?.focus();
        return;
      }

      button.disabled = true;
      button.textContent = 'Удаляем…';

      try {
        const result = await cleanupLegacyBackupV6({ confirmed: true });
        ['yandex:last_backup_meta', 'yandex:last_backup_check', 'yandex:last_backup_check_ts', 'backup:last_local_summary:v1', 'backup:restore_or_skip_done'].forEach(key => localStorage.removeItem(key));
        modal.remove();
        window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));
        window.NotificationSystem?.success?.(`Удалено legacy-ресурсов: ${result.deleted || 0}`);
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Удалить Backup v6 навсегда';
        window.NotificationSystem?.error?.(`Очистка не выполнена: ${error?.message || 'ошибка'}`);
      }
    });
  } catch (error) {
    if (modal.isConnected) modal.querySelector('.modal-body').innerHTML = `<div class="fav-empty">Не удалось проверить legacy backup: ${esc(error?.message || 'ошибка')}</div>`;
  }
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
      'legacy-cloud-cleanup': openLegacyCloudCleanupModal,
      'reconnect-rights': () => reconnectRights({ ya, rerender }),
      'save-backup': () => syncNow({ ya, notify, rerender })
    };

    return handlers[action]?.();
  };
}

export default { initYandexActions };
