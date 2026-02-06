/**
 * cache-db.js — IndexedDB хранилище для офлайн-кэша аудио и метаданных.
 *
 * Stores:
 *   "audio"  — Blob аудиофайлов, ключ: "uid:quality"
 *   "meta"   — JSON метаданные треков, ключ: uid
 *   "global" — глобальные счётчики (статистика, версии), ключ: строка-имя
 */

const DB_NAME = 'offlineAudioCache';
const DB_VERSION = 1;

let _dbPromise = null;

/* ───────── Открытие / инициализация БД ───────── */

export function openDB() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('global')) db.createObjectStore('global');
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return _dbPromise;
}

/* ───────── Приватные хелперы ───────── */

function audioKey(uid, quality) {
  return `${uid}:${quality}`;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ───────── Audio store (Blob) ───────── */

export async function setAudioBlob(uid, quality, blob) {
  const db = await openDB();
  const ak = audioKey(uid, quality);
  const otherQ = quality === 'high' ? 'low' : 'high';
  const otherAk = audioKey(uid, otherQ);

  return new Promise((resolve, reject) => {
    const t = db.transaction('audio', 'readwrite');
    const store = t.objectStore('audio');
    store.delete(otherAk);
    store.put(blob, ak);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function getAudioBlob(uid, quality) {
  const db = await openDB();
  return reqToPromise(tx(db, 'audio', 'readonly').get(audioKey(uid, quality)));
}

export async function deleteAudio(uid) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('audio', 'readwrite');
    const store = t.objectStore('audio');
    store.delete(audioKey(uid, 'high'));
    store.delete(audioKey(uid, 'low'));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/* ───────── Meta store ───────── */

export async function setTrackMeta(uid, metaObj) {
  const db = await openDB();
  return reqToPromise(
    tx(db, 'meta', 'readwrite').put({ ...metaObj, uid, ts: Date.now() }, uid)
  );
}

export async function getTrackMeta(uid) {
  const db = await openDB();
  return reqToPromise(tx(db, 'meta', 'readonly').get(uid));
}

export async function deleteTrackMeta(uid) {
  const db = await openDB();
  return reqToPromise(tx(db, 'meta', 'readwrite').delete(uid));
}

export async function getAllTrackMetas() {
  const db = await openDB();
  return reqToPromise(tx(db, 'meta', 'readonly').getAll());
}

/* ───────── Ключи audio store ───────── */

export async function getAllKeys() {
  const db = await openDB();
  return reqToPromise(tx(db, 'audio', 'readonly').getAllKeys());
}

/* ───────── Cloud-статистика ───────── */

export async function getCloudStats() {
  const metas = await getAllTrackMetas();
  const now = Date.now();
  let active = 0;
  let expired = 0;
  const expiredUids = [];

  for (const m of metas) {
    if (m.type !== 'cloud') continue;
    if (m.ttl && m.ts && (now - m.ts > m.ttl)) {
      expired++;
      expiredUids.push(m.uid);
    } else {
      active++;
    }
  }

  return { total: active + expired, active, expired, expiredUids };
}

export async function setCloudStats(stats) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('global', 'readwrite');
    t.objectStore('global').put(stats, 'cloud-stats');
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/* ───────── Global store (статистика, настройки) ───────── */

export async function getGlobal(key) {
  const db = await openDB();
  return reqToPromise(tx(db, 'global', 'readonly').get(key));
}

export async function setGlobal(key, value) {
  const db = await openDB();
  return reqToPromise(tx(db, 'global', 'readwrite').put(value, key));
}

export async function updateGlobalStats(uid, deltaSec, deltaFull) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const t = db.transaction('global', 'readwrite');
    const store = t.objectStore('global');

    const perReq = store.get(`stats:${uid}`);
    const totalReq = store.get('stats:total');

    perReq.onsuccess = () => {
      const cur = perReq.result || { seconds: 0, fullPlays: 0 };
      cur.seconds += deltaSec;
      cur.fullPlays += deltaFull;
      cur.lastPlayed = Date.now();
      store.put(cur, `stats:${uid}`);
    };

    totalReq.onsuccess = () => {
      const tot = totalReq.result || { seconds: 0, fullPlays: 0 };
      tot.seconds += deltaSec;
      tot.fullPlays += deltaFull;
      store.put(tot, 'stats:total');
    };

    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/* ───────── Оценка использования хранилища ───────── */

export async function estimateUsage() {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    const used = est.usage || 0;
    const quota = est.quota || 0;
    return {
      usage: used,
      used: used,       // alias для offline-modal.js
      quota: quota,
      free: quota - used
    };
  }
  return { usage: 0, used: 0, quota: 0, free: 0 };
}

/* ───────── Compatibility layer ───────── */

export async function bytesByQuality(uid) {
  const u = String(uid || '').trim();
  if (!u) return { hi: 0, lo: 0 };
  const [hi, lo] = await Promise.all([
    getAudioBlob(u, 'high'),
    getAudioBlob(u, 'low')
  ]);
  return {
    hi: hi ? (hi.size || 0) : 0,
    lo: lo ? (lo.size || 0) : 0
  };
}

export async function deleteTrackCache(uid) {
  const u = String(uid || '').trim();
  if (!u) return false;
  await deleteAudio(u);
  await deleteTrackMeta(u);
  return true;
}

export async function clearCloudStats(uid) {
  const u = String(uid || '').trim();
  if (!u) return false;
  const meta = await getTrackMeta(u);
  if (meta && meta.type === 'cloud') {
    await deleteTrackMeta(u);
    return true;
  }
  return false;
}

export async function getLocalMeta(uid) {
  return getTrackMeta(String(uid || '').trim());
}

export async function touchLocalAccess(uid) {
  const u = String(uid || '').trim();
  if (!u) return;
  const meta = await getTrackMeta(u);
  if (!meta) return;
  await setTrackMeta(u, { ...meta, lastAccessAt: Date.now() });
}
