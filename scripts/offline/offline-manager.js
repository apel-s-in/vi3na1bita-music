/**
 * offline-manager.js — Центральный модуль офлайн-кэша (🔒 pinned / ☁ cloud).
 *
 * ТЗ: Приложение к ТЗ П.1–П.15
 *
 * Реализует:
 *   - togglePinned (🔒) и cloud-автопоявление (☁)
 *   - Download Queue с приоритетами (P0–P5)
 *   - TTL проверку облачных треков
 *   - getTrackOfflineState для UI-индикаторов
 *   - re-cache логику (тихая + принудительная)
 *   - Полный API для offline-modal, PlayerCore, statistics-modal
 *   - EventEmitter для UI-обновлений
 */

import {
  openDB,
  setAudioBlob, getAudioBlob, getAudioBlobAny, deleteAudio,
  setTrackMeta, getTrackMeta, deleteTrackMeta, getAllTrackMetas,
  getGlobal, setGlobal,
  estimateUsage, deleteTrackCache
} from './cache-db.js';

/* ═══════ Константы ═══════ */

const PQ_KEY = 'qualityMode:v1';
const MODE_KEY = 'offline:mode:v1';
const CLOUD_N_KEY = 'offline:cloud:N';
const CLOUD_D_KEY = 'offline:cloud:D';
const NET_POLICY_KEY = 'offline:netPolicy:v1';
const PRESET_KEY = 'offline:preset:v1';
const MIN_SPACE_MB = 60;
const MB = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

/* ═══════ Утилиты ═══════ */

