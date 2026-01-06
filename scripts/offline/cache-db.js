// scripts/offline/cache-db.js
// IndexedDB слой для OFFLINE системы (ТЗ_НЬЮ)
// Хранит: bytes счётчики, blobs аудио, cloud stats, global stats

const DB_NAME = 'vitrina-offline-db';
const DB_VERSION = 2;

const STORE_META = 'meta';
const STORE_BYTES = 'bytes';
const STORE_BLOBS = 'blobs';
const STORE_STATS_GLOBAL = 'stats_global';
const STORE_CLOUD_STATS = 'cloud_stats';

const META_CQ_KEY = 'cacheQuality';
const MB = 1024 * 1024;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;

      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
      if (!db.objectStoreNames.contains(STORE_BYTES)) {
        db.createObjectStore(STORE_BYTES);
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS);
      }
      if (!db.objectStoreNames.contains(STORE_STATS_GLOBAL)) {
        db.createObjectStore(STORE_STATS_GLOBAL);
      }
      if (!db.objectStoreNames.contains(STORE_CLOUD_STATS)) {
        db.createObjectStore(STORE_CLOUD_STATS);
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });

  return dbPromise;
}

function txp(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const st = tx.objectStore(store);

    let res;
    try { res = fn(st); } catch (e) { reject(e); return; }

    if (res instanceof Promise) {
      res.then(r => {
        tx.oncomplete = () => resolve(r);
      }).catch(reject);
    } else {
      tx.oncomplete = () => resolve(res);
    }
    
    tx.onerror = () => reject(tx.error || new Error('IndexedDB tx failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB tx aborted'));
  });
}

export async function ensureDbReady() {
  await openDb();
}

// ===== Cache Quality =====
export async function getCacheQuality() {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_META, 'readonly');
      const st = tx.objectStore(STORE_META);
      const r = st.get(META_CQ_KEY);
      r.onsuccess = () => {
        const s = String(r.result || '').toLowerCase();
        resolve((s === 'lo') ? 'lo' : 'hi');
      };
      r.onerror = () => resolve('hi');
    });
  } catch {
    return 'hi';
  }
}

export async function setCacheQuality(v) {
  const cq = (String(v || '').toLowerCase() === 'lo') ? 'lo' : 'hi';
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put(cq, META_CQ_KEY);
  } catch {}
  return cq;
}

// ===== Bytes tracking =====
export async function bytesByQuality(uid) {
  const u = String(uid || '').trim();
  if (!u) return { hi: 0, lo: 0 };

  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_BYTES, 'readonly');
      const r = tx.objectStore(STORE_BYTES).get(u);
      r.onsuccess = () => {
        const row = r.result || {};
        const hi = Number(row.hi || 0);
        const lo = Number(row.lo || 0);
        resolve({
          hi: Number.isFinite(hi) && hi > 0 ? Math.floor(hi) : 0,
          lo: Number.isFinite(lo) && lo > 0 ? Math.floor(lo) : 0
        });
      };
      r.onerror = () => resolve({ hi: 0, lo: 0 });
    });
  } catch {
    return { hi: 0, lo: 0 };
  }
}

export async function setBytes(uid, quality, bytes) {
  const u = String(uid || '').trim();
  if (!u) return;

  const q = (String(quality || '').toLowerCase() === 'lo') ? 'lo' : 'hi';
  const b = Number(bytes);
  const safe = (Number.isFinite(b) && b > 0) ? Math.floor(b) : 0;

  try {
    const db = await openDb();
    const tx = db.transaction(STORE_BYTES, 'readwrite');
    const st = tx.objectStore(STORE_BYTES);
    
    const getReq = st.get(u);
    getReq.onsuccess = () => {
      const cur = getReq.result || { hi: 0, lo: 0 };
      const next = { 
        hi: Number(cur.hi || 0), 
        lo: Number(cur.lo || 0),
        updatedAt: Date.now()
      };
      next[q] = safe;
      st.put(next, u);
    };
  } catch {}
}

export async function totalCachedBytes() {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      let total = 0;
      const tx = db.transaction(STORE_BYTES, 'readonly');
      const req = tx.objectStore(STORE_BYTES).openCursor();

      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(total);
          return;
        }
        const v = cursor.value || {};
        const hi = Number(v.hi || 0);
        const lo = Number(v.lo || 0);
        if (Number.isFinite(hi) && hi > 0) total += hi;
        if (Number.isFinite(lo) && lo > 0) total += lo;
        cursor.continue();
      };

      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

export async function deleteTrackCache(uid) {
  const u = String(uid || '').trim();
  if (!u) return;

  try {
    const db = await openDb();
    const tx = db.transaction([STORE_BYTES, STORE_BLOBS], 'readwrite');
    tx.objectStore(STORE_BYTES).delete(u);
    tx.objectStore(STORE_BLOBS).delete(`${u}:hi`);
    tx.objectStore(STORE_BLOBS).delete(`${u}:lo`);
  } catch {}
}

