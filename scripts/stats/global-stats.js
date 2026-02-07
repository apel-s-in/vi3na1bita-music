/**
 * global-stats.js — Самодостаточный модуль глобальной статистики.
 *
 * Полностью независим от OfflineManager, Pinned/Cloud.
 * Хранит данные в отдельном IndexedDB store 'globalStats'.
 * Никогда не сбрасывается (ни при смене качества, ни при удалении кэша,
 * ни при перекэшировании — ТЗ Часть 9).
 *
 * Данные:
 *   per-track: globalFullListenCount, globalListenSeconds
 *   aggregate: globalTotalListenSeconds (всё время по всем трекам)
 *
 * Экспорт:
 *   GlobalStatsManager (singleton)
 *   getGlobalStats()
 */

const DB_NAME = 'globalStatsDB';
const DB_VERSION = 1;
const STORE_TRACKS = 'tracks';     // per-track stats
const STORE_AGGREGATE = 'aggregate'; // global aggregates

let _db = null;
let _dbPending = null;
let _ready = false;

/* ─── Tick batch (аккумулятор секунд, flush каждые 30 сек) ─── */
let _tickBatch = { uid: null, sec: 0, timer: null };

/* ═══════ IndexedDB ═══════ */

async function openDB() {
  if (_db) return _db;
  if (_dbPending) return _dbPending;

  _dbPending = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        db.createObjectStore(STORE_TRACKS, { keyPath: 'uid' });
      }

      if (!db.objectStoreNames.contains(STORE_AGGREGATE)) {
        db.createObjectStore(STORE_AGGREGATE, { keyPath: 'key' });
      }
    };

    req.onsuccess = () => {
      _db = req.result;
      _dbPending = null;
      resolve(_db);
    };

    req.onerror = () => {
      _dbPending = null;
      console.warn('[GlobalStats] DB open error:', req.error);
      reject(req.error);
    };
  });

  return _dbPending;
}

function db() {
  if (!_db) throw new Error('[GlobalStats] DB not opened. Call initialize() first.');
  return _db;
}

/* ─── Per-track store helpers ─── */

