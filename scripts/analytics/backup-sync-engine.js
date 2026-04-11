// scripts/analytics/backup-sync-engine.js
// Debounce autosave: слушает dirty-события, не чаще чем раз в 30 секунд
// Не трогает playback, не мешает iOS background audio

const DEBOUNCE_MS = 30000;
const MIN_INTERVAL_MS = 20000;

let _timer = null;
let _lastSaveAt = 0;
let _dirty = false;
let _bound = false;

function scheduleAutosave() {
  if (!_dirty) return;
  const ya = window.YandexAuth;
  const disk = window.YandexDisk;
  if (!ya || !disk) return;
  if (ya.getSessionStatus() !== 'active' || !ya.isTokenAlive()) return;
  if (Date.now() - _lastSaveAt < MIN_INTERVAL_MS) return;

  clearTimeout(_timer);
  _timer = setTimeout(async () => {
    _dirty = false;
    try {
      const { BackupVault } = await import('./backup-vault.js');
      const token = ya.getToken();
      if (!token || !ya.isTokenAlive()) return;
      const backup = await BackupVault.buildBackupObject();
      const meta = await disk.upload(token, backup);
      _lastSaveAt = Date.now();
      try {
        localStorage.setItem('yandex:last_backup_meta', JSON.stringify(meta));
        localStorage.setItem('yandex:last_backup_local_ts', String(Number(backup?.revision?.timestamp || backup?.createdAt || Date.now())));
      } catch {}
      console.debug('[BackupSyncEngine] autosave ok', new Date().toLocaleTimeString());
    } catch (e) {
      // Тихий fail — не ломаем playback
      console.debug('[BackupSyncEngine] autosave skip:', e?.message);
    }
  }, DEBOUNCE_MS);
}

function markDirty() {
  _dirty = true;
  scheduleAutosave();
}

export function initBackupSyncEngine() {
  if (_bound) return;
  _bound = true;

  // Слушаем dirty-события
  window.addEventListener('stats:updated', markDirty);
  window.addEventListener('analytics:logUpdated', markDirty);

  // Изменения favorites/playlists/settings
  const origSetItem = localStorage.setItem.bind(localStorage);
  const WATCH_KEYS = new Set([
    '__favorites_v2__', 'sc3:playlists', 'sc3:default', 'sc3:activeId',
    'sc3:ui_v2', 'sourcePref', 'favoritesOnlyMode', 'qualityMode:v1',
    'lyricsViewMode', 'lyricsAnimationEnabled', 'logoPulseEnabled',
    'sleepTimerState:v2', 'dl_format_v1'
  ]);

  localStorage.setItem = function(key, value) {
    origSetItem(key, value);
    if (WATCH_KEYS.has(key)) markDirty();
  };

  console.debug('[BackupSyncEngine] initialized, debounce:', DEBOUNCE_MS / 1000, 'sec');
}

export default { initBackupSyncEngine };
