import { BackupVault } from '../../analytics/backup-vault.js';

export function openBackupInfoModal() {
  window.Modals?.open?.({
    title: 'Что сохраняется в backup',
    maxWidth: 480,
    bodyHtml: `
      <div class="modal-confirm-text">
        Один backup-файл содержит полный слепок пользовательского прогресса.<br><br>
        Внутрь входят:
        <ul style="margin:10px 0 0 18px;color:#eaf2ff;line-height:1.5">
          <li>статистика и event log</li>
          <li>достижения, XP, стрики</li>
          <li>локальный профиль</li>
          <li>избранное и плейлисты</li>
          <li>настройки интерфейса и player state</li>
          <li>внутренние intel/store данные</li>
          <li>привязка к владельцу Яндекса и устройствам</li>
        </ul>
        <div style="margin-top:12px;color:#9db7dd">
          Файл можно сохранить на устройство вручную. Восстановление разрешено только под тем же Яндекс-аккаунтом владельца backup.
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
        <b>Версия приложения:</b> ${window.Utils?.escapeHtml?.(meta?.appVersion || 'unknown') || 'unknown'}<br>
        <b>Размер:</b> ${window.Utils?.escapeHtml?.(meta?.sizeHuman || 'unknown') || 'unknown'}<br><br>
        <span style="color:#9db7dd">Копия хранится в личной папке приложения на Яндекс Диске и привязана к аккаунту владельца.</span>
      </div>`
  });
}

export function openRestorePreviewModal(data, onConfirm) {
  const sum = BackupVault.summarizeBackupObject(data);
  const localTs = Number(localStorage.getItem('yandex:last_backup_local_ts') || 0);
  const cmp = sum.timestamp > localTs ? 'Облачная копия новее локального состояния.' : (localTs > sum.timestamp ? 'Локальные данные новее облачной копии.' : 'Дата облачной и локальной копии совпадает.');
  const m = window.Modals?.open?.({
    title: 'Предпросмотр восстановления',
    maxWidth: 500,
    bodyHtml: `
      <div class="modal-confirm-text">
        <b>Имя профиля:</b> ${window.Utils?.escapeHtml?.(sum.profileName) || sum.profileName}<br>
        <b>Дата backup:</b> ${sum.timestamp ? new Date(sum.timestamp).toLocaleString('ru-RU') : 'неизвестно'}<br>
        <b>Версия приложения:</b> ${window.Utils?.escapeHtml?.(sum.appVersion) || sum.appVersion}<br>
        <b>Событий:</b> ${sum.eventCount}<br>
        <b>Треков в статистике:</b> ${sum.statsCount}<br>
        <b>Достижений:</b> ${sum.achievementsCount}<br>
        <b>Избранных записей:</b> ${sum.favoritesCount}<br>
        <b>Плейлистов витрины:</b> ${sum.playlistsCount}<br>
        <b>Устройств:</b> ${sum.devicesCount}<br>
        <b>Owner Yandex ID:</b> ${window.Utils?.escapeHtml?.(sum.ownerYandexId || 'unknown') || 'unknown'}<br><br>
        <span style="color:#9db7dd">${cmp}</span><br><br>
        <b>Выберите режим:</b>
      </div>
      <div class="modal-choice-actions">
        <button type="button" class="modal-action-btn online" data-restore-mode="all">Восстановить всё</button>
        <button type="button" class="modal-action-btn" data-restore-mode="profile">Профиль, избранное, плейлисты</button>
        <button type="button" class="modal-action-btn" data-restore-mode="stats">Статистику и достижения</button>
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

export function openManualRestoreHelpModal(downloadHref, onPickLocalFile) {
  const m = window.Modals?.open?.({
    title: 'Восстановление через файл',
    maxWidth: 480,
    bodyHtml: `
      <div class="modal-confirm-text">
        Прямое чтение backup с Яндекс Диска заблокировано CORS браузера.<br><br>
        Дальше есть 2 безопасных варианта:
        <ol style="margin:10px 0 0 18px;color:#eaf2ff;line-height:1.5">
          <li>Скачать backup-файл с Яндекс Диска</li>
          <li>Выбрать этот же файл для импорта в приложение</li>
        </ol>
        <div style="margin-top:12px;color:#9db7dd">
          Импорт всё равно будет разрешён только если текущий Яндекс ID совпадает с владельцем backup.
        </div>
      </div>
      <div class="modal-choice-actions">
        <button type="button" class="modal-action-btn online" data-manual-restore="download">Скачать backup</button>
        <button type="button" class="modal-action-btn" data-manual-restore="pick">Выбрать файл</button>
      </div>`
  });
  m?.addEventListener('click', e => {
    const btn = e.target.closest('[data-manual-restore]');
    if (!btn) return;
    const act = btn.dataset.manualRestore;
    if (act === 'download' && downloadHref) window.open(downloadHref, '_blank', 'noopener');
    if (act === 'pick') onPickLocalFile?.();
  });
}
export default { openBackupInfoModal, openBackupFoundModal, openRestorePreviewModal, openManualRestoreHelpModal };
