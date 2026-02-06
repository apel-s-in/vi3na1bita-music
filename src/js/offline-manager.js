/**
 * OfflineManager — центр управления офлайн-состояниями (ТЗ 19.2)
 * Pinned/Cloud, Dynamic Cache, eviction, updates, re-cache, 100% OFFLINE
 */

import {
  getTrackMeta, saveTrackMeta, getAllTrackMetas, deleteTrackMeta,
  getAudioEntry, deleteAudioBlob, getTrackOfflineState,
  getTotalCacheSize, getCacheSizeByKind, getStorageEstimate,
  touchLRU, removeLRU, getLRUQueue, saveLRUQueue,
  backupLRUToLocalStorage, restoreLRUFromLocalStorage,
  clearAll, clearByKind, getAllAudioEntries,
  saveAsset, getAsset, getAllAssets, deleteAsset
} from './cache-db.js';

import {
  getMode, setMode, MODES,
  getCacheQuality, getFullOfflineQuality,
  isNetworkAllowedByPolicy, isNetworkUnknown,
  canGuaranteeStorage
} from './mode-manager.js';

import { resetCloudStats } from './stats-core.js';
import { enqueue, dequeue, dequeueByKind, pauseQueue, resumeQueue, PRIORITY, getStatus as getQueueStatus } from './download-queue.js';
import { resolveVariantUrl, getTrackSize, hasVariant } from './track-resolver.js';

const CACHE_LIMIT_KEY = 'offline:cacheLimit:v1';
const CACHE_LIMIT_MODE_KEY = 'offline:cacheLimitMode:v1';
const FULL_OFFLINE_SEL_KEY = 'offline:fullOfflineSelection:v1';
const FULL_OFFLINE_ASSETS_KEY = 'offline:fullOfflineAssets:v1';
const FULL_OFFLINE_READY_KEY = 'offline:fullOfflineReady:v1';
const DEFAULT_SIZE_HI_MB = 8;
const DEFAULT_SIZE_LO_MB = 3;
const AUTO_LIMIT_PERCENT = 0.5;

let _allTracks = [];
let _albumsData = [];
let _baseUrl = '';
let _protectedWindow = new Set(); // protected playback window uids

function _defaultMeta(uid) {
  return {
    uid,
    pinned: false,
    cloud: false,
    cacheKind: 'none',
    cachedVariant: null,
    cachedComplete: 0,
    needsUpdate: false,
    needsReCache: false,
    cloudFullListenCount: 0,
    lastFullListenAt: null,
    cloudAddedAt: null,
    cloudExpiresAt: null,
    fullOfflineIncluded: false,
    lastAccessAt: null
  };
}

function _findTrack(uid) {
  return _allTracks.find(t => t.uid === uid) || null;
}

function _showToast(msg, dur) {
  if (typeof window !== 'undefined' && window.showToast) {
    window.showToast(msg, dur || 3000);
  }
}

// ===================== INIT =====================

function init(allTracks, albumsData, baseUrl) {
  _allTracks = allTracks || [];
  _albumsData = albumsData || [];
  _baseUrl = baseUrl || '';
  _checkExpiredCloud();
  _checkLRUBackup();
  _listenEvents();
}

function _listenEvents() {
  window.addEventListener('cacheQualityChanged', (e) => {
    _handleCacheQualityChange(e.detail.from, e.detail.to);
  });
  window.addEventListener('cloudTriggered', (e) => {
    _handleCloudTriggered(e.detail.uid);
  });
}

// ===================== CACHE LIMIT (ТЗ 11.2.E) =====================

function getCacheLimitMode() {
  return localStorage.getItem(CACHE_LIMIT_MODE_KEY) || 'auto';
}

function setCacheLimitMode(mode) {
  localStorage.setItem(CACHE_LIMIT_MODE_KEY, mode);
}

function getCacheLimit() {
  const mode = getCacheLimitMode();
  if (mode === 'manual') {
    const v = parseInt(localStorage.getItem(CACHE_LIMIT_KEY) || '0', 10);
    return v > 0 ? v * 1024 * 1024 : 500 * 1024 * 1024;
  }
  return _getAutoLimit();
}

function setCacheLimitManual(mb) {
  localStorage.setItem(CACHE_LIMIT_KEY, String(mb));
  setCacheLimitMode('manual');
}

