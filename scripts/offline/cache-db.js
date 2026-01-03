// scripts/offline/cache-db.js
// ESM, без внешних зависимостей. Один open() на процесс. 2 пробела.

const DB_NAME = 'vb-audio';
const DB_VERSION = 1;

// Stores:
// - audioBlobs: key=uid|quality('hi'|'lo'), value: Blob (mp3)
// - meta: key=uid, value: { pinned, cloud, cachedQuality, cachedBytes, cachedComplete, needsUpdate, needsReCache, cloudAddedAt, cloudExpiresAt }
// - cloudStats: key=uid, value: { fullListenCount, lastFullListenAt }
// - globalStats: key=uid, value: { totalFullListens, totalPlayMs, firstPlayAt, lastPlayAt }
// - queue: key=auto, value: snapshot tasks (optional persist)
// - settings: key=string, value:any (CQ, N, D, limits, network policy, etc)

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains('audioBlobs')) {
        const s = db.createObjectStore('audioBlobs', { keyPath: 'id' });
        s.createIndex('byUid', 'uid', { unique: false });
        s.createIndex('byQuality', 'quality', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'uid' });
      }
      if (!db.objectStoreNames.contains('cloudStats')) {
        db.createObjectStore('cloudStats', { keyPath: 'uid' });
      }
      if (!db.objectStoreNames.contains('globalStats')) {
        db.createObjectStore('globalStats', { keyPath: 'uid' });
      }
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function _tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const os = tx.objectStore(store);
    const res = fn(os);
    tx.oncomplete = () => resolve(res);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// audioBlobs
export async function putAudioBlob(uid, quality, blob) {
  const id = `${uid}|${quality}`;
  await _tx('audioBlobs', 'readwrite', (os) => os.put({ id, uid, quality, blob, bytes: blob.size, ts: Date.now() }));
  return { id, bytes: blob.size };
}
export async function getAudioBlob(uid, quality) {
  const id = `${uid}|${quality}`;
  return _tx('audioBlobs', 'readonly', (os) => {
    return new Promise((resolve, reject) => {
      const req = os.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  });
}
export async function deleteAudioBlob(uid, quality) {
  const id = `${uid}|${quality}`;
  await _tx('audioBlobs', 'readwrite', (os) => os.delete(id));
}
export async function bytesByQuality(uid) {
  const recHi = await getAudioBlob(uid, 'hi');
  const recLo = await getAudioBlob(uid, 'lo');
  return { hi: recHi?.bytes || 0, lo: recLo?.bytes || 0 };
}

// meta
export async function getMeta(uid) {
  return _tx('meta', 'readonly', (os) => {
    return new Promise((resolve, reject) => {
      const req = os.get(uid);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  });
}
export async function putMeta(uid, patch) {
  const current = (await getMeta(uid)) || { uid };
  const merged = { ...current, ...patch };
  await _tx('meta', 'readwrite', (os) => os.put(merged));
  return merged;
}
export async function deleteMeta(uid) {
  await _tx('meta', 'readwrite', (os) => os.delete(uid));
}

// cloudStats
export async function getCloudStats(uid) {
  return _tx('cloudStats', 'readonly', (os) => {
    return new Promise((resolve, reject) => {
      const req = os.get(uid);
      req.onsuccess = () => resolve(req.result || { uid, fullListenCount: 0, lastFullListenAt: null, cloudAddedAt: null, cloudExpiresAt: null });
      req.onerror = () => reject(req.error);
    });
  });
}
export async function putCloudStats(uid, patch) {
  const cur = await getCloudStats(uid);
  const merged = { ...cur, ...patch, uid };
  await _tx('cloudStats', 'readwrite', (os) => os.put(merged));
  return merged;
}
export async function resetCloudStats(uid) {
  await _tx('cloudStats', 'readwrite', (os) => os.put({ uid, fullListenCount: 0, lastFullListenAt: null, cloudAddedAt: null, cloudExpiresAt: null }));
}

// globalStats
export async function getGlobalStats(uid) {
  return _tx('globalStats', 'readonly', (os) => {
    return new Promise((resolve, reject) => {
      const req = os.get(uid);
      req.onsuccess = () => resolve(req.result || { uid, totalFullListens: 0, totalPlayMs: 0, firstPlayAt: null, lastPlayAt: null });
      req.onerror = () => reject(req.error);
    });
  });
}
export async function putGlobalStats(uid, patch) {
  const cur = await getGlobalStats(uid);
  const merged = { ...cur, ...patch, uid };
  await _tx('globalStats', 'readwrite', (os) => os.put(merged));
  return merged;
}

// settings (CQ, N, D, limits, network policy, etc)
export async function getSetting(key, def = null) {
  return _tx('settings', 'readonly', (os) => {
    return new Promise((resolve) => {
      const req = os.get(key);
      req.onsuccess = () => resolve((req.result && req.result.value) ?? def);
      req.onerror = () => resolve(def);
    });
  });
}
export async function setSetting(key, value) {
  await _tx('settings', 'readwrite', (os) => os.put({ key, value }));
}

export async function estimateUsage() {
  if (!('storage' in navigator) || !navigator.storage.estimate) return { usage: 0, quota: 0 };
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return { usage: 0, quota: 0 };
  }
}
