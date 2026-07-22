/** cache-db.js — IndexedDB-хранилище для offline-кэша. Stores: 'audio', 'trackMeta', 'global'. Optimized: Fixed OOM memory leak in blob checks, drastically reduced boilerplate. */
const DB_NAME = 'offlineCache', DB_VERSION = 2; let _db = null;
export const openDB = () => _db ? Promise.resolve(_db) : window.Utils.func.memoAsyncOnce('offline:cache-db:open', () => new Promise((res, rej) => { const req = indexedDB.open(DB_NAME, DB_VERSION); req.onupgradeneeded = e => { const db = e.target.result; if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: ['uid', 'quality'] }); const ms = db.objectStoreNames.contains('trackMeta') ? e.target.transaction.objectStore('trackMeta') : db.createObjectStore('trackMeta', { keyPath: 'uid' }); if (!ms.indexNames.contains('type')) ms.createIndex('type', 'type', { unique: false }); if (!ms.indexNames.contains('cloudExpiresAt')) ms.createIndex('cloudExpiresAt', 'cloudExpiresAt', { unique: false }); if (!db.objectStoreNames.contains('global')) db.createObjectStore('global', { keyPath: 'key' }); }; req.onsuccess = () => res(_db = req.result); req.onerror = () => rej(req.error); }));
const db = () => { if (!_db) throw new Error('cache-db not opened.'); return _db; };
const read = (s, fn) => new Promise((res, rej) => { const r = fn(db().transaction(s, 'readonly').objectStore(s)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const write = (s, fn) => new Promise((res, rej) => { const tx = db().transaction(s, 'readwrite'); fn(tx.objectStore(s)); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); });
export const setAudioBlob = (uid, q, blob) => write('audio', s => s.put({ uid, quality: String(q) === 'lo' ? 'lo' : 'hi', blob }));
export const getAudioBlob = async (uid, q) => (await read('audio', s => s.get([uid, q])))?.blob || null;
export const deleteAudio = uid => write('audio', s => { s.delete([uid, 'hi']); s.delete([uid, 'lo']); });
export const deleteAudioVariant = (uid, q) => write('audio', s => s.delete([uid, q]));
export const hasAudioForUid = async uid =>
  !!(await read('audio', store =>
    store.count([uid, 'hi'])
  )) ||
  !!(await read('audio', store =>
    store.count([uid, 'lo'])
  ));

export const setTrackMeta = (uid, meta) =>
  write('trackMeta', store =>
    store.put({ ...meta, uid })
  );
export const getTrackMeta = uid => read('trackMeta', s => s.get(uid));
export const updateTrackMeta = async (uid, u) => setTrackMeta(uid, { ...((await getTrackMeta(uid)) || {}), ...u, uid });
export const deleteTrackMeta = uid => write('trackMeta', s => s.delete(uid));
export const getAllTrackMetas = async () => (await read('trackMeta', s => s.getAll())) || [];
const ACCOUNT_CACHE_POLICY_FIELDS = Object.freeze([
  'type',
  'cloud',
  'cloudOrigin',
  'cloudFullListenCount',
  'lastFullListenAt',
  'cloudAddedAt',
  'cloudExpiresAt',
  'pinnedAt'
]);

const pickAccountCachePolicy = meta =>
  Object.fromEntries(
    ACCOUNT_CACHE_POLICY_FIELDS
      .filter(key => meta?.[key] != null)
      .map(key => [key, meta[key]])
  );

export const exportAccountCachePolicies = async () =>
  Object.fromEntries(
    (await getAllTrackMetas())
      .filter(meta =>
        meta?.uid &&
        (
          ['pinned', 'cloud'].includes(meta.type) ||
          Number(meta.cloudFullListenCount || 0) > 0
        )
      )
      .map(meta => [
        String(meta.uid),
        pickAccountCachePolicy(meta)
      ])
  );

export const applyAccountCachePolicies = async (
  policies = {}
) => {
  const rows = await getAllTrackMetas();

  for (const meta of rows) {
    const policy = policies?.[meta.uid] || null;
    const transientType = [
      'dynamic',
      'playbackCache'
    ].includes(meta.type)
      ? meta.type
      : (
          meta.cachedComplete
            ? 'playbackCache'
            : null
        );

    const next = { ...meta };

    ACCOUNT_CACHE_POLICY_FIELDS.forEach(key => {
      delete next[key];
    });

    if (policy && typeof policy === 'object') {
      Object.assign(
        next,
        pickAccountCachePolicy(policy)
      );
    } else {
      next.type = transientType;
      next.cloud = false;
      next.cloudFullListenCount = 0;
    }

    await setTrackMeta(meta.uid, next);
  }

  window.dispatchEvent(new CustomEvent(
    'offline:stateChanged',
    {
      detail: {
        reason: 'account_cache_policy_switched'
      }
    }
  ));

  return true;
};
export const deleteTrackCache = async uid => { await deleteAudio(uid); await deleteTrackMeta(uid); };
export const getGlobal = k => read('global', s => s.get(String(k)));
export const setGlobal = (k, v) => write('global', s => s.put({ key: String(k), value: v }));
export const estimateUsage = async () => { try { if (navigator.storage?.estimate) { const e = await navigator.storage.estimate(); return { used: e.usage || 0, quota: e.quota || 0, free: Math.max(0, (e.quota || 0) - (e.usage || 0)) }; } } catch {} return { used: 0, quota: 524288000, free: 524288000 }; };