async function _getAutoLimit() {
  try {
    const est = await getStorageEstimate();
    if (est.quota > 0) {
      return Math.floor(est.quota * AUTO_LIMIT_PERCENT);
    }
  } catch (e) {}
  return 500 * 1024 * 1024;
}

// ===================== PINNED (ТЗ 8) =====================

async function togglePinned(uid, onOff) {
  let meta = await getTrackMeta(uid);
  if (!meta) meta = _defaultMeta(uid);
  const newVal = onOff !== undefined ? !!onOff : !meta.pinned;
  if (newVal === meta.pinned) return meta;

  if (newVal) {
    meta.pinned = true;
    meta.cacheKind = 'pinned';
    await saveTrackMeta(meta);

    const cq = getCacheQuality();
    const track = _findTrack(uid);
    const url = track ? resolveVariantUrl(track, cq, _baseUrl) : null;
    if (url) {
      enqueue({ uid, variant: cq, url, priority: PRIORITY.P2_PINNED, cacheKind: 'pinned' });
    }
    _showToast('Трек будет доступен офлайн. Начинаю скачивание…');
  } else {
    // ТЗ 8.2+8.3: unpin → cloud candidate
    meta.pinned = false;
    meta.cloud = true;
    meta.cacheKind = 'cloud';
    const D = parseInt(localStorage.getItem('offline:cloudD:v1') || '31', 10);
    if (!meta.cloudAddedAt) meta.cloudAddedAt = Date.now();
    meta.cloudExpiresAt = Date.now() + D * 86400000;
    await saveTrackMeta(meta);
    _showToast('Офлайн-закрепление снято. Трек может быть удалён при очистке кэша.');
  }

  _dispatchStateChange(uid);
  return meta;
}

// ===================== CLOUD MENU (ТЗ 9.5) =====================

async function cloudAddPin(uid) {
  let meta = await getTrackMeta(uid);
  if (!meta) return;
  meta.pinned = true;
  meta.cacheKind = 'pinned';
  await saveTrackMeta(meta);
  _dispatchStateChange(uid);
}

async function cloudRemoveFromCache(uid) {
  await deleteAudioBlob(uid);
  await resetCloudStats(uid);
  let meta = await getTrackMeta(uid);
  if (!meta) meta = _defaultMeta(uid);
  meta.cloud = false;
  meta.pinned = false;
  meta.cacheKind = 'none';
  meta.cachedVariant = null;
  meta.cachedComplete = 0;
  meta.needsUpdate = false;
  meta.needsReCache = false;
  await saveTrackMeta(meta);
  await removeLRU(uid);
  _dispatchStateChange(uid);
  _showToast('Трек удалён из кэша.');
}

// ===================== DYNAMIC CACHE (ТЗ 7.14) =====================

async function onTrackPlayed(uid) {
  const mode = getMode();
  if (mode !== MODES.R2) return;

  await touchLRU(uid);

  const entry = await getAudioEntry(uid);
  const cq = getCacheQuality();
  if (entry && entry.variant === cq) return;

  const limitOk = await _evictIfNeeded(uid);
  if (!limitOk) return;

  const track = _findTrack(uid);
  const url = track ? resolveVariantUrl(track, cq, _baseUrl) : null;
  if (url) {
    enqueue({ uid, variant: cq, url, priority: PRIORITY.P4_CLOUD, cacheKind: 'dynamic' });
  }

  const queue = await getLRUQueue();
  backupLRUToLocalStorage(queue);
}

