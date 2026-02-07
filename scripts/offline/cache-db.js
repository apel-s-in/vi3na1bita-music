/**
 * cache-db.js — IndexedDB-хранилище для offline-кэша.
 * Stores: 'audio', 'trackMeta', 'global'.
 */

const DB_NAME = 'offlineCache';
const DB_VERSION = 2;
let _db = null;
let _dbPending = null;

/* ─── openDB ─── */

export async function openDB() {
  if (_db) return _db;
  if (_dbPending) return _dbPending;

  _dbPending = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const tx = e.target.transaction;

      // Hard reset для чистоты структуры при смене версий
      // Если старые сторы существуют, удаляем их, чтобы создать с правильными keyPath
      if (db.objectStoreNames.contains('audio')) db.deleteObjectStore('audio');
      if (db.objectStoreNames.contains('trackMeta')) db.deleteObjectStore('trackMeta');
      if (db.objectStoreNames.contains('global')) db.deleteObjectStore('global');

      // Создаем заново с гарантированно правильной схемой
      db.createObjectStore('audio', { keyPath: ['uid', 'quality'] });

      const metaStore = db.createObjectStore('trackMeta', { keyPath: 'uid' });
      metaStore.createIndex('type', 'type', { unique: false });
      metaStore.createIndex('cloudExpiresAt', 'cloudExpiresAt', { unique: false });

      db.createObjectStore('global', { keyPath: 'key' });
    };

    req.onsuccess = () => { _db = req.result; _dbPending = null; resolve(_db); };
    req.onerror = () => { _dbPending = null; reject(req.error); };
  });
  return _dbPending;
}

function db() {
  if (!_db) throw new Error('cache-db not opened. Call openDB() first.');
  return _db;
}

/* ─── Audio blob operations ─── */

export async function setAudioBlob(uid, quality, blob) {
  const q = String(quality) === 'lo' ? 'lo' : 'hi';
  const otherQ = q === 'hi' ? 'lo' : 'hi';

  return new Promise((resolve, reject) => {
    const tx = db().transaction('audio', 'readwrite');
    const store = tx.objectStore('audio');

    // ТЗ 1.7 No duplicates rule: итогово держим только один variant.
    // Временная двойная копия допускается только на время перекачки,
    // но у нас нет отдельного temp-store, поэтому фиксируем атомарно в одной транзакции.
    store.put({ uid, quality: q, blob });
    store.delete([uid, otherQ]);

    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAudioBlob(uid, quality) {
  return new Promise((resolve, reject) => {
    const tx = db().transaction('audio', 'readonly');
    const req = tx.objectStore('audio').get([uid, quality]);
    req.onsuccess = () => resolve(req.result?.blob || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAudio(uid) {
  return new Promise((resolve, reject) => {
    const tx = db().transaction('audio', 'readwrite');
    const store = tx.objectStore('audio');
    store.delete([uid, 'hi']);
    store.delete([uid, 'lo']);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteAudioVariant(uid, quality) {
  return new Promise((resolve, reject) => {
    const tx = db().transaction('audio', 'readwrite');
    tx.objectStore('audio').delete([uid, quality]);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function hasAudioForUid(uid) {
  const hi = await getAudioBlob(uid, 'hi');
  if (hi) return true;
  const lo = await getAudioBlob(uid, 'lo');
  return !!lo;
}

/**
 * Возвращает качество имеющегося файла ('hi' | 'lo' | null)
 * Если есть оба (редкий кейс гонки), вернёт 'hi'.
 */
export async function getStoredVariant(uid) {
  const hi = await getAudioBlob(uid, 'hi');
  if (hi) return 'hi';
  const lo = await getAudioBlob(uid, 'lo');
  if (lo) return 'lo';
  return null;
}

/* ─── Track meta operations ─── */

export async function setTrackMeta(uid, meta) {
  return new Promise((resolve, reject) => {
    const tx = db().transaction('trackMeta', 'readwrite');
    tx.objectStore('trackMeta').put({ ...meta, uid });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function getTrackMeta(uid) {
  return new Promise((resolve, reject) => {
    const tx = db().transaction('trackMeta', 'readonly');
    const req = tx.objectStore('trackMeta').get(uid);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function updateTrackMeta(uid, updates) {
  const existing = (await getTrackMeta(uid)) || { uid };
  const merged = { ...existing, ...updates, uid };
  return setTrackMeta(uid, merged);
}

export async function deleteTrackMeta(uid) {
  return new Promise((resolve, reject) => {
    const tx = db().transaction('trackMeta', 'readwrite');
    tx.objectStore('trackMeta').delete(uid);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllTrackMetas() {
  return new Promise((resolve, reject) => {
    const tx = db().transaction('trackMeta', 'readonly');
    const req = tx.objectStore('trackMeta').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/* ─── Convenience ─── */

export async function deleteTrackCache(uid) {
  await deleteAudio(uid);
  await deleteTrackMeta(uid);
}

/* ─── Storage estimate ─── */

export async function estimateUsage() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      return {
        used: est.usage || 0,
        quota: est.quota || 0,
        free: Math.max(0, (est.quota || 0) - (est.usage || 0))
      };
    }
  } catch (e) {}
  // Fallback constant
  return { used: 0, quota: 500 * 1024 * 1024, free: 500 * 1024 * 1024 };
}
