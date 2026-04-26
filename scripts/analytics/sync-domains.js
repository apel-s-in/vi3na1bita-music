export const SYNC_WATCH_KEYS = new Set([
  '__favorites_v2__',
  'sc3:playlists',
  'sc3:default',
  'sc3:albumColors',
  'sc3:activeId',
  'sc3:ui_v2',
  'sourcePref',
  'favoritesOnlyMode',
  'qualityMode:v1',
  'offline:mode:v1',
  'offline:cacheQuality:v1',
  'cloud:listenThreshold',
  'cloud:ttlDays',
  'playerVolume',
  'lyricsViewMode',
  'lyricsAnimationEnabled',
  'lyricsShowAnimBtn',
  'logoPulseEnabled',
  'logoPulsePreset',
  'logoPulseIntensity',
  'logoPulseDebug',
  'profileShowControls',
  'dl_format_v1'
]);

export const STORAGE_KEY_TO_DOMAIN = new Map([
  ['__favorites_v2__', 'favorites'],
  ['sc3:playlists', 'playlists'],
  ['sc3:default', 'playlists'],
  ['sc3:albumColors', 'playlists'],
  ['sc3:activeId', 'deviceSettings'],
  ['sc3:ui_v2', 'deviceSettings'],
  ['sourcePref', 'deviceSettings'],
  ['favoritesOnlyMode', 'deviceSettings'],
  ['qualityMode:v1', 'deviceSettings'],
  ['offline:mode:v1', 'deviceSettings'],
  ['offline:cacheQuality:v1', 'deviceSettings'],
  ['cloud:listenThreshold', 'deviceSettings'],
  ['cloud:ttlDays', 'deviceSettings'],
  ['playerVolume', 'deviceSettings'],
  ['lyricsViewMode', 'deviceSettings'],
  ['lyricsAnimationEnabled', 'deviceSettings'],
  ['lyricsShowAnimBtn', 'deviceSettings'],
  ['logoPulseEnabled', 'deviceSettings'],
  ['logoPulsePreset', 'deviceSettings'],
  ['logoPulseIntensity', 'deviceSettings'],
  ['logoPulseDebug', 'deviceSettings'],
  ['profileShowControls', 'deviceSettings'],
  ['dl_format_v1', 'deviceSettings']
]);

export const DOMAIN_DEBOUNCE_MS = Object.freeze({
  achievements: 30000,
  profile: 30000,
  favorites: 180000,
  playlists: 120000,
  stats: 43200000,
  deviceSettings: 600000,
  ui: 300000,
  downloads: 300000,
  device: 600000,
  generic: 60000
});

const _dirtyDomains = new Set();
let _lastDirtyAt = 0;

export const getDomainForStorageKey = key => STORAGE_KEY_TO_DOMAIN.get(String(key || '').trim()) || 'generic';
export const isWatchedStorageKey = key => SYNC_WATCH_KEYS.has(String(key || '').trim());

export const markDomainDirty = domain => {
  const d = String(domain || '').trim() || 'generic';
  _dirtyDomains.add(d);
  _lastDirtyAt = Date.now();
  return { domains: [..._dirtyDomains], lastDirtyAt: _lastDirtyAt };
};

export const markStorageKeyDirty = key => {
  if (!isWatchedStorageKey(key)) return { domains: [..._dirtyDomains], lastDirtyAt: _lastDirtyAt };
  return markDomainDirty(getDomainForStorageKey(key));
};

export const consumeDirtyState = () => {
  const domains = [..._dirtyDomains];
  const maxDebounceMs = domains.length
    ? Math.min(...domains.map(d => DOMAIN_DEBOUNCE_MS[d] || DOMAIN_DEBOUNCE_MS.generic))
    : DOMAIN_DEBOUNCE_MS.generic;
  _dirtyDomains.clear();
  return { domains, lastDirtyAt: _lastDirtyAt, debounceMs: maxDebounceMs };
};

export const peekDirtyState = () => ({
  domains: [..._dirtyDomains],
  lastDirtyAt: _lastDirtyAt
});

export default {
  SYNC_WATCH_KEYS,
  STORAGE_KEY_TO_DOMAIN,
  DOMAIN_DEBOUNCE_MS,
  getDomainForStorageKey,
  isWatchedStorageKey,
  markDomainDirty,
  markStorageKeyDirty,
  consumeDirtyState,
  peekDirtyState
};
