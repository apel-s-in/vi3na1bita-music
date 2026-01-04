// scripts/offline/offline-manager.js
// OfflineManager (ESM) — единый менеджер CQ/pinned/cloud.
// MVP реализация: даёт API, который уже используется UI слоями.
// Важное правило: НЕ управляет воспроизведением.

import {
  bytesByQuality,
  deleteTrackCache,
  getCacheQuality,
  setCacheQuality,
  ensureDbReady,
  getAudioBlob,
  setAudioBlob,
  setBytes
} from './cache-db.js';

import { resolvePlaybackSource } from './track-resolver.js';
import { getTrackByUid } from '../app/track-registry.js';

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

  hasTask(key) {
    const k = String(key || '').trim();
    if (!k) return false;
    return this._items.some(t => String(t?.key || '').trim() === k);
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

  async isTrackComplete(uid, quality) {
    const u = String(uid || '').trim();
    if (!u) return false;

    const q = (String(quality || '').toLowerCase() === 'lo') ? 'lo' : 'hi';
    const meta = getTrackByUid(u);
    if (!meta) return false;

    const need = q === 'hi'
      ? Number(meta.sizeHi || meta.size || 0)
      : Number(meta.sizeLo || meta.size_low || 0);

    if (!(need > 0)) return false;

    const have = await bytesByQuality(u);
    const got = q === 'hi' ? Number(have.hi || 0) : Number(have.lo || 0);

    return got >= need;
  }

  async hasAnyComplete(uids) {
    const list = Array.isArray(uids) ? uids : [];
    if (list.length === 0) return false;

    // Проверяем сначала CQ, потом второй уровень (чтобы считать "есть офлайн вообще")
    const cq = await this.getCacheQuality();
    const alt = cq === 'hi' ? 'lo' : 'hi';

    for (const uid of list) {
      // eslint-disable-next-line no-await-in-loop
      if (await this.isTrackComplete(uid, cq)) return true;
    }
    for (const uid of list) {
      // eslint-disable-next-line no-await-in-loop
      if (await this.isTrackComplete(uid, alt)) return true;
    }
    return false;
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

    // ✅ По ТЗ 8.1: pinned=true + ставим задачу скачать до 100% в CQ
    this.enqueuePinnedDownload(u);

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

    // ✅ По ТЗ: cachedComplete означает 100% в CQ (а не "что-то есть")
    const cachedComplete = await this.isTrackComplete(u, cq);

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

  async cacheTrackAudio(uid, quality) {
    const u = String(uid || '').trim();
    if (!u) return { ok: false, reason: 'noUid' };

    const q = (String(quality || '').toLowerCase() === 'lo') ? 'lo' : 'hi';

    // Уже есть blob — ничего не делаем
    const existing = await getAudioBlob(u, q);
    if (existing) {
      return { ok: true, cached: true, reason: 'alreadyCached' };
    }

    const meta = getTrackByUid(u);
    const url = q === 'lo' ? String(meta?.urlLo || '').trim() : String(meta?.urlHi || '').trim();

    if (!url) return { ok: false, reason: 'noUrlForQuality' };

    // Network policy здесь пока не enforced полностью (будет следующий шаг),
    // но мы не начинаем скачивание если сети нет.
    const online = (() => {
      try {
        if (window.NetworkManager && typeof window.NetworkManager.getStatus === 'function') {
          return !!window.NetworkManager.getStatus().online;
        }
      } catch {}
      return navigator.onLine !== false;
    })();

    if (!online) return { ok: false, reason: 'offlineNoNetwork' };

    this._em.emit('progress', { uid: u, phase: 'downloadStart', quality: q });

    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const blob = await r.blob();
      const ok = await setAudioBlob(u, q, blob);

      if (!ok) throw new Error('IndexedDB write failed');

      // ✅ Обновляем bytes реальными байтами скачанного blob (не MB-hint).
      const bytes = (blob && typeof blob.size === 'number' && Number.isFinite(blob.size) && blob.size > 0)
        ? Math.floor(blob.size)
        : 0;

      await setBytes(u, q, bytes);

      this._em.emit('progress', { uid: u, phase: 'downloadDone', quality: q });
      return { ok: true, cached: true, reason: 'downloaded' };
    } catch (e) {
      this._em.emit('progress', { uid: u, phase: 'downloadError', quality: q, error: String(e?.message || e) });
      return { ok: false, reason: 'downloadError' };
    }
  }
  enqueuePinnedDownload(uid) {
    const u = String(uid || '').trim();
    if (!u) return;

    const taskKey = `pinned:${u}`;

    // Не ставим дубликаты
    if (this.queue && typeof this.queue.hasTask === 'function' && this.queue.hasTask(taskKey)) {
      return;
    }

    if (!this.queue || typeof this.queue.add !== 'function') return;

    this.queue.add({
      key: taskKey,
      uid: u,
      run: async () => {
        const cq = await this.getCacheQuality();
        await this.cacheTrackAudio(u, cq);
      }
    });
  }

  async resolveForPlayback(track, pq) {
    // ✅ Единый TrackResolver: PQ↔CQ + сеть/офлайн.
    // Важно: НЕ делаем stop/pause.
    const cq = await this.getCacheQuality();
    const offlineMode = this.isOfflineMode();

    const network = (() => {
      try {
        if (window.NetworkManager && typeof window.NetworkManager.getStatus === 'function') {
          return window.NetworkManager.getStatus();
        }
      } catch {}
      return { online: navigator.onLine !== false, kind: 'unknown', raw: null, saveData: false };
    })();

    const r = await resolvePlaybackSource({
      track,
      pq,
      cq,
      offlineMode,
      network
    });

    return {
      url: r.url || null,
      pq: (String(pq || '').toLowerCase() === 'lo') ? 'lo' : 'hi',
      cq,
      effectiveQuality: r.effectiveQuality,
      isLocal: !!r.isLocal,
      localQuality: r.localQuality || null,
      reason: r.reason || ''
    };
  }
}
