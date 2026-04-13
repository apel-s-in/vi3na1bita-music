// scripts/analytics/backup-sync-engine.js
// Умный автосейв: только при реальных изменениях, с защитой от затирания облака.

const LS_SYNC_ENABLED = 'backup:autosync:enabled';
const LS_RESTORE_DONE = 'backup:restore_or_skip_done';
const COOLDOWN_MS = 60 * 1000;

let _timer = null, _lastSaveAt = 0, _bound = false, _syncReady = false;

const PROFILE_WATCH_KEYS = new Set([
  '__favorites_v2__', 'sc3:playlists', 'sc3:default', 'sc3:activeId',
  'sc3:ui_v2', 'sourcePref', 'favoritesOnlyMode', 'qualityMode:v1',
  'lyricsViewMode', 'lyricsAnimationEnabled', 'logoPulseEnabled', 'dl_format_v1',
]);

export function isSyncEnabled() {
  return localStorage.getItem(LS_SYNC_ENABLED) !== '0';
}

export function isSyncReady() { return _syncReady; }

// КРИТИЧНО: canUpload проверяет что восстановление уже произошло
// или пользователь явно пропустил его. Без этого — пустые данные
// нового устройства могут затереть облачный прогресс.
function canUpload() {
  return _syncReady && isSyncEnabled() && isRestoreOrSkipDone();
}

export function isRestoreOrSkipDone() {
  return localStorage.getItem(LS_RESTORE_DONE) === '1';
}

// Вызывается ТОЛЬКО после:
// 1. Успешного restore из облака
// 2. Явного пропуска пользователем модалки восстановления
// 3. Когда облако НЕ новее (cloud_not_newer) — значит локальные данные актуальны
// 4. Когда облачной копии нет (no_cloud_backup) — нечего затирать
// 5. Ручного save-backup из профиля
export function markRestoreOrSkipDone(reason = 'unknown') {
  localStorage.setItem(LS_RESTORE_DONE, '1');
  console.debug('[BackupSyncEngine] restore/skip done, reason:', reason);
}

export function markSyncReady(reason = 'manual') {
  if (_syncReady) return;
  _syncReady = true;

  // Автоматически разрешаем upload если облако не новее или его нет
  const autoSafeReasons = [
    'no_cloud_backup', 'cloud_not_newer', 'diff_too_small',
    'no_auth_local_only', 'logged_out_local_only', 'offline_skip',
    'meta_check_failed', 'timeout_fallback',
    'auto_restore', 'restore_completed', 'manual_save',
    'user_skipped_restore'
  ];
  if (autoSafeReasons.includes(reason)) {
    markRestoreOrSkipDone(reason);
  }

  console.debug('[BackupSyncEngine] sync READY, reason:', reason);
  window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason } }));
}

export function setSyncEnabled(v) {
  localStorage.setItem(LS_SYNC_ENABLED, v ? '1' : '0');
  if (!v) { clearTimeout(_timer); _timer = null; }
  window.dispatchEvent(new CustomEvent('backup:sync:settings:changed'));
}

function emitState(state) {
  window.dispatchEvent(new CustomEvent('backup:sync:state', { detail: { state } }));
}

function markDirty(isAchievement = false) {
  if (!canUpload()) return;
  try { localStorage.setItem('backup:local_dirty_ts', String(Date.now())); } catch {}

  clearTimeout(_timer);
  const delay = isAchievement ? 5000 : COOLDOWN_MS;

  _timer = setTimeout(async () => {
    // Повторная проверка на случай если за время cooldown что-то изменилось
    if (!canUpload()) return;

    const ya = window.YandexAuth;
    const disk = window.YandexDisk;
    if (!ya || !disk) return;
    if (ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) return;
    if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return;
    if (Date.now() - _lastSaveAt < 10000) return;

    emitState('syncing');
    try {
      const { BackupVault } = await import('./backup-vault.js');
      const token = ya.getToken();
      if (!token || !ya.isTokenAlive()) { emitState('idle'); return; }

      const backup = await BackupVault.buildBackupObject();

      // ЗАЩИТА: не аплоадим пустой бэкап
      const statsCount = backup?.data?.stats?.length || 0;
      const eventsCount = backup?.data?.eventLog?.warm?.length || 0;
      const achCount = Object.keys(backup?.data?.achievements || {}).length;
      const favsRaw = backup?.data?.localStorage?.['__favorites_v2__'];
      let favsCount = 0;
      try { favsCount = JSON.parse(favsRaw || '[]').filter(i => !i.inactiveAt).length; } catch {}

      // Если всё пустое — скорее всего это свежее устройство, НЕ аплоадим
      if (statsCount <= 1 && eventsCount === 0 && achCount === 0 && favsCount === 0) {
        console.debug('[BackupSyncEngine] skip upload: backup appears empty (fresh device?)');
        emitState('idle');
        return;
      }

      const meta = await disk.upload(token, backup);
      _lastSaveAt = Date.now();

      try {
        localStorage.setItem('yandex:last_backup_meta', JSON.stringify(meta));
        localStorage.setItem('yandex:last_backup_check', JSON.stringify(meta));
        localStorage.setItem('yandex:last_backup_local_ts', String(
          Number(backup?.revision?.timestamp || backup?.createdAt || Date.now())
        ));
        window.dispatchEvent(new CustomEvent('yandex:backup:meta-updated'));
      } catch {}

      emitState('ok');
      setTimeout(() => emitState('idle'), 3000);
      console.debug('[BackupSyncEngine] profile autosave ok', new Date().toLocaleTimeString());

      if (window.eventLogger) {
        window.eventLogger.log('FEATURE_USED', 'global', { feature: 'backup' });
        window.dispatchEvent(new CustomEvent('analytics:forceFlush'));
      }
    } catch (e) {
      emitState('idle');
      console.debug('[BackupSyncEngine] autosave skip:', e?.message);
    }
  }, delay);
}

export function initBackupSyncEngine() {
  if (_bound) return;
  _bound = true;

  if (!localStorage._bsePatched) {
    const origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, value) {
      origSetItem(key, value);
      if (PROFILE_WATCH_KEYS.has(key) && _syncReady && !key.startsWith('backup:') && !key.startsWith('yandex:')) {
        markDirty(false);
      }
    };
    localStorage._bsePatched = true;
  }

  window.addEventListener('achievements:updated', (e) => {
    if (e.detail?.unlocked > 0 && _syncReady) {
      markDirty(true);
    }
  });

  setTimeout(() => {
    if (!_syncReady) {
      console.debug('[BackupSyncEngine] timeout fallback: forcing sync ready');
      markSyncReady('timeout_fallback');
    }
  }, 5 * 60 * 1000);

  console.debug('[BackupSyncEngine] initialized (profile watch only, NO stats polling)');
}

export function getSyncIntervalSec() { return 60; }
export function setSyncInterval() {}

export default {
  initBackupSyncEngine, markSyncReady, isSyncReady,
  isSyncEnabled, setSyncEnabled, getSyncIntervalSec, setSyncInterval,
  markRestoreOrSkipDone, isRestoreOrSkipDone
};
