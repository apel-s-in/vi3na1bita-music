// scripts/app/profile/yandex-auto-sync.js
// Минималистичная синхронизация: NO polling, умный автосейв, QR-перенос.

import { YandexDisk } from '../../core/yandex-disk.js';
import { BackupVault } from '../../analytics/backup-vault.js';

const LS_LAST_STATS_SAVE = 'backup:last_stats_save_ts';
const STATS_AUTOSAVE_INTERVAL = 12 * 60 * 60 * 1000; // 12 часов

function getLocalTs() { return Number(localStorage.getItem('yandex:last_backup_local_ts') || 0); }

// ─── Единственная точка входа ──────────────────────────────────────────────
export async function initYandexAutoSync() {

  // 1. Разрешаем автосейв если не залогинены
  const ya = window.YandexAuth;
  if (!ya || ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) {
    _markReady('no_auth_local_only');
    return;
  }

  // 2. Тихая проверка метаданных (ТОЛЬКО getMeta — без скачивания!)
  await _checkCloudMetaOnly();

  // 3. Слушаем события входа/выхода
  window.addEventListener('yandex:auth:changed', async e => {
    if (e.detail?.status === 'active') {
      await _checkCloudMetaOnly();
    } else if (e.detail?.status === 'logged_out') {
      _markReady('logged_out_local_only');
    }
  });

  // 4. Автосейв статистики раз в 12 часов (при наличии изменений)
  _scheduleStatsSave();
}

// ─── Тихая проверка только метаданных (без скачивания!) ────────────────────
async function _checkCloudMetaOnly() {
  const ya = window.YandexAuth;
  if (!ya || ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) return;
  if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) {
    _markReady('offline_skip');
    return;
  }

  try {
    const token = ya.getToken();
    const meta = await YandexDisk.getMeta(token).catch(() => null);

    if (!meta) {
      // Нет облачной копии — разрешаем сейвить
      _markReady('no_cloud_backup');
      return;
    }

    try { localStorage.setItem('yandex:last_backup_check', JSON.stringify(meta)); } catch {}
    window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));

    const cloudTs = Number(meta.timestamp || 0);
    const localTs = getLocalTs();

    if (cloudTs <= localTs) {
      // Локальные данные актуальны или совпадают
      _markReady('cloud_not_newer');
      return;
    }

    const diffMin = Math.round((cloudTs - localTs) / 60000);
    const isNewDevice = localTs === 0;

    if (!isNewDevice && diffMin < 2) {
      _markReady('diff_too_small');
      return;
    }

    // Показываем уведомление — облако новее, НО не скачиваем автоматически!
    // Пользователь сам решает через кнопку в профиле
    _markReady('cloud_newer_user_choice');

    // Зажигаем индикатор ! в личном кабинете
    window.dispatchEvent(new CustomEvent('yandex:cloud:newer', {
      detail: { cloudTs, localTs, diffMin, isNewDevice, meta }
    }));

    // Показываем модалку только если это новое устройство (нет истории)
    if (isNewDevice) {
      _showRestoreModal(meta, ya.getToken());
    }

  } catch (e) {
    console.debug('[AutoSync] meta check failed:', e?.message);
    _markReady('meta_check_failed');
  }
}

