// scripts/offline/cache-db.js
// IndexedDB wrapper v3.1 (Fixes: double counting, pruneTransient)

const DB_NAME = 'OfflineCacheDB';
const DB_VERSION = 6; 

const S = {
  AUDIO: 'audioBlobs',
  BYTES: 'trackBytes',
  META: 'cacheMeta',
  CLOUD: 'cloudStats',
  GLOB: 'globalStats',
  DL: 'downloadMeta',
  LOC: 'trackLocalMeta'
};

let _db = null;

const openDb = () => {
  if (_db) return _db;
  _db = new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      Object.values(S).forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => { _db = null; };
      db.onversionchange = () => { db.close(); _db = null; };
      res(db);
    };
    req.onerror = () => { _db = null; rej(req.error); };
  });
  return _db;
};

export const ensureDbReady = openDb;

// --- Core Helpers ---
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const run = async (store, mode, fn) => {
  const db = await openDb();
  const tx = db.transaction(store, mode);
  return req(fn(tx.objectStore(store)));
};

const get = (s, k) => run(s, 'readonly', st => st.get(k));
const set = (s, k, v) => run(s, 'readwrite', st => st.put(v, k));
const del = (s, k) => run(s, 'readwrite', st => st.delete(k));

// --- Audio & Bytes (NO DUPLICATES RULE) ---
const ak = (u, q) => `${u}:${q}`; 

