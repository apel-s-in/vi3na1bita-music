/**
 * CacheDB — IndexedDB storage for audio blobs and track metadata (ТЗ 1.3, 1.7)
 * Single audio copy per uid (no duplicates rule)
 * Stores: audio blobs, track offline state, LRU queue, stats
 */

const DB_NAME = 'vitrina-offline-v2';
const DB_VERSION = 2;

const STORE_AUDIO = 'audio';       // key: uid, value: { uid, variant, blob, size, cacheKind, createdAt }
const STORE_META = 'meta';         // key: uid, value: { uid, pinned, cloud, cacheKind, cachedVariant, cachedComplete, needsUpdate, needsReCache, cloudStats, ... }
const STORE_LRU = 'lru';           // key: 'queue', value: [uid, uid, ...]
const STORE_STATS = 'globalStats'; // key: uid, value: { globalFullListenCount, globalListenSeconds }
const STORE_ASSETS = 'assets';     // key: assetKey, value: { blob, type, createdAt }

let _db = null;
let _dbReady = null;

function _openDB() {
  if (_dbReady) return _dbReady;
  _dbReady = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, { keyPath: 'uid' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'uid' });
      }
      if (!db.objectStoreNames.contains(STORE_LRU)) {
        db.createObjectStore(STORE_LRU, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_STATS)) {
        db.createObjectStore(STORE_STATS, { keyPath: 'uid' });
      }
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        db.createObjectStore(STORE_ASSETS, { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => { console.error('[CacheDB] open error', e); reject(e); };
  });
  return _dbReady;
}

async function _getStore(storeName, mode = 'readonly') {
  const db = await _openDB();
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

async function _txDo(storeName, mode, fn) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = fn(store);
    tx.oncomplete = () => resolve(result._result !== undefined ? result._result : undefined);
    tx.onerror = (e) => reject(e);
  });
}

// Simpler approach: promise-based IDB helpers
function _idbGet(storeName, key) {
  return _openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e);
  }));
}

function _idbPut(storeName, value) {
  return _openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  }));
}

function _idbDelete(storeName, key) {
  return _openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  }));
}

function _idbGetAll(storeName) {
  return _openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e);
  }));
}

function _idbClear(storeName) {
  return _openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  }));
}

// ==================== AUDIO BLOB STORAGE ====================

/** Save audio blob for uid (ТЗ 1.7: only one variant per uid) */
async function saveAudioBlob(uid, variant, blob, cacheKind) {
  const existing = await getAudioEntry(uid);
  // No duplicates rule: if different variant exists, remove it first
  if (existing && existing.variant !== variant) {
    console.log(`[CacheDB] replacing ${existing.variant} → ${variant} for ${uid}`);
  }
  const entry = {
    uid,
    variant,
    blob,
    size: blob.size,
    cacheKind: cacheKind || 'dynamic',
    createdAt: Date.now()
  };
  await _idbPut(STORE_AUDIO, entry);

  // Update meta
  const meta = await getTrackMeta(uid) || _defaultMeta(uid);
  meta.cachedVariant = variant;
  meta.cachedComplete = 100;
  meta.cacheKind = cacheKind || meta.cacheKind || 'dynamic';
  meta.needsReCache = false;
  await saveTrackMeta(meta);

  return entry;
}

async function getAudioEntry(uid) {
  return _idbGet(STORE_AUDIO, uid);
}

async function getAudioBlob(uid) {
  const entry = await getAudioEntry(uid);
  return entry ? entry.blob : null;
}