// ─── Модалка восстановления (только для нового устройства) ─────────────────
function _showRestoreModal(meta, token) {
  const lRpg = window.achievementEngine?.profile || { level: 1, xp: 0 };
  const lFavs = (() => { try { return JSON.parse(localStorage.getItem('__favorites_v2__') || '[]').filter(i=>!i.inactiveAt).length; } catch { return 0; } })();

  window.Modals?.confirm?.({
    title: '☁️ Найден ваш облачный прогресс',
    textHtml: `
      <div style="color:#eaf2ff;font-size:13px;margin-bottom:12px;line-height:1.5">
        Обнаружена облачная копия данных. Восстановить прогресс на этом устройстве?
      </div>
      <div style="display:flex;gap:10px;margin:0 0 12px;text-align:center">
        <div style="flex:1;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:10px 8px">
          <div style="font-size:10px;color:#888;margin-bottom:6px;text-transform:uppercase">💾 Сейчас</div>
          <div style="font-size:13px;font-weight:900;color:#fff">Ур. ${lRpg.level}</div>
          <div style="font-size:11px;color:#eaf2ff">⭐ ${lFavs} треков</div>
        </div>
        <div style="flex:1;background:rgba(77,170,255,.08);border:1px solid rgba(77,170,255,.2);border-radius:12px;padding:10px 8px">
          <div style="font-size:10px;color:#8ab8fd;margin-bottom:6px;text-transform:uppercase">☁️ Облако</div>
          <div style="font-size:13px;font-weight:900;color:#fff">Ур. ${meta.level || 1}</div>
          <div style="font-size:11px;color:#eaf2ff">⭐ ${meta.favoritesCount || 0} треков</div>
        </div>
      </div>
      <div style="font-size:11px;color:#7f93b5">
        Применяется безопасное слияние — высокие результаты не будут понижены.
      </div>`,
    maxWidth: 460,
    confirmText: '📥 Восстановить',
    cancelText: 'Пропустить',
    onCancel: () => _markReady('user_skipped_restore'),
    onConfirm: async () => {
      window.NotificationSystem?.info('Загружаем резервную копию...');
      try {
        const data = await YandexDisk.download(token);
        if (!data) return window.NotificationSystem?.warning('Файл backup не найден.');
        const sum = BackupVault.summarizeBackupObject(data);
        const curYId = String(window.YandexAuth?.getProfile?.()?.yandexId || '').trim();
        if (sum.ownerYandexId && sum.ownerYandexId !== curYId) {
          return window.NotificationSystem?.error('Backup принадлежит другому аккаунту.');
        }
        await BackupVault.importData(new Blob([JSON.stringify(data)]), 'all');
        _markReady('auto_restore');
        window.NotificationSystem?.success('Прогресс восстановлен ✅ Обновляем...');
        setTimeout(() => window.location.reload(), 1500);
      } catch (e) {
        _markReady('restore_failed');
        window.NotificationSystem?.error('Ошибка: ' + String(e?.message || ''));
      }
    }
  });
}

// ─── Автосейв статистики раз в 12 часов ────────────────────────────────────
function _scheduleStatsSave() {
  const now = Date.now();
  const lastSave = Number(localStorage.getItem(LS_LAST_STATS_SAVE) || 0);
  const nextSave = lastSave + STATS_AUTOSAVE_INTERVAL;
  const delay = Math.max(0, nextSave - now);

  setTimeout(async () => {
    await _doStatsSave();
    // Планируем следующий через 12 часов
    setInterval(_doStatsSave, STATS_AUTOSAVE_INTERVAL);
  }, delay);
}

async function _doStatsSave() {
  const ya = window.YandexAuth;
  if (!ya || ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) return;
  if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return;

  // Проверяем есть ли грязные данные (изменения за 12 часов)
  const dirtyTs = Number(localStorage.getItem('backup:local_dirty_ts') || 0);
  const lastSave = Number(localStorage.getItem(LS_LAST_STATS_SAVE) || 0);
  if (dirtyTs <= lastSave) return; // Изменений не было — пропускаем

  try {
    const token = ya.getToken();
    const backup = await BackupVault.buildBackupObject();
    await YandexDisk.upload(token, backup);
    localStorage.setItem(LS_LAST_STATS_SAVE, String(Date.now()));
    localStorage.setItem('yandex:last_backup_local_ts', String(backup?.revision?.timestamp || Date.now()));
    console.debug('[AutoSync] stats autosave ok', new Date().toLocaleTimeString());
  } catch (e) {
    console.debug('[AutoSync] stats autosave failed:', e?.message);
  }
}

// ─── Хелпер: разблокировать автосейв ───────────────────────────────────────
async function _markReady(reason) {
  try {
    const { markSyncReady } = await import('../../analytics/backup-sync-engine.js');
    markSyncReady(reason);
  } catch {}
}

export default { initYandexAutoSync };
