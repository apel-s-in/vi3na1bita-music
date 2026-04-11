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

function buildDiffList(cloudMeta, localTs) {
  const lines = [];
  const cloudTs = Number(cloudMeta?.timestamp || 0);
  const diffMin = Math.round(Math.abs(cloudTs - localTs) / 60000);
  if (cloudTs > localTs) {
    const h = Math.floor(diffMin / 60), m = diffMin % 60;
    lines.push(`☁️ Облако новее на ${h > 0 ? `${h}ч ` : ''}${m}м`);
  }
  if (cloudMeta?.statsCount) lines.push(`📊 Статистика: ${cloudMeta.statsCount} треков`);
  if (cloudMeta?.achievementsCount) lines.push(`🏆 Достижений: ${cloudMeta.achievementsCount}`);
  if (cloudMeta?.favoritesCount) lines.push(`⭐ Избранных: ${cloudMeta.favoritesCount}`);
  if (cloudMeta?.playlistsCount) lines.push(`🎵 Плейлистов: ${cloudMeta.playlistsCount}`);
  if (cloudMeta?.devicesCount > 1) lines.push(`📱 Устройств в backup: ${cloudMeta.devicesCount}`);
  // Сравниваем XP если доступно локально
  const localRpg = getLocalXp();
  if (localRpg && cloudMeta?.achievementsCount && localRpg.xp > 0) {
    const localAch = Object.keys(window.achievementEngine?.unlocked || {}).length;
    if (cloudMeta.achievementsCount > localAch) lines.push(`✨ В облаке достижений больше`);
  }
  return lines;
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

      // Облако не новее — ничего не делаем
      if (!cloudTs || cloudTs <= localTs) return;

      // Проверяем: есть ли вообще локальные данные (новый пользователь)
      const isNewDevice = localTs === 0;
      const diffMin = Math.round((cloudTs - localTs) / 60000);

      // Слишком маленькая разница (< 2 минут) — игнорируем
      if (!isNewDevice && diffMin < 2) return;

      const diff = buildDiffList(meta, localTs);
      const title = isNewDevice ? '☁️ Найден ваш облачный прогресс' : '☁️ В облаке есть более новые данные';
      const textHtml = `
        <div style="margin-bottom:12px;color:#eaf2ff;line-height:1.5">
          ${isNewDevice
            ? 'Ваши данные сохранены в Яндекс Диске. Хотите восстановить прогресс на этом устройстве?'
            : `В облаке обнаружена версия от <b>${formatDate(cloudTs)}</b>.<br>Локальная версия: ${localTs ? formatDate(localTs) : 'нет данных'}.`
          }
        </div>
        ${diff.length ? `<div style="background:rgba(77,170,255,.08);border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;flex-direction:column;gap:6px;font-size:13px">${diff.map(d => `<div>${d}</div>`).join('')}</div>` : ''}
        <div style="font-size:11px;color:#7f93b5;line-height:1.4">
          Восстановление применяется безопасно: высокие результаты, достижения и XP не будут понижены.
        </div>`;

      window.Modals?.confirm?.({
        title,
        textHtml,
        maxWidth: 480,
        confirmText: '📥 Восстановить из облака',
        cancelText: 'Пропустить',
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