async function getTrackStats(uid) {
  return new Promise((resolve, reject) => {
    const tx = db().transaction(STORE_TRACKS, 'readonly');
    const req = tx.objectStore(STORE_TRACKS).get(uid);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function putTrackStats(data) {
  return new Promise((resolve, reject) => {
    const tx = db().transaction(STORE_TRACKS, 'readwrite');
    tx.objectStore(STORE_TRACKS).put(data);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllTrackStats() {
  return new Promise((resolve, reject) => {
    const tx = db().transaction(STORE_TRACKS, 'readonly');
    const req = tx.objectStore(STORE_TRACKS).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/* ─── Aggregate store helpers ─── */

async function getAggregate(key) {
  return new Promise((resolve, reject) => {
    const tx = db().transaction(STORE_AGGREGATE, 'readonly');
    const req = tx.objectStore(STORE_AGGREGATE).get(key);
    req.onsuccess = () => resolve(req.result?.value ?? 0);
    req.onerror = () => reject(req.error);
  });
}

async function putAggregate(key, value) {
  return new Promise((resolve, reject) => {
    const tx = db().transaction(STORE_AGGREGATE, 'readwrite');
    tx.objectStore(STORE_AGGREGATE).put({ key, value });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/* ═══════ Flush tick batch ═══════ */

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

    /* Обновить aggregate globalTotalListenSeconds */
    const total = (await getAggregate('globalTotalListenSeconds')) || 0;
    await putAggregate('globalTotalListenSeconds', total + sec);
  } catch (e) {
    console.warn('[GlobalStats] flushTickBatch error:', e);
  }
}

function _defaultTrackStats(uid) {
  return {
    uid,
    globalFullListenCount: 0,
    globalListenSeconds: 0,
    lastListenAt: null,
    firstListenAt: null
  };
}

/* ═══════ Public API ═══════ */

const GlobalStatsManager = {

  /**
   * Инициализация — открывает IndexedDB.
   * Вызвать при старте приложения, до любых записей.
   */
  async initialize() {
    if (_ready) return;
    try {
      await openDB();
      _ready = true;
      console.log('[GlobalStats] Initialized');
    } catch (e) {
      console.error('[GlobalStats] Init failed:', e);
    }
  },

  /**
   * Инкрементальная запись секунд прослушивания.
   * Вызывается из stats-tracker.js каждую секунду.
   * Батчинг: копим в памяти, flush каждые 30 сек или при смене трека.
   */
  async recordTick(uid, { deltaSec = 1 } = {}) {
    if (!uid || !_ready) return;

    /* Если uid сменился — flush старый */
    if (_tickBatch.uid && _tickBatch.uid !== uid && _tickBatch.sec > 0) {
      await _flushTickBatch();
    }

    _tickBatch.uid = uid;
    _tickBatch.sec += deltaSec;

    /* Flush каждые 30 секунд */
    if (!_tickBatch.timer) {
      _tickBatch.timer = setTimeout(() => _flushTickBatch(), 30000);
    }
  },

  /**
   * Регистрация полного прослушивания (full listen).
   * ТЗ 9.2: Full listen = duration > 0 AND position/duration > 0.9
   * Вызывается из stats-tracker.js при onEnded.
   */
  async registerFullListen(uid, { duration, position } = {}) {
    if (!uid || !_ready) return;

    const dur = Number(duration) || 0;
    const pos = Number(position) || 0;
    if (dur <= 0 || (pos / dur) < 0.9) return;

    /* Flush pending ticks для этого трека */
    if (_tickBatch.uid === uid && _tickBatch.sec > 0) {
      await _flushTickBatch();
    }

    try {
      const stats = (await getTrackStats(uid)) || _defaultTrackStats(uid);
      stats.globalFullListenCount = (stats.globalFullListenCount || 0) + 1;
      // Audit Fix #25: Не добавляем секунды здесь, они уже учтены через recordTick
      stats.lastListenAt = Date.now();
      if (!stats.firstListenAt) stats.firstListenAt = Date.now();
      await putTrackStats(stats);

      // Обновлять aggregate тоже не нужно, секунды пишутся отдельно
    } catch (e) {
      console.warn('[GlobalStats] registerFullListen error:', e);
    }
  },

  /**
   * Получить статистику одного трека.
   */
  async getTrackStats(uid) {
    if (!_ready) return _defaultTrackStats(uid);
    try {
      return (await getTrackStats(uid)) || _defaultTrackStats(uid);
    } catch {
      return _defaultTrackStats(uid);
    }
  },

  /**
   * Получить полную глобальную статистику для модалки.
   * ТЗ 9.4: показывать треки с globalFullListenCount >= 3.
   */
  async getStatistics() {
    if (!_ready) return _emptyStats();

    try {
      const allTracks = await getAllTrackStats();
      const totalSeconds = (await getAggregate('globalTotalListenSeconds')) || 0;

      let totalListens = 0;
      const perTrack = [];

      for (const t of allTracks) {
        const listens = t.globalFullListenCount || 0;
        const seconds = t.globalListenSeconds || 0;
        totalListens += listens;

        /* ТЗ 9.4: только треки с >= 3 полных прослушиваний */
        if (listens >= 3) {
          const trackData = window.TrackRegistry?.getTrackByUid?.(t.uid);
          perTrack.push({
            uid: t.uid,
            title: trackData?.title || t.uid,
            listens,
            seconds,
            lastListenAt: t.lastListenAt,
            firstListenAt: t.firstListenAt
          });
        }
      }

      /* Сортировка: самые прослушиваемые сверху */
      perTrack.sort((a, b) => b.listens - a.listens);

      return {
        totalListens,
        totalSeconds,
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

  /**
   * Принудительный flush (при смене трека, при закрытии приложения).
   */
  async flush() {
    await _flushTickBatch();
  },

  /** Проверка готовности */
  isReady() { return _ready; }
};

function _emptyStats() {
  return {
    totalListens: 0,
    totalSeconds: 0,
    totalDays: 0,
    totalHours: 0,
    totalMinutes: 0,
    tracksWithStats: 0,
    topTracks: [],
    allTracks: []
  };
}

/* Глобальный доступ */
window.GlobalStatsManager = GlobalStatsManager;

export function getGlobalStats() { return GlobalStatsManager; }
export default GlobalStatsManager;
