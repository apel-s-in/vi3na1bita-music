// scripts/analytics/backup-sync-engine.js
// Умный автосейв: только при реальных изменениях, с 1-минутным cooldown.
// Статистика — отдельный цикл (12 часов), управляемый из yandex-auto-sync.js

const LS_SYNC_ENABLED = 'backup:autosync:enabled';
const COOLDOWN_MS = 60 * 1000; // 1 минута cooldown после последнего изменения

let _timer = null;
let _lastSaveAt = 0;
let _bound = false;
let _syncReady = false;

// Ключи localStorage, которые считаются "важными изменениями профиля"
// (НЕ включаем статистику — она через отдельный 12-часовой цикл)
const PROFILE_WATCH_KEYS = new Set([
  '__favorites_v2__',       // Избранное
  'sc3:playlists',          // Плейлисты
  'sc3:default',            // Порядок витрины
  'sc3:activeId',           // Активный плейлист
  'sc3:ui_v2',              // Настройки UI
  'sourcePref',             // Приоритет источника
  'favoritesOnlyMode',      // Режим только избранные
  'qualityMode:v1',         // Качество
  'lyricsViewMode',         // Вид лирики
  'lyricsAnimationEnabled', // Анимация лирики
  'logoPulseEnabled',       // Пульсация
  'dl_format_v1',           // Формат скачивания
]);

// Достижения — тоже важное событие
const ACHIEVEMENT_EVENTS = new Set([
  'achievements:updated', // Разблокировано новое достижение
]);

export function isSyncEnabled() {
  return localStorage.getItem(LS_SYNC_ENABLED) !== '0';
}

export function isSyncReady() {
  return _syncReady;
}

export function markSyncReady(reason = 'manual') {
  if (_syncReady) return;
  _syncReady = true;
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

// Дебаунс: откладываем сейв на COOLDOWN_MS после последнего изменения
function markDirty(isAchievement = false) {
  if (!_syncReady || !isSyncEnabled()) return;
  try { localStorage.setItem('backup:local_dirty_ts', String(Date.now())); } catch {}

  clearTimeout(_timer);

  // Для достижений — cooldown 5 сек (срочнее)
  const delay = isAchievement ? 5000 : COOLDOWN_MS;

  _timer = setTimeout(async () => {
    const ya = window.YandexAuth;
    const disk = window.YandexDisk;
    if (!ya || !disk) return;
    if (ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) return;
    if (!(window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine)) return;

    // Дополнительная проверка: прошло ли достаточно времени с последнего сейва
    if (Date.now() - _lastSaveAt < 10000) return; // Не чаще раза в 10 сек

    emitState('syncing');
    try {
      const { BackupVault } = await import('./backup-vault.js');
      const token = ya.getToken();
      if (!token || !ya.isTokenAlive()) { emitState('idle'); return; }

      const backup = await BackupVault.buildBackupObject();
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

      // Логируем backup для ачивки
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

  // Патч localStorage — отслеживаем только ВАЖНЫЕ ключи профиля
  if (!localStorage._bsePatched) {
    const origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, value) {
      origSetItem(key, value);
      if (PROFILE_WATCH_KEYS.has(key) && _syncReady) {
        markDirty(false);
      }
    };
    localStorage._bsePatched = true;
  }

  // Слушаем достижения (важное событие — сейвим быстрее)
  window.addEventListener('achievements:updated', (e) => {
    // Проверяем есть ли новые разблокированные (detail.unlocked изменился)
    if (e.detail?.unlocked > 0 && _syncReady) {
      markDirty(true); // isAchievement=true → cooldown 5 сек
    }
  });

  // Страховка: если через 5 минут sync всё ещё не разблокирован
  setTimeout(() => {
    if (!_syncReady) {
      console.debug('[BackupSyncEngine] timeout fallback: forcing sync ready');
      markSyncReady('timeout_fallback');
    }
  }, 5 * 60 * 1000);

  console.debug('[BackupSyncEngine] initialized (profile watch only, NO stats polling)');
}

export function getSyncIntervalSec() { return 60; } // для совместимости UI
export function setSyncInterval() {} // no-op, cooldown фиксированный

export default {
  initBackupSyncEngine, markSyncReady, isSyncReady,
  isSyncEnabled, setSyncEnabled, getSyncIntervalSec, setSyncInterval
};