async function getAudioBlobURL(uid) {
  const blob = await getAudioBlob(uid);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

async function deleteAudioBlob(uid) {
  await _idbDelete(STORE_AUDIO, uid);
}

async function hasAudioLocally(uid) {
  const entry = await getAudioEntry(uid);
  return entry !== null;
}

async function getAllAudioEntries() {
  return _idbGetAll(STORE_AUDIO);
}

// ==================== TRACK META ====================

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

async function getTrackMeta(uid) {
  return _idbGet(STORE_META, uid);
}

async function saveTrackMeta(meta) {
  return _idbPut(STORE_META, meta);
}

async function getAllTrackMetas() {
  return _idbGetAll(STORE_META);
}

async function deleteTrackMeta(uid) {
  return _idbDelete(STORE_META, uid);
}

/** Get offline state for UI (ТЗ 19.2) */
async function getTrackOfflineState(uid) {
  const meta = await getTrackMeta(uid) || _defaultMeta(uid);
  return {
    pinned: meta.pinned,
    cloud: meta.cloud,
    cacheKind: meta.cacheKind,
    cachedVariant: meta.cachedVariant,
    cachedComplete: meta.cachedComplete,
    needsUpdate: meta.needsUpdate,
    needsReCache: meta.needsReCache
  };
}

// ==================== LRU QUEUE (ТЗ 7.14.4) ====================

const LRU_KEY = 'lru-queue';

async function getLRUQueue() {
  const entry = await _idbGet(STORE_LRU, LRU_KEY);
  return entry ? entry.queue : [];
}

async function saveLRUQueue(queue) {
  await _idbPut(STORE_LRU, { id: LRU_KEY, queue });
}

/** Touch uid to MRU position (ТЗ 7.14.4) */
async function touchLRU(uid) {
  const queue = await getLRUQueue();
  const idx = queue.indexOf(uid);
  if (idx !== -1) queue.splice(idx, 1);
  queue.unshift(uid);
  await saveLRUQueue(queue);
  return queue;
}

/** Remove uid from LRU */
async function removeLRU(uid) {
  const queue = await getLRUQueue();
  const idx = queue.indexOf(uid);
  if (idx !== -1) {
    queue.splice(idx, 1);
    await saveLRUQueue(queue);
  }
  return queue;
}

/** Get tail uids for eviction */
async function getLRUTail(count) {
  const queue = await getLRUQueue();
  return queue.slice(-count);
}

// LRU queue backup to localStorage (ТЗ answer Q3: text backup)
function backupLRUToLocalStorage(queue) {
  try {
    localStorage.setItem('offline:lruBackup:v1', JSON.stringify(queue));
  } catch(e) { /* quota exceeded, ignore */ }
}

function restoreLRUFromLocalStorage() {
  try {
    const raw = localStorage.getItem('offline:lruBackup:v1');
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}

// ==================== GLOBAL STATS (ТЗ 18) ====================

async function getGlobalStats(uid) {
  const entry = await _idbGet(STORE_STATS, uid);
  return entry || { uid, globalFullListenCount: 0, globalListenSeconds: 0 };
}

async function saveGlobalStats(uid, stats) {
  await _idbPut(STORE_STATS, { uid, ...stats });
}

async function getAllGlobalStats() {
  return _idbGetAll(STORE_STATS);
}

// ==================== ASSETS (covers, lyrics, gallery) ====================

async function saveAsset(key, blob, type) {
  await _idbPut(STORE_ASSETS, { key, blob, type, createdAt: Date.now() });
}

async function getAsset(key) {
  return _idbGet(STORE_ASSETS, key);
}

async function deleteAsset(key) {
  await _idbDelete(STORE_ASSETS, key);
}

async function getAllAssets() {
  return _idbGetAll(STORE_ASSETS);
}

// ==================== STORAGE SIZE ESTIMATES ====================

async function getTotalCacheSize() {
  const entries = await getAllAudioEntries();
  let total = 0;
  for (const e of entries) {
    total += e.size || 0;
  }
  return total;
}

async function getCacheSizeByKind() {
  const entries = await getAllAudioEntries();
  const metas = await getAllTrackMetas();
  const metaMap = {};
  metas.forEach(m => { metaMap[m.uid] = m; });

  const breakdown = { pinned: 0, cloud: 0, dynamic: 0, playbackWindow: 0, fullOffline: 0, other: 0 };
  for (const e of entries) {
    const meta = metaMap[e.uid];
    const kind = meta ? meta.cacheKind : (e.cacheKind || 'other');
    if (breakdown[kind] !== undefined) {
      breakdown[kind] += e.size || 0;
    } else {
      breakdown.other += e.size || 0;
    }
  }

  // Assets
  const assets = await getAllAssets();
  breakdown.other += assets.reduce((s, a) => s + (a.blob ? a.blob.size : 0), 0);

  return breakdown;
}

async function getStorageEstimate() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      return { quota: est.quota || 0, usage: est.usage || 0, free: (est.quota || 0) - (est.usage || 0) };
    }
  } catch(e) {}
  return { quota: 0, usage: 0, free: 0 };
}

// ==================== CLEAR / CLEANUP ====================

async function clearAll() {
  await _idbClear(STORE_AUDIO);
  await _idbClear(STORE_META);
  await _idbClear(STORE_LRU);
  await _idbClear(STORE_ASSETS);
  // Do NOT clear STORE_STATS (ТЗ 18.4: global stats never reset)
}

async function clearByKind(kind) {
  const metas = await getAllTrackMetas();
  const toDelete = metas.filter(m => m.cacheKind === kind);
  for (const m of toDelete) {
    await deleteAudioBlob(m.uid);
    m.cacheKind = 'none';
    m.cachedVariant = null;
    m.cachedComplete = 0;
    if (kind === 'dynamic') {
      await removeLRU(m.uid);
    }
    await saveTrackMeta(m);
  }
  return toDelete.length;
}

// Init DB on load
_openDB().catch(e => console.error('[CacheDB] init failed', e));

export {
  saveAudioBlob, getAudioEntry, getAudioBlob, getAudioBlobURL, deleteAudioBlob,
  hasAudioLocally, getAllAudioEntries,
  getTrackMeta, saveTrackMeta, getAllTrackMetas, deleteTrackMeta, getTrackOfflineState,
  getLRUQueue, saveLRUQueue, touchLRU, removeLRU, getLRUTail,
  backupLRUToLocalStorage, restoreLRUFromLocalStorage,
  getGlobalStats, saveGlobalStats, getAllGlobalStats,
  saveAsset, getAsset, deleteAsset, getAllAssets,
  getTotalCacheSize, getCacheSizeByKind, getStorageEstimate,
  clearAll, clearByKind,
  _openDB as initDB
};
