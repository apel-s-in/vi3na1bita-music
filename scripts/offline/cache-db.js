// scripts/offline/cache-db.js
// IndexedDB слой (CQ bytes) — MVP.
// Нужен для cache-progress-overlay.js (bytesByQuality).
// НЕ хранит blobs "по-настоящему" в этом коммите — только bytes (счётчики).

const DB_NAME = 'vitrina-offline-db';
const DB_VERSION = 1;

const STORE_META = 'meta'; // key -> value
const STORE_BYTES = 'bytes'; // uid -> { hi:number, lo:number }

// ✅ Реальное офлайн-хранилище аудио (Blob) по ключу `${uid}:${quality}`
const STORE_BLOBS = 'blobs';

const META_CQ_KEY = 'cacheQuality';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
      if (!db.objectStoreNames.contains(STORE_BYTES)) {
        db.createObjectStore(STORE_BYTES);
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS);
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

    tx.oncomplete = () => resolve(res);
    tx.onerror = () => reject(tx.error || new Error('IndexedDB tx failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB tx aborted'));
  });
}

export async function ensureDbReady() {
  await openDb();
}

export async function getCacheQuality() {
  try {
    const db = await openDb();
    const v = await txp(db, STORE_META, 'readonly', (st) => {
      return new Promise((resolve, reject) => {
        const r = st.get(META_CQ_KEY);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    });

    const s = String(v || '').toLowerCase();
    return (s === 'lo') ? 'lo' : 'hi';
  } catch {
    return 'hi';
  }
}

export async function setCacheQuality(v) {
  const cq = (String(v || '').toLowerCase() === 'lo') ? 'lo' : 'hi';
  try {
    const db = await openDb();
    await txp(db, STORE_META, 'readwrite', (st) => {
      st.put(cq, META_CQ_KEY);
    });
  } catch {}
  return cq;
}

// ===== Cloud state (N/D + TTL) =====
// meta key format: cloud:{uid} ->
// {
//   cloudFullListenCount:number,
//   lastFullListenAt:number,
//   cloudAddedAt:number,
//   cloudExpiresAt:number,
//   cloud:boolean
// }
function cloudKey(uid) {
  const u = String(uid || '').trim();
  return u ? `cloud:${u}` : '';
}

export async function getCloudStats(uid) {
  const key = cloudKey(uid);
  if (!key) {
    return {
      cloudFullListenCount: 0,
      lastFullListenAt: 0,
      cloudAddedAt: 0,
      cloudExpiresAt: 0,
      cloud: false
    };
  }

  try {
    const db = await openDb();
    const v = await txp(db, STORE_META, 'readonly', (st) => {
      return new Promise((resolve, reject) => {
        const r = st.get(key);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => reject(r.error);
      });
    });

    const c = Number(v?.cloudFullListenCount || 0);
    const last = Number(v?.lastFullListenAt || 0);
    const added = Number(v?.cloudAddedAt || 0);
    const exp = Number(v?.cloudExpiresAt || 0);
    const cloud = v?.cloud === true;

    return {
      cloudFullListenCount: (Number.isFinite(c) && c > 0) ? Math.floor(c) : 0,
      lastFullListenAt: (Number.isFinite(last) && last > 0) ? Math.floor(last) : 0,
      cloudAddedAt: (Number.isFinite(added) && added > 0) ? Math.floor(added) : 0,
      cloudExpiresAt: (Number.isFinite(exp) && exp > 0) ? Math.floor(exp) : 0,
      cloud
    };
  } catch {
    return {
      cloudFullListenCount: 0,
      lastFullListenAt: 0,
      cloudAddedAt: 0,
      cloudExpiresAt: 0,
      cloud: false
    };
  }
}

export async function setCloudStats(uid, stats) {
  const key = cloudKey(uid);
  if (!key) return false;

  const c = Number(stats?.cloudFullListenCount || 0);
  const last = Number(stats?.lastFullListenAt || 0);
  const added = Number(stats?.cloudAddedAt || 0);
  const exp = Number(stats?.cloudExpiresAt || 0);
  const cloud = stats?.cloud === true;

  const payload = {
    cloudFullListenCount: (Number.isFinite(c) && c > 0) ? Math.floor(c) : 0,
    lastFullListenAt: (Number.isFinite(last) && last > 0) ? Math.floor(last) : 0,
    cloudAddedAt: (Number.isFinite(added) && added > 0) ? Math.floor(added) : 0,
    cloudExpiresAt: (Number.isFinite(exp) && exp > 0) ? Math.floor(exp) : 0,
    cloud
  };

  try {
    const db = await openDb();
    await txp(db, STORE_META, 'readwrite', (st) => {
      st.put(payload, key);
    });
    return true;
  } catch {
    return false;
  }
}

export async function clearCloudStats(uid) {
  const key = cloudKey(uid);
  if (!key) return false;

  try {
    const db = await openDb();
    await txp(db, STORE_META, 'readwrite', (st) => {
      st.delete(key);
    });
    return true;
  } catch {
    return false;
  }
}

// meta key format: cloudCandidate:{uid} -> boolean
function cloudCandidateKey(uid) {
  const u = String(uid || '').trim();
  return u ? `cloudCandidate:${u}` : '';
}

export async function getCloudCandidate(uid) {
  const key = cloudCandidateKey(uid);
  if (!key) return false;

  try {
    const db = await openDb();
    const v = await txp(db, STORE_META, 'readonly', (st) => {
      return new Promise((resolve, reject) => {
        const r = st.get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    });
    return v === true;
  } catch {
    return false;
  }
}

export async function setCloudCandidate(uid, flag) {
  const key = cloudCandidateKey(uid);
  if (!key) return false;

  try {
    const db = await openDb();
    await txp(db, STORE_META, 'readwrite', (st) => {
      st.put(!!flag, key);
    });
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
    await txp(db, STORE_META, 'readwrite', (st) => {
      st.delete(key);
    });
    return true;
  } catch {
    return false;
  }
}

export async function bytesByQuality(uid) {
  const u = String(uid || '').trim();
  if (!u) return { hi: 0, lo: 0 };

  const MB = 1024 * 1024;

  const normalize = (v) => {
    const n = Number(v || 0);
    if (!Number.isFinite(n) || n <= 0) return 0;

    // ✅ Миграция legacy: если раньше сюда писали "MB" (например 8.5),
    // то значение будет < 1MB. Конвертируем MB → bytes.
    if (n > 0 && n < MB) {
      return Math.floor(n * MB);
    }

    return Math.floor(n);
  };

  try {
    const db = await openDb();
    const row = await txp(db, STORE_BYTES, 'readonly', (st) => {
      return new Promise((resolve, reject) => {
        const r = st.get(u);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => reject(r.error);
      });
    });

    const hi = normalize(row?.hi);
    const lo = normalize(row?.lo);

    // ✅ Если была миграция MB→bytes — перезапишем ряд, чтобы дальше не пересчитывать.
    if (row && ((hi && hi !== row.hi) || (lo && lo !== row.lo))) {
      try {
        const db2 = await openDb();
        await txp(db2, STORE_BYTES, 'readwrite', (st) => {
          st.put({ hi, lo }, u);
        });
      } catch {}
    }

    return { hi, lo };
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
    await txp(db, STORE_BYTES, 'readwrite', (st) => {
      return new Promise((resolve, reject) => {
        const getReq = st.get(u);

        getReq.onsuccess = () => {
          try {
            const cur = getReq.result || { hi: 0, lo: 0 };
            const next = { hi: Number(cur.hi || 0), lo: Number(cur.lo || 0) };
            next[q] = safe;
            const putReq = st.put(next, u);
            putReq.onsuccess = () => resolve(true);
            putReq.onerror = () => reject(putReq.error);
          } catch (e) {
            reject(e);
          }
        };

        getReq.onerror = () => reject(getReq.error);
      });
    });
  } catch {}
}

export async function totalCachedBytes() {
  try {
    const db = await openDb();
    const sum = await txp(db, STORE_BYTES, 'readonly', (st) => {
      return new Promise((resolve, reject) => {
        let total = 0;
        const req = st.openCursor();

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

        req.onerror = () => reject(req.error);
      });
    });

    return Number.isFinite(sum) && sum > 0 ? Math.floor(sum) : 0;
  } catch {
    return 0;
  }
}

export async function deleteTrackCache(uid) {
  const u = String(uid || '').trim();
  if (!u) return;

  try {
    const db = await openDb();
    await txp(db, STORE_BYTES, 'readwrite', (st) => {
      st.delete(u);
    });
  } catch {}

  // ✅ Также удаляем blobs (если есть)
  try {
    const db = await openDb();
    await txp(db, STORE_BLOBS, 'readwrite', (st) => {
      st.delete(`${u}:hi`);
      st.delete(`${u}:lo`);
    });
  } catch {}
}

export async function clearAllStores({ keepCacheQuality = true } = {}) {
  // Полная очистка bytes + blobs + cloud meta.
  // По умолчанию cacheQuality сохраняем (чтобы CQ не “сбрасывался” неожиданно).
  try {
    const db = await openDb();

    // 1) bytes — clear
    await txp(db, STORE_BYTES, 'readwrite', (st) => {
      st.clear();
    });

    // 2) blobs — clear
    await txp(db, STORE_BLOBS, 'readwrite', (st) => {
      st.clear();
    });

    // 3) meta — удаляем cloud:* и cloudCandidate:* (и при желании cacheQuality)
    await txp(db, STORE_META, 'readwrite', (st) => {
      return new Promise((resolve, reject) => {
        const req = st.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) {
            resolve(true);
            return;
          }
          const k = String(cursor.key || '');
          const isCloud = k.startsWith('cloud:') || k.startsWith('cloudCandidate:');
          const isCQ = k === 'cacheQuality';
          if (isCloud || (!keepCacheQuality && isCQ)) {
            try { cursor.delete(); } catch {}
          }
          cursor.continue();
        };
        req.onerror = () => reject(req.error);
      });
    });

    return true;
  } catch {
    return false;
  }
}

export async function getAudioBlob(uid, quality) {
  const u = String(uid || '').trim();
  if (!u) return null;

  const q = (String(quality || '').toLowerCase() === 'lo') ? 'lo' : 'hi';
  const key = `${u}:${q}`;

  try {
    const db = await openDb();
    const blob = await txp(db, STORE_BLOBS, 'readonly', (st) => {
      return new Promise((resolve, reject) => {
        const r = st.get(key);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => reject(r.error);
      });
    });
    return blob || null;
  } catch {
    return null;
  }
}

export async function setAudioBlob(uid, quality, blob) {
  const u = String(uid || '').trim();
  if (!u) return false;

  const q = (String(quality || '').toLowerCase() === 'lo') ? 'lo' : 'hi';
  const key = `${u}:${q}`;

  if (!(blob instanceof Blob)) return false;

  try {
    const db = await openDb();
    await txp(db, STORE_BLOBS, 'readwrite', (st) => {
      st.put(blob, key);
    });
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
    await txp(db, STORE_BLOBS, 'readwrite', (st) => {
      keys.forEach(k => st.delete(k));
    });
  } catch {}
}
