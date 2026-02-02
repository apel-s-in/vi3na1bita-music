// scripts/offline/cache-db.js
// IndexedDB wrapper (Optimized v2.0): Boilerplate removed, Logic preserved.

const DB_NAME = 'OfflineCacheDB';
const DB_VERSION = 5;

const S = {
  AUDIO: 'audioBlobs',
  BYTES: 'trackBytes',
  META: 'cacheMeta',
  CLOUD: 'cloudStats',
  CAND: 'cloudCandidate',
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
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
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

// --- Audio & Bytes ---
const ak = (u, q) => `${u}:${q}`; // key format

export const getAudioBlob = (uid, q) => get(S.AUDIO, ak(uid, q));
export const setAudioBlob = (uid, q, b) => set(S.AUDIO, ak(uid, q), b);
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

// --- Meta & Cloud ---
export const getCacheQuality = async () => ((await get(S.META, 'cacheQuality')) === 'lo' ? 'lo' : 'hi');
export const setCacheQuality = (q) => set(S.META, 'cacheQuality', q === 'lo' ? 'lo' : 'hi');

export const getCloudStats = (uid) => get(S.CLOUD, uid);
export const setCloudStats = (uid, d) => set(S.CLOUD, uid, d);
export const clearCloudStats = (uid) => del(S.CLOUD, uid);

export const getCloudCandidate = async (uid) => !!(await get(S.CAND, uid));
export const setCloudCandidate = (uid, v) => set(S.CAND, uid, !!v);
export const clearCloudCandidate = (uid) => del(S.CAND, uid);

// --- Global Stats (Complex) ---
const safeUid = (v) => String(v || '').trim() || null;

export const updateGlobalStats = async (uid, dSec, dFull) => {
  const u = safeUid(uid); if (!u) return false;
  const db = await openDb();
  const tx = db.transaction(S.GLOB, 'readwrite');
  const st = tx.objectStore(S.GLOB);

  const upd = async (k, fn, def) => {
    const v = (await req(st.get(k))) || def;
    await req(st.put(fn(v), k));
  };

  const now = Date.now(), sec = Math.max(0, Number(dSec)||0), full = Math.max(0, Number(dFull)||0);
  
  await Promise.all([
    upd(`t:${u}`, p => ({ seconds: (Number(p.seconds)||0)+sec, fullListens: (Number(p.fullListens)||0)+full, lastListenAt: now }), { seconds:0, fullListens:0 }),
    upd('total', p => ({ totalSeconds: (Number(p.totalSeconds)||0)+sec }), { totalSeconds: 0 }),
    upd('global', p => ({ totalListenSec: (Number(p.totalListenSec)||0)+sec, totalFullListens: (Number(p.totalFullListens)||0)+full }), { totalListenSec:0, totalFullListens:0 })
  ]);
  return true;
};

export const getGlobalStatsAndTotal = async () => {
  const db = await openDb();
  const st = db.transaction(S.GLOB).objectStore(S.GLOB);
  const [leg, tot, keys] = await Promise.all([req(st.get('global')), req(st.get('total')), req(st.getAllKeys())]);
  
  const tracks = [];
  for (const k of keys) {
    if (String(k).startsWith('t:')) {
      const rec = await req(st.get(k));
      tracks.push({ uid: k.slice(2), seconds: Number(rec?.seconds)||0, fullListens: Number(rec?.fullListens)||0, lastListenAt: Number(rec?.lastListenAt)||0 });
    }
  }
  return {
    totalBytes: await totalCachedBytes(),
    totalListenSec: Number(leg?.totalListenSec)||0, totalFullListens: Number(leg?.totalFullListens)||0, // legacy
    totalSeconds: Number(tot?.totalSeconds)||0, tracks // new
  };
};

// --- Download Meta (Updates) ---
const dk = (u, q) => `${String(u||'').trim()}:${String(q||'').toLowerCase()==='lo'?'lo':'hi'}`;
export const getDownloadMeta = (uid, q) => get(S.DL, dk(uid, q));
export const setDownloadMeta = (uid, q, m) => set(S.DL, dk(uid, q), m||null);
export const deleteDownloadMeta = (uid, q) => del(S.DL, dk(uid, q));

// --- Local Meta & Eviction ---
export const getLocalMeta = (uid) => get(S.LOC, String(uid||'').trim());
export const setLocalMeta = (uid, m) => set(S.LOC, String(uid||'').trim(), m||null);

const modLocal = async (uid, fn) => {
  const u = String(uid||'').trim(); if(!u) return;
  const prev = (await getLocalMeta(u)) || {};
  await setLocalMeta(u, fn(prev));
};

export const touchLocalAccess = (uid) => modLocal(uid, p => ({ ...p, lastAccessAt: Date.now() }));
export const markLocalCloud = (uid) => modLocal(uid, p => ({ ...p, kind: 'cloud', transientGroup: null, lastAccessAt: Date.now() }));
export const markLocalTransient = (uid, g='window') => modLocal(uid, p => ({ ...p, kind: (p.kind==='cloud'?'cloud':'transient'), transientGroup: (p.kind!=='cloud'?(g==='extra'?'extra':'window'):null), lastAccessAt: Date.now() }));

export const computeCacheBreakdown = async (pinned = new Set()) => {
  const db = await openDb();
  const keys = await req(db.transaction(S.BYTES).objectStore(S.BYTES).getAllKeys());
  const uids = new Set(keys.map(k => String(k).split(':')[0]).filter(Boolean));
  
  const res = { pinnedBytes:0, cloudBytes:0, transientWindowBytes:0, transientExtraBytes:0, transientUnknownBytes:0, audioTotalBytes:0 };

  for (const u of uids) {
    const bytes = (await getBytes(u, 'hi')) + (await getBytes(u, 'lo'));
    res.audioTotalBytes += bytes;
    if (pinned.has(u)) { res.pinnedBytes += bytes; continue; }

    const m = await getLocalMeta(u);
    const k = m?.kind || 'unknown', g = m?.transientGroup;
    if (k === 'cloud') res.cloudBytes += bytes;
    else if (k === 'transient') res[g === 'extra' ? 'transientExtraBytes' : (g === 'window' ? 'transientWindowBytes' : 'transientUnknownBytes')] += bytes;
    else res.transientUnknownBytes += bytes;
  }
  return res;
};

export const getEvictionCandidates = async (pinned = new Set()) => {
  const db = await openDb();
  const keys = await req(db.transaction(S.BYTES).objectStore(S.BYTES).getAllKeys());
  const uids = new Set(keys.map(k => String(k).split(':')[0]).filter(x => x && !pinned.has(x)));
  
  const list = [];
  for (const u of uids) {
    const bytes = (await getBytes(u, 'hi')) + (await getBytes(u, 'lo'));
    const m = await getLocalMeta(u);
    const k = m?.kind, g = m?.transientGroup, acc = Number(m?.lastAccessAt)||0;
    // weight: 0=extra, 1=window, 2=unknown, 3=cloud
    let w = 2;
    if (k === 'cloud') w = 3;
    else if (k === 'transient') w = (g === 'extra' ? 0 : (g === 'window' ? 1 : 2));
    
    list.push({ uid: u, bytes, lastAccessAt: acc, weight: w });
  }
  return list.sort((a, b) => (a.weight - b.weight) || (a.lastAccessAt - b.lastAccessAt));
};

export const getExpiredCloudUids = async () => {
  const db = await openDb();
  const st = db.transaction(S.CLOUD).objectStore(S.CLOUD);
  const [stats, keys] = await Promise.all([req(st.getAll()), req(st.getAllKeys())]);
  const now = Date.now(), exp = [];
  keys.forEach((k, i) => { if (stats[i]?.cloud && stats[i].cloudExpiresAt < now) exp.push(k); });
  return exp;
};

// --- Maintenance ---
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

export const clearAllStores = async (opts = {}) => {
  const cq = opts.keepCacheQuality ? await getCacheQuality() : null;
  const db = await openDb();
  const names = [S.AUDIO, S.BYTES, S.CLOUD, S.CAND, S.DL, S.LOC];
  const tx = db.transaction(names, 'readwrite');
  names.forEach(n => tx.objectStore(n).clear());
  await new Promise(r => { tx.oncomplete = () => r(true); });
  if (cq) await setCacheQuality(cq);
  return true;
};
