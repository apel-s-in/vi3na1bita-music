// scripts/offline/offline-manager.js
// OfflineManager (ESM) — единый менеджер CQ/pinned/cloud.
// MVP реализация: даёт API, который уже используется UI слоями.
// Важное правило: НЕ управляет воспроизведением.

import {
  bytesByQuality,
  deleteTrackCache,
  getCacheQuality,
  setCacheQuality,
  ensureDbReady
} from './cache-db.js';

const OFFLINE_MODE_KEY = 'offlineMode:v1';
const CQ_KEY = 'offline:cacheQuality:v1';
const PINNED_KEY = 'pinnedUids:v1';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const j = JSON.parse(raw);
    return (j === null || j === undefined) ? fallback : j;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

class Emitter {
  constructor() {
    this._map = new Map();
  }
  on(type, cb) {
    const arr = this._map.get(type) || [];
    arr.push(cb);
    this._map.set(type, arr);
    return () => {
      const next = (this._map.get(type) || []).filter(fn => fn !== cb);
      this._map.set(type, next);
    };
  }
  emit(type, payload) {
    (this._map.get(type) || []).forEach(fn => { try { fn(payload); } catch {} });
  }
}

class SimpleQueue {
  constructor({ onProgress } = {}) {
    this._items = [];
    this._running = false;
    this._onProgress = typeof onProgress === 'function' ? onProgress : null;
  }

  add(task) {
    if (!task) return;
    this._items.push(task);
    this._tick();
  }

  size() {
    return this._items.length;
  }

  async _tick() {
    if (this._running) return;
    if (this._items.length === 0) return;

    this._running = true;
    const task = this._items.shift();

    try {
      if (this._onProgress) {
        this._onProgress({ uid: task?.uid || null, phase: 'start' });
      }
      if (task && typeof task.run === 'function') {
        await task.run();
      }
      if (this._onProgress) {
        this._onProgress({ uid: task?.uid || null, phase: 'done' });
      }
    } catch (e) {
      if (this._onProgress) {
        this._onProgress({ uid: task?.uid || null, phase: 'error', error: String(e?.message || e) });
      }
    } finally {
      this._running = false;
      this._tick();
    }
  }
}

export class OfflineManager {
  constructor() {
    this._em = new Emitter();

    this.queue = new SimpleQueue({
      onProgress: (ev) => this._em.emit('progress', ev)
    });
  }

  async initialize() {
    // Готовим IndexedDB, чтобы bytesByQuality не падал
    try { await ensureDbReady(); } catch {}
  }

  on(type, cb) {
    return this._em.on(type, cb);
  }

  isOfflineMode() {
    try {
      return localStorage.getItem(OFFLINE_MODE_KEY) === '1';
    } catch {
      return false;
    }
  }

  setOfflineMode(enabled) {
    try {
      localStorage.setItem(OFFLINE_MODE_KEY, enabled ? '1' : '0');
    } catch {}
    // UI сам обновится через attachOfflineUI(); здесь только состояние.
  }

  async getCacheQuality() {
    // CQ хранится отдельно от PQ
    try {
      const cq = String(localStorage.getItem(CQ_KEY) || '').toLowerCase();
      if (cq === 'lo') return 'lo';
      if (cq === 'hi') return 'hi';
    } catch {}
    return getCacheQuality();
  }

  async setCacheQuality(cq) {
    const v = (String(cq || '').toLowerCase() === 'lo') ? 'lo' : 'hi';
    try { localStorage.setItem(CQ_KEY, v); } catch {}
    await setCacheQuality(v);
    this._em.emit('progress', { uid: null, phase: 'cqChanged' });
  }

  _getPinnedSet() {
    const arr = readJson(PINNED_KEY, []);
    const uids = Array.isArray(arr) ? arr.map(x => String(x || '').trim()).filter(Boolean) : [];
    return new Set(uids);
  }

  _setPinnedSet(set) {
    writeJson(PINNED_KEY, Array.from(set));
  }

  async pin(uid) {
    const u = String(uid || '').trim();
    if (!u) return;

    const set = this._getPinnedSet();
    if (!set.has(u)) {
      set.add(u);
      this._setPinnedSet(set);
    }

    // В MVP мы не стартуем скачивание автоматически (это будет слой 100% offline / P2).
    this._em.emit('progress', { uid: u, phase: 'pinned' });
  }

  async unpin(uid) {
    const u = String(uid || '').trim();
    if (!u) return;

    const set = this._getPinnedSet();
    if (set.has(u)) {
      set.delete(u);
      this._setPinnedSet(set);
    }

    this._em.emit('progress', { uid: u, phase: 'unpinned' });
  }

  async getIndicators(uid) {
    const u = String(uid || '').trim();
    if (!u) return { pinned: false, cloud: false, cachedComplete: false };

    const pinned = this._getPinnedSet().has(u);

    // MVP: cloud отсутствует как механизм синхронизации, но cachedComplete можно показывать по bytes.
    const cq = await this.getCacheQuality();
    const bytes = await bytesByQuality(u);
    const have = cq === 'hi' ? bytes.hi : bytes.lo;

    // cachedComplete: в MVP считаем "есть хоть что-то" как прогресс, но complete=false.
    // Полноценный complete = (have >= needBytes) появится после TrackRegistry+size и CQ политики.
    const cachedComplete = have > 0;

    return {
      pinned,
      cloud: false,
      cachedComplete
    };
  }

  async cloudMenu(uid, action) {
    const u = String(uid || '').trim();
    const act = String(action || '').trim();
    if (!u || !act) return;

    if (act === 'remove-cache') {
      await deleteTrackCache(u);
      this._em.emit('progress', { uid: u, phase: 'cacheRemoved' });
      return;
    }
  }

  async resolveForPlayback(track, pq) {
    // TrackResolver слой будет позже.
    // MVP: возвращаем сеть (track.src) как есть.
    // Важное: не делаем stop/pause.
    const src = String(track?.src || '').trim();
    return {
      url: src || null,
      pq: (String(pq || '').toLowerCase() === 'lo') ? 'lo' : 'hi',
      cq: await this.getCacheQuality(),
      isLocal: false
    };
  }
}
