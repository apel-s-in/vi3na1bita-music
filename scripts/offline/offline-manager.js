// scripts/offline/offline-manager.js
// OfflineManager (ESM) — единый менеджер CQ/pinned/cloud/queue.
// Важно: НЕ управляет воспроизведением (не делает stop/play/seek).
// Цель: максимально чисто, без дублей и “устаревших следов”, и ближе к ТЗ_НЬЮ.

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
  clearAllStores,
  updateGlobalStats,
  getGlobalStatsAndTotal,
  getEvictionCandidates
} from './cache-db.js';

import { resolvePlaybackSource } from './track-resolver.js';
import { getTrackByUid } from '../app/track-registry.js';
import { getNetPolicy, isAllowedByNetPolicy, shouldConfirmByPolicy } from './net-policy.js';

const LS = {
  OFFLINE_MODE: 'offlineMode:v1',
  CQ: 'offline:cacheQuality:v1',
  PINNED: 'pinnedUids:v1',
  CLOUD_N: 'offline:cloudN:v1',
  CLOUD_D: 'offline:cloudD:v1',
  ALERT: 'offline:alert:v1',
};

const MB = 1024 * 1024;

function normUid(v) {
  const s = String(v || '').trim();
  return s ? s : null;
}

function normQ(v) {
  return String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi';
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

function getNetworkStatusSafe() {
  try {
    if (window.NetworkManager && typeof window.NetworkManager.getStatus === 'function') {
      return window.NetworkManager.getStatus();
    }
  } catch {}
  return { online: navigator.onLine !== false, kind: 'unknown', raw: null, saveData: false };
}

function readCloudN() {
  const raw = Number(localStorage.getItem(LS.CLOUD_N) || 5);
  const n = Number.isFinite(raw) ? Math.floor(raw) : 5;
  return Math.max(1, Math.min(50, n));
}

function readCloudD() {
  const raw = Number(localStorage.getItem(LS.CLOUD_D) || 31);
  const d = Number.isFinite(raw) ? Math.floor(raw) : 31;
  return Math.max(1, Math.min(365, d));
}

function setAlert(on, reason) {
  try {
    localStorage.setItem(LS.ALERT, JSON.stringify({
      on: !!on,
      ts: Date.now(),
      reason: String(reason || '')
    }));
  } catch {}
  try { window.dispatchEvent(new CustomEvent('offline:uiChanged')); } catch {}
}

class Emitter {
  constructor() { this._m = new Map(); }
  on(type, cb) {
    const arr = this._m.get(type) || [];
    arr.push(cb);
    this._m.set(type, arr);
    return () => this._m.set(type, (this._m.get(type) || []).filter(fn => fn !== cb));
  }
  emit(type, payload) {
    (this._m.get(type) || []).forEach(fn => { try { fn(payload); } catch {} });
  }
}

class SimpleQueue {
  // 1 active audio download at a time.
  constructor({ onProgress } = {}) {
    this._items = [];
    this._running = false;
    this._runningKey = null;
    this._onProgress = (typeof onProgress === 'function') ? onProgress : null;
  }

  size() { return this._items.length; }

  hasTask(key) {
    const k = String(key || '').trim();
    if (!k) return false;
    if (this._runningKey && this._runningKey === k) return true;
    return this._items.some(t => String(t?.key || '').trim() === k);
  }

  add(task) {
    if (!task || typeof task.run !== 'function') return;

    const pr = Number(task.priority || 0);
    const item = { ...task, priority: Number.isFinite(pr) ? pr : 0, __ts: Date.now() };

    // higher priority first, FIFO within same priority
    const idx = this._items.findIndex(t => Number(t?.priority || 0) < item.priority);
    if (idx === -1) this._items.push(item);
    else this._items.splice(idx, 0, item);

    this._tick();
  }

  async _tick() {
    if (this._running) return;
    const task = this._items.shift();
    if (!task) return;

    this._running = true;
    this._runningKey = String(task.key || '') || null;

    try {
      this._onProgress?.({ uid: task.uid || null, phase: 'start', key: task.key || '' });
      await task.run();
      this._onProgress?.({ uid: task.uid || null, phase: 'done', key: task.key || '' });
    } catch (e) {
      this._onProgress?.({ uid: task.uid || null, phase: 'error', key: task.key || '', error: String(e?.message || e) });
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
    try { await ensureDbReady(); } catch {}
  }

  on(type, cb) { return this._em.on(type, cb); }

  // =========================
  // Offline mode
  // =========================
  isOfflineMode() {
    try { return localStorage.getItem(LS.OFFLINE_MODE) === '1'; } catch { return false; }
  }

  setOfflineMode(enabled) {
    try { localStorage.setItem(LS.OFFLINE_MODE, enabled ? '1' : '0'); } catch {}
    // UI обновляется через offline-ui-bootstrap слушая offline:uiChanged.
    try { window.dispatchEvent(new CustomEvent('offline:uiChanged')); } catch {}
  }

  // =========================
  // Cache Quality (CQ)
  // =========================
  async getCacheQuality() {
    // Источник истины: localStorage CQ, fallback на IndexedDB meta CQ.
    try {
      const cq = String(localStorage.getItem(LS.CQ) || '').toLowerCase();
      if (cq === 'hi' || cq === 'lo') return cq;
    } catch {}
    return getCacheQuality();
  }

  async setCacheQuality(cq) {
    const v = normQ(cq);
    try { localStorage.setItem(LS.CQ, v); } catch {}
    try { await setCacheQuality(v); } catch {}
    this._em.emit('progress', { uid: null, phase: 'cqChanged', cq: v });
    setAlert(true, 'Изменено Cache Quality (CQ). Возможен re-cache.');
    return v;
  }

  // =========================
  // Cloud settings
  // =========================
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

    try { localStorage.setItem(LS.CLOUD_N, String(safeN)); } catch {}
    try { localStorage.setItem(LS.CLOUD_D, String(safeD)); } catch {}

    this._em.emit('progress', { uid: null, phase: 'cloudSettingsChanged', n: safeN, d: safeD });
    return { n: safeN, d: safeD };
  }

  // =========================
  // Pinned
  // =========================
  _getPinnedSet() {
    const arr = readJson(LS.PINNED, []);
    const uids = Array.isArray(arr) ? arr.map(x => String(x || '').trim()).filter(Boolean) : [];
    return new Set(uids);
  }

  _setPinnedSet(set) {
    writeJson(LS.PINNED, Array.from(set));
  }

  getPinnedUids() {
    return Array.from(this._getPinnedSet());
  }

  async pin(uid) {
    const u = normUid(uid);
    if (!u) return false;

    const set = this._getPinnedSet();
    if (!set.has(u)) {
      set.add(u);
      this._setPinnedSet(set);
    }

    // pinned=true отменяет cloudCandidate
    try { await setCloudCandidate(u, false); } catch {}

    // ТЗ 8.1: ставим задачу скачать трек до 100% в CQ
    this.enqueuePinnedDownload(u, { userInitiated: true });

    this._em.emit('progress', { uid: u, phase: 'pinned' });
    return true;
  }

  async unpin(uid) {
    const u = normUid(uid);
    if (!u) return false;

    const set = this._getPinnedSet();
    if (set.has(u)) {
      set.delete(u);
      this._setPinnedSet(set);
    }

    // ТЗ 8.3: снятие pinned → cloudCandidate сразу
    try { await setCloudCandidate(u, true); } catch {}

    window.NotificationSystem?.info('Офлайн-закрепление снято. Трек может стать Cloud ☁', 3500);

    // Докачка в CQ (cloudCandidate)
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

    this._em.emit('progress', { uid: u, phase: 'unpinned' });
    return true;
  }

  enqueuePinnedDownload(uid, opts = {}) {
    const u = normUid(uid);
    if (!u) return;

    const userInitiated = !!opts?.userInitiated;
    this.getCacheQuality().then((cq) => {
      this.enqueueAudioDownload({
        uid: u,
        quality: cq,
        key: `pinned:${cq}:${u}`,
        priority: 25, // P2
        userInitiated,
        isMass: false,
        kind: 'pinned'
      });
    }).catch(() => {});
  }

  enqueuePinnedDownloadAll() {
    const list = this.getPinnedUids();
    list.forEach((uid) => this.enqueuePinnedDownload(uid, { userInitiated: true }));
    this._em.emit('progress', { uid: null, phase: 'pinnedQueueEnqueued', count: list.length });
  }

  // =========================
  // Track cache state helpers
  // =========================
  async isTrackComplete(uid, quality) {
    const u = normUid(uid);
    if (!u) return false;

    const q = normQ(quality);
    const meta = getTrackByUid(u);
    if (!meta) return false;

    const needMb = (q === 'hi')
      ? Number(meta.sizeHi || meta.size || 0)
      : Number(meta.sizeLo || meta.size_low || 0);

    if (!(Number.isFinite(needMb) && needMb > 0)) return false;
    const needBytes = Math.floor(needMb * MB);

    const have = await bytesByQuality(u);
    const got = (q === 'hi') ? Number(have.hi || 0) : Number(have.lo || 0);
    if (!(Number.isFinite(got) && got > 0)) return false;

    // допуск 92% (как у тебя и как в resolver)
    return got >= Math.floor(needBytes * 0.92);
  }

  async hasAnyComplete(uids) {
    const list = Array.isArray(uids) ? uids : [];
    if (!list.length) return false;

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

  async getCacheSizeBytes() {
    return totalCachedBytes();
  }

  async clearAllCache() {
    // Полная очистка: bytes + blobs + cloud meta.
    // Воспроизведение не трогаем.
    try {
      const ok = await clearAllStores({ keepCacheQuality: true });
      this._setPinnedSet(new Set());
      this._em.emit('progress', { uid: null, phase: 'allCacheCleared' });
      setAlert(false, '');
      return !!ok;
    } catch {
      return false;
    }
  }

  // =========================
  // Queue API (единая очередь скачивания)
  // =========================
  enqueueAudioDownload(params = {}) {
    const u = normUid(params?.uid);
    if (!u) return { ok: false, reason: 'noUid' };

    const q = normQ(params?.quality);
    const kind = String(params?.kind || '').trim() || 'generic';
    const userInitiated = !!params?.userInitiated;
    const isMass = !!params?.isMass;

    const pr = Number(params?.priority || 0);
    const priority = Number.isFinite(pr) ? pr : 0;

    const key = String(params?.key || '').trim() || `${kind}:${q}:${u}`;
    const onResult = (typeof params?.onResult === 'function') ? params.onResult : null;

    if (this.queue.hasTask(key)) return { ok: true, enqueued: false, dedup: true, key };

    this.queue.add({
      key,
      uid: u,
      priority,
      run: async () => {
        const r = await this.cacheTrackAudio(u, q, { userInitiated, isMass });
        try { onResult && onResult(r); } catch {}
      }
    });

    return { ok: true, enqueued: true, key };
  }

  // =========================
  // 100% OFFLINE (backend)
  // =========================
  async startFullOffline(uids) {
    const uniq = Array.from(new Set((Array.isArray(uids) ? uids : [])
      .map(x => String(x || '').trim())
      .filter(Boolean)));

    if (!uniq.length) return { ok: false, reason: 'empty' };

    // Перед стартом: можно сделать eviction best-effort
    await this.checkEviction();

    this.mass = {
      active: true,
      total: uniq.length,
      done: 0,
      error: 0,
      skipped: 0,
      startedAt: Date.now()
    };

    this._em.emit('progress', { uid: null, phase: 'offlineAllStart', total: uniq.length });

    const cq = await this.getCacheQuality();

    uniq.forEach((uid) => {
      const u = String(uid || '').trim();
      const taskKey = `offlineAll:${cq}:${u}`;

      this.enqueueAudioDownload({
        uid: u,
        quality: cq,
        key: taskKey,
        priority: 10, // P3-ish
        userInitiated: false,
        isMass: true,
        kind: 'offlineAll',
        onResult: (r) => {
          if (r && r.ok) this.mass.done++;
          else if (String(r?.reason || '').includes('Skipped')) this.mass.skipped++;
          else this.mass.error++;

          if (this.mass.done + this.mass.error + this.mass.skipped >= this.mass.total) {
            this.mass.active = false;
            this._em.emit('progress', { uid: null, phase: 'offlineAllDone', ...this.mass });
            window.NotificationSystem?.success('Загрузка 100% OFFLINE завершена');
          }
        }
      });
    });

    return { ok: true, total: uniq.length };
  }

  getMassStatus() { return { ...this.mass }; }

  // =========================
  // Cloud: eligibility + indicators + actions
  // =========================
  async isCloudEligible(uid) {
    const u = normUid(uid);
    if (!u) return false;

    // pinned исключает cloud
    if (this._getPinnedSet().has(u)) return false;

    const { n } = this.getCloudSettings();
    const now = Date.now();

    const st = await getCloudStats(u);
    const candidate = await getCloudCandidate(u);

    const count = Number(st?.cloudFullListenCount || 0);
    const cloudByAuto = Number.isFinite(count) && count >= n;

    if (st?.cloud === true) {
      const exp = Number(st?.cloudExpiresAt || 0);
      return Number.isFinite(exp) && exp > 0 && exp >= now;
    }

    // cloud=false, но eligible как кандидат/авто — включится после 100% CQ
    return !!(candidate || cloudByAuto);
  }

  async getIndicators(uid) {
    const u = normUid(uid);
    if (!u) return { pinned: false, cloud: false, cachedComplete: false };

    const pinned = this._getPinnedSet().has(u);
    const cq = await this.getCacheQuality();
    const cachedComplete = await this.isTrackComplete(u, cq);
    const eligible = await this.isCloudEligible(u);

    // ТЗ 10.1/9.3: ☁ только если cloud eligible и 100% в CQ.
    const cloud = (!pinned) && (!!cachedComplete) && (!!eligible);

    return { pinned, cloud, cachedComplete };
  }

  async cloudMenu(uid, action) {
    const u = normUid(uid);
    const act = String(action || '').trim();
    if (!u || !act) return false;

    if (act === 'add-lock') {
      await this.pin(u);
      return true;
    }

    if (act === 'remove-cache') {
      // ТЗ 9.5: удалить локальную cloud-копию + сбросить cloud-статистику, НЕ трогать global stats.
      await deleteTrackCache(u);
      try { await clearCloudStats(u); } catch {}
      try { await clearCloudCandidate(u); } catch {}
      this._em.emit('progress', { uid: u, phase: 'cacheRemoved' });
      return true;
    }

    return false;
  }

  async _maybeActivateCloudAfterCqComplete(uid) {
    const u = normUid(uid);
    if (!u) return false;

    if (this._getPinnedSet().has(u)) return false;

    const cq = await this.getCacheQuality();
    const complete = await this.isTrackComplete(u, cq);
    if (!complete) return false;

    const { n, d } = this.getCloudSettings();
    const ttlMs = d * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const st = await getCloudStats(u);
    if (st?.cloud === true) return true;

    const candidate = await getCloudCandidate(u);
    const count = Number(st?.cloudFullListenCount || 0);
    const cloudByAuto = Number.isFinite(count) && count >= n;

    if (!candidate && !cloudByAuto) return false;

    await setCloudStats(u, {
      cloudFullListenCount: (Number.isFinite(count) && count > 0) ? Math.floor(count) : 0,
      lastFullListenAt: Number(st?.lastFullListenAt || 0) > 0 ? Math.floor(st.lastFullListenAt) : 0,
      cloudAddedAt: now,
      cloudExpiresAt: now + ttlMs,
      cloud: true
    });

    try { await clearCloudCandidate(u); } catch {}

    this._em.emit('progress', { uid: u, phase: 'cloudActivated' });
    return true;
  }

  // =========================
  // Stats entrypoint (called from PlayerCore)
  // =========================
  async recordListenStats(uid, ctx = {}) {
    const u = normUid(uid);
    if (!u) return;

    const deltaSec = Number(ctx?.deltaSec || 0);
    const isFullListen = !!ctx?.isFullListen;

    // Global stats never reset (ТЗ 1.4 / 7.11.2)
    if (deltaSec > 0 || isFullListen) {
      await updateGlobalStats(u, deltaSec, isFullListen ? 1 : 0);
    }

    // Cloud stats only on full listen (ТЗ 9.2 / 7.11.1)
    if (isFullListen) {
      await this._updateCloudStatsOnFullListen(u);
    }
  }

  async _updateCloudStatsOnFullListen(uid) {
    const u = normUid(uid);
    if (!u) return;

    const now = Date.now();
    const { n, d } = this.getCloudSettings();
    const ttlMs = d * 24 * 60 * 60 * 1000;

    const prev = await getCloudStats(u);

    const prevCount = Number(prev?.cloudFullListenCount || 0);
    const nextCount = (Number.isFinite(prevCount) && prevCount > 0) ? (prevCount + 1) : 1;

    // Auto cloud if count >= N
    const becameCloud = nextCount >= n;
    const nextCloud = becameCloud ? true : (prev?.cloud === true);

    // TTL продлеваем только если cloud=true (по ТЗ repeat/full listen продлевает)
    const cloudExpiresAt = nextCloud ? (now + ttlMs) : 0;
    const cloudAddedAt = nextCloud
      ? (Number(prev?.cloudAddedAt || 0) > 0 ? Number(prev.cloudAddedAt) : now)
      : 0;

    await setCloudStats(u, {
      cloudFullListenCount: nextCount,
      lastFullListenAt: now,
      cloudAddedAt,
      cloudExpiresAt,
      cloud: nextCloud
    });

    this._em.emit('progress', { uid: u, phase: 'cloudStats', cloud: nextCloud });
  }

  async getGlobalStatistics() {
    return getGlobalStatsAndTotal();
  }

  // =========================
  // Eviction (best-effort)
  // =========================
  async checkEviction(limitMB = 500) {
    const total = await this.getCacheSizeBytes();
    const limitBytes = Math.floor(Number(limitMB || 0) * MB);
    if (!(limitBytes > 0) || total <= limitBytes) return;

    const pinnedSet = this._getPinnedSet();
    const candidates = await getEvictionCandidates(pinnedSet); // LRU

    let freed = 0;

    for (const uid of candidates) {
      if ((total - freed) <= limitBytes) break;

      // eslint-disable-next-line no-await-in-loop
      const sizes = await bytesByQuality(uid);
      const trackBytes = (Number(sizes.hi || 0) + Number(sizes.lo || 0)) || 0;

      // eslint-disable-next-line no-await-in-loop
      await deleteTrackCache(uid);

      // eslint-disable-next-line no-await-in-loop
      await clearCloudStats(uid);

      freed += trackBytes;
    }

    if (freed > 0) {
      window.NotificationSystem?.info('Кэш переполнен. Удалены самые старые треки.');
      this._em.emit('progress', { uid: null, phase: 'eviction', freed });
    }
  }

  // =========================
  // Download implementation (blob)
  // =========================
  async cacheTrackAudio(uid, quality, options = {}) {
    const u = normUid(uid);
    if (!u) return { ok: false, reason: 'noUid' };

    const q = normQ(quality);

    const meta = getTrackByUid(u);
    if (!meta) return { ok: false, reason: 'noTrackMeta' };

    // Resolve network URL via TrackResolver (even if offline mode ON, downloading is network action)
    let url = null;
    try {
      const r = await resolvePlaybackSource({
        track: meta,
        pq: q,
        cq: q,
        offlineMode: false,
        network: { online: true, kind: 'unknown', raw: null, saveData: false }
      });
      url = r?.url || null;
    } catch {
      url = null;
    }

    if (!url) return { ok: false, reason: 'noUrlResolved' };

    const st = getNetworkStatusSafe();
    if (st.online === false) return { ok: false, reason: 'offline:network' };

    const policy = getNetPolicy();
    const userInitiated = !!options?.userInitiated;
    const isAuto = !userInitiated;
    const isMass = !!options?.isMass;

    // Hard block if policy not allow
    if (policy !== 'ask' && !isAllowedByNetPolicy(policy, st)) {
      return { ok: false, reason: `netPolicyBlocked:${policy}:${st.kind || 'unknown'}` };
    }

    // Confirm rules
    if (policy === 'ask' && shouldConfirmByPolicy(policy, st, { isMass, isAuto })) {
      if (isAuto) {
        setAlert(true, 'Есть загрузки, требующие подтверждения (Network Policy = ask)');
        return { ok: false, reason: 'netPolicyAsk:autoTaskSkipped' };
      }
      const ok = window.confirm('Тип сети неизвестен. Продолжить?');
      if (!ok) return { ok: false, reason: 'netPolicyAsk:userDenied' };
    }

    this._em.emit('progress', { uid: u, phase: 'downloadStart', quality: q });

    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const blob = await r.blob();
      if (!(blob instanceof Blob)) throw new Error('Not a blob');

      const wrote = await setAudioBlob(u, q, blob);
      if (!wrote) throw new Error('IndexedDB write failed');

      const bytes = (typeof blob.size === 'number' && Number.isFinite(blob.size) && blob.size > 0)
        ? Math.floor(blob.size)
        : 0;

      await setBytes(u, q, bytes);

      this._em.emit('progress', { uid: u, phase: 'downloadDone', quality: q, bytes });

      // Cloud activation only after CQ complete
      try {
        const cq = await this.getCacheQuality();
        if (q === cq) await this._maybeActivateCloudAfterCqComplete(u);
      } catch {}

      // Eviction best-effort after write (to keep within quota)
      try { await this.checkEviction(); } catch {}

      return { ok: true, cached: true, reason: 'downloaded', bytes };
    } catch (e) {
      this._em.emit('progress', { uid: u, phase: 'downloadError', quality: q, error: String(e?.message || e) });
      return { ok: false, reason: 'downloadError' };
    }
  }

  // =========================
  // Playback resolver bridge for PlayerCore
  // =========================
  async resolveForPlayback(track, pq) {
    const cq = await this.getCacheQuality();
    const offlineMode = this.isOfflineMode();
    const network = getNetworkStatusSafe();

    const r = await resolvePlaybackSource({
      track,
      pq: normQ(pq),
      cq,
      offlineMode,
      network
    });

    return {
      url: r?.url || null,
      pq: normQ(pq),
      cq,
      effectiveQuality: r?.effectiveQuality || normQ(pq),
      isLocal: !!r?.isLocal,
      localQuality: r?.localQuality || null,
      reason: r?.reason || ''
    };
  }
}