async function _evictIfNeeded(newUid) {
  let limit;
  try { limit = await getCacheLimit(); } catch(e) { limit = getCacheLimit(); }
  if (typeof limit === 'object' && limit.then) limit = await limit;

  const totalSize = await getTotalCacheSize();
  const newTrack = _findTrack(newUid);
  const cq = getCacheQuality();
  const estimatedSize = newTrack
    ? (getTrackSize(newTrack, cq) || DEFAULT_SIZE_HI_MB) * 1024 * 1024
    : DEFAULT_SIZE_HI_MB * 1024 * 1024;

  if (totalSize + estimatedSize <= limit) return true;

  const queue = await getLRUQueue();
  const allMetas = await getAllTrackMetas();
  const metaMap = {};
  allMetas.forEach(m => { metaMap[m.uid] = m; });

  let freed = 0;
  const toEvict = [];

  for (let i = queue.length - 1; i >= 0 && (totalSize + estimatedSize - freed > limit); i--) {
    const evictUid = queue[i];
    if (evictUid === newUid) continue;
    if (_protectedWindow.has(evictUid)) continue;
    const m = metaMap[evictUid];
    if (m && (m.pinned || m.cloud)) continue;
    const audioEntry = await getAudioEntry(evictUid);
    if (audioEntry) {
      freed += audioEntry.size || 0;
      toEvict.push(evictUid);
    }
  }

  if (toEvict.length === 0 && totalSize + estimatedSize > limit) {
    // ТЗ 7.14.6: pinned+cloud fill the limit
    const breakdown = await getCacheSizeByKind();
    if (breakdown.pinned + breakdown.cloud >= limit) {
      _showToast('Pinned/Cloud занимают весь лимит. Увеличьте лимит или снимите 🔒/☁.', 5000);
      return false;
    }
  }

  for (const evictUid of toEvict) {
    await deleteAudioBlob(evictUid);
    await removeLRU(evictUid);
    const m = metaMap[evictUid];
    if (m && m.cacheKind === 'dynamic') {
      m.cacheKind = 'none';
      m.cachedVariant = null;
      m.cachedComplete = 0;
      await saveTrackMeta(m);
    }
  }

  if (toEvict.length > 0) {
    _showToast('Кэш переполнен. Удалены самые старые треки.');
  }

  return true;
}

// ===================== CLOUD TTL CHECK (ТЗ 9.4) =====================

async function _checkExpiredCloud() {
  try {
    const metas = await getAllTrackMetas();
    const now = Date.now();
    for (const m of metas) {
      if (m.cloud && m.cloudExpiresAt && m.cloudExpiresAt < now) {
        await deleteAudioBlob(m.uid);
        m.cloud = false;
        m.cacheKind = 'none';
        m.cachedVariant = null;
        m.cachedComplete = 0;
        m.cloudFullListenCount = 0;
        m.cloudAddedAt = null;
        m.cloudExpiresAt = null;
        m.lastFullListenAt = null;
        await saveTrackMeta(m);
        await removeLRU(m.uid);
        _showToast('Офлайн-доступ истёк. Трек удалён из кэша.');
        _dispatchStateChange(m.uid);
      }
    }
  } catch (e) {
    console.error('[OfflineManager] cloud expiry check error', e);
  }
}

// ===================== LRU BACKUP RESTORE =====================

async function _checkLRUBackup() {
  try {
    const queue = await getLRUQueue();
    if (queue.length === 0) {
      const backup = restoreLRUFromLocalStorage();
      if (backup.length > 0) {
        await saveLRUQueue(backup);
        console.log('[OfflineManager] restored LRU queue from backup:', backup.length);
      }
    }
  } catch (e) {
    console.error('[OfflineManager] LRU backup restore error', e);
  }
}

// ===================== CACHE QUALITY CHANGE (ТЗ 5.2) =====================

async function _handleCacheQualityChange(fromQ, toQ) {
  const metas = await getAllTrackMetas();
  const priorities = { pinned: 1, cloud: 2, dynamic: 3, playbackWindow: 4 };

  const toReCache = metas
    .filter(m => m.cachedVariant && m.cachedVariant !== toQ &&
      ['pinned', 'cloud', 'dynamic', 'playbackWindow'].includes(m.cacheKind))
    .sort((a, b) => (priorities[a.cacheKind] || 99) - (priorities[b.cacheKind] || 99));

  for (const m of toReCache) {
    m.needsReCache = true;
    await saveTrackMeta(m);

    const track = _findTrack(m.uid);
    const url = track ? resolveVariantUrl(track, toQ, _baseUrl) : null;
    if (url) {
      enqueue({
        uid: m.uid, variant: toQ, url,
        priority: PRIORITY.P3_UPDATE,
        cacheKind: m.cacheKind
      });
    }
  }

  _dispatchNeedsUpdate();
}

// ===================== CLOUD TRIGGERED =====================

