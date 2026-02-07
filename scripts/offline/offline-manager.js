/**
 * offline-manager.js — Центральный модуль офлайн-кэша (v1.0/R1)
 *
 * Реализует:
 * - Pinned 🔒 / Cloud ☁ (мета, TTL, авто-cloud по N full listens)
 * - единое качество qualityMode:v1 (hi|lo)
 * - DownloadQueue (единая очередь, 1 параллель по умолчанию)
 * - resolveTrackSource: 4-ступенчатый приоритет из ТЗ Часть 7.2
 *
 * Инварианты:
 * - НИКОГДА не вызывает playerCore.stop()/play() и не ломает playing-плейлист.
 */

import {
  openDB,
  setAudioBlob,
  getAudioBlob,
  deleteAudioVariant,
  deleteAudio,
  setTrackMeta,
  getTrackMeta,
  updateTrackMeta,
  deleteTrackMeta,
  getAllTrackMetas,
  hasAudioForUid,
  getStoredVariant,
  deleteTrackCache
} from './cache-db.js';

/* --- CONSTANTS --- */
const STORAGE_KEYS = {
  QUALITY: 'qualityMode:v1',
  MODE: 'offline:mode:v1',
  CLOUD_N: 'cloud:listenThreshold',
  CLOUD_D: 'cloud:ttlDays'
};

const DEFAULTS = { CLOUD_N: 5, CLOUD_D: 31, MIN_SPACE_MB: 60 };

export const DOWNLOAD_PRIORITY = {
  CUR: 100,
  NEIGHBOR: 90,
  PINNED: 80,
  RECACHE_CLOUD: 70,
  CLOUD_FILL: 60,
  NON_AUDIO: 50
};

const MB = 1024 * 1024;
const DAY_MS = 86400000;

/* --- UTILS --- */
const emit = (name, detail = {}) =>
  window.dispatchEvent(new CustomEvent(name, { detail }));

