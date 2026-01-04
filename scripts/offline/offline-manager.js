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
  setBytes,
  getCloudStats,
  setCloudStats,
  clearCloudStats,
  getCloudCandidate,
  setCloudCandidate,
  clearCloudCandidate,
  totalCachedBytes,
  clearAllStores
} from './cache-db.js';

import { resolvePlaybackSource } from './track-resolver.js';
import { getTrackByUid } from '../app/track-registry.js';
import { getNetPolicy, isAllowedByNetPolicy, shouldConfirmByPolicy } from './net-policy.js';

const OFFLINE_MODE_KEY = 'offlineMode:v1';
const CQ_KEY = 'offline:cacheQuality:v1';
const PINNED_KEY = 'pinnedUids:v1';

// Cloud N/D (ТЗ_НЬЮ): настраивается в OFFLINE modal (секция C)
const CLOUD_N_KEY = 'offline:cloudN:v1';
const CLOUD_D_KEY = 'offline:cloudD:v1';

function readCloudN() {
  const raw = Number(localStorage.getItem(CLOUD_N_KEY) || 5);
  const n = Number.isFinite(raw) ? Math.floor(raw) : 5;
  return Math.max(1, Math.min(50, n));
}

function readCloudD() {
  const raw = Number(localStorage.getItem(CLOUD_D_KEY) || 31);
  const d = Number.isFinite(raw) ? Math.floor(raw) : 31;
  return Math.max(1, Math.min(365, d));
}

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

    const pr = Number(task?.priority || 0);
    const safePr = Number.isFinite(pr) ? pr : 0;

    const item = { ...task, priority: safePr, __enqTs: Date.now() };

    // ✅ Приоритетная вставка: higher priority first, FIFO внутри одинакового priority.
    const idx = this._items.findIndex(t => (Number(t?.priority || 0) < safePr));
    if (idx === -1) this._items.push(item);
    else this._items.splice(idx, 0, item);

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

    this.mass = {
      active: false,
      total: 0,
      done: 0,
      error: 0,
      skipped: 0,
      startedAt: 0
    };

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

  getCloudSettings() {
    return { n: readCloudN(), d: readCloudD() };
  }

  setCloudSettings(next = {}) {
    const nRaw = Number(next?.n);
    const dRaw = Number(next?.d);

    const n = Number.isFinite(nRaw) ? Math.floor(nRaw) : readCloudN();
    const d = Number.isFinite(dRaw) ? Math.floor(dRaw) : readCloudD();

    const safeN = Math.max(1, Math.min(50, n));
    const safeD = Math.max(1, Math.min(365, d));

    try { localStorage.setItem(CLOUD_N_KEY, String(safeN)); } catch {}
    try { localStorage.setItem(CLOUD_D_KEY, String(safeD)); } catch {}

    this._em.emit('progress', { uid: null, phase: 'cloudSettingsChanged', n: safeN, d: safeD });
    return { n: safeN, d: safeD };
  }

  async isTrackComplete(uid, quality) {
    const u = String(uid || '').trim();
    if (!u) return false;

    const q = (String(quality || '').toLowerCase() === 'lo') ? 'lo' : 'hi';
    const meta = getTrackByUid(u);
    if (!meta) return false;

    const needMb = q === 'hi'
      ? Number(meta.sizeHi || meta.size || 0)
      : Number(meta.sizeLo || meta.size_low || 0);

    if (!(Number.isFinite(needMb) && needMb > 0)) return false;

    const needBytes = Math.floor(needMb * 1024 * 1024);

    const have = await bytesByQuality(u);
    const gotBytes = q === 'hi' ? Number(have.hi || 0) : Number(have.lo || 0);

    if (!(Number.isFinite(gotBytes) && gotBytes > 0)) return false;

    return gotBytes >= Math.floor(needBytes * 0.92);
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

  getPinnedUids() {
    return Array.from(this._getPinnedSet());
  }

  async getCacheSizeBytes() {
    return totalCachedBytes();
  }

  async clearAllCache() {
    // ✅ Полная очистка: bytes + blobs + cloud meta (cursor).
    // Воспроизведение НЕ трогаем.
    try {
      const ok = await clearAllStores({ keepCacheQuality: true });

      // pinned set -> empty
      try { this._setPinnedSet(new Set()); } catch {}

      this._em.emit('progress', { uid: null, phase: 'allCacheCleared' });
      return !!ok;
    } catch {
      return false;
    }
  }

  getMassStatus() {
    return { ...this.mass };
  }

  enqueueOfflineAll(uids) {
    const list = Array.isArray(uids) ? uids : [];
    const uniq = Array.from(new Set(list.map(x => String(x || '').trim()).filter(Boolean)));
    if (!uniq.length) {
      this.mass = { active: false, total: 0, done: 0, error: 0, skipped: 0, startedAt: 0 };
      this._em.emit('progress', { uid: null, phase: 'offlineAllEmpty' });
      return { ok: false, reason: 'empty' };
    }

    // Массовая сессия
    this.mass = {
      active: true,
      total: uniq.length,
      done: 0,
      error: 0,
      skipped: 0,
      startedAt: Date.now()
    };

    this._em.emit('progress', { uid: null, phase: 'offlineAllStart', total: uniq.length });

    uniq.forEach((uid) => {
      const taskKey = `offlineAll:${uid}`;
      if (this.queue?.hasTask?.(taskKey)) return;

      this.queue.add({
        key: taskKey,
        uid,
        priority: 5,
        run: async () => {
          const cq = await this.getCacheQuality();

          const r = await this.cacheTrackAudio(uid, cq, { userInitiated: false });

          if (r && r.ok) {
            this.mass.done += 1;
          } else if (String(r?.reason || '').startsWith('netPolicyAsk:autoTaskSkipped')) {
            this.mass.skipped += 1;
          } else {
            this.mass.error += 1;
          }

          // Завершение
          const finished = (this.mass.done + this.mass.error + this.mass.skipped) >= this.mass.total;
          if (finished) {
            this.mass.active = false;
            this._em.emit('progress', { uid: null, phase: 'offlineAllDone', ...this.getMassStatus() });
          } else {
            this._em.emit('progress', { uid: null, phase: 'offlineAllTick', ...this.getMassStatus() });
          }
        }
      });
    });

    return { ok: true, total: uniq.length };
  }

  enqueuePinnedDownloadAll() {
    const list = this.getPinnedUids();
    list.forEach((uid) => this.enqueuePinnedDownload(uid));
    this._em.emit('progress', { uid: null, phase: 'pinnedQueueEnqueued', count: list.length });
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

    // ✅ pinned=true отменяет cloudCandidate
    try { await setCloudCandidate(u, false); } catch {}

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

    // ✅ ТЗ 8.3: unpin -> cloudCandidate=true и докачать до 100% CQ
    try { await setCloudCandidate(u, true); } catch {}

    // Ставим задачу докачки до CQ (без повышения listens)
    try {
      const cq = await this.getCacheQuality();
      const taskKey = `cloudCandidate:${cq}:${u}`;

      if (!this.queue?.hasTask?.(taskKey)) {
        this.queue.add({
          key: taskKey,
          uid: u,
          priority: 15,
          run: async () => {
            await this.cacheTrackAudio(u, cq, { userInitiated: false });
          }
        });
      }
    } catch {}

    this._em.emit('progress', { uid: u, phase: 'unpinned' });
  }

  async recordFullListen(uid) {
    const u = String(uid || '').trim();
    if (!u) return false;

    const now = Date.now();

    try {
      const prev = await getCloudStats(u);
      const listens = (Number(prev?.listens || 0) || 0) + 1;

      const next = {
        listens,
        firstListenAt: prev?.firstListenAt > 0 ? prev.firstListenAt : now,
        lastListenAt: now
      };

      await setCloudStats(u, next);
      this._em.emit('progress', { uid: u, phase: 'cloudStats', listens: next.listens });
      return true;
    } catch {
      return false;
    }
  }

  async isCloudEligible(uid) {
    const u = String(uid || '').trim();
    if (!u) return false;

    try {
      // 8.3: cloudCandidate должен быть true (после unpin)
      const candidate = await getCloudCandidate(u);
      if (!candidate) return false;

      const st = await getCloudStats(u);
      const listens = Number(st?.listens || 0);
      const last = Number(st?.lastListenAt || 0);

      const { n, d } = this.getCloudSettings();

      if (!(Number.isFinite(listens) && listens >= n)) return false;
      if (!(Number.isFinite(last) && last > 0)) return false;

      const ttlMs = d * 24 * 60 * 60 * 1000;
      return (Date.now() - last) <= ttlMs;
    } catch {
      return false;
    }
  }

  async getIndicators(uid) {
    const u = String(uid || '').trim();
    if (!u) return { pinned: false, cloud: false, cachedComplete: false };

    const pinned = this._getPinnedSet().has(u);

    const cq = await this.getCacheQuality();

    // ✅ cachedComplete: 100% в CQ
    const cachedComplete = await this.isTrackComplete(u, cq);

    // ✅ Cloud N/D:
    // ☁ показываем только если:
    // - не pinned
    // - 100% cachedComplete
    // - набрано N полных прослушиваний и не истёк TTL D дней
    const eligible = await this.isCloudEligible(u);
    const cloud = !pinned && !!cachedComplete && !!eligible;

    return {
      pinned,
      cloud,
      cachedComplete
    };
  }

  async cloudMenu(uid, action) {
    const u = String(uid || '').trim();
    const act = String(action || '').trim();
    if (!u || !act) return;

    if (act === 'remove-cache') {
      await deleteTrackCache(u);

      // ✅ По ТЗ: удаление из кэша сбрасывает cloud-статистику и cloudCandidate
      try { await clearCloudStats(u); } catch {}
      try { await clearCloudCandidate(u); } catch {}

      // ✅ Если кэш удалён — pinned не должен оставаться “висеть”.
      try {
        const set = this._getPinnedSet();
        if (set.has(u)) {
          set.delete(u);
          this._setPinnedSet(set);
        }
      } catch {}

      this._em.emit('progress', { uid: u, phase: 'cacheRemoved' });
      return;
    }
  }

  async cacheTrackAudio(uid, quality, options = {}) {
    const u = String(uid || '').trim();
    if (!u) return { ok: false, reason: 'noUid' };

    const q = (String(quality || '').toLowerCase() === 'lo') ? 'lo' : 'hi';

    const userInitiated = Boolean(options?.userInitiated);
    const isAuto = !userInitiated;

    if (policy !== 'ask' && !isAllowedByNetPolicy(policy, st)) {
      return { ok: false, reason: `netPolicyBlocked:${policy}:${st.kind || 'unknown'}` };
    }

    if (shouldConfirmByPolicy(policy, st, { isMass: false, isAuto }) && policy === 'ask') {
      if (isAuto) {
        // Авто-задачи (PlaybackCache/фон): не показываем confirm, ставим alert "!"
        try {
          localStorage.setItem('offline:alert:v1', JSON.stringify({
            on: true,
            ts: Date.now(),
            reason: 'Загрузки требуют подтверждения (Network Policy = ask)'
          }));
          window.dispatchEvent(new CustomEvent('offline:uiChanged'));
        } catch {}
        return { ok: false, reason: 'netPolicyAsk:autoTaskSkipped' };
      }

      const ok = window.confirm('Разрешить загрузку трека по текущей сети?');
      if (!ok) return { ok: false, reason: 'netPolicyAsk:userDenied' };
    }

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
