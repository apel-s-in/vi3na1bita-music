import { BackupVault } from '../../analytics/backup-vault.js';
import { uploadBackupBundle } from '../../analytics/backup-upload-runner.js';
import { YandexDisk } from '../../core/yandex-disk.js';
import { openBackupInfoModal, openBackupFoundModal } from './yandex-modals.js';

const pickBackupFile = () => new Promise(res => {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.vi3bak,application/json';
  inp.onchange = () => res(inp.files?.[0] || null);
  inp.click();
});

const readMetaProfile = async () => {
  try {
    const { metaDB } = await import('../../analytics/meta-db.js');
    return (await metaDB.getGlobal('user_profile').catch(() => null))?.value || { name: 'Слушатель' };
  } catch {
    return { name: 'Слушатель' };
  }
};

const openSyncLogModal = async () => {
  const { readSyncRevisions } = await import('../../analytics/sync-revisions.js');
  const esc = s => window.Utils?.escapeHtml?.(String(s || '')) || String(s || '');
  const rows = readSyncRevisions();
  window.Modals?.open?.({
    title: 'Журнал синхронизации',
    maxWidth: 420,
    bodyHtml: rows.length ? `<div class="sync-log-list">${rows.map(r => `
      <div class="profile-list-item sync-log-row">
        <div style="font-size:20px">${r.ok ? '✅' : '⚠️'}</div>
        <div class="log-info">
          <div class="log-title">${esc(new Date(r.timestamp).toLocaleString('ru-RU'))} · ${esc(r.reason || 'sync')}</div>
          <div class="log-desc">${esc(r.ok ? 'успешно' : `ошибка: ${r.error || 'unknown'}`)}</div>
          <div class="log-desc">hash: ${esc(r.hash || '—')} · domains: ${esc((r.domains || []).join(', ') || '—')}</div>
          <div class="log-desc">shared: ${r.uploadedShared ? 'да' : 'нет'} · device: ${r.uploadedDevice ? 'да' : 'нет'}</div>
        </div>
      </div>`).join('')}</div>` : '<div class="fav-empty">Журнал синхронизации пока пуст</div>'
  });
};