export const setAudioBlob = async (uid, q, blob) => {
  const db = await openDb();
  const tx = db.transaction([S.AUDIO, S.BYTES], 'readwrite');
  const storeA = tx.objectStore(S.AUDIO);
  const storeB = tx.objectStore(S.BYTES);

  const otherQ = q === 'hi' ? 'lo' : 'hi';
  storeA.delete(ak(uid, otherQ));
  storeB.delete(ak(uid, otherQ));

  storeA.put(blob, ak(uid, q));
  storeB.put(blob.size, ak(uid, q));

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const getAudioBlob = (uid, q) => get(S.AUDIO, ak(uid, q));
export const deleteAudioBlob = (uid, q) => del(S.AUDIO, ak(uid, q));

export const getBytes = async (uid, q) => Number(await get(S.BYTES, ak(uid, q))) || 0;
export const setBytes = (uid, q, b) => set(S.BYTES, ak(uid, q), Number(b) || 0);

export const bytesByQuality = async (uid) => ({ hi: await getBytes(uid, 'hi'), lo: await getBytes(uid, 'lo') });

export const totalCachedBytes = async () => {
  const db = await openDb();
  const keys = await req(db.transaction(S.BYTES).objectStore(S.BYTES).getAllKeys());
  let t = 0;
  for (const k of keys) t += (Number(await get(S.BYTES, k)) || 0);
  return t;
};

// --- Local Meta (Kind) ---
export const getLocalMeta = (uid) => get(S.LOC, String(uid||'').trim());
export const setLocalMeta = (uid, m) => set(S.LOC, String(uid||'').trim(), m||null);

const modLocal = async (uid, fn) => {
  const u = String(uid||'').trim(); if(!u) return;
  const prev = (await getLocalMeta(u)) || {};
  await setLocalMeta(u, fn(prev));
};

export const touchLocalAccess = (uid) => modLocal(uid, p => ({ ...p, lastAccessAt: Date.now() }));
export const markLocalKind = (uid, kind, grp=null) => modLocal(uid, p => ({ ...p, kind, transientGroup: grp, lastAccessAt: Date.now() }));

// --- Cleanup Helpers (Fixed strict 3-track rule) ---
export const deleteTrackCache = async (uid) => {
  const u = String(uid||'').trim(); if(!u) return;
  try { (await import('./track-resolver.js')).revokeObjectUrlsForUid(u); } catch {}
  const db = await openDb();
  const tx = db.transaction([S.AUDIO, S.BYTES, S.DL, S.LOC], 'readwrite');
  const d = (s, k) => tx.objectStore(s).delete(k);
  
  d(S.AUDIO, ak(u, 'hi')); d(S.AUDIO, ak(u, 'lo'));
  d(S.BYTES, ak(u, 'hi')); d(S.BYTES, ak(u, 'lo'));
  d(S.DL, dk(u, 'hi')); d(S.DL, dk(u, 'lo'));
  d(S.LOC, u);
  
  return new Promise(r => { tx.oncomplete = () => r(); });
};

// CRITICAL FIX: Explicit cleanup for window tracks
export const pruneTransientWindowExcept = async (keepUids) => {
  const keep = new Set(keepUids.map(u => String(u).trim()));
  const db = await openDb();
  const keys = await req(db.transaction(S.LOC).objectStore(S.LOC).getAllKeys());
  
  for (const uid of keys) {
    if (keep.has(uid)) continue;
    const m = await getLocalMeta(uid);
    // Only delete if explicitly transient window
    if (m?.kind === 'transient' && m?.transientGroup === 'window') {
        await deleteTrackCache(uid);
    }
  }
};

// --- Stats & Breakdown ---
export const computeCacheBreakdown = async (pinned = new Set()) => {
  const db = await openDb();
  const keys = await req(db.transaction(S.BYTES).objectStore(S.BYTES).getAllKeys());
  const uids = new Set(keys.map(k => String(k).split(':')[0]).filter(Boolean));
  
  const res = { pinnedBytes:0, cloudBytes:0, transientWindowBytes:0, fullOfflineBytes:0, dynamicBytes:0, otherBytes:0, audioTotalBytes:0 };

  for (const u of uids) {
    // FIX: Math.max instead of sum (No Duplicates Rule means only one exists, but safer to take max to avoid weird states)
    const hi = await getBytes(u, 'hi');
    const lo = await getBytes(u, 'lo');
    const bytes = Math.max(hi, lo); 
    
    res.audioTotalBytes += bytes;
    
    if (pinned.has(u)) { res.pinnedBytes += bytes; continue; }

    const m = await getLocalMeta(u);
    const k = m?.kind || 'unknown';
    
    if (k === 'cloud') res.cloudBytes += bytes;
    else if (k === 'dynamic') res.dynamicBytes += bytes;
    else if (k === 'fullOffline') res.fullOfflineBytes += bytes;
    else if (k === 'transient' && m?.transientGroup === 'window') res.transientWindowBytes += bytes;
    else res.otherBytes += bytes;
  }
  return res;
};

// ... (Other getters/setters like getCloudStats, updateGlobalStats remain as is) ...
// Included for completeness:
const dk = (u, q) => `${String(u||'').trim()}:${String(q||'').toLowerCase()==='lo'?'lo':'hi'}`;
export const getDownloadMeta = (uid, q) => get(S.DL, dk(uid, q));
export const setDownloadMeta = (uid, q, m) => set(S.DL, dk(uid, q), m||null);
export const getCloudStats = (uid) => get(S.CLOUD, uid);
export const setCloudStats = (uid, d) => set(S.CLOUD, uid, d);
export const clearCloudStats = (uid) => del(S.CLOUD, uid);
export const getCloudCandidate = async (uid) => !!(await get(S.META, `cand:${uid}`));
export const setCloudCandidate = (uid, v) => set(S.META, `cand:${uid}`, !!v);

export const updateGlobalStats = async (uid, dSec, dFull) => {
  const u = String(uid||'').trim(); if(!u) return;
  const db = await openDb();
  const tx = db.transaction(S.GLOB, 'readwrite');
  const st = tx.objectStore(S.GLOB);
  const upd = async (k, fn, def) => {
    const v = (await req(st.get(k))) || def;
    await req(st.put(fn(v), k));
  };
  const now = Date.now(), sec = Math.max(0, Number(dSec)||0), full = Math.max(0, Number(dFull)||0);
  await Promise.all([
    upd(`t:${u}`, p => ({ seconds:(Number(p.seconds)||0)+sec, fullListens:(Number(p.fullListens)||0)+full, lastListenAt:now }), {seconds:0,fullListens:0}),
    upd('global', p => ({ totalListenSec:(Number(p.totalListenSec)||0)+sec, totalFullListens:(Number(p.totalFullListens)||0)+full }), {totalListenSec:0,totalFullListens:0})
  ]);
};

export const getGlobalStatsAndTotal = async () => {
  const db = await openDb();
  const st = db.transaction(S.GLOB).objectStore(S.GLOB);
  const [glob, keys] = await Promise.all([req(st.get('global')), req(st.getAllKeys())]);
  const tracks = [];
  for (const k of keys) {
    if (String(k).startsWith('t:')) {
      const rec = await req(st.get(k));
      tracks.push({ uid: k.slice(2), seconds: Number(rec?.seconds)||0, fullListens: Number(rec?.fullListens)||0, lastListenAt: Number(rec?.lastListenAt)||0 });
    }
  }
  return { totalSeconds: Number(glob?.totalListenSec)||0, totalFullListens: Number(glob?.totalFullListens)||0, tracks };
};

export const getEvictionCandidates = async (pinned = new Set()) => {
  const db = await openDb();
  const keys = await req(db.transaction(S.BYTES).objectStore(S.BYTES).getAllKeys());
  const uids = new Set(keys.map(k => String(k).split(':')[0]).filter(x => x && !pinned.has(x)));
  const list = [];
  for (const u of uids) {
    const bytes = Math.max(await getBytes(u, 'hi'), await getBytes(u, 'lo'));
    const m = await getLocalMeta(u);
    const k = m?.kind;
    let weight = 0; 
    if (k === 'dynamic') weight = 1;
    if (k === 'cloud' || k === 'fullOffline') weight = 99;
    list.push({ uid: u, bytes, lastAccessAt: Number(m?.lastAccessAt)||0, weight });
  }
  return list.sort((a, b) => (a.weight - b.weight) || (a.lastAccessAt - b.lastAccessAt));
};

export const clearAllStores = async (opts = {}) => {
  const db = await openDb();
  const names = [S.AUDIO, S.BYTES, S.CLOUD, S.DL, S.LOC]; 
  const tx = db.transaction(names, 'readwrite');
  names.forEach(n => tx.objectStore(n).clear());
  return new Promise(r => { tx.oncomplete = () => r(true); });
};
