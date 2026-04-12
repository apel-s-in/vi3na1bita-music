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
  const localTs = Number(localStorage.getItem('yandex:last_backup_local_ts') || 0);
  const cloudTs = Number(meta?.timestamp || 0);
  const cmpLabel = cloudTs > localTs ? '☁️ Облако новее локального'
    : localTs > cloudTs ? '💾 Локальные данные новее облака'
    : '✅ Версии совпадают';

  window.Modals?.open?.({
    title: 'Облачная копия найдена',
    maxWidth: 460,
    bodyHtml: `
      <div class="modal-confirm-text">
        <b>Статус:</b> копия доступна<br>
        <b>Дата:</b> ${meta?.timestamp ? new Date(meta.timestamp).toLocaleString('ru-RU') : 'неизвестно'}<br>
        <b>Версия приложения:</b> ${window.Utils?.escapeHtml?.(meta?.appVersion || 'unknown') || 'unknown'}<br>
        <b>Размер:</b> ${window.Utils?.escapeHtml?.(meta?.sizeHuman || 'unknown') || 'unknown'}<br>
        <b>Сравнение:</b> ${cmpLabel}<br>
        ${meta?.historyPath ? `<b>История:</b> версионированный backup сохранён<br>` : ''}
        <br><span style="color:#9db7dd">Копия хранится в личной папке приложения на Яндекс Диске и привязана к аккаунту владельца.</span>
      </div>`
  });
}

export function openRestorePreviewModal(data, onConfirm) {
  const sum = BackupVault.summarizeBackupObject(data);
  const localTs = Number(localStorage.getItem('yandex:last_backup_local_ts') || 0);

  const lRpg = window.achievementEngine?.profile || { level: 1, xp: 0 };
  const lAchCount = Object.keys(window.achievementEngine?.unlocked || {}).length;
  const lFavs = (() => { try { return JSON.parse(localStorage.getItem('__favorites_v2__') || '[]').filter(i => !i.inactiveAt).length; } catch { return 0; } })();
  
  const cRpg = data.data?.userProfileRpg || { level: 1, xp: 0 };

  const tableHtml = `
    <div style="display:flex;gap:10px;margin:16px 0;text-align:center">
      <div style="flex:1;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);border-radius:12px;padding:12px 8px">
        <div style="font-size:11px;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">💾 На устройстве</div>
        <div style="font-size:14px;font-weight:900;color:#fff;margin-bottom:4px">Ур. ${lRpg.level} <span style="font-size:11px;color:#ff9800">(${lRpg.xp} XP)</span></div>
        <div style="font-size:12px;color:#eaf2ff;margin-bottom:2px">🏆 Ачивок: <b>${lAchCount}</b></div>
        <div style="font-size:12px;color:#eaf2ff">⭐ Избранных: <b>${lFavs}</b></div>
      </div>
      <div style="flex:1;background:rgba(77,170,255,.08);border:1px solid rgba(77,170,255,.2);border-radius:12px;padding:12px 8px">
        <div style="font-size:11px;color:#8ab8fd;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">☁️ В облаке</div>
        <div style="font-size:14px;font-weight:900;color:#fff;margin-bottom:4px">Ур. ${cRpg.level || 1} <span style="font-size:11px;color:#ff9800">(${cRpg.xp || 0} XP)</span></div>
        <div style="font-size:12px;color:#eaf2ff;margin-bottom:2px">🏆 Ачивок: <b>${sum.achievementsCount}</b></div>
        <div style="font-size:12px;color:#eaf2ff">⭐ Избранных: <b>${sum.favoritesCount}</b></div>
      </div>
    </div>`;

  const m = window.Modals?.open?.({
    title: 'Предпросмотр восстановления',
    maxWidth: 500,
    bodyHtml: `
      <div class="modal-confirm-text" style="font-size:13px">
        <b>Дата backup:</b> ${sum.timestamp ? new Date(sum.timestamp).toLocaleString('ru-RU') : 'неизвестно'}<br>
        <b>Версия приложения:</b> ${window.Utils?.escapeHtml?.(sum.appVersion) || sum.appVersion}<br>
        ${tableHtml}
        <span style="color:#9db7dd">При восстановлении применяется безопасное слияние: высокие результаты (XP, уровни, достижения) не будут понижены, а добавятся к текущим.</span><br><br>
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

export function openRestoreVersionPickerModal(items, onPick) {
  const list = (Array.isArray(items) ? items : []).slice(0, 4);
  const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');

  const bodyHtml = list.length
    ? `<div class="modal-confirm-text">Доступные версии backup в облаке:</div>
       <div class="modal-choice-actions">
         ${list.map((it, i) => `
           <button type="button" class="modal-action-btn ${i === 0 ? 'online' : ''}" data-restore-path="${esc(it.path || '')}">
             ${it.isLatest ? '☁️ Latest' : '🕘 Архив'} · ${it.timestamp ? new Date(it.timestamp).toLocaleString('ru-RU') : 'без даты'} · ${esc(it.sizeHuman || 'unknown')}${it.appVersion ? ` · v${esc(String(it.appVersion))}` : ''}${it.checksum ? ` · ✓` : ''}
           </button>
         `).join('')}
       </div>`
    : `<div class="modal-confirm-text" style="text-align:center;color:#9db7dd">
         <div style="font-size:32px;margin-bottom:12px">☁️</div>
         <div>Список версий backup не получен.</div>
         <div style="margin-top:8px;font-size:12px;opacity:.7">Проверьте подключение и попробуйте сохранить backup заново.</div>
       </div>`;

  const m = window.Modals?.open?.({ title: 'Выберите облачную версию', maxWidth: 500, bodyHtml });
  if (!m) return;

  m.addEventListener('click', e => {
    const btn = e.target.closest('[data-restore-path]');
    if (!btn) return;
    const path = String(btn.dataset.restorePath || '').trim();
    m.remove();
    onPick?.(path || null);
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
export default { openBackupInfoModal, openBackupFoundModal, openRestorePreviewModal, openRestoreVersionPickerModal, openManualRestoreHelpModal };