export function initYandexActions() {
  window._handleYaAction = async (action, container, rerender) => {
    const ya = window.YandexAuth, disk = YandexDisk, nSys = window.NotificationSystem, mods = window.Modals;
    if (!ya) return;

    const acts = {
      login: () => ya.login(),
      logout: () => mods?.confirm?.({
        title: 'Выйти из аккаунта?',
        textHtml: 'Локальный прогресс сохранится. Только облачная синхронизация отключится.',
        confirmText: 'Выйти',
        cancelText: 'Отмена',
        onConfirm: () => { ya.logout(); rerender?.(); nSys?.info('Следующий вход запросит подтверждение Яндекса заново'); }
      }),
      rename: () => {
        const p = ya.getProfile(); if (!p) return;
        window.Utils?.profileModals?.promptName?.({
          title: 'Изменить имя',
          value: p.displayName || '',
          btnText: 'Сохранить',
          onSubmit: n => { ya.updateDisplayName(n); rerender?.(); nSys?.success('Имя обновлено'); }
        });
      },
      'backup-info': () => openBackupInfoModal(),
      'sync-log': () => openSyncLogModal(),
      'reconnect-rights': () => mods?.confirm?.({
        title: 'Переподключить права Яндекса?',
        textHtml: 'Приложение выполнит локальный выход и при следующем входе попросит заново подтвердить доступ к Яндекс Диску.',
        confirmText: 'Переподключить',
        cancelText: 'Отмена',
        onConfirm: () => {
          try { window.eventLogger?.log?.('AUTH_EVENT', null, { action: 'reconnect_rights_requested', status: 'confirm' }); } catch {}
          ya.logout(); rerender?.(); setTimeout(() => ya.login({ forceConfirm: true }), 250);
        }
      }),
      'delete-old-backups': () => {
        const t = ya.getToken();
        if (!t || !ya.isTokenAlive()) return nSys?.warning('Сессия истекла. Войдите снова.');
        mods?.confirm?.({
          title: 'Удалить старые backup-версии?',
          textHtml: 'Будут удалены архивные backup-файлы, кроме последних 5 версий и актуального файла latest.',
          confirmText: 'Удалить',
          cancelText: 'Отмена',
          onConfirm: async () => {
            try {
              await disk.deleteOldBackups(t, { keep: 5 });
              nSys?.success('Старые копии удалены ✅');
              const m = await disk.getMeta(t).catch(() => null);
              if (m) {
                localStorage.setItem('yandex:last_backup_check', JSON.stringify(m));
                localStorage.setItem('yandex:last_backup_meta', JSON.stringify(m));
                window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));
              }
              rerender?.();
            } catch (e) { nSys?.error('Ошибка: ' + (e?.message || '')); }
          }
        });
      },
      'backup-export-manual': async () => {
        try { await BackupVault.exportData(); nSys?.success('Backup-файл сохранён на устройство ✅'); }
        catch (e) { nSys?.error('Ошибка сохранения файла: ' + (e?.message || '')); }
      },
      'backup-import-manual': async () => {
        const t = ya.getToken();
        if (!t || !ya.isTokenAlive()) return nSys?.warning('Для восстановления нужен вход в Яндекс.');
        try {
          const f = await pickBackupFile();
          if (!f) return;
          await BackupVault.importBackupFile(f, 'all');
          try {
            const { markSyncReady, markRestoreOrSkipDone } = await import('../../analytics/backup-sync-engine.js');
            markSyncReady('restore_completed');
            markRestoreOrSkipDone('restore_completed');
          } catch {}
          try {
            const { runPostRestoreRefresh } = await import('./yandex-runtime-refresh.js');
            await runPostRestoreRefresh({ reason: 'manual_file_restore' });
          } catch {}
          nSys?.success('Backup восстановлен ✅');
        } catch (e) {
          const m = e?.message || '';
          if (m.includes('restore_owner_mismatch')) nSys?.error('Этот backup принадлежит другому Яндекс-аккаунту.');
          else if (m.includes('restore_requires_yandex_login')) nSys?.warning('Сначала войдите в Яндекс.');
          else if (m.includes('backup_integrity_failed')) nSys?.error('Файл backup повреждён или изменён.');
          else nSys?.error('Ошибка импорта backup: ' + m);
        }
      },
      'check-backup': async () => {
        const t = ya.getToken();
        if (!t || !ya.isTokenAlive()) return nSys?.warning('Сессия истекла. Войдите снова.');
        nSys?.info('Проверяем облачную копию...');
        try {
          const [ex, m] = await Promise.all([disk.checkExists(t), disk.getMeta(t).catch(() => null)]);
          if (!ex) {
            try { localStorage.removeItem('yandex:last_backup_check'); localStorage.removeItem('yandex:last_backup_check_ts'); } catch {}
            nSys?.warning('Облачная резервная копия не найдена.');
            return rerender?.();
          }
          try {
            if (m) {
              localStorage.setItem('yandex:last_backup_check', JSON.stringify(m));
              localStorage.setItem('yandex:last_backup_check_ts', String(Date.now()));
            }
          } catch {}
          rerender?.(); openBackupFoundModal(m);
        } catch (e) { nSys?.error('Не удалось проверить резервную копию: ' + (e?.message || '')); }
      },
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
          await uploadBackupBundle({ disk, token: t, BackupVault, force: true, uploadDevice: true, reason: 'manual_save' });
          try {
            const orch = await import('./auth-onboarding-orchestrator.js');
            orch.clearPreloadCache?.();
          } catch {}
          try {
            const se = await import('../../analytics/backup-sync-engine.js');
            se.markSyncReady?.('manual_save');
            se.markRestoreOrSkipDone?.('manual_save');
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
          await openManualRestoreFlow({ token: t, profile: await readMetaProfile() });
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
