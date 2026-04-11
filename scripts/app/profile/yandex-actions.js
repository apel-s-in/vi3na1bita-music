// scripts/app/profile/yandex-actions.js
// Обработчики пользовательских действий с Яндекс-авторизацией из профиля.

import { BackupVault } from '../../analytics/backup-vault.js';
import { YandexDisk } from '../../core/yandex-disk.js';

function openBackupInfoModal() {
  window.Modals?.open?.({
    title: 'Что сохраняется в облако',
    maxWidth: 460,
    bodyHtml: `
      <div class="modal-confirm-text">
        Резервная копия создаётся в личной папке приложения на Яндекс Диске.<br><br>
        В состав входят:
        <ul style="margin:10px 0 0 18px;color:#eaf2ff;line-height:1.5">
          <li>статистика прослушивания</li>
          <li>достижения, XP и стрики</li>
          <li>локальный профиль пользователя</li>
          <li>избранное</li>
          <li>плейлисты и настройки витрины</li>
          <li>настройки интерфейса и часть служебных данных восстановления</li>
        </ul>
        <div style="margin-top:12px;color:#9db7dd">
          В резервную копию не попадает пароль Яндекса. Доступ идёт только через официальный OAuth и только к данным приложения.
        </div>
      </div>`
  });
}

function openRestorePreviewModal(data, onConfirm) {
  const sum = BackupVault.summarizeBackupObject(data);
  const localTs = Number(localStorage.getItem('yandex:last_backup_local_ts') || 0);
  const cmp = sum.timestamp > localTs ? 'Облачная копия новее локального состояния.' : (localTs > sum.timestamp ? 'Локальные данные новее облачной копии.' : 'Дата облачной и локальной копии совпадает.');
  const m = window.Modals?.open?.({
    title: 'Предпросмотр восстановления',
    maxWidth: 480,
    bodyHtml: `
      <div class="modal-confirm-text">
        <b>Имя профиля:</b> ${window.Utils?.escapeHtml?.(sum.profileName) || sum.profileName}<br>
        <b>Дата backup:</b> ${sum.timestamp ? new Date(sum.timestamp).toLocaleString('ru-RU') : 'неизвестно'}<br>
        <b>Версия приложения:</b> ${window.Utils?.escapeHtml?.(sum.appVersion) || sum.appVersion}<br>
        <b>Треков в статистике:</b> ${sum.statsCount}<br>
        <b>Достижений:</b> ${sum.achievementsCount}<br>
        <b>Избранных записей:</b> ${sum.favoritesCount}<br>
        <b>Плейлистов витрины:</b> ${sum.playlistsCount}<br><br>
        <span style="color:#9db7dd">${cmp}</span><br><br>
        <b>Выберите режим:</b>
      </div>
      <div class="modal-choice-actions">
        <button type="button" class="modal-action-btn online" data-restore-mode="all">Восстановить всё</button>
        <button type="button" class="modal-action-btn" data-restore-mode="profile">Только профиль и избранное</button>
        <button type="button" class="modal-action-btn" data-restore-mode="stats">Только статистику и достижения</button>
      </div>`
  });
  m?.addEventListener('click', e => {
    const btn = e.target.closest('[data-restore-mode]');
    if (!btn) return;
    const mode = btn.dataset.restoreMode || 'all';
    m.remove();
    onConfirm?.(mode);
  });
}

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

    if (action === 'backup-info') {
      openBackupInfoModal();
      return;
    }

    if (action === 'check-backup') {
      const token = ya.getToken();
      if (!token || !ya.isTokenAlive()) {
        window.NotificationSystem?.warning('Сессия истекла. Войдите снова.');
        return;
      }
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
        window.Modals?.open?.({
          title: 'Облачная копия найдена',
          maxWidth: 460,
          bodyHtml: `
            <div class="modal-confirm-text">
              <b>Статус:</b> копия доступна<br>
              <b>Дата:</b> ${meta?.timestamp ? new Date(meta.timestamp).toLocaleString('ru-RU') : 'неизвестно'}<br>
              <b>Версия backup:</b> ${window.Utils?.escapeHtml?.(meta?.version || 'unknown') || 'unknown'}<br>
              <b>Версия приложения:</b> ${window.Utils?.escapeHtml?.(meta?.appVersion || 'unknown') || 'unknown'}<br><br>
              <span style="color:#9db7dd">Копия хранится в личной папке приложения на Яндекс Диске. Она недоступна другим пользователям приложения.</span>
            </div>`
        });
      } catch (e) {
        window.NotificationSystem?.error('Не удалось проверить резервную копию: ' + String(e?.message || ''));
      }
      return;
    }

    if (action === 'save-backup') {
      const token = ya.getToken();
      if (!token || !ya.isTokenAlive()) {
        window.NotificationSystem?.warning('Сессия истекла. Войдите снова.');
        return;
      }
      if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) {
        window.NotificationSystem?.error('Нет подключения к сети.');
        return;
      }
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
      window.NotificationSystem?.info('Загружаем резервную копию...');
      try {
        const data = await disk.download(token);
        if (!data) {
          window.NotificationSystem?.warning('Резервная копия не найдена на Диске.');
          return;
        }
        openRestorePreviewModal(data, async (mode) => {
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
      return;
    }
  };
}

export default { initYandexActions };