// ===== Blob storage =====
export async function getAudioBlob(uid, quality) {
  const u = String(uid || '').trim();
  if (!u) return null;

  const q = (String(quality || '').toLowerCase() === 'lo') ? 'lo' : 'hi';
  const key = `${u}:${q}`;

  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_BLOBS, 'readonly');
      const r = tx.objectStore(STORE_BLOBS).get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setAudioBlob(uid, quality, blob) {
  const u = String(uid || '').trim();
  if (!u || !(blob instanceof Blob)) return false;

  const q = (String(quality || '').toLowerCase() === 'lo') ? 'lo' : 'hi';
  const key = `${u}:${q}`;

  try {
    const db = await openDb();
    const tx = db.transaction(STORE_BLOBS, 'readwrite');
    tx.objectStore(STORE_BLOBS).put(blob, key);
    return true;
  } catch {
    return false;
  }
}

export async function deleteAudioBlob(uid, quality) {
  const u = String(uid || '').trim();
  if (!u) return;

  const qRaw = String(quality || '').toLowerCase().trim();
  const keys = (qRaw === 'hi' || qRaw === 'lo')
    ? [`${u}:${qRaw}`]
    : [`${u}:hi`, `${u}:lo`];

  try {
    const db = await openDb();
    const tx = db.transaction(STORE_BLOBS, 'readwrite');
    const st = tx.objectStore(STORE_BLOBS);
    keys.forEach(k => st.delete(k));
  } catch {}
}

// ===== Cloud Stats (ТЗ 7.11.1 - сбрасываемая) =====
export async function getCloudStats(uid) {
  const u = String(uid || '').trim();
  const defaults = {
    cloudFullListenCount: 0,
    lastFullListenAt: 0,
    cloudAddedAt: 0,
    cloudExpiresAt: 0,
    cloud: false
  };
  
  if (!u) return defaults;

  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_CLOUD_STATS, 'readonly');
      const r = tx.objectStore(STORE_CLOUD_STATS).get(u);
      r.onsuccess = () => {
        const v = r.result;
        if (!v) { resolve(defaults); return; }
        resolve({
          cloudFullListenCount: Math.floor(Number(v.cloudFullListenCount || 0)),
          lastFullListenAt: Math.floor(Number(v.lastFullListenAt || 0)),
          cloudAddedAt: Math.floor(Number(v.cloudAddedAt || 0)),
          cloudExpiresAt: Math.floor(Number(v.cloudExpiresAt || 0)),
          cloud: v.cloud === true
        });
      };
      r.onerror = () => resolve(defaults);
    });
  } catch {
    return defaults;
  }
}

export async function setCloudStats(uid, stats) {
  const u = String(uid || '').trim();
  if (!u) return false;

  const payload = {
    cloudFullListenCount: Math.floor(Number(stats?.cloudFullListenCount || 0)),
    lastFullListenAt: Math.floor(Number(stats?.lastFullListenAt || 0)),
    cloudAddedAt: Math.floor(Number(stats?.cloudAddedAt || 0)),
    cloudExpiresAt: Math.floor(Number(stats?.cloudExpiresAt || 0)),
    cloud: stats?.cloud === true
  };

  try {
    const db = await openDb();
    const tx = db.transaction(STORE_CLOUD_STATS, 'readwrite');
    tx.objectStore(STORE_CLOUD_STATS).put(payload, u);
    return true;
  } catch {
    return false;
  }
}

export async function clearCloudStats(uid) {
  const u = String(uid || '').trim();
  if (!u) return false;

  try {
    const db = await openDb();
    const tx = db.transaction(STORE_CLOUD_STATS, 'readwrite');
    tx.objectStore(STORE_CLOUD_STATS).delete(u);
    return true;
  } catch {
    return false;
  }
}

// ===== Cloud Candidate (meta) =====
function cloudCandidateKey(uid) {
  const u = String(uid || '').trim();
  return u ? `cloudCandidate:${u}` : '';
}

export async function getCloudCandidate(uid) {
  const key = cloudCandidateKey(uid);
  if (!key) return false;

  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_META, 'readonly');
      const r = tx.objectStore(STORE_META).get(key);
      r.onsuccess = () => resolve(r.result === true);
      r.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function setCloudCandidate(uid, flag) {
  const key = cloudCandidateKey(uid);
  if (!key) return false;

  try {
    const db = await openDb();
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put(!!flag, key);
    return true;
  } catch {
    return false;
  }
}

export async function clearCloudCandidate(uid) {
  const key = cloudCandidateKey(uid);
  if (!key) return false;

  try {
    const db = await openDb();
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).delete(key);
    return true;
  } catch {
    return false;
  }
}