async function _handleCloudTriggered(uid) {
  const cq = getCacheQuality();
  const entry = await getAudioEntry(uid);
  if (entry && entry.variant === cq) {
    const meta = await getTrackMeta(uid);
    if (meta) {
      meta.cachedComplete = 100;
      meta.cacheKind = 'cloud';
      await saveTrackMeta(meta);
      _dispatchStateChange(uid);
      _showToast(`Трек добавлен в офлайн на ${localStorage.getItem('offline:cloudD:v1') || 31} день.`);
    }
    return;
  }

  const track = _findTrack(uid);
  const url = track ? resolveVariantUrl(track, cq, _baseUrl) : null;
  if (url) {
    enqueue({ uid, variant: cq, url, priority: PRIORITY.P4_CLOUD, cacheKind: 'cloud' });
  }
}

// ===================== UPDATES DETECTION (ТЗ 13) =====================

async function checkForUpdates(remoteTracks) {
  const metas = await getAllTrackMetas();
  let hasUpdates = false;

  for (const m of metas) {
    if (m.cacheKind === 'none' || !m.cachedVariant) continue;
    const remote = remoteTracks.find(t => t.uid === m.uid);
    if (!remote) continue;

    const variant = m.cachedVariant;
    const remoteSize = variant === 'lo'
      ? (remote.size_low || DEFAULT_SIZE_LO_MB)
      : (remote.size || DEFAULT_SIZE_HI_MB);
    const entry = await getAudioEntry(m.uid);
    const localSizeMB = entry ? entry.size / (1024 * 1024) : 0;

    if (Math.abs(localSizeMB - remoteSize) > 0.1) {
      m.needsUpdate = true;
      await saveTrackMeta(m);
      hasUpdates = true;

      if (['pinned', 'cloud', 'fullOffline'].includes(m.cacheKind)) {
        const url = resolveVariantUrl(remote, variant, _baseUrl);
        if (url) {
          enqueue({
            uid: m.uid, variant, url,
            priority: PRIORITY.P3_UPDATE,
            cacheKind: m.cacheKind
          });
        }
      }
    }
  }

  if (hasUpdates) _dispatchNeedsUpdate();
  return hasUpdates;
}

async function updateAllFiles() {
  const metas = await getAllTrackMetas();
  const toUpdate = metas.filter(m =>
    (m.needsUpdate || m.needsReCache) &&
    ['pinned', 'cloud', 'fullOffline'].includes(m.cacheKind)
  );

  for (const m of toUpdate) {
    const track = _findTrack(m.uid);
    if (!track) continue;
    const variant = m.needsReCache ? getCacheQuality() : m.cachedVariant;
    const url = resolveVariantUrl(track, variant, _baseUrl);
    if (url) {
      enqueue({
        uid: m.uid, variant, url,
        priority: PRIORITY.P3_UPDATE,
        cacheKind: m.cacheKind
      });
    }
  }

  return toUpdate.length;
}

// ===================== PLAYBACK WINDOW PROTECTION =====================

function protectWindow(uids) {
  _protectedWindow = new Set(uids);
}

function unprotectWindow() {
  _protectedWindow.clear();
}

function isProtected(uid) {
  return _protectedWindow.has(uid);
}

// ===================== CLEAR CACHE (ТЗ 11.2.H) =====================

async function clearCacheByCategory(category) {
  return clearByKind(category);
}

async function clearAllCache() {
  await clearAll();
  _showToast('Весь кэш очищен.');
}

// ===================== SIZE ESTIMATES (ТЗ 11.2.I.4) =====================

function computeSizeEstimate(uids, variant, includeCovers, includeGallery) {
  let audioMB = 0;
  let coversMB = 0;
  let lyricsMB = 0;

  for (const uid of uids) {
    const track = _findTrack(uid);
    if (!track) continue;
    audioMB += getTrackSize(track, variant);
    lyricsMB += 0.01;
    if (includeCovers) coversMB += 0.3;
    if (includeGallery) coversMB += 1.0;
  }

  return {
    tracks: uids.length,
    audioMB: Math.round(audioMB * 10) / 10,
    coversMB: Math.round(coversMB * 10) / 10,
    lyricsMB: Math.round(lyricsMB * 10) / 10,
    totalMB: Math.round((audioMB + coversMB + lyricsMB) * 10) / 10
  };
}

// ===================== 100% OFFLINE (ТЗ 11.2.I) =====================

