export const SHARED_STORAGE_KEYS = [
  '__favorites_v2__',
  'sc3:playlists',
  'sc3:default',
  'sc3:albumColors'
];

export const DEVICE_STORAGE_KEYS = [
  'sourcePref',
  'favoritesOnlyMode',
  'qualityMode:v1',
  'offline:mode:v1',
  'offline:cacheQuality:v1',
  'cloud:listenThreshold',
  'cloud:ttlDays',
  'playerVolume',
  'playerStateV2',
  'sleepTimerState:v2',
  'app:first-install-ts',
  'sc3:activeId',
  'sc3:ui_v2',
  'lyricsViewMode',
  'lyricsAnimationEnabled',
  'lyricsShowAnimBtn',
  'logoPulseEnabled',
  'logoPulsePreset',
  'logoPulseIntensity',
  'logoPulseDebug',
  'profileShowControls',
  'dl_format_v1'
];

export const TRANSIENT_STORAGE_KEYS = [
  'yandex:last_backup_check',
  'yandex:last_backup_meta',
  'yandex:last_backup_local_ts',
  'backup:autosync:enabled',
  'backup:restore_or_skip_done'
];

export const ALL_SNAPSHOT_STORAGE_KEYS = [...SHARED_STORAGE_KEYS, ...DEVICE_STORAGE_KEYS];

export const SHARED_STORAGE_KEY_SET = new Set(SHARED_STORAGE_KEYS);
export const DEVICE_STORAGE_KEY_SET = new Set(DEVICE_STORAGE_KEYS);
export const TRANSIENT_STORAGE_KEY_SET = new Set(TRANSIENT_STORAGE_KEYS);
export const ALL_SNAPSHOT_STORAGE_KEY_SET = new Set(ALL_SNAPSHOT_STORAGE_KEYS);

export const PLAYBACK_SENSITIVE_DEVICE_KEYS = new Set([
  'playerStateV2',
  'favoritesOnlyMode',
  'sourcePref',
  'qualityMode:v1'
]);

export const shouldStoreInSnapshot = key => ALL_SNAPSHOT_STORAGE_KEY_SET.has(String(key || ''));
export const isSharedStorageKey = key => SHARED_STORAGE_KEY_SET.has(String(key || ''));
export const isDeviceStorageKey = key => DEVICE_STORAGE_KEY_SET.has(String(key || ''));
export const isTransientStorageKey = key => TRANSIENT_STORAGE_KEY_SET.has(String(key || ''));

export const collectSnapshotLocalStorage = (storage = localStorage) => ALL_SNAPSHOT_STORAGE_KEYS.reduce((acc, key) => {
  try {
    const v = storage.getItem(key);
    if (v != null) acc[key] = v;
  } catch {}
  return acc;
}, {});

export const collectSharedSnapshotLocalStorage = (storage = localStorage) => SHARED_STORAGE_KEYS.reduce((acc, key) => {
  try {
    const v = storage.getItem(key);
    if (v != null) acc[key] = v;
  } catch {}
  return acc;
}, {});

export const getSharedSnapshotLocalEntries = raw => Object.fromEntries(
  Object.entries(raw || {}).filter(([k]) => isSharedStorageKey(k))
);

export const getDeviceSnapshotLocalEntries = raw => Object.fromEntries(
  Object.entries(raw || {}).filter(([k]) => isDeviceStorageKey(k))
);

export default {
  SHARED_STORAGE_KEYS,
  DEVICE_STORAGE_KEYS,
  TRANSIENT_STORAGE_KEYS,
  ALL_SNAPSHOT_STORAGE_KEYS,
  SHARED_STORAGE_KEY_SET,
  DEVICE_STORAGE_KEY_SET,
  TRANSIENT_STORAGE_KEY_SET,
  ALL_SNAPSHOT_STORAGE_KEY_SET,
  PLAYBACK_SENSITIVE_DEVICE_KEYS,
  shouldStoreInSnapshot,
  isSharedStorageKey,
  isDeviceStorageKey,
  isTransientStorageKey,
  collectSnapshotLocalStorage,
  collectSharedSnapshotLocalStorage,
  getSharedSnapshotLocalEntries,
  getDeviceSnapshotLocalEntries
};
