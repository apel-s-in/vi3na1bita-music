import { BackupVault } from '../../analytics/backup-vault.js';

export function openBackupInfoModal() {
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

export function openBackupFoundModal(meta) {
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
}

export function openRestorePreviewModal(data, onConfirm) {
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
export default { openBackupInfoModal, openBackupFoundModal, openRestorePreviewModal };