function getFullOfflineSelection() {
  try {
    const raw = localStorage.getItem(FULL_OFFLINE_SEL_KEY);
    return raw ? JSON.parse(raw) : { favorites: false, albums: [], uids: [] };
  } catch (e) { return { favorites: false, albums: [], uids: [] }; }
}

function setFullOfflineSelection(sel) {
  localStorage.setItem(FULL_OFFLINE_SEL_KEY, JSON.stringify(sel));
}

function getFullOfflineAssets() {
  try {
    const raw = localStorage.getItem(FULL_OFFLINE_ASSETS_KEY);
    return raw ? JSON.parse(raw) : { covers: true, gallery: false };
  } catch (e) { return { covers: true, gallery: false }; }
}

function setFullOfflineAssets(assets) {
  localStorage.setItem(FULL_OFFLINE_ASSETS_KEY, JSON.stringify(assets));
}

function isFullOfflineReady() {
  return localStorage.getItem(FULL_OFFLINE_READY_KEY) === '1';
}

function _setFullOfflineReady(v) {
  localStorage.setItem(FULL_OFFLINE_READY_KEY, v ? '1' : '0');
}

/** Resolve the full set of uids for 100% OFFLINE including pinned/cloud auto-add (ТЗ 11.2.I.9) */
function resolveFullOfflineUids(selection, favUids) {
  const uidSet = new Set();

  if (selection.favorites && favUids) {
    favUids.forEach(uid => uidSet.add(uid));
  }

  if (selection.albums && selection.albums.length > 0) {
    for (const albumId of selection.albums) {
      const album = _albumsData.find(a => a.id === albumId || a.prefix === albumId);
      if (album && album.tracks) {
        album.tracks.forEach(t => { if (t.uid) uidSet.add(t.uid); });
      }
    }
  }

  if (selection.uids) {
    selection.uids.forEach(uid => uidSet.add(uid));
  }

  return Array.from(uidSet);
}

/** Auto-add pinned/cloud to 100% OFFLINE set (ТЗ 8.4, 9.6) */
async function autoAddPinnedCloudToFullOffline(uidSet) {
  const metas = await getAllTrackMetas();
  for (const m of metas) {
    if (m.pinned || m.cloud) {
      uidSet.add(m.uid);
    }
  }
  return uidSet;
}

/** Start full offline download (ТЗ 11.2.I.5) */
async function startFullOfflineDownload(selection, favUids) {
  const canStore = await canGuaranteeStorage();
  if (!canStore) {
    _showToast('Недостаточно свободного места. Нужно минимум 60 МБ.', 4000);
    return false;
  }

  if (isNetworkUnknown()) {
    const proceed = await _confirmUnknownNetwork();
    if (!proceed) return false;
  }

  const foq = getFullOfflineQuality();
  let uids = resolveFullOfflineUids(selection, favUids);
  const uidSet = new Set(uids);
  await autoAddPinnedCloudToFullOffline(uidSet);
  uids = Array.from(uidSet);

  setFullOfflineSelection(selection);
  _setFullOfflineReady(false);

  const assets = getFullOfflineAssets();
  let enqueued = 0;

  for (const uid of uids) {
    const track = _findTrack(uid);
    if (!track) continue;

    let meta = await getTrackMeta(uid);
    if (!meta) meta = _defaultMeta(uid);
    meta.fullOfflineIncluded = true;
    await saveTrackMeta(meta);

    const entry = await getAudioEntry(uid);
    if (!entry || entry.variant !== foq) {
      const url = resolveVariantUrl(track, foq, _baseUrl);
      if (url) {
        enqueue({
          uid, variant: foq, url,
          priority: PRIORITY.P6_FULL_OFFLINE,
          cacheKind: 'fullOffline'
        });
        enqueued++;
      }
    }

    if (track.lyrics) {
      enqueue({
        uid, url: _baseUrl ? `${_baseUrl}/${track.lyrics}` : track.lyrics,
        priority: PRIORITY.P5_ASSET,
        cacheKind: 'fullOffline',
        assetKey: `lyrics:${uid}`,
        assetType: 'text/plain'
      });
    }

    if (assets.covers && track.cover) {
      enqueue({
        uid, url: _baseUrl ? `${_baseUrl}/${track.cover}` : track.cover,
        priority: PRIORITY.P5_ASSET,
        cacheKind: 'fullOffline',
        assetKey: `cover:${uid}`,
        assetType: 'image/jpeg'
      });
    }
  }

  // Listen for completion
  _watchFullOfflineCompletion(uids);

  return { enqueued, totalTracks: uids.length };
}

