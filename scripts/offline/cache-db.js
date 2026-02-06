/**
 * cache-db.js — IndexedDB-обёртка для офлайн-кэша.
 *
 * Хранилища:
 *   audio   — Blob аудио-файлов   key = "uid:quality"
 *   meta    — JSON-мета треков     key = uid
 *   globals — Глобальные настройки key = string
 */

const DB_NAME = 'offlineCache';
const DB_VERSION = 2;

let _db = null;

export async function openDB() {
  if (_db) return _db;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('audio')) {
        db.createObjectStore('audio');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }
      if (!db.objectStoreNames.contains('globals')) {
        db.createObjectStore('globals');
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = (e) => {
      console.error('[CacheDB] Open failed:', e.target.error);
      reject(e.target.error);
    };
  });
}

/* ═══════ Generic helpers ═══════ */

function tx(storeName, mode = 'readonly') {
  const t = _db.transaction(storeName, mode);
  return t.objectStore(storeName);
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ═══════ Audio blobs ═══════ */

function audioKey(uid, quality) {
  return `${uid}:${quality || 'hi'}`;
}

export async function setAudioBlob(uid, quality, blob) {
  await openDB();
  return reqP(tx('audio', 'readwrite').put(blob, audioKey(uid, quality)));
}

export async function getAudioBlob(uid, quality) {
  await openDB();
  const b = await reqP(tx('audio', 'readonly').get(audioKey(uid, quality)));
  return b || null;
}

/**
 * Пробуем получить blob нужного качества, если нет — пробуем другое.
 * Возвращает { blob, quality } | null
 */
export async function getAudioBlobAny(uid, preferredQuality) {
  await openDB();
  const pq = preferredQuality || 'hi';
  const altQ = pq === 'hi' ? 'lo' : 'hi';

  let blob = await reqP(tx('audio', 'readonly').get(audioKey(uid, pq)));
  if (blob) return { blob, quality: pq };

  blob = await reqP(tx('audio', 'readonly').get(audioKey(uid, altQ)));
  if (blob) return { blob, quality: altQ };

  return null;
}

export async function deleteAudio(uid, quality) {
  await openDB();
  return reqP(tx('audio', 'readwrite').delete(audioKey(uid, quality)));
}

export async function deleteTrackCache(uid) {
  await openDB();
  const store = tx('audio', 'readwrite');
  await reqP(store.delete(audioKey(uid, 'hi')));
  await reqP(store.delete(audioKey(uid, 'lo')));
}

/* ═══════ Track meta ═══════ */

export async function setTrackMeta(uid, data) {
  await openDB();
  return reqP(tx('meta', 'readwrite').put(data, uid));
}

export async function getTrackMeta(uid) {
  await openDB();
  return (await reqP(tx('meta', 'readonly').get(uid))) || null;
}

export async function deleteTrackMeta(uid) {
  await openDB();
  return reqP(tx('meta', 'readwrite').delete(uid));
}

export async function getAllTrackMetas() {
  await openDB();
  const store = tx('meta', 'readonly');
  const keys = await reqP(store.getAllKeys());
  const vals = await reqP(store.getAll());
  return vals.map((v, i) => ({ ...v, uid: v.uid || keys[i] }));
}

/* ═══════ Globals ═══════ */

export async function setGlobal(key, val) {
  await openDB();
  return reqP(tx('globals', 'readwrite').put(val, key));
}

export async function getGlobal(key) {
  await openDB();
  return (await reqP(tx('globals', 'readonly').get(key))) ?? null;
}

/* ═══════ Storage estimate ═══════ */

export async function estimateUsage() {
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      return {
        usage: est.usage || 0,
        used: est.usage || 0,
        quota: est.quota || 0,
        free: (est.quota || 0) - (est.usage || 0)
      };
    }
  } catch {}
  return { usage: 0, used: 0, quota: 0, free: 0 };
}
