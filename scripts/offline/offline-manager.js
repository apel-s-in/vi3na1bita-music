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
    this._runningKey = null;
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

    if (this._runningKey && this._runningKey === k) return true;

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
    this._runningKey = task && task.key ? String(task.key) : null;

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
      this._runningKey = null;
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

  enqueueAudioDownload(params = {}) {
    const uid = String(params?.uid || '').trim();
    if (!uid) return { ok: false, reason: 'noUid' };

    const quality = (String(params?.quality || '').toLowerCase() === 'lo') ? 'lo' : 'hi';

    const kind = String(params?.kind || '').trim() || 'generic';
    const userInitiated = !!params?.userInitiated;
    const isMass = !!params?.isMass;

    const priorityRaw = Number(params?.priority || 0);
    const priority = Number.isFinite(priorityRaw) ? priorityRaw : 0;

    const keyRaw = String(params?.key || '').trim();
    const key = keyRaw || `${kind}:${quality}:${uid}`;

    const onResult = (typeof params?.onResult === 'function') ? params.onResult : null;

    if (!this.queue || typeof this.queue.add !== 'function') {
      return { ok: false, reason: 'noQueue' };
    }

    // ✅ Дедуп: очередь + running
    if (typeof this.queue.hasTask === 'function' && this.queue.hasTask(key)) {
      return { ok: true, enqueued: false, dedup: true, key };
    }

    this.queue.add({
      key,
      uid,
      priority,
      run: async () => {
        const r = await this.cacheTrackAudio(uid, quality, { userInitiated, isMass });
        if (onResult) {
          try { onResult(r); } catch {}
        }
      }
    });

    return { ok: true, enqueued: true, key };
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
      const u = String(uid || '').trim();
      if (!u) return;

      this.getCacheQuality().then((cq) => {
        const taskKey = `offlineAll:${cq}:${u}`;

        this.enqueueAudioDownload({
          uid: u,
          quality: cq,
          key: taskKey,
          priority: 5,
          userInitiated: false,
          isMass: true,
          kind: 'offlineAll',
          onResult: (r) => {
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
      }).catch(() => {});
    });

    return { ok: true, total: uniq.length };
  }

  enqueuePinnedDownloadAll() {
    const list = this.getPinnedUids();

    // ✅ Массовая pinned-загрузка — это НЕ "auto-task": пользователь нажал кнопку в модалке.
    // Чтобы policy=ask не скипал молча, считаем userInitiated=true.
    list.forEach((uid) => this.enqueuePinnedDownload(uid, { userInitiated: true }));

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
    // ✅ Это действие пользователя (клик по 🔒) => разрешаем confirm при policy=ask
    this.enqueuePinnedDownload(u, { userInitiated: true });

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

    // ✅ ТЗ 8.3: снятие pinned → cloudCandidate присваивается немедленно
    // и докачка до 100% в CQ. fullListenCount НЕ накручиваем.
    try { await setCloudCandidate(u, true); } catch {}

    // ✅ UX toast по ТЗ 20 (короткий)
    window.NotificationSystem?.info('Офлайн‑закрепление снято. Трек станет Cloud‑кандидатом.', 3500);

    // Докачка CQ (можно без userInitiated — это не массовое)
    try {
      const cq = await this.getCacheQuality();
      this.enqueueAudioDownload({
        uid: u,
        quality: cq,
        key: `cloudCandidate:${cq}:${u}`,
        priority: 15,
        userInitiated: false,
        isMass: false,
        kind: 'cloudCandidate'
      });
    } catch {}

    this._em.emit('progress', { uid: u, phase: 'unpinned' });
  }

  /**
   * Cloud full listen (ТЗ 9.2):
   * - засчитываем только если duration валидна и прогресс > 90%
   * - repeat: повторное full listen продлевает TTL
   *
   * Важно: снятие pinned -> cloudCandidate НЕ накручивает fullListenCount (ТЗ 8.3),
   * поэтому этот метод должен вызываться ТОЛЬКО из Playback/Player событий, а не из UI кликов.
   */
  async recordFullListen(uid, ctx = {}) {
    const u = String(uid || '').trim();
    if (!u) return { ok: false, reason: 'noUid' };

    const duration = Number(ctx?.duration || 0);
    const progress = Number(ctx?.progress || 0);

    if (!(Number.isFinite(duration) && duration > 0)) return { ok: false, reason: 'invalidDuration' };
    if (!(Number.isFinite(progress) && progress > 0.9)) return { ok: false, reason: 'progressLt90' };

    const now = Date.now();
    const { n, d } = this.getCloudSettings();
    const ttlMs = d * 24 * 60 * 60 * 1000;

    try {
      const prev = await getCloudStats(u);

      const prevCount = Number(prev?.cloudFullListenCount || 0);
      const nextCount = (Number.isFinite(prevCount) && prevCount > 0) ? (prevCount + 1) : 1;

      // A) Авто-cloud: если достигли N — делаем cloud=true (но ☁ в UI только после 100% CQ)
      const becameCloud = nextCount >= n;

      const nextCloud = becameCloud ? true : (prev?.cloud === true);

      // TTL стартует при cloud=true (ТЗ 9.4). Продление — при каждом full listen, но только если cloud=true.
      const cloudAddedAt = nextCloud
        ? (Number(prev?.cloudAddedAt || 0) > 0 ? Number(prev.cloudAddedAt) : now)
        : 0;

      const cloudExpiresAt = nextCloud
        ? (now + ttlMs)
        : 0;

      const next = {
        cloudFullListenCount: nextCount,
        lastFullListenAt: now,
        cloudAddedAt,
        cloudExpiresAt,
        cloud: nextCloud
      };

      await setCloudStats(u, next);

      // если авто-cloud сработал — candidate не нужен, но пусть остаётся как есть (не критично)
      this._em.emit('progress', { uid: u, phase: 'cloudStats', cloudFullListenCount: next.cloudFullListenCount, cloud: next.cloud });

      return { ok: true, cloud: next.cloud, cloudFullListenCount: next.cloudFullListenCount };
    } catch {
      return { ok: false, reason: 'dbError' };
    }
  }

  async isCloudEligible(uid) {
    const u = String(uid || '').trim();
    if (!u) return false;

    try {
      const pinned = this._getPinnedSet().has(u);
      if (pinned) return false;

      const { n } = this.getCloudSettings();
      const now = Date.now();

      const st = await getCloudStats(u);

      // B) Ручной cloud: cloudCandidate=true (ТЗ 9.3.B)
      const candidate = await getCloudCandidate(u);

      const count = Number(st?.cloudFullListenCount || 0);
      const cloudByAuto = Number.isFinite(count) && count >= n;

      // Cloud “условно доступен”, если:
      // - cloud=true и ttl не истёк
      // - или кандидат (manual), даже если fullListenCount<N (ТЗ 8.3 / 9.3.B)
      // Но отображать ☁ будем только при cachedComplete=100% CQ (делает getIndicators)
      const cloudFlag = (st?.cloud === true);

      // Если cloud=true — проверяем TTL
      if (cloudFlag) {
        const exp = Number(st?.cloudExpiresAt || 0);
        if (Number.isFinite(exp) && exp > 0 && exp >= now) return true;
        // TTL истёк: cloud недействителен
        return false;
      }

      // Если ещё cloud=false, но кандидат или авто-порог выполнен — считаем eligible (станет cloud после 100% докачки CQ)
      if (candidate) return true;
      if (cloudByAuto) return true;

      return false;
    } catch {
      return false;
    }
  }

  async getIndicators(uid) {
    const u = String(uid || '').trim();
    if (!u) return { pinned: false, cloud: false, cachedComplete: false };

    const pinned = this._getPinnedSet().has(u);

    const cq = await this.getCacheQuality();

    // ✅ cachedComplete: 100% в CQ (как в ТЗ 9.3/10.1)
    const cachedComplete = await this.isTrackComplete(u, cq);

    // ✅ Cloud показываем в UI только если cachedComplete=100% (CQ)
    // Cloud eligible включает:
    // - auto: count>=N
    // - manual: cloudCandidate=true
    // - TTL проверяем только когда cloud=true
    const eligible = await this.isCloudEligible(u);

    // Если pinned — всегда 🔒, облако не показываем
    const cloud = (!pinned) && (!!cachedComplete) && (!!eligible);

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
      // ✅ ТЗ 9.5: “Удалить из кэша”:
      // - удалить локальную cloud-копию (в нашем хранилище это bytes+blobs)
      // - сбросить cloud-статистику (cloudFullListenCount, lastFullListenAt, cloudAddedAt, cloudExpiresAt, cloud=true)
      // - НЕ трогать global user stats (в проекте их пока нет)
      await deleteTrackCache(u);

      try { await clearCloudStats(u); } catch {}
      try { await clearCloudCandidate(u); } catch {}

      // pinned при этом НЕ обязателен к сбросу по ТЗ,
      // но UI-логика: “Удалить из кэша” из cloud-меню предполагает cloud-копию.
      // Если трек pinned — пользователь должен сначала снять pinned.
      // Поэтому pinned здесь НЕ трогаем.

      this._em.emit('progress', { uid: u, phase: 'cacheRemoved' });
      return;
    }

    if (act === 'add-lock') {
      await this.pin(u);
      return;
    }
  }
  async _maybeActivateCloudAfterCqComplete(uid) {
    const u = String(uid || '').trim();
    if (!u) return false;

    // pinned всегда сильнее cloud
    if (this._getPinnedSet().has(u)) return false;

    try {
      const cq = await this.getCacheQuality();
      const cachedComplete = await this.isTrackComplete(u, cq);
      if (!cachedComplete) return false;

      const { n, d } = this.getCloudSettings();
      const ttlMs = d * 24 * 60 * 60 * 1000;
      const now = Date.now();

      const st = await getCloudStats(u);
      if (st?.cloud === true) return true;

      const candidate = await getCloudCandidate(u);

      const count = Number(st?.cloudFullListenCount || 0);
      const cloudByAuto = Number.isFinite(count) && count >= n;

      // Включаем cloud после 100% CQ, если:
      // - manual (cloudCandidate), или
      // - auto (count>=N)
      if (!candidate && !cloudByAuto) return false;

      await setCloudStats(u, {
        cloudFullListenCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
        lastFullListenAt: Number(st?.lastFullListenAt || 0) > 0 ? Math.floor(st.lastFullListenAt) : 0,
        cloudAddedAt: now,
        cloudExpiresAt: now + ttlMs,
        cloud: true
      });

      // candidate больше не нужен
      try { await clearCloudCandidate(u); } catch {}

      this._em.emit('progress', { uid: u, phase: 'cloudActivated' });
      return true;
    } catch {
      return false;
    }
  }

  async cacheTrackAudio(uid, quality, options = {}) {
    const u = String(uid || '').trim();
    if (!u) return { ok: false, reason: 'noUid' };

    const q = (String(quality || '').toLowerCase() === 'lo') ? 'lo' : 'hi';

    // 1) Метаданные трека
    const track = getTrackByUid(u);
    if (!track) return { ok: false, reason: 'noTrackMeta' };

    // 2) Определяем URL (через единый резолвер, чтобы не дублировать логику путей)
    //    offlineMode=false, чтобы получить сетевой URL (если он существует)
    let url = null;
    try {
      const r = await resolvePlaybackSource({
        track,
        pq: q,          // для скачивания берём качество как "желаемое"
        cq: q,
        offlineMode: false,
        network: { online: true, kind: 'unknown', raw: null, saveData: false }
      });
      url = r?.url || null;
    } catch {
      url = null;
    }
    if (!url) return { ok: false, reason: 'noUrlResolved' };

    // 3) Статус сети
    const st = (() => {
      try {
        if (window.NetworkManager && typeof window.NetworkManager.getStatus === 'function') {
          return window.NetworkManager.getStatus();
        }
      } catch {}
      return { online: navigator.onLine !== false, kind: 'unknown', raw: null, saveData: false };
    })();

    // Если реально оффлайн — не пытаемся качать
    if (st.online === false) {
      return { ok: false, reason: 'offline:network' };
    }

    // 4) Политика сети (wifi/cellular/ask/unknown)
    const policy = getNetPolicy();

    const userInitiated = Boolean(options?.userInitiated);
    const isAuto = !userInitiated;
    const isMass = Boolean(options?.isMass);

    // 5) Enforce policy: если policy не ask — блокируем без confirm
    if (policy !== 'ask' && !isAllowedByNetPolicy(policy, st)) {
      return { ok: false, reason: `netPolicyBlocked:${policy}:${st.kind || 'unknown'}` };
    }

    // 6) ask: confirm (только для userInitiated; авто-задачи пропускаем с alert)
    if (policy === 'ask' && shouldConfirmByPolicy(policy, st, { isMass, isAuto })) {
      if (isAuto) {
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

      const wrote = await setAudioBlob(u, q, blob);
      if (!wrote) throw new Error('IndexedDB write failed');

      const bytes = (blob && typeof blob.size === 'number' && Number.isFinite(blob.size) && blob.size > 0)
        ? Math.floor(blob.size)
        : 0;

      await setBytes(u, q, bytes);

      this._em.emit('progress', { uid: u, phase: 'downloadDone', quality: q, bytes });

      // ✅ Cloud: включаем cloud=true только ПОСЛЕ 100% докачки В CQ (ТЗ 9.3/9.4)
      try {
        const cq = await this.getCacheQuality();
        if (q === cq) {
          await this._maybeActivateCloudAfterCqComplete(u);
        }
      } catch {}

      return { ok: true, cached: true, reason: 'downloaded', bytes };
    } catch (e) {
      this._em.emit('progress', { uid: u, phase: 'downloadError', quality: q, error: String(e?.message || e) });
      return { ok: false, reason: 'downloadError' };
    }
  }
  enqueuePinnedDownload(uid, opts = {}) {
    const u = String(uid || '').trim();
    if (!u) return;

    const userInitiated = !!opts?.userInitiated;

    // pinned всегда качаем в CQ
    this.getCacheQuality().then((cq) => {
      this.enqueueAudioDownload({
        uid: u,
        quality: cq,
        key: `pinned:${cq}:${u}`,
        priority: 25,
        userInitiated,
        isMass: false,
        kind: 'pinned'
      });
    }).catch(() => {});
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