// ===== Global Stats (ТЗ 7.11.2 - никогда не сбрасывается) =====
export async function getGlobalStats(uid) {
  const u = String(uid || '').trim();
  if (!u) return { seconds: 0, fullListens: 0, lastListenAt: 0 };

  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_STATS_GLOBAL, 'readonly');
      const r = tx.objectStore(STORE_STATS_GLOBAL).get(u);
      r.onsuccess = () => {
        const v = r.result || {};
        resolve({
          seconds: Number(v.seconds || 0),
          fullListens: Number(v.fullListens || 0),
          lastListenAt: Number(v.lastListenAt || 0)
        });
      };
      r.onerror = () => resolve({ seconds: 0, fullListens: 0, lastListenAt: 0 });
    });
  } catch {
    return { seconds: 0, fullListens: 0, lastListenAt: 0 };
  }
}

export async function updateGlobalStats(uid, deltaSeconds, addFullListen = 0) {
  const u = String(uid || '').trim();
  if (!u) return;

  const now = Date.now();
  const delta = Number(deltaSeconds) || 0;
  const full = Number(addFullListen) || 0;

  try {
    const db = await openDb();
    const tx = db.transaction(STORE_STATS_GLOBAL, 'readwrite');
    const st = tx.objectStore(STORE_STATS_GLOBAL);
    
    const getReq = st.get(u);
    getReq.onsuccess = () => {
      const cur = getReq.result || { seconds: 0, fullListens: 0, lastListenAt: 0 };
      const next = {
        seconds: (Number(cur.seconds) || 0) + delta,
        fullListens: (Number(cur.fullListens) || 0) + full,
        lastListenAt: now
      };
      st.put(next, u);
    };
  } catch {}
}

export async function getGlobalStatsAndTotal() {
  try {
    const db = await openDb();
    let totalSeconds = 0;
    const tracks = [];

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_STATS_GLOBAL, 'readonly');
      const req = tx.objectStore(STORE_STATS_GLOBAL).openCursor();
      
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve({ totalSeconds, tracks });
          return;
        }
        const val = cursor.value;
        const uid = cursor.key;
        totalSeconds += (Number(val.seconds) || 0);
        if ((val.fullListens || 0) > 0 || (val.seconds || 0) > 0) {
          tracks.push({ uid, ...val });
        }
        cursor.continue();
      };
      
      req.onerror = () => resolve({ totalSeconds: 0, tracks: [] });
    });
  } catch {
    return { totalSeconds: 0, tracks: [] };
  }
}

// ===== Eviction helpers =====
export async function getEvictionCandidates(pinnedSet) {
  try {
    const db = await openDb();
    const candidates = [];

    await new Promise((resolve) => {
      const tx = db.transaction(STORE_BYTES, 'readonly');
      const req = tx.objectStore(STORE_BYTES).openCursor();
      
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) { resolve(); return; }
        const uid = String(cursor.key);
        if (!pinnedSet.has(uid)) {
          const v = cursor.value || {};
          candidates.push({ 
            uid, 
            updatedAt: v.updatedAt || 0,
            bytes: (Number(v.hi) || 0) + (Number(v.lo) || 0)
          });
        }
        cursor.continue();
      };
      
      req.onerror = () => resolve();
    });

    // Enrich with lastListenAt for LRU sorting
    for (const c of candidates) {
      const g = await getGlobalStats(c.uid);
      c.lastListenAt = g?.lastListenAt || 0;
    }

    // Sort: oldest first (LRU)
    candidates.sort((a, b) => (a.lastListenAt || 0) - (b.lastListenAt || 0));
    
    return candidates;
  } catch {
    return [];
  }
}

// ===== Cloud TTL expiration check =====
export async function getExpiredCloudUids() {
  const now = Date.now();
  const expired = [];

  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_CLOUD_STATS, 'readonly');
      const req = tx.objectStore(STORE_CLOUD_STATS).openCursor();
      
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(expired);
          return;
        }
        const v = cursor.value;
        if (v && v.cloud === true && v.cloudExpiresAt > 0 && v.cloudExpiresAt < now) {
          expired.push(String(cursor.key));
        }
        cursor.continue();
      };
      
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

// ===== Clear all stores =====
export async function clearAllStores({ keepCacheQuality = true } = {}) {
  try {
    const db = await openDb();

    // Clear bytes
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_BYTES, 'readwrite');
      tx.objectStore(STORE_BYTES).clear();
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });

    // Clear blobs
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_BLOBS, 'readwrite');
      tx.objectStore(STORE_BLOBS).clear();
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });

    // Clear cloud stats
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_CLOUD_STATS, 'readwrite');
      tx.objectStore(STORE_CLOUD_STATS).clear();
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });

    // Clear meta (except CQ if keepCacheQuality)
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_META, 'readwrite');
      const st = tx.objectStore(STORE_META);
      
      if (keepCacheQuality) {
        const req = st.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) { resolve(); return; }
          const k = String(cursor.key || '');
          if (k !== META_CQ_KEY) {
            cursor.delete();
          }
          cursor.continue();
        };
        req.onerror = () => resolve();
      } else {
        st.clear();
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      }
    });

    return true;
  } catch {
    return false;
  }
}
