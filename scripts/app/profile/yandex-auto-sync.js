// scripts/app/profile/yandex-auto-sync.js
// Фоновый polling каждые 30 секунд (Push simulation) и умное сравнение

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
  let _lastCloudTs = Number(localStorage.getItem('yandex:last_backup_local_ts') || 0);
  let _autoSyncDone = false; // флаг: авто-синхронизация уже выполнена в этой сессии

  // Функция тихой проверки (Polling)
  const checkCloudSilently = async (showNotification = false) => {
    const ya = window.YandexAuth;
    if (!ya || ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) return;
    if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return;
    
    const token = ya.getToken();
    if (!token) return;

    try {
      const { YandexDisk } = await import('../../core/yandex-disk.js');
      const meta = await YandexDisk.getMeta(token).catch(() => null);
      if (meta) {
        localStorage.setItem('yandex:last_backup_check', JSON.stringify(meta));
        // Триггерим обновление UI Личного Кабинета
        window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));
        
        const cloudTs = Number(meta.timestamp || 0);
        const localTs = getLocalTs();
        
        if (cloudTs > localTs && cloudTs > _lastCloudTs) {
          _lastCloudTs = cloudTs;
          // Зажигаем оранжевую лампочку автосохранения
          try {
            const { markSyncReady } = await import('../../analytics/backup-sync-engine.js');
            markSyncReady('cloud_is_newer_wait'); 
          } catch {}
          
          if (showNotification) {
            window.NotificationSystem?.info('☁️ В облаке появились новые данные. Зайдите в Личный кабинет.', 5000);
          }
        }
      }
    } catch {}
  };

  // Polling каждые 30 секунд
  setInterval(() => checkCloudSilently(false), 30000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // При возврате в приложение — всегда проверяем облако тихо
      checkCloudSilently(false);
    }
  });

  // Авто-запуск при старте если уже залогинен
  const _tryAutoSyncOnStart = async () => {
    const ya = window.YandexAuth;
    if (!ya || ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) {
      // Не залогинен — разрешаем автосейв без восстановления
      try {
        const { markSyncReady } = await import('../../analytics/backup-sync-engine.js');
        markSyncReady('no_auth_local_only');
      } catch {}
      return;
    }
    if (_autoSyncDone) return;
    _autoSyncDone = true;
    await window._handleYaAutoSync?.();
  };

  // Запускаем через небольшую задержку чтобы всё успело инициализироваться
  setTimeout(_tryAutoSyncOnStart, 1500);

  // Слушаем событие входа — если пользователь залогинился во время сессии
  window.addEventListener('yandex:auth:changed', async (e) => {
    if (e.detail?.status === 'active') {
      _autoSyncDone = false;
      setTimeout(_tryAutoSyncOnStart, 500);
    } else if (e.detail?.status === 'logged_out') {
      _autoSyncDone = false;
      // При выходе — сразу разрешаем локальный автосейв
      try {
        const { markSyncReady } = await import('../../analytics/backup-sync-engine.js');
        markSyncReady('logged_out_local_only');
      } catch {}
    }
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

      try { 
        localStorage.setItem('yandex:last_backup_check', JSON.stringify(meta)); 
        window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));
      } catch {}

      const cloudTs = Number(meta.timestamp || 0);
      const localTs = getLocalTs();
      const localDirtyTs = Number(localStorage.getItem('backup:local_dirty_ts') || 0);

      // Локальные правки новее облака -> разрешаем выгрузку в облако
      if (localDirtyTs > cloudTs && localDirtyTs > localTs) {
        try {
          const { markSyncReady } = await import('../../analytics/backup-sync-engine.js');
          markSyncReady('local_dirty_newer');
        } catch {}
        return;
      }

      // Облако не новее -> разрешаем автосохранение
      if (!cloudTs || cloudTs <= localTs) {
        try {
          const { markSyncReady } = await import('../../analytics/backup-sync-engine.js');
          markSyncReady('cloud_not_newer');
        } catch {}
        return;
      }

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
            window.NotificationSystem?.error('Ошибка: ' + String(e?.message || ''));
          }
        }
      });
    } catch {}
  };
}

export default { initYandexAutoSync };
