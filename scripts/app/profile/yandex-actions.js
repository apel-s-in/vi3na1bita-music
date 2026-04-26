import { BackupVault } from '../../analytics/backup-vault.js';
import { uploadBackupBundle } from '../../analytics/backup-upload-runner.js';
import { YandexDisk } from '../../core/yandex-disk.js';
import { openBackupInfoModal, openBackupFoundModal, openManualRestoreHelpModal } from './yandex-modals.js';
import { openYandexRestoreFlow } from './yandex-restore-flow.js';

let _cachedBackupFile = null;
const pickBackupFile = (useCache = false) => (useCache && _cachedBackupFile) ? Promise.resolve(_cachedBackupFile) : new Promise(res => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.vi3bak,application/json'; inp.onchange = () => { const f = inp.files?.[0] || null; if (f) _cachedBackupFile = f; res(f); }; inp.click(); });
const clearCachedBackupFile = () => { _cachedBackupFile = null; };

export function initYandexActions() {
  window._handleYaAction = async (action, container, rerender) => {
    const ya = window.YandexAuth, disk = YandexDisk, nSys = window.NotificationSystem, mods = window.Modals;
    const localProfile = (() => { try { return JSON.parse(localStorage.getItem('profile:last_snapshot') || 'null') || { name: 'Слушатель' }; } catch { return { name: 'Слушатель' }; } })();
    if (!ya) return;

    const acts = {
      'login': () => ya.login(),
      'logout': () => mods?.confirm?.({ title: 'Выйти из аккаунта?', textHtml: 'Локальный прогресс сохранится. Только облачная синхронизация отключится.', confirmText: 'Выйти', cancelText: 'Отмена', onConfirm: () => { ya.logout(); rerender?.(); nSys?.info('Следующий вход запросит подтверждение Яндекса заново'); } }),
      'rename': () => { const p = ya.getProfile(); if (!p) return; window.Utils?.profileModals?.promptName?.({ title: 'Изменить имя', value: p.displayName || '', btnText: 'Сохранить', onSubmit: n => { ya.updateDisplayName(n); rerender?.(); nSys?.success('Имя обновлено'); } }); },
      'backup-info': () => openBackupInfoModal(),
      'reconnect-rights': () => mods?.confirm?.({ title: 'Переподключить права Яндекса?', textHtml: 'Приложение выполнит локальный выход и при следующем входе попросит заново подтвердить доступ к Яндекс Диску.', confirmText: 'Переподключить', cancelText: 'Отмена', onConfirm: () => { ya.logout(); rerender?.(); setTimeout(() => ya.login({ forceConfirm: true }), 250); } }),
      'delete-old-backups': () => { const t = ya.getToken(); if (!t || !ya.isTokenAlive()) return nSys?.warning('Сессия истекла. Войдите снова.'); mods?.confirm?.({ title: 'Удалить старые backup-версии?', textHtml: 'Будут удалены архивные backup-файлы, кроме последних 5 версий и актуального файла latest.', confirmText: 'Удалить', cancelText: 'Отмена', onConfirm: async () => { try { await disk.deleteOldBackups(t, { keep: 5 }); nSys?.success(`Старые копии удалены ✅`); const m = await disk.getMeta(t).catch(() => null); if (m) { localStorage.setItem('yandex:last_backup_check', JSON.stringify(m)); localStorage.setItem('yandex:last_backup_meta', JSON.stringify(m)); window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated')); } rerender?.(); } catch (e) { nSys?.error('Ошибка: ' + (e?.message || '')); } } }); },
      'backup-export-manual': async () => { try { await BackupVault.exportData(); nSys?.success('Backup-файл сохранён на устройство ✅'); } catch (e) { nSys?.error('Ошибка сохранения файла: ' + (e?.message || '')); } },
      'backup-import-manual': async () => { const t = ya.getToken(); if (!t || !ya.isTokenAlive()) return nSys?.warning('Для восстановления нужен вход в Яндекс.'); try { const f = await pickBackupFile(true); if (!f) return; await BackupVault.importBackupFile(f, 'all'); clearCachedBackupFile(); try { const { markSyncReady, markRestoreOrSkipDone } = await import('../../analytics/backup-sync-engine.js'); markSyncReady('restore_completed'); markRestoreOrSkipDone('restore_completed'); } catch {} try { const { runPostRestoreRefresh } = await import('./yandex-runtime-refresh.js'); await runPostRestoreRefresh({ reason: 'manual_file_restore' }); } catch {} nSys?.success('Backup восстановлен ✅'); } catch (e) { const m = e?.message || ''; if (m.includes('restore_owner_mismatch')) nSys?.error('Этот backup принадлежит другому Яндекс-аккаунту.'); else if (m.includes('restore_requires_yandex_login')) nSys?.warning('Сначала войдите в Яндекс.'); else if (m.includes('backup_integrity_failed')) nSys?.error('Файл backup повреждён или изменён.'); else nSys?.error('Ошибка импорта backup: ' + m); } },
      'check-backup': async () => { const t = ya.getToken(); if (!t || !ya.isTokenAlive()) return nSys?.warning('Сессия истекла. Войдите снова.'); nSys?.info('Проверяем облачную копию...'); try { const [ex, m] = await Promise.all([disk.checkExists(t), disk.getMeta(t).catch(() => null)]); if (!ex) { try { localStorage.removeItem('yandex:last_backup_check'); } catch {} nSys?.warning('Облачная резервная копия не найдена.'); return rerender?.(); } try { if (m) localStorage.setItem('yandex:last_backup_check', JSON.stringify(m)); } catch {} rerender?.(); openBackupFoundModal(m); } catch (e) { nSys?.error('Не удалось проверить резервную копию: ' + (e?.message || '')); } },
      'save-backup': async () => {
        const t = ya.getToken();
        if (!t || !ya.isTokenAlive()) return nSys?.warning('Сессия истекла. Войдите снова.');
        if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return nSys?.error('Нет подключения к сети.');
        try {
          const { isSyncReady } = await import('../../analytics/backup-sync-engine.js');
          if (!isSyncReady()) return nSys?.warning('Облачное состояние ещё не подтверждено. Сначала проверьте/восстановите backup, затем сохраняйте.');
        } catch {}
        nSys?.info('Сохраняем единый backup на Яндекс Диск...');
        try {
          const up = await uploadBackupBundle({ disk, token: t, BackupVault, force: true, uploadDevice: true, reason: 'manual_save' });
          const b = up.backup;
          try {
            localStorage.setItem('profile:last_snapshot', JSON.stringify(b?.data?.userProfile || localProfile || { name: 'Слушатель' }));
          } catch {}
          // Инвалидируем persistent cache orchestrator, чтобы следующий логин получил свежие данные
          try {
            const orch = await import('./auth-onboarding-orchestrator.js');
            orch.clearPreloadCache?.();
          } catch {}
          nSys?.success('Прогресс сохранён на Яндекс Диск ✅');
          rerender?.();
        } catch (e) {
          const msg = String(e?.message || '');
          if (msg.includes('401')) nSys?.error('Сессия истекла. Войдите снова.');
          else if (msg.includes('offline')) nSys?.error('Нет сети.');
          else nSys?.error('Ошибка сохранения: ' + msg);
        }
      },
      'restore-backup': async () => {
        const t = ya.getToken();
        if (!t || !ya.isTokenAlive()) return nSys?.warning('Сессия истекла. Войдите снова.');
        try {
          const { openManualRestoreFlow } = await import('./auth-onboarding-orchestrator.js');
          await openManualRestoreFlow({ token: t, profile: localProfile });
        } catch (e) {
          const msg = String(e?.message || '');
          if (msg.includes('backup_not_found')) nSys?.warning('Облачная копия не найдена. Сначала сохраните backup кнопкой «Сохранить».');
          else nSys?.error('Не удалось подготовить восстановление: ' + msg);
        }
      }
    };
    acts[action]?.();
  };
}
export default { initYandexActions };
