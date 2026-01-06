// scripts/offline/cache-db.js
// IndexedDB wrapper для offline-кэша (ТЗ_Нью)

const DB_NAME = 'OfflineCacheDB';
const DB_VERSION = 5;

const STORE_AUDIO = 'audioBlobs';
const STORE_BYTES = 'trackBytes';
const STORE_META = 'cacheMeta';
const STORE_CLOUD_STATS = 'cloudStats';
const STORE_CLOUD_CANDIDATE = 'cloudCandidate';
const STORE_GLOBAL_STATS = 'globalStats';

// Meta per (uid:quality) for updates/re-cache (ТЗ 13)
const STORE_DL_META = 'downloadMeta';

// Local cache meta per uid for eviction/breakdown (ТЗ 1.3 / 11.2.E / 13)
const STORE_LOCAL_META = 'trackLocalMeta';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO);
      }
      if (!db.objectStoreNames.contains(STORE_BYTES)) {
        db.createObjectStore(STORE_BYTES);
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
      if (!db.objectStoreNames.contains(STORE_CLOUD_STATS)) {
        db.createObjectStore(STORE_CLOUD_STATS);
      }
      if (!db.objectStoreNames.contains(STORE_CLOUD_CANDIDATE)) {
        db.createObjectStore(STORE_CLOUD_CANDIDATE);
      }
      if (!db.objectStoreNames.contains(STORE_GLOBAL_STATS)) {
        db.createObjectStore(STORE_GLOBAL_STATS);
      }

      if (!db.objectStoreNames.contains(STORE_DL_META)) {
        db.createObjectStore(STORE_DL_META);
      }

      if (!db.objectStoreNames.contains(STORE_LOCAL_META)) {
        db.createObjectStore(STORE_LOCAL_META);
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

export async function ensureDbReady() {
  await openDb();
}

async function getStore(name, mode = 'readonly') {
  const db = await openDb();
  const tx = db.transaction(name, mode);
  return tx.objectStore(name);
}

function promisifyReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Audio blobs
export async function getAudioBlob(uid, quality) {
  const key = `${uid}:${quality}`;
  const store = await getStore(STORE_AUDIO);
  return promisifyReq(store.get(key));
}

export async function setAudioBlob(uid, quality, blob) {
  const key = `${uid}:${quality}`;
  const store = await getStore(STORE_AUDIO, 'readwrite');
  return promisifyReq(store.put(blob, key));
}

export async function deleteAudioBlob(uid, quality) {
  const key = `${uid}:${quality}`;
  const store = await getStore(STORE_AUDIO, 'readwrite');
  return promisifyReq(store.delete(key));
}

// Bytes tracking
export async function getBytes(uid, quality) {
  const key = `${uid}:${quality}`;
  const store = await getStore(STORE_BYTES);
  const val = await promisifyReq(store.get(key));
  return Number(val) || 0;
}

export async function setBytes(uid, quality, bytes) {
  const key = `${uid}:${quality}`;
  const store = await getStore(STORE_BYTES, 'readwrite');
  return promisifyReq(store.put(Number(bytes) || 0, key));
}

export async function bytesByQuality(uid) {
  const hi = await getBytes(uid, 'hi');
  const lo = await getBytes(uid, 'lo');
  return { hi, lo };
}

export async function totalCachedBytes() {
  const store = await getStore(STORE_BYTES);
  const keys = await promisifyReq(store.getAllKeys());
  let total = 0;
  for (const k of keys) {
    const v = await promisifyReq(store.get(k));
    total += Number(v) || 0;
  }
  return total;
}

// Cache Quality meta
export async function getCacheQuality() {
  const store = await getStore(STORE_META);
  const val = await promisifyReq(store.get('cacheQuality'));
  return (val === 'lo') ? 'lo' : 'hi';
}

export async function setCacheQuality(q) {
  const store = await getStore(STORE_META, 'readwrite');
  return promisifyReq(store.put(q === 'lo' ? 'lo' : 'hi', 'cacheQuality'));
}

// Cloud stats per track
export async function getCloudStats(uid) {
  const store = await getStore(STORE_CLOUD_STATS);
  return promisifyReq(store.get(uid));
}

export async function setCloudStats(uid, data) {
  const store = await getStore(STORE_CLOUD_STATS, 'readwrite');
  return promisifyReq(store.put(data, uid));
}

export async function clearCloudStats(uid) {
  const store = await getStore(STORE_CLOUD_STATS, 'readwrite');
  return promisifyReq(store.delete(uid));
}

// Cloud candidate flag
export async function getCloudCandidate(uid) {
  const store = await getStore(STORE_CLOUD_CANDIDATE);
  const val = await promisifyReq(store.get(uid));
  return !!val;
}

export async function setCloudCandidate(uid, val) {
  const store = await getStore(STORE_CLOUD_CANDIDATE, 'readwrite');
  return promisifyReq(store.put(!!val, uid));
}

export async function clearCloudCandidate(uid) {
  const store = await getStore(STORE_CLOUD_CANDIDATE, 'readwrite');
  return promisifyReq(store.delete(uid));
}

// Global statistics (ТЗ 7.11 / 17)
// Хранение:
// - per-track: key `t:${uid}` => { seconds, fullListens, lastListenAt }
// - totals: key `total` => { totalSeconds }
// Back-compat:
// - key `global` => { totalListenSec, totalFullListens } (оставляем, чтобы старые UI не падали)

function safeUid(v) {
  const s = String(v || '').trim();
  return s || null;
}

export async function updateGlobalStats(uid, deltaSec, deltaFullListens) {
  const u = safeUid(uid);
  if (!u) return false;

  const dSec = Math.max(0, Number(deltaSec) || 0);
  const dFull = Math.max(0, Number(deltaFullListens) || 0);

  const store = await getStore(STORE_GLOBAL_STATS, 'readwrite');

  // per-track
  const tKey = `t:${u}`;
  const prevT = (await promisifyReq(store.get(tKey))) || { seconds: 0, fullListens: 0, lastListenAt: 0 };
  const nextT = {
    seconds: (Number(prevT.seconds) || 0) + dSec,
    fullListens: (Number(prevT.fullListens) || 0) + dFull,
    lastListenAt: Date.now()
  };
  await promisifyReq(store.put(nextT, tKey));

  // totals
  const totalKey = 'total';
  const prevTotal = (await promisifyReq(store.get(totalKey))) || { totalSeconds: 0 };
  const nextTotal = { totalSeconds: (Number(prevTotal.totalSeconds) || 0) + dSec };
  await promisifyReq(store.put(nextTotal, totalKey));

  // Back-compat aggregate (старый формат)
  const prevLegacy = (await promisifyReq(store.get('global'))) || { totalListenSec: 0, totalFullListens: 0 };
  const nextLegacy = {
    totalListenSec: (Number(prevLegacy.totalListenSec) || 0) + dSec,
    totalFullListens: (Number(prevLegacy.totalFullListens) || 0) + dFull
  };
  await promisifyReq(store.put(nextLegacy, 'global'));

  return true;
}

export async function getGlobalStatsAndTotal() {
  const store = await getStore(STORE_GLOBAL_STATS);

  const legacy = (await promisifyReq(store.get('global'))) || { totalListenSec: 0, totalFullListens: 0 };
  const total = (await promisifyReq(store.get('total'))) || { totalSeconds: 0 };

  // Собираем per-track список
  const keys = await promisifyReq(store.getAllKeys());
  const tracks = [];
  for (const k of keys) {
    if (typeof k === 'string' && k.startsWith('t:')) {
      const uid = k.slice(2);
      // eslint-disable-next-line no-await-in-loop
      const rec = await promisifyReq(store.get(k));
      tracks.push({
        uid,
        seconds: Number(rec?.seconds) || 0,
        fullListens: Number(rec?.fullListens) || 0,
        lastListenAt: Number(rec?.lastListenAt) || 0
      });
    }
  }

  const totalBytes = await totalCachedBytes();

  // Возвращаем и новый, и legacy формат
  return {
    totalBytes,

    // legacy (использует текущий offline-modal.js)
    totalListenSec: Number(legacy.totalListenSec) || 0,
    totalFullListens: Number(legacy.totalFullListens) || 0,

    // новый (ТЗ 17)
    totalSeconds: Number(total.totalSeconds) || 0,
    tracks
  };
}
// Download meta for updates (ТЗ 13)
function dlMetaKey(uid, quality) {
  return `${String(uid || '').trim()}:${String(quality || '').toLowerCase() === 'lo' ? 'lo' : 'hi'}`;
}

/**
 * meta shape example:
 * { downloadedAt, bytes, expectedMB, expectedField } where expectedField='size'|'size_low'
 */
export async function getDownloadMeta(uid, quality) {
  const key = dlMetaKey(uid, quality);
  const store = await getStore(STORE_DL_META);
  return promisifyReq(store.get(key));
}

export async function setDownloadMeta(uid, quality, meta) {
  const key = dlMetaKey(uid, quality);
  const store = await getStore(STORE_DL_META, 'readwrite');
  return promisifyReq(store.put(meta || null, key));
}

export async function deleteDownloadMeta(uid, quality) {
  const key = dlMetaKey(uid, quality);
  const store = await getStore(STORE_DL_META, 'readwrite');
  return promisifyReq(store.delete(key));
}

// Delete track cache
export async function deleteTrackCache(uid) {
  await deleteAudioBlob(uid, 'hi');
  await deleteAudioBlob(uid, 'lo');

  const storeBytes = await getStore(STORE_BYTES, 'readwrite');
  await promisifyReq(storeBytes.delete(`${uid}:hi`));
  await promisifyReq(storeBytes.delete(`${uid}:lo`));

  // meta for updates
  try { await deleteDownloadMeta(uid, 'hi'); } catch {}
  try { await deleteDownloadMeta(uid, 'lo'); } catch {}

  // local meta
  try {
    const storeLocal = await getStore(STORE_LOCAL_META, 'readwrite');
    await promisifyReq(storeLocal.delete(String(uid || '').trim()));
  } catch {}
}

// Clear all
export async function clearAllStores(opts = {}) {
  const keepCacheQuality = !!opts?.keepCacheQuality;
  const cq = keepCacheQuality ? await getCacheQuality() : null;

  const db = await openDb();
  const storeNames = [STORE_AUDIO, STORE_BYTES, STORE_CLOUD_STATS, STORE_CLOUD_CANDIDATE, STORE_DL_META, STORE_LOCAL_META];

  for (const name of storeNames) {
    const tx = db.transaction(name, 'readwrite');
    const store = tx.objectStore(name);
    await promisifyReq(store.clear());
  }

  if (keepCacheQuality && cq) {
    await setCacheQuality(cq);
  }

  return true;
}

// ===== Local meta (kind/LRU/transient grouping) =====
// kind: 'cloud' | 'transient' | 'unknown'
// transientGroup: 'window' | 'extra' | null
// lastAccessAt: number (ms)

export async function getLocalMeta(uid) {
  const u = String(uid || '').trim();
  if (!u) return null;
  const store = await getStore(STORE_LOCAL_META);
  return promisifyReq(store.get(u));
}

export async function setLocalMeta(uid, meta) {
  const u = String(uid || '').trim();
  if (!u) return false;
  const store = await getStore(STORE_LOCAL_META, 'readwrite');
  await promisifyReq(store.put(meta || null, u));
  return true;
}

export async function touchLocalAccess(uid) {
  const u = String(uid || '').trim();
  if (!u) return false;

  const prev = (await getLocalMeta(u)) || {};
  const next = {
    ...prev,
    lastAccessAt: Date.now(),
  };
  await setLocalMeta(u, next);
  return true;
}

export async function markLocalCloud(uid) {
  const u = String(uid || '').trim();
  if (!u) return false;

  const prev = (await getLocalMeta(u)) || {};
  const next = {
    ...prev,
    kind: 'cloud',
    transientGroup: null,
    lastAccessAt: Date.now(),
  };
  await setLocalMeta(u, next);
  return true;
}

export async function markLocalTransient(uid, group = 'window') {
  const u = String(uid || '').trim();
  if (!u) return false;

  const g = (group === 'extra') ? 'extra' : 'window';

  const prev = (await getLocalMeta(u)) || {};
  // cloud не понижаем до transient (если уже cloud)
  const kind = (prev.kind === 'cloud') ? 'cloud' : 'transient';

  const next = {
    ...prev,
    kind,
    transientGroup: (kind === 'transient') ? g : null,
    lastAccessAt: Date.now(),
  };
  await setLocalMeta(u, next);
  return true;
}

export async function computeCacheBreakdown(pinnedSet = new Set()) {
  // считаем только audio bytes (hi+lo) по uid
  const storeBytes = await getStore(STORE_BYTES);
  const keys = await promisifyReq(storeBytes.getAllKeys());

  const uidSet = new Set();
  for (const k of keys) {
    const uid = String(k).split(':')[0];
    if (uid) uidSet.add(uid);
  }

  let pinnedBytes = 0;
  let cloudBytes = 0;
  let windowTransientBytes = 0;
  let extraTransientBytes = 0;
  let unknownTransientBytes = 0;

  for (const uid of uidSet) {
    const hiB = await getBytes(uid, 'hi');
    const loB = await getBytes(uid, 'lo');
    const bytes = hiB + loB;

    if (pinnedSet.has(uid)) {
      pinnedBytes += bytes;
      continue;
    }

    const meta = await getLocalMeta(uid);
    const kind = String(meta?.kind || 'unknown');
    const tg = String(meta?.transientGroup || '');

    if (kind === 'cloud') {
      cloudBytes += bytes;
    } else if (kind === 'transient') {
      if (tg === 'extra') extraTransientBytes += bytes;
      else if (tg === 'window') windowTransientBytes += bytes;
      else unknownTransientBytes += bytes;
    } else {
      // без меты считаем как transient/unknown (удаляется раньше cloud)
      unknownTransientBytes += bytes;
    }
  }

  return {
    pinnedBytes,
    cloudBytes,
    transientWindowBytes: windowTransientBytes,
    transientExtraBytes: extraTransientBytes,
    transientUnknownBytes: unknownTransientBytes,
    audioTotalBytes: pinnedBytes + cloudBytes + windowTransientBytes + extraTransientBytes + unknownTransientBytes
  };
}

// Eviction candidates (ТЗ 1.3 / 13):
// - pinned исключаем
// - порядок: extra transient -> window transient -> unknown transient -> cloud
// - внутри группы: LRU по lastAccessAt (старые удаляем первыми)
export async function getEvictionCandidates(pinnedSet = new Set()) {
  const storeBytes = await getStore(STORE_BYTES);
  const bytesKeys = await promisifyReq(storeBytes.getAllKeys());

  const uidSet = new Set();
  for (const k of bytesKeys) {
    const uid = String(k).split(':')[0];
    if (uid && !pinnedSet.has(uid)) uidSet.add(uid);
  }

  const candidates = [];
  for (const uid of uidSet) {
    const hiB = await getBytes(uid, 'hi');
    const loB = await getBytes(uid, 'lo');
    const bytes = hiB + loB;

    const meta = await getLocalMeta(uid);
    const kind = String(meta?.kind || 'unknown');
    const tg = String(meta?.transientGroup || '');
    const lastAccessAt = Number(meta?.lastAccessAt || 0) || 0;

    // weight: меньше = удаляем раньше
    // transient extra=0, transient window=1, transient unknown=2, cloud=3
    let weight = 2;
    if (kind === 'cloud') weight = 3;
    else if (kind === 'transient' && tg === 'extra') weight = 0;
    else if (kind === 'transient' && tg === 'window') weight = 1;
    else if (kind === 'transient') weight = 2;
    else weight = 2;

    candidates.push({ uid, bytes, lastAccessAt, weight, kind, transientGroup: tg });
  }

  candidates.sort((a, b) => (a.weight - b.weight) || (a.lastAccessAt - b.lastAccessAt));
  return candidates;
}

// Expired cloud
export async function getExpiredCloudUids() {
  const store = await getStore(STORE_CLOUD_STATS);
  const allStats = await promisifyReq(store.getAll());
  const allKeys = await promisifyReq(store.getAllKeys());

  const now = Date.now();
  const expired = [];

  for (let i = 0; i < allKeys.length; i++) {
    const uid = allKeys[i];
    const st = allStats[i];

    if (st?.cloud === true) {
      const exp = Number(st?.cloudExpiresAt || 0);
      if (exp > 0 && exp < now) {
        expired.push(uid);
      }
    }
  }

  return expired;
}