const normQ = (v) => (String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi');

const toast = (msg) => window.NotificationSystem?.info?.(msg);
const toastWarn = (msg) => window.NotificationSystem?.warning?.(msg);

function isNetworkAllowed() {
  if (window.NetPolicy?.isNetworkAllowed) return !!window.NetPolicy.isNetworkAllowed();
  return navigator.onLine;
}

function getTrackUrl(uid, quality) {
  const t = window.TrackRegistry?.getTrackByUid?.(uid);
  if (!t) return null;
  const q = normQ(quality);
  return q === 'lo' ? (t.audio_low || t.audio || t.src) : (t.audio || t.src);
}

function getTrackTitle(uid) {
  return window.TrackRegistry?.getTrackByUid?.(uid)?.title || uid;
}

/* --- DOWNLOAD QUEUE (ТЗ Часть 10) --- */
class DownloadQueue {
  constructor() {
    this._queue = [];
    this._active = new Map(); // uid -> { ctrl, item }
    this._paused = false;
    this._maxParallel = 1;
  }

  setParallel(n) {
    this._maxParallel = Math.max(1, Number(n) || 1);
    this._process();
  }

  pause() {
    this._paused = true;
  }

  resume() {
    this._paused = false;
    this._process();
  }

  clear() {
    for (const v of this._active.values()) v.ctrl.abort();
    this._active.clear();
    this._queue = [];
  }

  getStatus() {
    return { active: this._active.size, queued: this._queue.length, isPaused: this._paused };
  }

  isDownloading(uid) {
    return this._active.has(String(uid || '').trim());
  }

  cancel(uid) {
    const u = String(uid || '').trim();
    if (!u) return;

    this._queue = this._queue.filter((i) => i.uid !== u);

    const act = this._active.get(u);
    if (act) {
      act.ctrl.abort();
      this._active.delete(u);
    }
    this._process();
  }

  enqueue(task) {
    const uid = String(task?.uid || '').trim();
    const url = task?.url;
    const quality = normQ(task?.quality);
    const kind = task?.kind || 'cloud';
    const priority = Number(task?.priority || 0);

    if (!uid || !url) return;

    // Дедуп: если уже качаем этот uid:
    // - то же качество => skip
    // - другое качество => abort (анти-истерика)
    const active = this._active.get(uid);
    if (active) {
      if (active.item.quality === quality) return;
      active.ctrl.abort();
      this._active.delete(uid);
    }

    const idx = this._queue.findIndex((i) => i.uid === uid);
    if (idx !== -1) {
      const existing = this._queue[idx];
      if (existing.quality !== quality) {
        this._queue.splice(idx, 1);
      } else if (priority > existing.priority) {
        existing.priority = priority;
        this._sort();
        this._process();
        return;
      } else {
        return;
      }
    }

    this._queue.push({
      uid,
      url,
      quality,
      kind,
      priority,
      retries: 0,
      addedAt: Date.now()
    });

    this._sort();
    this._process();
  }

  _sort() {
    this._queue.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.addedAt - b.addedAt;
    });
  }

  async _process() {
    if (this._paused) return;
    if (this._active.size >= this._maxParallel) return;
    if (!this._queue.length) return;
    if (!isNetworkAllowed()) return;

    const item = this._queue.shift();
    this._start(item);
  }

  async _start(item) {
    const ctrl = new AbortController();
    this._active.set(item.uid, { ctrl, item });
    emit('offline:downloadStart', { uid: item.uid, kind: item.kind });

    try {
      const resp = await fetch(item.url, { signal: ctrl.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();

      // мягкая проверка места перед записью
      if (window.OfflineManager && !(await window.OfflineManager.hasSpace())) {
        throw new Error('DiskFull');
      }

      await setAudioBlob(item.uid, item.quality, blob);

      await updateTrackMeta(item.uid, {
        quality: item.quality,
        size: blob.size,
        url: item.url,
        cachedComplete: true,
        needsReCache: false
      });

      // ТЗ 1.7: двухфазная замена. Удаляем другой variant после успеха и не для CUR.
      try {
        const curUid = window.playerCore?.getCurrentTrackUid?.();
        if (!curUid || String(curUid).trim() !== String(item.uid).trim()) {
          const otherQ = item.quality === 'hi' ? 'lo' : 'hi';
          await deleteAudioVariant(item.uid, otherQ).catch(() => {});
        }
      } catch {}

      this._active.delete(item.uid);
      emit('offline:trackCached', { uid: item.uid });
      emit('offline:stateChanged');
    } catch (e) {
      this._active.delete(item.uid);

      if (e?.name === 'AbortError') {
        // ТЗ 4.4: удаляем только недокачанный вариант, не трогаем "старый правильный"
        await deleteAudioVariant(item.uid, item.quality).catch(() => {});
        this._process();
        return;
      }

      console.warn(`[Queue] Failed ${item.uid}: ${e?.message || e}`);

      if (e?.message !== 'DiskFull' && item.retries < 3) {
        item.retries++;
        const delay = 1000 * Math.pow(2, item.retries);
        setTimeout(() => {
          this._queue.push(item);
          this._sort();
          this._process();
        }, delay);
      } else {
        if (e?.message === 'DiskFull') toastWarn('Мало места, загрузка приостановлена');
        emit('offline:downloadFailed', { uid: item.uid, error: e?.message || 'DownloadFailed' });
      }
    } finally {
      this._process();
    }
  }
}

/* --- MAIN MANAGER --- */
class OfflineManager {
  constructor() {
    this.queue = new DownloadQueue();
    this._ready = false;
    this._spaceOk = true;
    this._protectedUids = new Set();

    // ВАЖНО: PlayerUI сейчас ищет window._offlineManagerInstance
    // чтобы сделать confirm>5 для перекэша при смене качества.
    window._offlineManagerInstance = this;
  }

  async initialize() {
    if (this._ready) return;

    await openDB();
    await this._checkSpaceOnStartup();
    await this._cleanExpiredOnStartup();

    window.addEventListener('netPolicy:changed', () => this.queue.resume());
    window.addEventListener('quality:changed', (e) => this._onQualityChanged(e.detail?.quality));

    this._ready = true;
    emit('offline:ready');
  }

  /* --- API --- */

  isSpaceOk() {
    return this._spaceOk;
  }

  getDownloadStatus() {
    return this.queue.getStatus();
  }

  async getTrackOfflineState(uid) {
    if (!this._ready) return { status: 'none', clickable: false };

    const u = String(uid || '').trim();
    if (!u) return { status: 'none', clickable: false };

    const meta = await getTrackMeta(u);
    const hasBlob = await hasAudioForUid(u);
    const selectedQ = this.getQuality();

    let status = 'none';
    if (meta?.type === 'pinned') status = 'pinned';
    else if (meta?.type === 'cloud') status = (hasBlob && meta.cachedComplete) ? 'cloud' : 'cloud_loading';
    else if (meta?.type === 'playbackCache') status = 'transient';

    return {
      status,
      downloading: this.queue.isDownloading(u),
      cachedComplete: hasBlob && !!meta?.cachedComplete,
      needsReCache: !!meta?.needsReCache || (hasBlob && meta?.quality && meta.quality !== selectedQ),
      needsUpdate: !!meta?.needsUpdate,
      cloudExpiresAt: meta?.cloudExpiresAt || null,
      quality: meta?.quality || null,
      daysLeft: meta?.cloudExpiresAt
        ? Math.max(0, Math.ceil((meta.cloudExpiresAt - Date.now()) / DAY_MS))
        : 0
    };
  }

  async getStorageBreakdown() {
    const all = await getAllTrackMetas();
    const bd = { pinned: 0, cloud: 0, transient: 0, other: 0 };

    for (const m of all) {
      const sz = m.size || 0;
      if (m.type === 'pinned') bd.pinned += sz;
      else if (m.type === 'cloud') bd.cloud += sz;
      else if (m.type === 'playbackCache') bd.transient += sz;
      else bd.other += sz;
    }
    return bd;
  }

  async getStorageUsage() {
    const metas = await getAllTrackMetas();
    const stats = {
      pinned: { count: 0, size: 0 },
      cloud: { count: 0, size: 0 },
      transient: { count: 0, size: 0 }
    };

    for (const m of metas) {
      const sz = m.size || 0;
      const bucket = stats[m.type] || stats.transient;
      bucket.count++;
      bucket.size += sz;
    }
    return stats;
  }

  async getOfflineTracksList() {
    const metas = await getAllTrackMetas();
    const pinned = metas
      .filter((m) => m.type === 'pinned')
      .sort((a, b) => (a.pinnedAt || 0) - (b.pinnedAt || 0));

    const cloud = metas
      .filter((m) => m.type === 'cloud')
      .sort((a, b) => (b.cloudExpiresAt || 0) - (a.cloudExpiresAt || 0));

    return { pinned, cloud };
  }

  /* --- ACTIONS --- */

  async togglePinned(uid) {
    if (!this._ready) return;

    const u = String(uid || '').trim();
    if (!u) return;

    const meta = (await getTrackMeta(u)) || { uid: u };
    const now = Date.now();
    const selectedQ = this.getQuality();
    const { D } = this.getCloudSettings();

    if (meta.type === 'pinned') {
      // ТЗ 5.6: unpin -> cloud сразу, файл НЕ удаляем
      await updateTrackMeta(u, {
        type: 'cloud',
        cloudOrigin: 'unpin',
        pinnedAt: null,
        cloudAddedAt: now,
        cloudExpiresAt: now + D * DAY_MS
      });
      toast(`Офлайн-закрепление снято. Трек доступен как облачный кэш на ${D} дней.`);
      emit('offline:stateChanged');
      return;
    }

    // pin
    if (!this._spaceOk) {
      toastWarn('Недостаточно места на устройстве');
      return;
    }

    await updateTrackMeta(u, {
      type: 'pinned',
      pinnedAt: now,
      quality: selectedQ,
      cloudExpiresAt: null
    });

    const existingQ = await getStoredVariant(u);

    // Если файл уже есть как cloud/old quality — скачивание может не понадобиться
    if (!existingQ) {
      const url = getTrackUrl(u, selectedQ);
      if (url) {
        this.queue.enqueue({ uid: u, url, quality: selectedQ, kind: 'pinned', priority: DOWNLOAD_PRIORITY.PINNED });
        toast('Трек будет доступен офлайн. Начинаю скачивание...');
      }
    } else if (existingQ !== selectedQ) {
      await updateTrackMeta(u, { needsReCache: true });
      const url = getTrackUrl(u, selectedQ);
      if (url) this.queue.enqueue({ uid: u, url, quality: selectedQ, kind: 'reCache', priority: DOWNLOAD_PRIORITY.PINNED });
      toast('Трек закреплён 🔒');
    } else {
      toast('Трек закреплён 🔒');
    }

    emit('offline:stateChanged');
  }

  async removeCached(uid) {
    const u = String(uid || '').trim();
    if (!u) return;

    this.queue.cancel(u);
    await deleteAudio(u);

    // ТЗ 6.6: сбросить cloud-статистику, НЕ трогать global stats (они в другом модуле)
    await updateTrackMeta(u, {
      type: null,
      cloudOrigin: null,
      pinnedAt: null,
      cloudFullListenCount: 0,
      lastFullListenAt: null,
      cloudAddedAt: null,
      cloudExpiresAt: null,
      cachedComplete: false,
      needsReCache: false,
      needsUpdate: false,
      quality: null,
      size: 0
    });

    emit('offline:stateChanged');
  }

  async removeAllCached() {
    const metas = await getAllTrackMetas();
    for (const m of metas) {
      if (m.type === 'pinned' || m.type === 'cloud') {
        await this.removeCached(m.uid);
      }
    }
    toast('Все офлайн-треки удалены');
  }

  /* --- LISTEN TRACKING (cloud stats only) --- */

  async registerFullListen(uid, { duration, position }) {
    const u = String(uid || '').trim();
    if (!u) return;

    const dur = Number(duration) || 0;
    const pos = Number(position) || 0;

    // ТЗ: full listen только если duration валидна И прогресс строго > 90%
    if (!(dur > 0)) return;
    if (!((pos / dur) > 0.9)) return;

    const meta = (await getTrackMeta(u)) || { uid: u };
    const { N, D } = this.getCloudSettings();
    const now = Date.now();

    const count = (meta.cloudFullListenCount || 0) + 1;
    const updates = { cloudFullListenCount: count, lastFullListenAt: now };

    // ТЗ 6.7: продлить TTL если уже cloud
    if (meta.type === 'cloud') {
      updates.cloudExpiresAt = now + D * DAY_MS;
    }

    // ТЗ 6.4: авто-cloud
    if (meta.type !== 'pinned' && meta.type !== 'cloud' && count >= N) {
      if (await this.hasSpace()) {
        updates.type = 'cloud';
        updates.cloudOrigin = 'auto';
        updates.cloudAddedAt = now;
        updates.cloudExpiresAt = now + D * DAY_MS;
        updates.quality = this.getQuality();

        // скачиваем только если нет blob
        if (!(await hasAudioForUid(u))) {
          const url = getTrackUrl(u, updates.quality);
          if (url) {
            this.queue.enqueue({ uid: u, url, quality: updates.quality, kind: 'cloud', priority: DOWNLOAD_PRIORITY.CLOUD_FILL });
          }
          toast(`Трек добавлен в офлайн на ${D} дней.`);
        }
      }
    }

    await updateTrackMeta(u, updates);
    emit('offline:stateChanged');
  }

  async recordTickStats() {
    // cloud-статистика секунд не считает (ТЗ 9.1)
  }

  /* --- SETTINGS --- */

  getMode() {
    return localStorage.getItem(STORAGE_KEYS.MODE) || 'R0';
  }

  async setMode(m) {
    let mode = m === 'R1' ? 'R1' : 'R0';
    if (mode === 'R1' && !(await this.hasSpace())) {
      toastWarn('Недостаточно места, PlaybackCache отключён');
      mode = 'R0';
    }
    localStorage.setItem(STORAGE_KEYS.MODE, mode);
    emit('offline:uiChanged');
  }

  getQuality() {
    return normQ(localStorage.getItem(STORAGE_KEYS.QUALITY));
  }

  // Важно: setter без emit (emit делает PlayerCore.switchQuality)
  setCacheQualitySetting(q) {
    localStorage.setItem(STORAGE_KEYS.QUALITY, normQ(q));
  }

  getCloudSettings() {
    return {
      N: parseInt(localStorage.getItem(STORAGE_KEYS.CLOUD_N), 10) || DEFAULTS.CLOUD_N,
      D: parseInt(localStorage.getItem(STORAGE_KEYS.CLOUD_D), 10) || DEFAULTS.CLOUD_D
    };
  }

  async previewCloudSettingsChange({ newN, newD }) {
    const N = Math.max(1, parseInt(newN, 10) || DEFAULTS.CLOUD_N);
    const D = Math.max(1, parseInt(newD, 10) || DEFAULTS.CLOUD_D);

    const metas = await getAllTrackMetas();
    const now = Date.now();

    let toRemove = 0;
    for (const m of metas) {
      if (m.type !== 'cloud') continue;

      if (m.cloudOrigin === 'auto' && (m.cloudFullListenCount || 0) < N) {
        toRemove++;
        continue;
      }
      if (m.lastFullListenAt) {
        const newExpire = m.lastFullListenAt + D * DAY_MS;
        if (newExpire < now) toRemove++;
      }
    }

    return { toRemove };
  }

  async confirmApplyCloudSettings({ newN, newD }) {
    const N = Math.max(1, parseInt(newN, 10) || DEFAULTS.CLOUD_N);
    const D = Math.max(1, parseInt(newD, 10) || DEFAULTS.CLOUD_D);

    localStorage.setItem(STORAGE_KEYS.CLOUD_N, String(N));
    localStorage.setItem(STORAGE_KEYS.CLOUD_D, String(D));

    const metas = await getAllTrackMetas();
    const now = Date.now();
    let removedCount = 0;

    for (const m of metas) {
      if (m.type !== 'cloud') continue;

      // ТЗ 6.8: если N увеличен — удалить auto-cloud с count < N
      if (m.cloudOrigin === 'auto' && (m.cloudFullListenCount || 0) < N) {
        await this.removeCached(m.uid);
        removedCount++;
        continue;
      }

      // ТЗ 6.8: пересчёт D: cloudExpiresAt = lastFullListenAt + D
      if (m.lastFullListenAt) {
        const newExpire = m.lastFullListenAt + D * DAY_MS;
        if (newExpire < now) {
          await this.removeCached(m.uid);
          removedCount++;
        } else {
          await updateTrackMeta(m.uid, { cloudExpiresAt: newExpire });
        }
      }
    }

    toast(removedCount > 0 ? `Обновлено. Удалено треков: ${removedCount}` : 'Настройки облака обновлены');
  }

  async countNeedsReCache(targetQuality) {
    const q = normQ(targetQuality || this.getQuality());
    const metas = await getAllTrackMetas();
    let count = 0;

    for (const m of metas) {
      if ((m.type === 'pinned' || m.type === 'cloud') && m.quality && m.quality !== q) count++;
    }
    return count;
  }

  async reCacheAll(targetQuality) {
    const q = normQ(targetQuality || this.getQuality());
    const metas = await getAllTrackMetas();
    let enqueued = 0;

    for (const m of metas) {
      if ((m.type === 'pinned' || m.type === 'cloud') && m.quality && m.quality !== q) {
        const url = getTrackUrl(m.uid, q);
        if (!url) continue;

        const prio = m.type === 'pinned'
          ? DOWNLOAD_PRIORITY.PINNED
          : DOWNLOAD_PRIORITY.RECACHE_CLOUD;

        this.queue.enqueue({ uid: m.uid, url, quality: q, kind: 'reCache', priority: prio });
        enqueued++;
      }
    }

    return enqueued;
  }

  async clearByType(type) {
    const metas = await getAllTrackMetas();
    let count = 0;
    for (const m of metas) {
      if (m.type === type) {
        await deleteTrackCache(m.uid);
        count++;
      }
    }
    if (count > 0) emit('offline:stateChanged');
    return count;
  }

  async clearAll() {
    const metas = await getAllTrackMetas();
    for (const m of metas) await deleteTrackCache(m.uid);
    if (metas.length > 0) emit('offline:stateChanged');
    return metas.length;
  }

  async getTrackMeta(uid) {
    return getTrackMeta(uid);
  }

  /* --- RESOLVE SOURCE (ТЗ Часть 7.2) --- */

  /**
   * @param {string} uid
   * @param {string} [requestedQuality] - приходит из TrackResolver, но в v1.0 выбранное качество = qualityMode
   */
  async resolveTrackSource(uid, requestedQuality) {
    const u = String(uid || '').trim();
    if (!u) return { source: 'none', url: null, quality: this.getQuality() };

    const selectedQ = normQ(requestedQuality || this.getQuality());
    const otherQ = selectedQ === 'hi' ? 'lo' : 'hi';
    const netOk = isNetworkAllowed();

    // 1) локальная копия в текущем качестве
    const blob = await getAudioBlob(u, selectedQ);
    if (blob) return { source: 'local', blob, quality: selectedQ };

    // 2) локальная копия в другом качестве
    const otherBlob = await getAudioBlob(u, otherQ);
    if (otherBlob) {
      if (selectedQ === 'lo') {
        // улучшение: выбрано Lo, но есть Hi — играем Hi и помечаем needsReCache
        await updateTrackMeta(u, { needsReCache: true });
        return { source: 'local', blob: otherBlob, quality: otherQ };
      }

      // выбрано Hi, но есть только Lo
      if (netOk) {
        const url = getTrackUrl(u, selectedQ);
        if (url) {
          await updateTrackMeta(u, { needsReCache: true });
          // тихо ставим в очередь перекачку (по одному)
          this.queue.enqueue({
            uid: u,
            url,
            quality: selectedQ,
            kind: 'reCache',
            priority: DOWNLOAD_PRIORITY.RECACHE_CLOUD
          });
          return { source: 'stream', url, quality: selectedQ };
        }
      }

      // 4) fallback: сети нет — играем то, что есть
      return { source: 'local', blob: otherBlob, quality: otherQ };
    }

    // 3) сеть в текущем качестве
    if (netOk) {
      const url = getTrackUrl(u, selectedQ);
      if (url) return { source: 'stream', url, quality: selectedQ };
    }

    return { source: 'none', url: null, quality: selectedQ };
  }

  async enqueueAudioDownload(uid, { priority, kind }) {
    if (!this._ready) return;

    const u = String(uid || '').trim();
    if (!u) return;

    const k = kind || 'cloud';

    // ТЗ 8.10: transient не создаём если pinned/cloud или blob уже есть
    if (k === 'playbackCache') {
      const meta = await getTrackMeta(u);
      if (meta?.type === 'pinned' || meta?.type === 'cloud') return;
      if (await hasAudioForUid(u)) return;
    }

    const ok = await this.hasSpace();
    if (!ok) {
      if (k === 'playbackCache') {
        toastWarn('Мало места, предзагрузка приостановлена');
        return;
      }
      // pinned/cloud: пробуем освободить место удалением transients
      const freed = await this._evictTransient(5 * MB);
      if (!freed) {
        toastWarn('Недостаточно места на устройстве');
        return;
      }
    }

    const q = this.getQuality();
    const url = getTrackUrl(u, q);
    if (!url) return;

    const existingMeta = await getTrackMeta(u);
    if (!existingMeta && k === 'playbackCache') {
      await setTrackMeta(u, {
        uid: u,
        type: 'playbackCache',
        quality: q,
        cachedComplete: false,
        needsReCache: false,
        createdAt: Date.now()
      });
    }

    this.queue.enqueue({ uid: u, url, quality: q, kind: k, priority: Number(priority || 0) });
  }

  /* --- QUALITY CHANGE (ТЗ Часть 4.4) --- */

  async _onQualityChanged(newQuality) {
    const q = normQ(newQuality);
    const metas = await getAllTrackMetas();
    const curUid = window.playerCore?.getCurrentTrackUid?.();

    // 1) отменяем активные загрузки pinned/cloud (анти-истерика)
    for (const m of metas) {
      if ((m.type === 'pinned' || m.type === 'cloud') && this.queue.isDownloading(m.uid)) {
        this.queue.cancel(m.uid);
      }
    }

    // 2) помечаем needsReCache по фактическому quality в meta
    let reCacheCount = 0;
    for (const m of metas) {
      if (m.type !== 'pinned' && m.type !== 'cloud') continue;

      if (m.quality && m.quality !== q) {
        if (!m.needsReCache) await updateTrackMeta(m.uid, { needsReCache: true });
        reCacheCount++;
      } else if (m.quality === q && m.needsReCache) {
        await updateTrackMeta(m.uid, { needsReCache: false });
      }
    }

    // 3) тихая очередь (по одному), pinned сначала, CUR пропускаем
    if (reCacheCount > 0) {
      const list = metas
        .filter((m) => (m.type === 'pinned' || m.type === 'cloud') && m.quality && m.quality !== q)
        .sort((a, b) => (a.type === b.type ? 0 : (a.type === 'pinned' ? -1 : 1)));

      for (const m of list) {
        if (curUid && String(curUid).trim() === String(m.uid).trim()) continue;

        const url = getTrackUrl(m.uid, q);
        if (!url) continue;

        const prio = m.type === 'pinned'
          ? DOWNLOAD_PRIORITY.PINNED
          : DOWNLOAD_PRIORITY.RECACHE_CLOUD;

        this.queue.enqueue({ uid: m.uid, url, quality: q, kind: 'reCache', priority: prio });
      }
    }

    emit('offline:stateChanged');
    emit('offline:reCacheStatus', { count: reCacheCount });
  }

  /* --- TRANSIENT EVICTION --- */

  setProtectedUids(uids) {
    this._protectedUids = new Set(uids || []);
  }

  async _evictTransient(bytesNeeded) {
    const metas = await getAllTrackMetas();
    const transients = metas
      .filter((m) => m.type === 'playbackCache')
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    let freed = 0;

    for (const m of transients) {
      if (this._protectedUids.has(m.uid)) continue;

      await deleteAudio(m.uid);
      await deleteTrackMeta(m.uid);
      freed += (m.size || 0);

      if (freed >= bytesNeeded) return true;
    }

    return freed >= bytesNeeded;
  }

  /* --- SPACE / TTL --- */

  async hasSpace() {
    try {
      const est = await navigator.storage?.estimate?.();
      if (!est?.quota) {
        this._spaceOk = true;
        return true;
      }
      const free = (est.quota || 0) - (est.usage || 0);
      this._spaceOk = free >= DEFAULTS.MIN_SPACE_MB * MB;
      return this._spaceOk;
    } catch {
      this._spaceOk = true;
      return true;
    }
  }

  async _checkSpaceOnStartup() {
    await this.hasSpace();
    if (!this._spaceOk && this.getMode() === 'R1') {
      localStorage.setItem(STORAGE_KEYS.MODE, 'R0');
      toastWarn('Недостаточно места, PlaybackCache отключён');
    }
  }

  async _cleanExpiredOnStartup() {
    const metas = await getAllTrackMetas();
    const now = Date.now();
    let cleaned = 0;

    for (const m of metas) {
      if (m.type === 'cloud' && m.cloudExpiresAt && m.cloudExpiresAt < now) {
        await deleteAudio(m.uid);
        await updateTrackMeta(m.uid, {
          type: null,
          cloudOrigin: null,
          cloudFullListenCount: 0,
          lastFullListenAt: null,
          cloudAddedAt: null,
          cloudExpiresAt: null,
          cachedComplete: false,
          needsReCache: false,
          needsUpdate: false,
          quality: null,
          size: 0
        });
        cleaned++;
        toast(`Офлайн-доступ истёк. Трек "${getTrackTitle(m.uid)}" удалён из кэша.`);
      }
    }

    if (cleaned > 0) emit('offline:stateChanged');
  }

  /* --- UPDATES (ТЗ Часть 11) --- */

  async checkForUpdates(remoteConfig) {
    if (!remoteConfig?.tracks) return 0;

    const metas = await getAllTrackMetas();
    let updatesCount = 0;

    for (const m of metas) {
      if (m.type !== 'pinned' && m.type !== 'cloud') continue;

      const remote = remoteConfig.tracks.find((t) => t.uid === m.uid);
      if (!remote) continue;

      const q = m.quality || this.getQuality();
      const remoteSize = q === 'lo' ? remote.size_low : remote.size;
      if (!remoteSize || !m.size) continue;

      if (Math.abs(remoteSize * MB - m.size) > 1024) {
        await updateTrackMeta(m.uid, { needsUpdate: true });
        updatesCount++;
      }
    }

    if (updatesCount > 0) emit('offline:updatesAvailable', { count: updatesCount });
    return updatesCount;
  }

  async updateAll() {
    const q = this.getQuality();
    const metas = await getAllTrackMetas();
    let enqueued = 0;

    for (const m of metas) {
      if (!m.needsUpdate) continue;
      if (m.type !== 'pinned' && m.type !== 'cloud') continue;

      const url = getTrackUrl(m.uid, q);
      if (!url) continue;

      const prio = m.type === 'pinned'
        ? DOWNLOAD_PRIORITY.PINNED
        : DOWNLOAD_PRIORITY.RECACHE_CLOUD;

      this.queue.enqueue({ uid: m.uid, url, quality: q, kind: 'update', priority: prio });
      enqueued++;
    }

    return enqueued;
  }

  async hasNeedsAttention() {
    const metas = await getAllTrackMetas();
    return metas.some((m) =>
      (m.type === 'pinned' || m.type === 'cloud') && (m.needsReCache || m.needsUpdate)
    );
  }
}

/* --- SINGLETON & GLOBAL --- */
const offlineManager = new OfflineManager();
window.OfflineManager = offlineManager;

export function getOfflineManager() {
  return offlineManager;
}

export default offlineManager;