let _fullOfflineWatcher = null;

function _watchFullOfflineCompletion(uids) {
  if (_fullOfflineWatcher) {
    window.removeEventListener('downloadComplete', _fullOfflineWatcher);
  }

  const remaining = new Set(uids);

  _fullOfflineWatcher = async (e) => {
    const { uid } = e.detail;
    remaining.delete(uid);

    window.dispatchEvent(new CustomEvent('fullOfflineProgress', {
      detail: { done: uids.length - remaining.size, total: uids.length }
    }));

    if (remaining.size === 0) {
      window.removeEventListener('downloadComplete', _fullOfflineWatcher);
      _fullOfflineWatcher = null;
      _setFullOfflineReady(true);
      window.dispatchEvent(new CustomEvent('fullOfflineComplete', {
        detail: { totalTracks: uids.length }
      }));
    }
  };

  window.addEventListener('downloadComplete', _fullOfflineWatcher);
}

/** Activate R3 after user confirms (ТЗ 11.2.I.7) */
async function activateFullOffline() {
  if (!isFullOfflineReady()) {
    _showToast('Загрузка 100% OFFLINE не завершена.');
    return false;
  }
  return setMode(MODES.R3);
}

/** Deactivate R3 */
async function deactivateFullOffline() {
  return setMode(MODES.R0);
}

/** Check if uid is in full offline set */
async function isInFullOfflineSet(uid) {
  const meta = await getTrackMeta(uid);
  return meta && (meta.fullOfflineIncluded || meta.pinned || meta.cloud);
}

/** Remove track from 100% OFFLINE (ТЗ 11.2.I.11) */
async function removeFromFullOffline(uid) {
  const meta = await getTrackMeta(uid);
  if (!meta) return false;
  if (meta.pinned) {
    _showToast('Сначала снимите 🔒, затем удалите из 100% OFFLINE.');
    return false;
  }
  meta.fullOfflineIncluded = false;
  if (meta.cacheKind === 'fullOffline') {
    meta.cacheKind = 'none';
  }
  await saveTrackMeta(meta);
  _dispatchStateChange(uid);
  return true;
}

// ===================== NEEDS UPDATE INDICATOR (ТЗ 12) =====================

async function hasNeedsUpdateOrReCache() {
  const metas = await getAllTrackMetas();
  return metas.some(m => m.needsUpdate || m.needsReCache);
}

function _dispatchNeedsUpdate() {
  window.dispatchEvent(new CustomEvent('needsUpdateChanged'));
}

function _dispatchStateChange(uid) {
  window.dispatchEvent(new CustomEvent('offlineStateChanged', { detail: { uid } }));
}

// ===================== CONFIRM UNKNOWN NETWORK =====================

function _confirmUnknownNetwork() {
  return new Promise(resolve => {
    if (typeof window !== 'undefined' && window.confirm) {
      resolve(window.confirm('Тип сети неизвестен. Продолжить?'));
    } else {
      resolve(true);
    }
  });
}

// ===================== GETTERS / STATE =====================

async function getBreakdown() {
  return getCacheSizeByKind();
}

function getAllTracks() { return _allTracks; }
function getAlbumsData() { return _albumsData; }
function getBaseUrl() { return _baseUrl; }

export {
  init,
  togglePinned, cloudAddPin, cloudRemoveFromCache,
  onTrackPlayed,
  checkForUpdates, updateAllFiles,
  protectWindow, unprotectWindow, isProtected,
  clearCacheByCategory, clearAllCache,
  computeSizeEstimate,
  getFullOfflineSelection, setFullOfflineSelection,
  getFullOfflineAssets, setFullOfflineAssets,
  resolveFullOfflineUids, autoAddPinnedCloudToFullOffline,
  startFullOfflineDownload, activateFullOffline, deactivateFullOffline,
  isFullOfflineReady, isInFullOfflineSet, removeFromFullOffline,
  hasNeedsUpdateOrReCache,
  getCacheLimit, getCacheLimitMode, setCacheLimitMode, setCacheLimitManual,
  getBreakdown,
  getAllTracks, getAlbumsData, getBaseUrl,
  _checkExpiredCloud
};
