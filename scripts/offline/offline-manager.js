// scripts/offline/offline-manager.js
// OfflineManager (ESM) — единый менеджер CQ/pinned/cloud/queue (ТЗ_НЬЮ)
// Важно: НЕ управляет воспроизведением (не делает stop/play/seek)

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
  getEvictionCandidates,
  getExpiredCloudUids
} from './cache-db.js';

import { resolvePlaybackSource, isTrackAvailableOffline } from './track-resolver.js';
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
const DEFAULT_CACHE_LIMIT_MB = 500;

function normUid(v) {
  const s = String(v || '').trim();
  return s || null;
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

class DownloadQueue {
  constructor({ onProgress } = {}) {
    this._items = [];
    this._running = false;
    this._runningKey = null;
    this._paused = false;
    this._onProgress = (typeof onProgress === 'function') ? onProgress : null;
  }

  size() { return this._items.length; }
  isRunning() { return this._running; }
  isPaused() { return this._paused; }

  hasTask(key) {
    const k = String(key || '').trim();
    if (!k) return false;
    if (this._runningKey === k) return true;
    return this._items.some(t => String(t?.key || '').trim() === k);
  }

  add(task) {
    if (!task || typeof task.run !== 'function') return;

    const pr = Number(task.priority || 0);
    const item = { ...task, priority: Number.isFinite(pr) ? pr : 0, __ts: Date.now() };

    const idx = this._items.findIndex(t => Number(t?.priority || 0) < item.priority);
    if (idx === -1) this._items.push(item);
    else this._items.splice(idx, 0, item);

    this._tick();
  }

  pause() { this._paused = true; }
  resume() { this._paused = false; this._tick(); }

  async _tick() {
    if (this._running || this._paused) return;
    
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
    this._initialized = false;

    this.mass = {
      active: false,
      total: 0,
      done: 0,
      error: 0,
      skipped: 0,
      startedAt: 0
    };

    this.queue = new DownloadQueue({
      onProgress: (ev) => this._em.emit('progress', ev)
    });
  }

  async initialize() {
    if (this._initialized) return;
    this._initialized = true;

    try { await ensureDbReady(); } catch {}

    this._checkExpiredCloud();
    setInterval(() => this._checkExpiredCloud(), 60 * 60 * 1000);
  }

  on(type, cb) { return this._em.on(type, cb); }

  // Offline mode
  isOfflineMode() {
    try { return localStorage.getItem(LS.OFFLINE_MODE) === '1'; } catch { return false; }
  }

  setOfflineMode(enabled) {
    try { localStorage.setItem(LS.OFFLINE_MODE, enabled ? '1' : '0'); } catch {}
    try { window.dispatchEvent(new CustomEvent('offline:uiChanged')); } catch {}
  }

  // Cache Quality (CQ)
  async getCacheQuality() {
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
    setAlert(true, 'Изменено качество кэша. Рекомендуется обновить файлы.');
    return v;
  }

  // Cloud settings
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

  // Pinned
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

  isPinned(uid) {
    return this._getPinnedSet().has(normUid(uid) || '');
  }

  async pin(uid) {
    const u = normUid(uid);
    if (!u) return false;

    const set = this._getPinnedSet();
    if (!set.has(u)) {
      set.add(u);
      this._setPinnedSet(set);
    }

    try { await setCloudCandidate(u, false); } catch {}

    this.enqueuePinnedDownload(u, { userInitiated: true });

    window.NotificationSystem?.info('Трек будет доступен офлайн. Начинаю скачивание…', 3500);
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

    try { await setCloudCandidate(u, true); } catch {}

    window.NotificationSystem?.info('Офлайн-закрепление снято. Трек может стать Cloud ☁', 3500);

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
        priority: 25,
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

  // Track cache state
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

    return got >= Math.floor(needBytes * 0.92);
  }

  async hasAnyComplete(uids) {
    const list = Array.isArray(uids) ? uids : [];
    if (!list.length) return false;

    const cq = await this.getCacheQuality();
    const alt = cq === 'hi' ? 'lo' : 'hi';

    for (const uid of list) {
      if (await this.isTrackComplete(uid, cq)) return true;
    }
    for (const uid of list) {
      if (await this.isTrackComplete(uid, alt)) return true;
    }
    return false;
  }

  async getCacheSizeBytes() {
    return totalCachedBytes();
  }

  async clearAllCache() {
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

  // Queue API
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
        try { onResult?.(r); } catch {}
      }
    });

    return { ok: true, enqueued: true, key };
  }

  // 100% OFFLINE
  async startFullOffline(uids) {
    const uniq = Array.from(new Set((Array.isArray(uids) ? uids : [])
      .map(x => String(x || '').trim())
      .filter(Boolean)));

    if (!uniq.length) return { ok: false, reason: 'empty' };

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
        priority: 10,
        userInitiated: false,
        isMass: true,
        kind: 'offlineAll',
        onResult: (r) => {
          if (r?.ok) this.mass.done++;
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

  // Queue control (ТЗ 11.2.F)
  pauseQueue() { try { this.queue?.pause?.(); } catch {} }
  resumeQueue() { try { this.queue?.resume?.(); } catch {} }

  getQueueStatus() {
    return {
      downloadingKey: this.queue?._runningKey || null,
      downloading: this.queue?.isRunning?.() || false,
      paused: this.queue?.isPaused?.() || false,
      queued: this.queue?.size?.() || 0
    };
  }

  // ===== 100% OFFLINE helpers (ТЗ 11.2.I) =====
  // selection: { mode: 'favorites'|'albums', albumKeys?: string[] }
  async computeSizeEstimate(selection = {}) {
    const cq = await this.getCacheQuality();

    const toMb = (v) => {
      const n = Number(v);
      return (Number.isFinite(n) && n > 0) ? n : 0;
    };

    const uniq = (arr) => Array.from(new Set((Array.isArray(arr) ? arr : []).map(x => String(x || '').trim()).filter(Boolean)));

    // Собираем uid-ы набора
    let uids = [];
    if (selection.mode === 'favorites') {
      const playing = window.SPECIAL_FAVORITES_KEY || '__favorites__';
      // Любые ⭐ в любом альбоме — это "избранное" пользователя
      // но "только ИЗБРАННОЕ" в ТЗ = активные в favorites view (⭐ true).
      // Значит: берём все liked uid по всем альбомам.
      const map = window.FavoritesManager?.getLikedUidMap?.() || {};
      const all = [];
      Object.keys(map || {}).forEach((a) => {
        const arr = Array.isArray(map[a]) ? map[a] : [];
        arr.forEach(u => all.push(String(u || '').trim()));
      });
      uids = uniq(all);
      // special key playing переменная не используется, оставлено для ясности
      void playing;
    } else if (selection.mode === 'albums') {
      const keys = uniq(selection.albumKeys);
      const allTracks = (typeof window.TrackRegistry?.getAllTracks === 'function')
        ? window.TrackRegistry.getAllTracks()
        : (typeof window.getAllTracks === 'function' ? window.getAllTracks() : []);
      // В твоём проекте getAllTracks экспортирован из scripts/app/track-registry.js, но в window он не публикуется.
      // Поэтому используем реестр через Offline preload (preloadAllAlbumsTrackIndex) и getTrackByUid.
      // Здесь оцениваем только по uid, найденным в TrackRegistry Map через window.OfflineUI preload.
      uids = uniq(allTracks
        .filter(t => keys.includes(String(t?.sourceAlbum || t?.albumKey || t?.album || '').trim()))
        .map(t => String(t?.uid || '').trim()));
    } else {
      return { ok: false, reason: 'badSelection', tracksMB: 0, coversMB: 0, lyricsMB: 0, totalMB: 0, count: 0 };
    }

    // Оценка по size/size_low из TrackRegistry
    let tracksMB = 0;
    for (const uid of uids) {
      const meta = getTrackByUid(uid);
      if (!meta) continue;
      const mb = (cq === 'lo')
        ? (toMb(meta.sizeLo || meta.size_low) || toMb(meta.sizeHi || meta.size))
        : (toMb(meta.sizeHi || meta.size) || toMb(meta.sizeLo || meta.size_low));
      tracksMB += mb;
    }

    // assets (covers/lyrics/fulltext) — в v1.0 считаем 0 в мегабайтах, но реально прогреем SW shell/urls.
    const coversMB = 0;
    const lyricsMB = 0;
    const totalMB = tracksMB + coversMB + lyricsMB;

    return { ok: true, cq, tracksMB, coversMB, lyricsMB, totalMB, count: uids.length, uids };
  }

  async _canGuaranteeStorageForMB(totalMB) {
    const needBytes = Math.floor((Number(totalMB) || 0) * MB);

    // iOS и вообще: если API недоступен — считаем "нельзя гарантировать"
    try {
      if (navigator.storage && typeof navigator.storage.estimate === 'function') {
        const est = await navigator.storage.estimate();
        const quota = Number(est?.quota || 0);
        const usage = Number(est?.usage || 0);
        if (quota > 0) {
          const free = Math.max(0, quota - usage);
          // запас 10%
          const ok = free >= needBytes * 1.1;
          return { ok, quota, usage, free };
        }
      }
    } catch {}

    return { ok: false, unknown: true };
  }

  async startFullOfflineSelection(selection = {}) {
    // Confirm Unknown network (ТЗ 11.2.D + 11.2.I)
    const policy = getNetPolicy();
    const net = getNetworkStatusSafe();

    if (!net.online) return { ok: false, reason: 'offline' };

    // Unknown type confirm (минимально: kind === 'unknown' => confirm для mass)
    const kind = String(net.kind || '').toLowerCase();
    const needConfirm = (kind === 'unknown');

    if (needConfirm) {
      return { ok: false, reason: 'needsConfirm', policy, net };
    }

    const est = await this.computeSizeEstimate(selection);
    if (!est.ok) return est;

    const guarantee = await this._canGuaranteeStorageForMB(est.totalMB);
    if (!guarantee.ok) {
      return { ok: false, reason: 'cannotGuaranteeStorage', estimate: est, guarantee };
    }

    // Запускаем аудио-часть через существующий startFullOffline(uids)
    const res = await this.startFullOffline(est.uids);

    return { ...res, estimate: est, guarantee };
  }

  // Cloud logic (ТЗ 9)
  async isCloudEligible(uid) {
    const u = normUid(uid);
    if (!u) return false;

    if (this._getPinnedSet().has(u)) return false;

    const { n } = this.getCloudSettings();
    const now = Date.now();

    const st = await getCloudStats(u);
    const candidate = await getCloudCandidate(u);

    if (st?.cloud === true) {
      const exp = Number(st?.cloudExpiresAt || 0);
      return Number.isFinite(exp) && exp > 0 && exp >= now;
    }

    const count = Number(st?.cloudFullListenCount || 0);
    const cloudByAuto = Number.isFinite(count) && count >= n;

    return !!(candidate || cloudByAuto);
  }

  async getIndicators(uid) {
    const u = normUid(uid);
    if (!u) return { pinned: false, cloud: false, cachedComplete: false };

    const pinned = this._getPinnedSet().has(u);
    const cq = await this.getCacheQuality();
    const cachedComplete = await this.isTrackComplete(u, cq);
    const eligible = await this.isCloudEligible(u);

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
      const ok = confirm('Удалить из кэша (статистика облачка будет сброшена)?');
      if (!ok) return false;

      await deleteTrackCache(u);
      try { await clearCloudStats(u); } catch {}
      try { await clearCloudCandidate(u); } catch {}

      window.NotificationSystem?.success('Трек удалён из кэша');
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
      cloudFullListenCount: Math.max(0, count),
      lastFullListenAt: Number(st?.lastFullListenAt || 0),
      cloudAddedAt: now,
      cloudExpiresAt: now + ttlMs,
      cloud: true
    });

    try { await clearCloudCandidate(u); } catch {}

    window.NotificationSystem?.info('Трек добавлен в офлайн на ' + d + ' дней.');
    this._em.emit('progress', { uid: u, phase: 'cloudActivated' });
    return true;
  }

  async _checkExpiredCloud() {
    try {
      const expired = await getExpiredCloudUids();
      
      for (const uid of expired) {
        if (this._getPinnedSet().has(uid)) continue;

        await deleteTrackCache(uid);
        await clearCloudStats(uid);
        await clearCloudCandidate(uid);
        
        this._em.emit('progress', { uid, phase: 'cloudExpired' });
      }

      if (expired.length > 0) {
        window.NotificationSystem?.info(`Офлайн-доступ истёк. Удалено ${expired.length} трек(ов).`);
      }
    } catch {}
  }

  // Stats (ТЗ 7.11)
  async recordListenStats(uid, ctx = {}) {
    const u = normUid(uid);
    if (!u) return;

    const deltaSec = Number(ctx?.deltaSec || 0);
    const isFullListen = !!ctx?.isFullListen;

    if (deltaSec > 0 || isFullListen) {
      await updateGlobalStats(u, deltaSec, isFullListen ? 1 : 0);
    }

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
    const nextCount = prevCount + 1;

    const becameCloud = nextCount >= n;
    const nextCloud = becameCloud ? true : (prev?.cloud === true);

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

    this._em.emit('progress', { uid: u, phase: 'cloudStats', cloud: nextCloud, count: nextCount });
  }

  async getGlobalStatistics() {
    return getGlobalStatsAndTotal();
  }

  // Eviction (ТЗ 13)
  async checkEviction(limitMB = DEFAULT_CACHE_LIMIT_MB) {
    const total = await this.getCacheSizeBytes();
    const limitBytes = Math.floor(Number(limitMB || 0) * MB);
    if (!(limitBytes > 0) || total <= limitBytes) return;

    const pinnedSet = this._getPinnedSet();
    const candidates = await getEvictionCandidates(pinnedSet);

    let freed = 0;
    const evictedUids = [];

    for (const c of candidates) {
      if ((total - freed) <= limitBytes) break;

      await deleteTrackCache(c.uid);
      // ВАЖНО (ТЗ): cloud-статистика сбрасывается только при явном действии пользователя
      // "☁ → Удалить из кэша". Eviction этого делать не должен.

      freed += c.bytes;
      evictedUids.push(c.uid);
    }

    if (freed > 0) {
      window.NotificationSystem?.info('Кэш переполнен. Удалены самые старые треки.');
      this._em.emit('progress', { uid: null, phase: 'eviction', freed, count: evictedUids.length });
    }
  }

  // Download implementation
  async cacheTrackAudio(uid, quality, options = {}) {
    const u = normUid(uid);
    if (!u) return { ok: false, reason: 'noUid' };

    const q = normQ(quality);
    const userInitiated = !!options?.userInitiated;
    const isMass = !!options?.isMass;

    const track = getTrackByUid(u);
    if (!track) return { ok: false, reason: 'noTrackMeta' };

    const alreadyComplete = await this.isTrackComplete(u, q);
    if (alreadyComplete) {
      await this._maybeActivateCloudAfterCqComplete(u);
      return { ok: true, skipped: true, reason: 'Skipped: already complete' };
    }

    const urlHi = track?.urlHi || track?.audio || null;
    const urlLo = track?.urlLo || track?.audio_low || null;
    const url = (q === 'lo') ? (urlLo || urlHi) : (urlHi || urlLo);

    if (!url) return { ok: false, reason: 'noUrl' };

    const policy = getNetPolicy();
    const net = getNetworkStatusSafe();

    if (!net.online) {
      return { ok: false, reason: 'offline' };
    }

    const allowed = isAllowedByNetPolicy({
      policy,
      net,
      quality: q,
      kind: isMass ? 'mass' : 'single',
      userInitiated
    });

    if (!allowed) {
      if (userInitiated && shouldConfirmByPolicy({ policy, net })) {
        return { ok: false, reason: 'needsConfirm', policy, net };
      }
      return { ok: false, reason: 'policyBlocked' };
    }

    await this.checkEviction();

    try {
      this._em.emit('progress', { uid: u, phase: 'downloading', quality: q });

      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) {
        return { ok: false, reason: `httpError:${resp.status}` };
      }

      const blob = await resp.blob();
      const bytes = blob.size;

      if (bytes < 1000) {
        return { ok: false, reason: 'tooSmall' };
      }

      await setAudioBlob(u, q, blob);
      await setBytes(u, q, bytes);

      this._em.emit('progress', { uid: u, phase: 'downloaded', quality: q, bytes });

      await this._maybeActivateCloudAfterCqComplete(u);

      return { ok: true, bytes, quality: q };
    } catch (e) {
      return { ok: false, reason: String(e?.message || 'fetchError') };
    }
  }

  // Resolve playback (ТЗ 6.1, 7.4)
  async resolveForPlayback(track, pq) {
    const cq = await this.getCacheQuality();
    const offlineMode = this.isOfflineMode();
    const net = getNetworkStatusSafe();

    return resolvePlaybackSource({
      track,
      pq: normQ(pq),
      cq,
      offlineMode,
      network: net
    });
  }

  // Check track availability offline
  async isTrackAvailableOffline(uid) {
    return isTrackAvailableOffline(uid);
  }
}

let _instance = null;

export function getOfflineManager() {
  if (!_instance) {
    _instance = new OfflineManager();
  }
  return _instance;
}

export async function initOfflineManager() {
  const mgr = getOfflineManager();
  await mgr.initialize();
  return mgr;
}
