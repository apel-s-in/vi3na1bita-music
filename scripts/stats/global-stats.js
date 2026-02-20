/**
 * global-stats.js — Самодостаточный модуль глобальной статистики.
 * Optimized: DRY IndexedDB boilerplate removed.
 *
 * Полностью независим от OfflineManager, Pinned/Cloud.
 * Хранит данные в отдельном IndexedDB store 'globalStats'.
 * Никогда не сбрасывается.
 */

let _db = null, _dbPending = null, _ready = false;
let _tickBatch = { uid: null, sec: 0, timer: null };

const openDB = () => {
  if (_db) return Promise.resolve(_db);
  if (_dbPending) return _dbPending;
  return (_dbPending = new Promise((res, rej) => {
    const req = indexedDB.open('globalStatsDB', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'uid' });
      if (!db.objectStoreNames.contains('aggregate')) db.createObjectStore('aggregate', { keyPath: 'key' });
    };
    req.onsuccess = () => { _db = req.result; _dbPending = null; res(_db); };
    req.onerror = () => { _dbPending = null; console.warn('[GlobalStats] DB error:', req.error); rej(req.error); };
  }));
};

const db = () => { if (!_db) throw new Error('[GlobalStats] DB not opened'); return _db; };

const read = (store, fn) => new Promise((res, rej) => {
  const r = fn(db().transaction(store, 'readonly').objectStore(store));
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});

const write = (store, fn) => new Promise((res, rej) => {
  const tx = db().transaction(store, 'readwrite');
  fn(tx.objectStore(store));
  tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error);
});

/* ─── Helpers ─── */
const getTrackStats = uid => read('tracks', s => s.get(uid));
const putTrackStats = data => write('tracks', s => s.put(data));
const getAllTrackStats = () => read('tracks', s => s.getAll());
const getAggregate = async key => (await read('aggregate', s => s.get(key)))?.value ?? 0;
const putAggregate = (key, value) => write('aggregate', s => s.put({ key, value }));

const _defaultTrackStats = uid => ({ uid, globalFullListenCount: 0, globalListenSeconds: 0, lastListenAt: null, firstListenAt: null });

async function _flushTickBatch() {
  if (!_tickBatch.uid || _tickBatch.sec <= 0 || !_ready) return;
  const { uid, sec } = _tickBatch;
  _tickBatch.sec = 0;
  if (_tickBatch.timer) { clearTimeout(_tickBatch.timer); _tickBatch.timer = null; }

  try {
    const stats = (await getTrackStats(uid)) || _defaultTrackStats(uid);
    stats.globalListenSeconds = (stats.globalListenSeconds || 0) + sec;
    stats.lastListenAt = Date.now();
    await putTrackStats(stats);
    await putAggregate('globalTotalListenSeconds', (await getAggregate('globalTotalListenSeconds')) + sec);
  } catch (e) { console.warn('[GlobalStats] flush error:', e); }
}

function _emptyStats() {
  return { totalListens: 0, totalSeconds: 0, totalDays: 0, totalHours: 0, totalMinutes: 0, tracksWithStats: 0, topTracks: [], allTracks: [] };
}

/* ═══════ Public API ═══════ */
const GlobalStatsManager = {
  async initialize() {
    if (_ready) return;
    try { await openDB(); _ready = true; console.log('[GlobalStats] Initialized'); } 
    catch (e) { console.error('[GlobalStats] Init failed:', e); }
  },

  async recordTick(uid, { deltaSec = 1 } = {}) {
    if (!uid || !_ready) return;
    if (_tickBatch.uid && _tickBatch.uid !== uid && _tickBatch.sec > 0) await _flushTickBatch();
    _tickBatch.uid = uid;
    _tickBatch.sec += deltaSec;
    if (!_tickBatch.timer) _tickBatch.timer = setTimeout(_flushTickBatch, 30000);
  },

  async registerFullListen(uid, { duration, position } = {}) {
    if (!uid || !_ready) return;
    if ((Number(duration) || 0) <= 0 || ((Number(position) || 0) / duration) < 0.9) return;
    if (_tickBatch.uid === uid && _tickBatch.sec > 0) await _flushTickBatch();

    try {
      const stats = (await getTrackStats(uid)) || _defaultTrackStats(uid);
      stats.globalFullListenCount = (stats.globalFullListenCount || 0) + 1;
      stats.lastListenAt = Date.now();
      if (!stats.firstListenAt) stats.firstListenAt = Date.now();
      await putTrackStats(stats);
    } catch (e) { console.warn('[GlobalStats] fullListen error:', e); }
  },

  async getTrackStats(uid) {
    if (!_ready) return _defaultTrackStats(uid);
    try { return (await getTrackStats(uid)) || _defaultTrackStats(uid); } catch { return _defaultTrackStats(uid); }
  },

  async getStatistics() {
    if (!_ready) return _emptyStats();
    try {
      const allTracks = await getAllTrackStats();
      const totalSeconds = await getAggregate('globalTotalListenSeconds');
      let totalListens = 0;
      const perTrack = [];

      for (const t of allTracks) {
        totalListens += (t.globalFullListenCount || 0);
        if ((t.globalFullListenCount || 0) >= 3) {
          perTrack.push({
            uid: t.uid,
            title: window.TrackRegistry?.getTrackByUid?.(t.uid)?.title || t.uid,
            listens: t.globalFullListenCount,
            seconds: t.globalListenSeconds || 0,
            lastListenAt: t.lastListenAt,
            firstListenAt: t.firstListenAt
          });
        }
      }

      perTrack.sort((a, b) => b.listens - a.listens);

      return {
        totalListens, totalSeconds,
        totalDays: Math.floor(totalSeconds / 86400),
        totalHours: Math.floor((totalSeconds % 86400) / 3600),
        totalMinutes: Math.floor((totalSeconds % 3600) / 60),
        tracksWithStats: perTrack.length,
        topTracks: perTrack.slice(0, 20),
        allTracks: perTrack
      };
    } catch (e) {
      console.warn('[GlobalStats] getStatistics error:', e);
      return _emptyStats();
    }
  },

  async flush() { await _flushTickBatch(); },
  isReady() { return _ready; }
};

window.GlobalStatsManager = GlobalStatsManager;
export function getGlobalStats() { return GlobalStatsManager; }
export default GlobalStatsManager;
