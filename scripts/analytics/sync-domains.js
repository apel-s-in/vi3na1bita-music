export const SYNC_WATCH_KEYS = new Set([
  '__favorites_v2__',
  'sc3:playlists',
  'sc3:default',
  'sc3:activeId',
  'sc3:ui_v2',
  'sourcePref',
  'favoritesOnlyMode',
  'qualityMode:v1',
  'lyricsViewMode',
  'lyricsAnimationEnabled',
  'logoPulseEnabled',
  'dl_format_v1'
]);

export const STORAGE_KEY_TO_DOMAIN = new Map([
  ['__favorites_v2__', 'favorites'],
  ['sc3:playlists', 'playlists'],
  ['sc3:default', 'playlists'],
  ['sc3:activeId', 'playlists'],
  ['sc3:ui_v2', 'ui'],
  ['sourcePref', 'device'],
  ['favoritesOnlyMode', 'device'],
  ['qualityMode:v1', 'device'],
  ['lyricsViewMode', 'ui'],
  ['lyricsAnimationEnabled', 'ui'],
  ['logoPulseEnabled', 'ui'],
  ['dl_format_v1', 'downloads']
]);

export const DOMAIN_DEBOUNCE_MS = Object.freeze({
  achievements: 5000,
  favorites: 15000,
  playlists: 20000,
  ui: 30000,
  downloads: 30000,
  device: 30000,
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