function emit(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function normQ(v) {
  return String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi';
}

function toast(msg) {
  window.NotificationSystem?.info?.(msg);
}

function toastWarn(msg) {
  window.NotificationSystem?.warning?.(msg);
}

/* ═══════ TrackRegistry bridge ═══════ */

function getTrackData(uid) {
  return window.TrackRegistry?.getTrackByUid?.(uid) || null;
}

function getTrackUrl(uid, quality) {
  const t = getTrackData(uid);
  if (!t) return null;
  const q = normQ(quality);
  if (q === 'lo') return t.audio_low || t.audio || t.src || null;
  return t.audio || t.src || null;
}

/* ═══════ Presets ═══════ */

const PRESETS = {
  conservative: { name: 'conservative', label: 'Экономный', parallel: 1, delayMs: 2000 },
  balanced: { name: 'balanced', label: 'Сбалансированный', parallel: 2, delayMs: 500 },
  aggressive: { name: 'aggressive', label: 'Быстрый', parallel: 3, delayMs: 100 }
};

/* ═══════ DownloadQueue ═══════ */

class DownloadQueue {
  constructor() {
    this._queue = [];
    this._active = null;
    this._paused = false;
  }

  enqueue({ uid, url, quality, kind = 'cloud', priority = 0 }) {
    if (!uid || !url) return;
    if (this._active?.uid === uid) return;
    if (this._queue.some(i => i.uid === uid)) return;
    this._queue.push({ uid, url, quality: normQ(quality), kind, priority, retries: 0 });
    this._queue.sort((a, b) => b.priority - a.priority);
    this._processNext();
  }

  cancel(uid) {
    this._queue = this._queue.filter(i => i.uid !== uid);
    if (this._active?.uid === uid) {
      this._active.ctrl.abort();
      this._active = null;
      this._processNext();
    }
  }

  cancelMismatchedQuality(targetQuality) {
    const q = normQ(targetQuality);
    this._queue = this._queue.filter(i => i.quality === q);
    if (this._active && this._active.quality !== q) {
      this._active.ctrl.abort();
      this._active = null;
    }
    this._processNext();
  }

  pause() { this._paused = true; }
  resume() { this._paused = false; this._processNext(); }
  clear() {
    if (this._active) { this._active.ctrl.abort(); this._active = null; }
    this._queue = [];
  }

  getStatus() {
    return {
      queued: this._queue.length,
      active: this._active ? 1 : 0,
      activeUid: this._active?.uid || null,
      paused: this._paused,
      items: this._queue.map(i => ({ uid: i.uid, kind: i.kind, quality: i.quality }))
    };
  }

  async _processNext() {
    if (this._paused || this._active || !this._queue.length) return;
    if (!navigator.onLine) return;

    const item = this._queue.shift();
    const ctrl = new AbortController();
    this._active = { uid: item.uid, ctrl, quality: item.quality, kind: item.kind };

    emit('offline:downloadStart', { uid: item.uid, kind: item.kind });

    try {
      const resp = await fetch(item.url, { signal: ctrl.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();

      if (this._active?.uid !== item.uid) return;

      await setAudioBlob(item.uid, item.quality, blob);

      const meta = await getTrackMeta(item.uid) || {};
      await setTrackMeta(item.uid, {
        ...meta,
        uid: item.uid,
        quality: item.quality,
        size: blob.size,
        url: item.url,
        needsReCache: false
      });

      this._active = null;
      emit('offline:trackCached', {
        uid: item.uid, quality: item.quality, kind: item.kind, size: blob.size
      });
      emit('offline:stateChanged');
      this._processNext();

    } catch (err) {
      this._active = null;
      if (err.name === 'AbortError') {
        this._processNext();
        return;
      }
      if (item.retries < 3) {
        item.retries++;
        setTimeout(() => {
          this._queue.push(item);
          this._queue.sort((a, b) => b.priority - a.priority);
          this._processNext();
        }, 2000 * item.retries);
      } else {
        console.warn(`[DQ] Failed: ${item.uid}`, err.message);
        emit('offline:downloadFailed', { uid: item.uid, error: err.message });
        this._processNext();
      }
    }
  }
}

/* ═══════ OfflineManager (singleton) ═══════ */

class OfflineManager {
  constructor() {
    this.queue = new DownloadQueue();
    this._ready = false;
    this._listeners = new Map();
  }

  /* ─── EventEmitter ─── */

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this._listeners.get(event)?.delete(fn);
  }

  _emit(event, data) {
    this._listeners.get(event)?.forEach(fn => { try { fn(data); } catch {} });
  }

  /* ─── Init ─── */

  async initialize() {
    if (this._ready) return this;
    await openDB();
    await this._cleanExpiredCloud();
    this._ready = true;
    emit('offline:ready');
    return this;
  }

  // Alias
  async init() { return this.initialize(); }

  /* ─── Mode (R0/R1/R2/R3) ─── */

  getMode() {
    return localStorage.getItem(MODE_KEY) || 'R0';
  }

  async setMode(mode) {
    const valid = ['R0', 'R1', 'R2', 'R3'];
    if (!valid.includes(mode)) return;
    localStorage.setItem(MODE_KEY, mode);
    this._emit('progress', { phase: 'modeChanged', mode });
    emit('offline:uiChanged');
  }

  isOfflineMode() {
    return this.getMode() !== 'R0';
  }

  /* ─── Quality ─── */

  getCacheQuality() {
    return normQ(localStorage.getItem(PQ_KEY));
  }

  getCacheQualitySetting() {
    return this.getCacheQuality();
  }

  setCacheQualitySetting(q) {
    const val = normQ(q);
    localStorage.setItem(PQ_KEY, val);
    this.onQualityChanged(val);
    emit('offline:uiChanged');
  }

  getActivePlaybackQuality() {
    const mode = this.getMode();
    return this.getCacheQuality();
  }

  async onQualityChanged(newQuality) {
    const q = normQ(newQuality);
    this.queue.cancelMismatchedQuality(q);

    const metas = await getAllTrackMetas();
    let count = 0;
    for (const m of metas) {
      if (m.type !== 'pinned' && m.type !== 'cloud') continue;
      if (m.quality && m.quality !== q) {
        await setTrackMeta(m.uid, { ...m, needsReCache: true });
        count++;
      }
    }

    if (count > 0) this._startSilentReCache(q);
    emit('offline:stateChanged');
  }

  async _startSilentReCache(targetQ) {
    const metas = await getAllTrackMetas();
    const items = metas.filter(m =>
      (m.type === 'pinned' || m.type === 'cloud') && m.needsReCache
    );
    items.sort((a, b) => (b.type === 'pinned' ? 1 : 0) - (a.type === 'pinned' ? 1 : 0));

    for (const m of items) {
      const url = getTrackUrl(m.uid, targetQ);
      if (!url) continue;
      this.queue.enqueue({
        uid: m.uid, url,
        quality: targetQ,
        kind: 'reCache',
        priority: m.type === 'pinned' ? 8 : 5
      });
    }
  }

  /* ─── Cloud settings ─── */

  getCloudN() { return parseInt(localStorage.getItem(CLOUD_N_KEY)) || 5; }
  getCloudD() { return parseInt(localStorage.getItem(CLOUD_D_KEY)) || 31; }

  setCloudN(n) {
    localStorage.setItem(CLOUD_N_KEY, String(Math.max(1, Math.floor(n))));
    this._emit('progress', { phase: 'cloudSettingsChanged' });
  }

  setCloudD(d) {
    localStorage.setItem(CLOUD_D_KEY, String(Math.max(1, Math.floor(d))));
    this._emit('progress', { phase: 'cloudSettingsChanged' });
  }

  /* ─── Network Policy ─── */

  getNetPolicy() {
    try {
      return { wifi: true, mobile: true, ...JSON.parse(localStorage.getItem(NET_POLICY_KEY) || '{}') };
    } catch {
      return { wifi: true, mobile: true };
    }
  }

  setNetPolicy(policy) {
    const merged = { ...this.getNetPolicy(), ...policy };
    localStorage.setItem(NET_POLICY_KEY, JSON.stringify(merged));
    emit('offline:uiChanged');
  }

  /* ─── Preset ─── */

  getPreset() {
    const name = localStorage.getItem(PRESET_KEY) || 'balanced';
    return PRESETS[name] || PRESETS.balanced;
  }

  setPreset(name) {
    if (PRESETS[name]) {
      localStorage.setItem(PRESET_KEY, name);
      emit('offline:uiChanged');
    }
  }

  /* ─── Storage Info ─── */

  async getStorageInfo() {
    const est = await estimateUsage();
    const metas = await getAllTrackMetas();

    const counts = { pinned: 0, cloud: 0, dynamic: 0, total: 0 };
    const sizes = { pinned: 0, cloud: 0, dynamic: 0, total: 0 };

    for (const m of metas) {
      const s = m.size || 0;
      if (m.type === 'pinned') { counts.pinned++; sizes.pinned += s; }
      else if (m.type === 'cloud') { counts.cloud++; sizes.cloud += s; }
      else if (m.type === 'dynamic' || m.type === 'playbackWindow') { counts.dynamic++; sizes.dynamic += s; }
      counts.total++;
      sizes.total += s;
    }

    return {
      used: est.used || est.usage || 0,
      usage: est.used || est.usage || 0,
      quota: est.quota || 0,
      free: est.free || 0,
      categories: { counts, sizes }
    };
  }

  /* ─── Track Offline State (для UI-индикаторов) ─── */

  async getTrackOfflineState(uid) {
    const u = String(uid || '').trim();
    const empty = {
      pinned: false, cloud: false, cacheKind: 'none',
      cachedVariant: null, cachedComplete: 0,
      needsReCache: false, downloading: false
    };
    if (!u) return empty;

    const meta = await getTrackMeta(u);
    if (!meta) return empty;

    const found = await getAudioBlobAny(u, meta.quality || 'hi');
    const downloading = this.queue._active?.uid === u ||
                        this.queue._queue.some(i => i.uid === u);

    return {
      pinned: meta.type === 'pinned',
      cloud: meta.type === 'cloud' && !!found,
      cacheKind: meta.type || 'none',
      cachedVariant: found?.quality || null,
      cachedComplete: found ? 100 : 0,
      needsReCache: !!meta.needsReCache,
      downloading
    };
  }

  /* ─── isTrackComplete ─── */

  async isTrackComplete(uid, quality) {
    const u = String(uid || '').trim();
    if (!u) return false;
    const blob = await getAudioBlob(u, normQ(quality));
    return !!blob;
  }

  /* ─── Toggle Pinned (🔒) — ТЗ П.4 ─── */

  async togglePinned(uid) {
    const u = String(uid || '').trim();
    if (!u) return;

    const meta = await getTrackMeta(u);
    const quality = this.getCacheQuality();

    // Снятие 🔒 → Cloud-кандидат (ТЗ П.4.4)
    if (meta?.type === 'pinned') {
      const D = this.getCloudD();
      const now = Date.now();
      await setTrackMeta(u, {
        ...meta,
        type: 'cloud',
        cloudAddedAt: now,
        cloudExpiresAt: now + D * DAY_MS,
        pinnedAt: null
      });
      toast(`Офлайн-закрепление снято. Трек доступен как облачный кэш на ${D} дней.`);
      emit('offline:stateChanged');
      return;
    }

    // Проверка места (ТЗ П.2)
    if (!(await this._hasSpace())) {
      toastWarn('Недостаточно места на устройстве. Освободите память для офлайн-кэша.');
      return;
    }

    // Установка 🔒 (ТЗ П.4.3)
    const now = Date.now();
    const existing = await getAudioBlobAny(u, quality);

    await setTrackMeta(u, {
      ...(meta || {}),
      uid: u,
      type: 'pinned',
      pinnedAt: now,
      quality,
      needsReCache: existing ? (existing.quality !== quality) : false,
      cloudFullListenCount: meta?.cloudFullListenCount || 0,
      lastFullListenAt: meta?.lastFullListenAt || null,
      cloudAddedAt: meta?.cloudAddedAt || null,
      cloudExpiresAt: null
    });

    // Если файл уже есть (ТЗ П.4.3: "скачивание не нужно")
    if (existing) {
      toast('Трек закреплён офлайн 🔒');
      emit('offline:stateChanged');
      return;
    }

    toast('Трек будет доступен офлайн. Начинаю скачивание…');

    const url = getTrackUrl(u, quality);
    if (url) {
      this.queue.enqueue({ uid: u, url, quality, kind: 'pinned', priority: 10 });
    }

    emit('offline:stateChanged');
  }

  /* ─── Cloud: регистрация полного прослушивания (ТЗ П.5.2, П.5.3) ─── */

  async registerFullListen(uid) {
    const u = String(uid || '').trim();
    if (!u) return;

    const meta = await getTrackMeta(u);
    const now = Date.now();
    const N = this.getCloudN();
    const D = this.getCloudD();
    const quality = this.getCacheQuality();

    /* Уже 🔒 — просто обновить статистику */
    if (meta?.type === 'pinned') {
      await setTrackMeta(u, {
        ...meta,
        cloudFullListenCount: (meta.cloudFullListenCount || 0) + 1,
        lastFullListenAt: now
      });
      return;
    }

    /* Уже ☁ — обновить счётчик и продлить TTL (ТЗ П.5.3) */
    if (meta?.type === 'cloud') {
      const count = (meta.cloudFullListenCount || 0) + 1;
      await setTrackMeta(u, {
        ...meta,
        cloudFullListenCount: count,
        lastFullListenAt: now,
        cloudExpiresAt: now + D * DAY_MS
      });
      return;
    }

    /* Новый трек — инкрементируем счётчик (ТЗ П.5.2) */
    const count = (meta?.cloudFullListenCount || 0) + 1;
    const updatedMeta = {
      ...(meta || {}),
      uid: u,
      cloudFullListenCount: count,
      lastFullListenAt: now
    };

    /* Достигнут порог N → появляется ☁ (ТЗ П.5.2) */
    if (count >= N) {
      /* Проверка места */
      if (!(await this._hasSpace())) {
        console.warn('[OM] No space for cloud cache:', u);
        await setTrackMeta(u, updatedMeta);
        return;
      }

      updatedMeta.type = 'cloud';
      updatedMeta.quality = quality;
      updatedMeta.cloudAddedAt = now;
      updatedMeta.cloudExpiresAt = now + D * DAY_MS;

      await setTrackMeta(u, updatedMeta);

      /* Запускаем скачивание (ТЗ П.5.2 — "тихо в фоне") */
      const url = getTrackUrl(u, quality);
      if (url) {
        this.queue.enqueue({ uid: u, url, quality, kind: 'cloud', priority: 3 });
      }

      emit('offline:stateChanged');
      return;
    }

    /* Ещё не порог — просто сохраняем мету */
    await setTrackMeta(u, updatedMeta);
  }

  /* ─── recordListenStats — alias для PlayerCore ─── */

  async recordListenStats(uid, pct) {
    if (typeof pct === 'number' && pct >= 0.97) {
      await this.registerFullListen(uid);
    }
  }

  /* ─── enqueueAudioDownload — для PlayerCore/playback-cache-bootstrap ─── */

  async enqueueAudioDownload(uid, quality, opts = {}) {
    const u = String(uid || '').trim();
    if (!u) return;
    const q = normQ(quality);
    const url = getTrackUrl(u, q);
    if (!url) return;

    const kind = opts.kind || 'playbackWindow';
    const priority = opts.priority ?? 1;

    this.queue.enqueue({ uid: u, url, quality: q, kind, priority });
  }

  /* ─── updatePlaybackWindow (ТЗ П.7) ─── */

  async updatePlaybackWindow(currentUid, playlist, windowSize = 2) {
    if (!playlist || !playlist.length) return;

    const quality = this.getCacheQuality();
    const idx = playlist.indexOf(currentUid);
    if (idx === -1) return;

    /* Определяем окно вокруг текущего трека */
    const windowUids = new Set();
    for (let i = Math.max(0, idx - windowSize); i <= Math.min(playlist.length - 1, idx + windowSize); i++) {
      windowUids.add(playlist[i]);
    }

    /* Ставим в очередь те, что ещё не закэшированы */
    for (const uid of windowUids) {
      const complete = await this.isTrackComplete(uid, quality);
      if (!complete) {
        const url = getTrackUrl(uid, quality);
        if (url) {
          const dist = Math.abs(playlist.indexOf(uid) - idx);
          this.queue.enqueue({
            uid, url, quality, kind: 'playbackWindow', priority: 5 - dist
          });
        }
      }
    }
  }

  /* ─── Remove cached audio (ТЗ П.5.5) ─── */

  async removeCached(uid) {
    const u = String(uid || '').trim();
    if (!u) return;

    this.queue.cancel(u);
    await deleteTrackCache(u);
    await deleteTrackMeta(u);
    emit('offline:stateChanged');
  }

  /* ─── Clear by category ─── */

  async clearByCategory(category) {
    const metas = await getAllTrackMetas();
    let count = 0;

    for (const m of metas) {
      if (category === 'all' || m.type === category) {
        this.queue.cancel(m.uid);
        await deleteTrackCache(m.uid);
        await deleteTrackMeta(m.uid);
        count++;
      }
    }

    emit('offline:stateChanged');
    return count;
  }

  /* ─── Pause / Resume downloads ─── */

  pauseDownloads() { this.queue.pause(); emit('offline:uiChanged'); }
  resumeDownloads() { this.queue.resume(); emit('offline:uiChanged'); }

  /* ─── Re-cache (ТЗ П.8.3) ─── */

  async reCacheAll(progressCallback) {
    const quality = this.getCacheQuality();
    const metas = await getAllTrackMetas();
    const items = metas.filter(m => m.type === 'pinned' || m.type === 'cloud');
    const total = items.length;
    let done = 0;

    for (const m of items) {
      this.queue.cancel(m.uid);
      await deleteTrackCache(m.uid);

      const url = getTrackUrl(m.uid, quality);
      if (url) {
        this.queue.enqueue({
          uid: m.uid, url, quality,
          kind: 'reCache', priority: m.type === 'pinned' ? 8 : 5
        });
      }

      done++;
      if (typeof progressCallback === 'function') {
        progressCallback({ done, total, uid: m.uid, pct: Math.round((done / total) * 100) });
      }
      this._emit('progress', { phase: 'reCache', done, total, uid: m.uid });
    }

    toast(`Re-cache запущен для ${total} треков.`);
    return { total, done };
  }

  /* ─── Global Statistics (ТЗ П.9) ─── */

  async getGlobalStatistics() {
    const metas = await getAllTrackMetas();
    const storage = await this.getStorageInfo();

    const pinned = metas.filter(m => m.type === 'pinned');
    const cloud = metas.filter(m => m.type === 'cloud');
    const dynamic = metas.filter(m => m.type === 'dynamic' || m.type === 'playbackWindow');

    const totalListens = metas.reduce((s, m) => s + (m.cloudFullListenCount || 0), 0);
    const avgListens = metas.length ? (totalListens / metas.length).toFixed(1) : 0;

    const cloudExpiringSoon = cloud.filter(m => {
      return m.cloudExpiresAt && (m.cloudExpiresAt - Date.now()) < 3 * DAY_MS;
    });

    return {
      storage,
      counts: {
        pinned: pinned.length,
        cloud: cloud.length,
        dynamic: dynamic.length,
        total: metas.length,
        needsReCache: metas.filter(m => m.needsReCache).length,
        cloudExpiringSoon: cloudExpiringSoon.length
      },
      listens: {
        total: totalListens,
        average: parseFloat(avgListens)
      },
      queue: this.queue.getStatus(),
      settings: {
        mode: this.getMode(),
        quality: this.getCacheQuality(),
        cloudN: this.getCloudN(),
        cloudD: this.getCloudD(),
        netPolicy: this.getNetPolicy(),
        preset: this.getPreset()
      },
      items: metas
    };
  }

  /* ─── Get list for ☁/🔒 modal ─── */

  async getPinnedAndCloudList() {
    const metas = await getAllTrackMetas();
    return metas
      .filter(m => m.type === 'pinned' || m.type === 'cloud')
      .map(m => {
        const track = getTrackData(m.uid);
        return {
          ...m,
          title: track?.title || m.uid,
          artist: track?.artist || '',
          album: track?.album || ''
        };
      })
      .sort((a, b) => {
        if (a.type === 'pinned' && b.type !== 'pinned') return -1;
        if (a.type !== 'pinned' && b.type === 'pinned') return 1;
        return (b.lastFullListenAt || 0) - (a.lastFullListenAt || 0);
      });
  }

  /* ─── Expired cloud cleanup (ТЗ П.5.6) ─── */

  async _cleanExpiredCloud() {
    const metas = await getAllTrackMetas();
    const now = Date.now();
    let removed = 0;

    for (const m of metas) {
      if (m.type === 'cloud' && m.cloudExpiresAt && m.cloudExpiresAt < now) {
        await deleteTrackCache(m.uid);
        await deleteTrackMeta(m.uid);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[OM] Cleaned ${removed} expired cloud tracks.`);
      emit('offline:stateChanged');
    }
  }

  /* ─── Space check (ТЗ П.2) ─── */

  async _hasSpace() {
    try {
      const est = await estimateUsage();
      if (!est.quota) return true;
      const free = est.quota - (est.used || est.usage || 0);
      return free > MIN_SPACE_MB * MB;
    } catch {
      return true;
    }
  }
}

/* ═══════ Singleton ═══════ */

const offlineManager = new OfflineManager();

export function getOfflineManager() {
  return offlineManager;
}

export default offlineManager;

