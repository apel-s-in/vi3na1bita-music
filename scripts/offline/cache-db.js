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

export async function bytesByQuality(uid) {
  const u = String(uid || '').trim();
  if (!u) return { hi: 0, lo: 0 };

  try {
    const db = await openDb();
    const row = await txp(db, STORE_BYTES, 'readonly', (st) => {
      return new Promise((resolve, reject) => {
        const r = st.get(u);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => reject(r.error);
      });
    });

    const hi = Number(row?.hi || 0);
    const lo = Number(row?.lo || 0);

    return {
      hi: Number.isFinite(hi) && hi > 0 ? hi : 0,
      lo: Number.isFinite(lo) && lo > 0 ? lo : 0
    };
  } catch {
    return { hi: 0, lo: 0 };
  }
}

export async function setBytes(uid, quality, bytes) {
  const u = String(uid || '').trim();
  if (!u) return;

  const q = (String(quality || '').toLowerCase() === 'lo') ? 'lo' : 'hi';
  const b = Number(bytes || 0);
  const safe = Number.isFinite(b) && b > 0 ? b : 0;

  try {
    const db = await openDb();
    await txp(db, STORE_BYTES, 'readwrite', (st) => {
      const getReq = st.get(u);

      getReq.onsuccess = () => {
        const cur = getReq.result || { hi: 0, lo: 0 };
        const next = { hi: Number(cur.hi || 0), lo: Number(cur.lo || 0) };
        next[q] = safe;
        st.put(next, u);
      };
    });
  } catch {}
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
