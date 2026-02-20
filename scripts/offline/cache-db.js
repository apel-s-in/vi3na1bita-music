/**
 * cache-db.js — IndexedDB-хранилище для offline-кэша.
 * Stores: 'audio', 'trackMeta', 'global'.
 * Optimized: Fixed OOM memory leak in blob checks, drastically reduced boilerplate.
 */

const DB_NAME = 'offlineCache';
const DB_VERSION = 2;
let _db = null, _dbPending = null;

export const openDB = () => {
  if (_db) return Promise.resolve(_db);
  if (_dbPending) return _dbPending;
  return (_dbPending = new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: ['uid', 'quality'] });
      
      let metaStore = db.objectStoreNames.contains('trackMeta') 
        ? e.target.transaction.objectStore('trackMeta') 
        : db.createObjectStore('trackMeta', { keyPath: 'uid' });
        
      if (!metaStore.indexNames.contains('type')) metaStore.createIndex('type', 'type', { unique: false });
      if (!metaStore.indexNames.contains('cloudExpiresAt')) metaStore.createIndex('cloudExpiresAt', 'cloudExpiresAt', { unique: false });
      
      if (!db.objectStoreNames.contains('global')) db.createObjectStore('global', { keyPath: 'key' });
    };
    req.onsuccess = () => { _db = req.result; _dbPending = null; res(_db); };
    req.onerror = () => { _dbPending = null; rej(req.error); };
  }));
};

const db = () => { if (!_db) throw new Error('cache-db not opened. Call openDB() first.'); return _db; };

// Универсальные хелперы транзакций
const read = (store, fn) => new Promise((res, rej) => {
  const r = fn(db().transaction(store, 'readonly').objectStore(store));
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});

const write = (store, fn) => new Promise((res, rej) => {
  const tx = db().transaction(store, 'readwrite');
  fn(tx.objectStore(store));
  tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error);
});

/* ─── Audio blob operations ─── */
export const setAudioBlob = (uid, q, blob) => write('audio', s => s.put({ uid, quality: String(q) === 'lo' ? 'lo' : 'hi', blob }));
export const getAudioBlob = async (uid, q) => (await read('audio', s => s.get([uid, q])))?.blob || null;
export const deleteAudio = uid => write('audio', s => { s.delete([uid, 'hi']); s.delete([uid, 'lo']); });
export const deleteAudioVariant = (uid, q) => write('audio', s => s.delete([uid, q]));

// CRITICAL FIX: Используем .count() вместо .get() для избежания утечек RAM (OOM) при проверке кэша
export const hasAudioForUid = async uid => !!(await read('audio', s => s.count([uid, 'hi']))) || !!(await read('audio', s => s.count([uid, 'lo'])));
export const getStoredVariant = async uid => (await read('audio', s => s.count([uid, 'hi']))) ? 'hi' : ((await read('audio', s => s.count([uid, 'lo']))) ? 'lo' : null);

/* ─── Track meta operations ─── */
export const setTrackMeta = (uid, meta) => write('trackMeta', s => s.put({ ...meta, uid }));
export const getTrackMeta = uid => read('trackMeta', s => s.get(uid));
export const updateTrackMeta = async (uid, updates) => setTrackMeta(uid, { ...((await getTrackMeta(uid)) || {}), ...updates, uid });
export const deleteTrackMeta = uid => write('trackMeta', s => s.delete(uid));
export const getAllTrackMetas = async () => (await read('trackMeta', s => s.getAll())) || [];

/* ─── Convenience & Storage ─── */
export const deleteTrackCache = async uid => { await deleteAudio(uid); await deleteTrackMeta(uid); };

export const estimateUsage = async () => {
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      return { used: e.usage || 0, quota: e.quota || 0, free: Math.max(0, (e.quota || 0) - (e.usage || 0)) };
    }
  } catch {}
  return { used: 0, quota: 500 * 1048576, free: 500 * 1048576 }; // Fallback 500MB
};
