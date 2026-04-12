// scripts/app/profile/yandex-auto-sync.js
// Автоматическая проверка облака при входе. Не трогает playback.

import { YandexDisk } from '../../core/yandex-disk.js';
import { BackupVault } from '../../analytics/backup-vault.js';

function getLocalTs() { return Number(localStorage.getItem('yandex:last_backup_local_ts') || 0); }

function formatDate(ts) {
  if (!ts) return 'неизвестно';
  return new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getLocalXp() {
  try {
    const rpg = window.achievementEngine?.profile;
    return rpg ? { xp: Number(rpg.xp || 0), level: Number(rpg.level || 1) } : null;
  } catch { return null; }
}

function buildTwoColumnDiff(cloudMeta) {
  const lRpg = getLocalXp() || { level: 1, xp: 0 };
  const lAch = Object.keys(window.achievementEngine?.unlocked || {}).length;
  const lFavs = (() => { try { return JSON.parse(localStorage.getItem('__favorites_v2__') || '[]').filter(i => !i.inactiveAt).length; } catch { return 0; } })();
  
  return `
    <div style="display:flex;gap:10px;margin:12px 0;text-align:center">
      <div style="flex:1;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);border-radius:12px;padding:12px 8px">
        <div style="font-size:11px;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">💾 На устройстве</div>
        <div style="font-size:14px;font-weight:900;color:#fff;margin-bottom:4px">Ур. ${lRpg.level} <span style="font-size:11px;color:#ff9800">(${lRpg.xp} XP)</span></div>
        <div style="font-size:12px;color:#eaf2ff;margin-bottom:2px">🏆 Ачивок: <b>${lAch}</b></div>
        <div style="font-size:12px;color:#eaf2ff">⭐ Избранных: <b>${lFavs}</b></div>
      </div>
      <div style="flex:1;background:rgba(77,170,255,.08);border:1px solid rgba(77,170,255,.2);border-radius:12px;padding:12px 8px">
        <div style="font-size:11px;color:#8ab8fd;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">☁️ В облаке</div>
        <div style="font-size:14px;font-weight:900;color:#fff;margin-bottom:4px">Ур. ${cloudMeta.level || 1} <span style="font-size:11px;color:#ff9800">(${cloudMeta.xp || 0} XP)</span></div>
        <div style="font-size:12px;color:#eaf2ff;margin-bottom:2px">🏆 Ачивок: <b>${cloudMeta.achievementsCount || 0}</b></div>
        <div style="font-size:12px;color:#eaf2ff">⭐ Избранных: <b>${cloudMeta.favoritesCount || 0}</b></div>
      </div>
    </div>`;
}

export async function initYandexAutoSync() {
  // Проверка при возврате на вкладку (обнаружение backup с другого устройства)
  let _lastCloudTs = Number(localStorage.getItem('yandex:last_backup_local_ts') || 0);
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const ya = window.YandexAuth;
    if (!ya || ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) return;
    if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return;
    // Тихая фоновая проверка без уведомления если уже показывали
    if (sessionStorage.getItem('ya:auto-check:done')) return;
    const token = ya.getToken();
    if (!token) return;
    try {
      const { YandexDisk } = await import('../../core/yandex-disk.js');
      const meta = await YandexDisk.getMeta(token).catch(() => null);
      const cloudTs = Number(meta?.timestamp || 0);
      if (cloudTs > _lastCloudTs + 60000) {
        // Облако обновилось с другого устройства — показываем ненавязчивое уведомление
        window.NotificationSystem?.info('☁️ Обнаружен более новый backup с другого устройства. Откройте «📥 Из облака».');
        _lastCloudTs = cloudTs;
      }
    } catch {}
  });

  window._handleYaAutoSync = async () => {
    const ya = window.YandexAuth;
    if (!ya || ya.getSessionStatus() !== 'active') return;
    const token = ya.getToken();
    if (!token || !ya.isTokenAlive()) return;
    if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return;

    try {
      const meta = await YandexDisk.getMeta(token).catch(() => null);
      if (!meta) return;

      try { localStorage.setItem('yandex:last_backup_check', JSON.stringify(meta)); } catch {}

      const cloudTs = Number(meta.timestamp || 0);
      const localTs = getLocalTs();
      const localDirtyTs = Number(localStorage.getItem('backup:local_dirty_ts') || 0);

      // Если локально есть несохраненные правки, и они сделаны ПОЗЖЕ чем облачный бэкап
      // Мы не должны предлагать восстановить старое облако, мы должны разрешить выгрузку локального
      if (localDirtyTs > cloudTs && localDirtyTs > localTs) {
        try {
          const { markSyncReady } = await import('../../analytics/backup-sync-engine.js');
          markSyncReady('local_dirty_newer');
        } catch {}
        return;
      }

      // Облако не новее — данные актуальны, разрешаем autosync
      if (!cloudTs || cloudTs <= localTs) {
        try {
          const { markSyncReady } = await import('../../analytics/backup-sync-engine.js');
          markSyncReady('cloud_not_newer');
        } catch {}
        return;
      }

      // Проверяем: есть ли вообще локальные данные (новый пользователь)
      const isNewDevice = localTs === 0;
      const diffMin = Math.round((cloudTs - localTs) / 60000);

      // Слишком маленькая разница (< 2 минут) — игнорируем
      if (!isNewDevice && diffMin < 2) return;

      const title = isNewDevice ? '☁️ Найден ваш облачный прогресс' : '☁️ В облаке есть более новые данные';
      const textHtml = `
        <div style="margin-bottom:4px;color:#eaf2ff;line-height:1.5;font-size:13px">
          ${isNewDevice
            ? 'Ваши данные сохранены в Яндекс Диске. Хотите восстановить прогресс на этом устройстве?'
            : `В облаке обнаружена версия от <b>${formatDate(cloudTs)}</b>.`
          }
        </div>
        ${buildTwoColumnDiff(meta)}
        <div style="font-size:11px;color:#7f93b5;line-height:1.4;text-align:center">
          Применяется безопасное слияние: высокие результаты (XP, достижения) не будут понижены.
        </div>`;

      window.Modals?.confirm?.({
        title,
        textHtml,
        maxWidth: 480,
        confirmText: '📥 Восстановить из облака',
        cancelText: 'Пропустить',
        onCancel: async () => {
          // Пользователь пропустил — его локальные данные актуальны
          try {
            const { markSyncReady } = await import('../../analytics/backup-sync-engine.js');
            markSyncReady('user_skipped_restore');
          } catch {}
        },
        onConfirm: async () => {
          window.NotificationSystem?.info('Загружаем резервную копию...');
          try {
            const data = await YandexDisk.download(token);
            if (!data) return window.NotificationSystem?.warning('Файл backup не найден.');
            const sum = BackupVault.summarizeBackupObject(data);
            if (sum.ownerYandexId && sum.ownerYandexId !== String(ya.getProfile()?.yandexId || '').trim()) {
              return window.NotificationSystem?.error('Backup принадлежит другому аккаунту.');
            }
            await BackupVault.importData(new Blob([JSON.stringify(data)]), 'all');
            try {
              const { markSyncReady } = await import('../../analytics/backup-sync-engine.js');
              markSyncReady('auto_restore');
            } catch {}
            window.NotificationSystem?.success('Прогресс восстановлен ✅ Обновляем...');
            setTimeout(() => window.location.reload(), 1500);
          } catch (e) {
            const msg = String(e?.message || '');
            if (msg.includes('disk_forbidden') || msg.includes('disk_auth_error')) {
              window.NotificationSystem?.warning('Нет доступа к Диску. Войдите снова через 🔐 Права.');
            } else if (msg.includes('download_cors_fallback_required')) {
              window.NotificationSystem?.info('Восстановите вручную через «📥 Из облака» в Личном кабинете.');
            } else {
              window.NotificationSystem?.error('Ошибка: ' + msg);
            }
          }
        }
      });
    } catch {}
  };
}

export default { initYandexAutoSync };
