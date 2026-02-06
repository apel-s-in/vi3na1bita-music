/**
 * cache-db.js — IndexedDB хранилище для офлайн-кэша аудио и метаданных.
 *
 * Stores:
 *   "audio"  — Blob аудиофайлов, ключ: "uid:hi" или "uid:lo"
 *   "meta"   — JSON метаданные треков, ключ: uid
 *   "global" — глобальные счётчики (статистика, настройки), ключ: строка
 *
 * No-duplicates rule: для одного uid хранится ТОЛЬКО ОДИН variant (hi или lo).
 */

const DB_NAME = 'offlineAudioCache';
const DB_VERSION = 2;
let _dbPromise = null;

/* ───── Открытие БД ───── */

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

/* ───── Хелперы ───── */

function audioKey(uid, quality) {
  const q = quality === 'lo' ? 'lo' : 'hi';
  return `${uid}:${q}`;
}

function otherQuality(q) {
  return q === 'lo' ? 'hi' : 'lo';
}

function reqP(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function store(db, name, mode) {
  return db.transaction(name, mode).objectStore(name);
}

/* ───── Audio (Blob) ───── */

/**
 * Сохранить аудио-blob. Удаляет другое качество того же uid (no-duplicates rule).
 */
export async function setAudioBlob(uid, quality, blob) {
  const db = await openDB();
  const q = quality === 'lo' ? 'lo' : 'hi';
  const ak = audioKey(uid, q);
  const otherAk = audioKey(uid, otherQuality(q));
  return new Promise((resolve, reject) => {
    const t = db.transaction('audio', 'readwrite');
    const s = t.objectStore('audio');
    s.delete(otherAk);
    s.put(blob, ak);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/**
 * Получить аудио-blob по uid и quality.
 */
export async function getAudioBlob(uid, quality) {
  const db = await openDB();
  const q = quality === 'lo' ? 'lo' : 'hi';
  return reqP(store(db, 'audio', 'readonly').get(audioKey(uid, q)));
}

/**
 * Получить аудио-blob любого качества (приоритет: запрошенное → альтернативное).
 * Возвращает { blob, quality } или null.
 */
export async function getAudioBlobAny(uid, preferredQuality) {
  const pq = preferredQuality === 'lo' ? 'lo' : 'hi';
  let blob = await getAudioBlob(uid, pq);
  if (blob) return { blob, quality: pq };
  const alt = otherQuality(pq);
  blob = await getAudioBlob(uid, alt);
  if (blob) return { blob, quality: alt };
  return null;
}

/**
 * Удалить все аудио для uid (обе качества).
 */
export async function deleteAudio(uid) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('audio', 'readwrite');
    const s = t.objectStore('audio');
    s.delete(audioKey(uid, 'hi'));
    s.delete(audioKey(uid, 'lo'));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/* ───── Meta ───── */

/**
 * Meta-объект трека:
 * {
 *   uid, type ('pinned'|'cloud'|'dynamic'|'playbackWindow'|'none'),
 *   quality ('hi'|'lo'), size, url,
 *   pinnedAt, cloudAddedAt, cloudExpiresAt,
 *   cloudFullListenCount, lastFullListenAt,
 *   needsUpdate, needsReCache,
 *   ts (last modified)
 * }
 */
export async function setTrackMeta(uid, metaObj) {
  const db = await openDB();
  return reqP(store(db, 'meta', 'readwrite').put(
    { ...metaObj, uid, ts: Date.now() }, uid
  ));
}

export async function getTrackMeta(uid) {
  const db = await openDB();
  return reqP(store(db, 'meta', 'readonly').get(uid));
}

export async function deleteTrackMeta(uid) {
  const db = await openDB();
  return reqP(store(db, 'meta', 'readwrite').delete(uid));
}

export async function getAllTrackMetas() {
  const db = await openDB();
  return reqP(store(db, 'meta', 'readonly').getAll());
}

/* ───── Audio Keys ───── */

export async function getAllKeys() {
  const db = await openDB();
  return reqP(store(db, 'audio', 'readonly').getAllKeys());
}

/* ───── Global store ───── */

export async function getGlobal(key) {
  const db = await openDB();
  return reqP(store(db, 'global', 'readonly').get(key));
}

export async function setGlobal(key, value) {
  const db = await openDB();
  return reqP(store(db, 'global', 'readwrite').put(value, key));
}

/**
 * Атомарно обновить global stats для трека.
 */
export async function updateGlobalStats(uid, deltaSec, deltaFull) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('global', 'readwrite');
    const s = t.objectStore('global');
    const perReq = s.get(`stats:${uid}`);
    const totalReq = s.get('stats:total');
    perReq.onsuccess = () => {
      const cur = perReq.result || { seconds: 0, fullPlays: 0 };
      cur.seconds += deltaSec;
      cur.fullPlays += deltaFull;
      cur.lastPlayed = Date.now();
      s.put(cur, `stats:${uid}`);
    };
    totalReq.onsuccess = () => {
      const tot = totalReq.result || { seconds: 0, fullPlays: 0 };
      tot.seconds += deltaSec;
      tot.fullPlays += deltaFull;
      s.put(tot, 'stats:total');
    };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/* ───── Storage estimate ───── */

export async function estimateUsage() {
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    const used = est.usage || 0;
    const quota = est.quota || 0;
    return { usage: used, used, quota, free: quota - used };
  }
  return { usage: 0, used: 0, quota: 0, free: 0 };
}

/* ───── Convenience: полное удаление трека ───── */

export async function deleteTrackCache(uid) {
  const u = String(uid || '').trim();
  if (!u) return false;
  await deleteAudio(u);
  await deleteTrackMeta(u);
  return true;
}

/* ───── Cloud-статистика (агрегат) ───── */

export async function getCloudStats() {
  const metas = await getAllTrackMetas();
  const now = Date.now();
  let active = 0, expired = 0;
  const expiredUids = [];
  for (const m of metas) {
    if (m.type !== 'cloud') continue;
    if (m.cloudExpiresAt && m.cloudExpiresAt < now) {
      expired++;
      expiredUids.push(m.uid);
    } else {
      active++;
    }
  }
  return { total: active + expired, active, expired, expiredUids };
}
