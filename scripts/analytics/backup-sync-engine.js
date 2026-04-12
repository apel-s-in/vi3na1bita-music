// scripts/analytics/backup-sync-engine.js
// Умное автосохранение: включается только ПОСЛЕ того как данные восстановлены.
// Не трогает playback, не мешает iOS background audio.

const LS_SYNC_ENABLED = 'backup:autosync:enabled';
const LS_SYNC_INTERVAL = 'backup:autosync:intervalSec';
const DEFAULT_INTERVAL_SEC = 30;
const MIN_INTERVAL_SEC = 15;

let _timer = null;
let _lastSaveAt = 0;
let _dirty = false;
let _bound = false;
let _syncReady = false; // Главный флаг — включается только после восстановления

function getIntervalMs() {
  const sec = Math.max(MIN_INTERVAL_SEC, Number(localStorage.getItem(LS_SYNC_INTERVAL) || DEFAULT_INTERVAL_SEC));
  return sec * 1000;
}

export function isSyncEnabled() {
  return localStorage.getItem(LS_SYNC_ENABLED) !== '0';
}

export function isSyncReady() {
  return _syncReady;
}

// Вызывается только когда мы УВЕРЕНЫ что данные актуальны
export function markSyncReady(reason = 'manual') {
  _syncReady = true;
  console.debug('[BackupSyncEngine] sync READY, reason:', reason);
  window.dispatchEvent(new CustomEvent('backup:sync:ready', { detail: { reason } }));
  // Сразу планируем первое сохранение
  markDirty();
}

export function setSyncEnabled(v) {
  localStorage.setItem(LS_SYNC_ENABLED, v ? '1' : '0');
  if (!v) { clearTimeout(_timer); _timer = null; }
  window.dispatchEvent(new CustomEvent('backup:sync:settings:changed'));
}

export function setSyncInterval(sec) {
  const s = Math.max(MIN_INTERVAL_SEC, Number(sec) || DEFAULT_INTERVAL_SEC);
  localStorage.setItem(LS_SYNC_INTERVAL, String(s));
  window.dispatchEvent(new CustomEvent('backup:sync:settings:changed'));
}

export function getSyncIntervalSec() {
  return Math.max(MIN_INTERVAL_SEC, Number(localStorage.getItem(LS_SYNC_INTERVAL) || DEFAULT_INTERVAL_SEC));
}

function emitSyncState(state) {
  window.dispatchEvent(new CustomEvent('backup:sync:state', { detail: { state } }));
}

function scheduleAutosave() {
  if (!_dirty) return;
  if (!_syncReady) return; // Не сохраняем пока данные не восстановлены
  if (!isSyncEnabled()) return;

  const ya = window.YandexAuth;
  const disk = window.YandexDisk;
  if (!ya || !disk) return;
  if (ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) return;

  const now = Date.now();
  const intervalMs = getIntervalMs();
  if (now - _lastSaveAt < intervalMs) {
    // Перепланируем через оставшееся время
    const remaining = intervalMs - (now - _lastSaveAt);
    clearTimeout(_timer);
    _timer = setTimeout(scheduleAutosave, remaining);
    return;
  }

  clearTimeout(_timer);
  _timer = setTimeout(async () => {
    if (!_syncReady || !isSyncEnabled()) return;
    _dirty = false;
    emitSyncState('syncing');
    try {
      const { BackupVault } = await import('./backup-vault.js');
      const token = ya.getToken();
      if (!token || !ya.isTokenAlive()) { emitSyncState('idle'); return; }
      const backup = await BackupVault.buildBackupObject();
      const meta = await disk.upload(token, backup);
      _lastSaveAt = Date.now();
      try {
        localStorage.setItem('yandex:last_backup_meta', JSON.stringify(meta));
        localStorage.setItem('yandex:last_backup_local_ts', String(Number(backup?.revision?.timestamp || backup?.createdAt || Date.now())));
      } catch {}
      emitSyncState('ok');
      setTimeout(() => emitSyncState('idle'), 3000);
      console.debug('[BackupSyncEngine] autosave ok', new Date().toLocaleTimeString());
    } catch (e) {
      emitSyncState('idle');
      console.debug('[BackupSyncEngine] autosave skip:', e?.message);
    }
  }, 0);
}

function markDirty() {
  _dirty = true;
  scheduleAutosave();
}

const WATCH_KEYS = new Set([
  '__favorites_v2__', 'sc3:playlists', 'sc3:default', 'sc3:activeId',
  'sc3:ui_v2', 'sourcePref', 'favoritesOnlyMode', 'qualityMode:v1',
  'lyricsViewMode', 'lyricsAnimationEnabled', 'logoPulseEnabled',
  'sleepTimerState:v2', 'dl_format_v1'
]);

export function initBackupSyncEngine() {
  if (_bound) return;
  _bound = true;

  window.addEventListener('stats:updated', markDirty);
  window.addEventListener('analytics:logUpdated', markDirty);

  // Патч localStorage — защита от двойного патча
  if (!localStorage._bsePatched) {
    const origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, value) {
      origSetItem(key, value);
      if (WATCH_KEYS.has(key)) markDirty();
    };
    localStorage._bsePatched = true;
  }

  // Проверяем: если пользователь уже авторизован И localTs актуален — разрешаем sync
  const ya = window.YandexAuth;
  if (ya?.getSessionStatus?.() === 'active') {
    const localTs = Number(localStorage.getItem('yandex:last_backup_local_ts') || 0);
    if (localTs > 0) {
      // Данные уже были восстановлены ранее — safe to enable sync
      setTimeout(() => markSyncReady('session_restored'), 2000);
    }
    // Иначе ждём события из auto-sync
  }

  console.debug('[BackupSyncEngine] initialized, interval:', getSyncIntervalSec(), 'sec, ready:', _syncReady);
}

export default { initBackupSyncEngine, markSyncReady, isSyncReady, isSyncEnabled, setSyncEnabled, setSyncInterval, getSyncIntervalSec };
