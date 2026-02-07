/**
 * offline-manager.js — Центральный модуль офлайн-кэша (v2.0)
 * 
 * Fixes vs ТЗ:
 * - #2: togglePinned → cloud transition с корректными полями
 * - #3: _onQualityChanged — отмена текущих загрузок (защита от "истерики")
 * - countNeedsReCache считает файлы с ДРУГИМ качеством
 * - registerFullListen корректно проверяет >90%
 * - resolveTrackSource — полная 4-ступенчатая логика из ТЗ Часть 7.2
 * - enqueueAudioDownload — не создаёт transient если есть pinned/cloud
 * - confirmApplyCloudSettings — preview перед удалением
 * - Eviction вызывается перед загрузкой
 */

import {
  openDB,
  setAudioBlob, getAudioBlob, deleteAudioVariant, deleteAudio,
  setTrackMeta, getTrackMeta, updateTrackMeta, deleteTrackMeta,
  getAllTrackMetas, hasAudioForUid, estimateUsage, getStoredVariant,
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
  CUR: 100, NEIGHBOR: 90, PINNED: 80,
  RECACHE_CLOUD: 70, CLOUD_FILL: 60, NON_AUDIO: 50
};

const MB = 1024 * 1024;
const DAY_MS = 86400000;

/* --- UTILS --- */
const emit = (name, detail = {}) => window.dispatchEvent(new CustomEvent(name, { detail }));
const normQ = (v) => (String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi');
const toast = (msg) => window.NotificationSystem?.info?.(msg);
const toastWarn = (msg) => window.NotificationSystem?.warning?.(msg);

function getTrackUrl(uid, quality) {
  const t = window.TrackRegistry?.getTrackByUid?.(uid);
  if (!t) return null;
  return normQ(quality) === 'lo' ? (t.audio_low || t.audio || t.src) : (t.audio || t.src);
}

function getTrackTitle(uid) {
  return window.TrackRegistry?.getTrackByUid?.(uid)?.title || uid;
}

/* --- DOWNLOAD QUEUE (ТЗ Часть 10) --- */
class DownloadQueue {
  constructor() {
    this._queue = [];
    this._active = new Map();
    this._paused = false;
    this._maxParallel = 1;
  }

  setParallel(n) { this._maxParallel = Math.max(1, n); this._process(); }

  enqueue(task) {
    const { uid, url, quality, kind = 'cloud', priority = 0 } = task;
    if (!uid || !url) return;

    // Дедупликация: если уже в активной загрузке с ТЕМ ЖЕ качеством — skip
    if (this._active.has(uid)) {
      const act = this._active.get(uid);
      if (act.item.quality === quality) return;
      // Другое качество — отменяем текущую (ТЗ 4.4: защита от истерики)
      act.ctrl.abort();
      this._active.delete(uid);
    }

    const existingIdx = this._queue.findIndex(i => i.uid === uid);
    if (existingIdx !== -1) {
      const existing = this._queue[existingIdx];
      if (existing.quality !== quality) {
        // Качество изменилось — заменяем задачу
        this._queue.splice(existingIdx, 1);
      } else if (priority > existing.priority) {
        existing.priority = priority;
        this._sort();
        return;
      } else {
        return;
      }
    }

    this._queue.push({
      uid, url, quality: normQ(quality), kind, priority,
      retries: 0, addedAt: Date.now()
    });
    this._sort();
    this._process();
  }

  pause() { this._paused = true; }
  resume() { this._paused = false; this._process(); }

  cancel(uid) {
    this._queue = this._queue.filter(i => i.uid !== uid);
    if (this._active.has(uid)) {
      this._active.get(uid).ctrl.abort();
      this._active.delete(uid);
      this._process();
    }
  }

  /** ТЗ 4.4: Отменить все задачи определённого качества */
  cancelByQuality(quality) {
    const q = normQ(quality);
    // Отменяем из очереди
    this._queue = this._queue.filter(i => i.quality !== q);
    // Отменяем активные
    for (const [uid, { ctrl, item }] of this._active) {
      if (item.quality === q) {
        ctrl.abort();
        this._active.delete(uid);
      }
    }
    this._process();
  }

  getStatus() {
    return { active: this._active.size, queued: this._queue.length, isPaused: this._paused };
  }

  isDownloading(uid) { return this._active.has(uid); }

  clear() {
    this._active.forEach(v => v.ctrl.abort());
    this._active.clear();
    this._queue = [];
  }

  _sort() {
    this._queue.sort((a, b) => b.priority !== a.priority
      ? b.priority - a.priority
      : a.addedAt - b.addedAt);
  }

  async _process() {
    if (this._paused) return;
    if (this._active.size >= this._maxParallel) return;
    if (!this._queue.length) return;
    if (window.NetPolicy && !window.NetPolicy.isNetworkAllowed()) return;

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

      if (window.OfflineManager && !(await window.OfflineManager.hasSpace())) {
        throw new Error('DiskFull');
      }

      await setAudioBlob(item.uid, item.quality, blob);

      await updateTrackMeta(item.uid, {
        quality: item.quality,
        size: blob.size,
        needsReCache: false,
        url: item.url,
        cachedComplete: true
      });

      // Двухфазная замена (ТЗ 1.7): удаляем старый variant ТОЛЬКО после успеха и не для CUR.
      try {
        const curUid = window.playerCore?.getCurrentTrackUid?.();
        if (curUid && String(curUid).trim() === String(item.uid).trim()) {
          // CUR не трогаем
        } else {
          const otherQ = item.quality === 'hi' ? 'lo' : 'hi';
          await deleteAudioVariant(item.uid, otherQ).catch(() => {});
        }
      } catch {}

      this._active.delete(item.uid);
      emit('offline:trackCached', { uid: item.uid });
      emit('offline:stateChanged');
      this._process();

    } catch (e) {
      this._active.delete(item.uid);
      if (e.name === 'AbortError') {
        // ТЗ 4.4: удаляем только тот variant, который качали (не сносим старый корректный).
        await deleteAudioVariant(item.uid, item.quality).catch(() => {});
        this._process();
        return;
      }

      console.warn(`[Queue] Failed ${item.uid}: ${e.message}`);

      if (e.message !== 'DiskFull' && item.retries < 3) {
        item.retries++;
        setTimeout(() => {
          this._queue.push(item);
          this._sort();
          this._process();
        }, 1000 * Math.pow(2, item.retries));
      } else {
        if (e.message === 'DiskFull') toastWarn('Мало места, загрузка приостановлена');
        emit('offline:downloadFailed', { uid: item.uid, error: e.message });
      }
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
  }

  async initialize() {
    if (this._ready) return;
    await openDB();
    await this._checkSpace();
    await this._cleanExpired();

    window.addEventListener('netPolicy:changed', () => this.queue.resume());
    window.addEventListener('quality:changed', (e) => this._onQualityChanged(e.detail?.quality));

    this._ready = true;
    emit('offline:ready');
  }

  /* --- API --- */

  isSpaceOk() { return this._spaceOk; }
  getDownloadStatus() { return this.queue.getStatus(); }

  async getTrackOfflineState(uid) {
    if (!this._ready) return { status: 'none', clickable: false };

    const meta = await getTrackMeta(uid);
    const hasBlob = await hasAudioForUid(uid);
    const q = this.getQuality();
    let status = 'none';

    if (meta?.type === 'pinned') {
      status = 'pinned';
    } else if (meta?.type === 'cloud') {
      // ТЗ 5.4: облачко ТОЛЬКО при cloud=true И cachedComplete=100%
      status = (hasBlob && meta.cachedComplete) ? 'cloud' : 'cloud_loading';
    } else if (meta?.type === 'playbackCache') {
      status = 'transient';
    }

    return {
      status,
      downloading: this.queue.isDownloading(uid),
      cachedComplete: hasBlob && !!meta?.cachedComplete,
      needsReCache: meta?.needsReCache || (hasBlob && meta?.quality && meta.quality !== q),
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
    const pinned = metas.filter(m => m.type === 'pinned')
      .sort((a, b) => (a.pinnedAt || 0) - (b.pinnedAt || 0));
    const cloud = metas.filter(m => m.type === 'cloud')
      .sort((a, b) => (b.cloudExpiresAt || 0) - (a.cloudExpiresAt || 0));
    return { pinned, cloud };
  }

  /* --- ACTIONS --- */

  async togglePinned(uid) {
    if (!this._ready) return;

    const meta = (await getTrackMeta(uid)) || { uid };
    const q = this.getQuality();
    const { D } = this.getCloudSettings();
    const now = Date.now();

    if (meta.type === 'pinned') {
      // ТЗ 5.6: Снятие пиннинга → автоматически Cloud
      await updateTrackMeta(uid, {
        type: 'cloud',
        cloudOrigin: 'unpin',
        pinnedAt: null,
        cloudAddedAt: now,
        cloudExpiresAt: now + D * DAY_MS,
        // ТЗ 5.6: cloudFullListenCount НЕ накручивается и НЕ обнуляется
      });
      toast(`Офлайн-закрепление снято. Доступен как облачный кэш на ${D} дней.`);

    } else {
      // Pin
      if (!this._spaceOk) {
        toastWarn('Недостаточно места на устройстве');
        return;
      }

      await updateTrackMeta(uid, {
        type: 'pinned',
        pinnedAt: now,
        quality: q,
        cloudExpiresAt: null
      });

      const existingQ = await getStoredVariant(uid);

      if (this.queue.isDownloading(uid)) {
        // Уже качается — повышаем приоритет
        toast('Трек закреплён 🔒 (загрузка продолжается)');
      } else if (!existingQ) {
        const url = getTrackUrl(uid, q);
        if (url) {
          this.queue.enqueue({
            uid, url, quality: q,
            kind: 'pinned', priority: DOWNLOAD_PRIORITY.PINNED
          });
          toast('Трек будет доступен офлайн. Начинаю скачивание...');
        }
      } else {
        if (existingQ !== q) {
          await updateTrackMeta(uid, { needsReCache: true });
          const url = getTrackUrl(uid, q);
          if (url) {
            this.queue.enqueue({
              uid, url, quality: q,
              kind: 'pinned', priority: DOWNLOAD_PRIORITY.PINNED
            });
          }
        }
        toast('Трек закреплён 🔒');
      }
    }
    emit('offline:stateChanged');
  }

  async removeCached(uid) {
    this.queue.cancel(uid);
    await deleteAudio(uid);
    // ТЗ 6.6: сбросить cloud-статистику, НЕ трогать global stats
    await updateTrackMeta(uid, {
      type: null,
      cloudFullListenCount: 0,
      lastFullListenAt: null,
      cloudAddedAt: null,
      cloudExpiresAt: null,
      cachedComplete: false,
      needsReCache: false,
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

  /* --- LISTEN TRACKING --- */

  async registerFullListen(uid, { duration, position }) {
    if (!uid || !duration) return;
    if ((position / duration) < 0.9) return;

    const meta = (await getTrackMeta(uid)) || { uid };
    const { N, D } = this.getCloudSettings();
    const now = Date.now();

    const count = (meta.cloudFullListenCount || 0) + 1;
    const updates = {
      cloudFullListenCount: count,
      lastFullListenAt: now
    };

    // ТЗ 6.7: Продление TTL при full listen
    if (meta.type === 'cloud') {
      updates.cloudExpiresAt = now + D * DAY_MS;
    }

    // ТЗ 6.4: Автоматическое появление облачка
    if (meta.type !== 'pinned' && meta.type !== 'cloud' && count >= N) {
      if (await this.hasSpace()) {
        updates.type = 'cloud';
        updates.cloudOrigin = 'auto';
        updates.cloudAddedAt = now;
        updates.cloudExpiresAt = now + D * DAY_MS;
        updates.quality = this.getQuality();

        if (!(await hasAudioForUid(uid))) {
          const url = getTrackUrl(uid, updates.quality);
          if (url) {
            this.queue.enqueue({
              uid, url, quality: updates.quality,
              kind: 'cloud', priority: DOWNLOAD_PRIORITY.CLOUD_FILL
            });
          }
          toast(`Трек добавлен в офлайн на ${D} дней.`);
        }
      }
    }

    await updateTrackMeta(uid, updates);
    emit('offline:stateChanged');
  }

  // ТЗ 9.1: Cloud-статистика не считает секунды (только full listens)
  async recordTickStats() { /* no-op for cloud stats */ }

  /* --- SETTINGS --- */

  getMode() { return localStorage.getItem(STORAGE_KEYS.MODE) || 'R0'; }

  async setMode(m) {
    if (m === 'R1' && !(await this.hasSpace())) {
      toastWarn('Недостаточно места, PlaybackCache отключён');
      m = 'R0';
    }
    localStorage.setItem(STORAGE_KEYS.MODE, m);
    emit('offline:uiChanged');
  }

  getQuality() { return normQ(localStorage.getItem(STORAGE_KEYS.QUALITY)); }

  // ТЗ 4.2: Только сохраняет, НЕ эмитит. switchQuality — единственная точка emit.
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
    const metas = await getAllTrackMetas();
    const now = Date.now();
    let toRemove = 0;
    for (const m of metas) {
      if (m.type !== 'cloud') continue;
      // ТЗ 6.8: только автоматические (не через снятие замочка)
      if (m.cloudOrigin === 'auto' && (m.cloudFullListenCount || 0) < newN) {
        toRemove++;
        continue;
      }
      if (m.lastFullListenAt) {
        const newExpire = m.lastFullListenAt + newD * DAY_MS;
        if (newExpire < now) toRemove++;
      }
    }
    return { toRemove };
  }

  async confirmApplyCloudSettings({ newN, newD }) {
    localStorage.setItem(STORAGE_KEYS.CLOUD_N, newN);
    localStorage.setItem(STORAGE_KEYS.CLOUD_D, newD);

    const metas = await getAllTrackMetas();
    const now = Date.now();
    let removedCount = 0;

    for (const m of metas) {
      if (m.type !== 'cloud') continue;

      // ТЗ 6.8: Увеличение N — удалить auto-cloud с count < N
      if (m.cloudOrigin === 'auto' && (m.cloudFullListenCount || 0) < newN) {
        await this.removeCached(m.uid);
        removedCount++;
        continue;
      }

      // ТЗ 6.8: Пересчёт D
      if (m.lastFullListenAt) {
        const newExpire = m.lastFullListenAt + newD * DAY_MS;
        if (newExpire < now) {
          await this.removeCached(m.uid);
          removedCount++;
        } else {
          await updateTrackMeta(m.uid, { cloudExpiresAt: newExpire });
        }
      }
    }

    if (removedCount > 0) toast(`Обновлено. Удалено треков: ${removedCount}`);
    else toast('Настройки облака обновлены');
  }

  async countNeedsReCache(targetQuality) {
    const q = normQ(targetQuality || this.getQuality());
    const metas = await getAllTrackMetas();
    let count = 0;
    for (const m of metas) {
      if ((m.type === 'pinned' || m.type === 'cloud') && m.quality && m.quality !== q) {
        count++;
      }
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
        if (url) {
          const prio = m.type === 'pinned'
            ? DOWNLOAD_PRIORITY.PINNED
            : DOWNLOAD_PRIORITY.RECACHE_CLOUD;
          this.queue.enqueue({ uid: m.uid, url, quality: q, kind: 'reCache', priority: prio });
          enqueued++;
        }
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

  async getTrackMeta(uid) { return getTrackMeta(uid); }

  /* --- RESOLVE SOURCE (ТЗ Часть 7.2 — 4-ступенчатый приоритет) --- */

  async resolveTrackSource(uid) {
    const q = this.getQuality();
    const otherQ = q === 'hi' ? 'lo' : 'hi';
    const netOk = window.NetPolicy ? window.NetPolicy.isNetworkAllowed() : navigator.onLine;

    // Приоритет 1: локальная копия в текущем качестве
    const blob = await getAudioBlob(uid, q);
    if (blob) return { source: 'local', blob, quality: q };

    // Приоритет 2: локальная копия в ДРУГОМ качестве
    const otherBlob = await getAudioBlob(uid, otherQ);
    if (otherBlob) {
      if (q === 'lo') {
        // ТЗ 7.2: Lo выбрано, есть Hi — играть Hi (улучшение)
        await updateTrackMeta(uid, { needsReCache: true });
        return { source: 'local', blob: otherBlob, quality: otherQ };
      }
      // q === 'hi', есть только Lo
      if (netOk) {
        // ТЗ 7.2: Hi выбрано, есть Lo, есть сеть — стримить Hi (не ухудшаем)
        const url = getTrackUrl(uid, q);
        if (url) {
          await updateTrackMeta(uid, { needsReCache: true });
          const reCacheUrl = getTrackUrl(uid, q);
          if (reCacheUrl) {
            this.queue.enqueue({
              uid, url: reCacheUrl, quality: q,
              kind: 'reCache', priority: DOWNLOAD_PRIORITY.RECACHE_CLOUD
            });
          }
          return { source: 'stream', url, quality: q };
        }
      }
      // ТЗ 7.2 Приоритет 4 (fallback): нет сети, есть Lo — играть Lo
      return { source: 'local', blob: otherBlob, quality: otherQ };
    }

    // Приоритет 3: стрим из сети
    if (netOk) {
      const url = getTrackUrl(uid, q);
      if (url) return { source: 'stream', url, quality: q };
    }

    // Ничего нет
    return { source: 'none', url: null, quality: q };
  }

  async enqueueAudioDownload(uid, { priority, kind }) {
    if (!this._ready) return;

    // ТЗ 8.10: Если для позиции есть pinned/cloud — transient не создаём
    if (kind === 'playbackCache') {
      const meta = await getTrackMeta(uid);
      if (meta?.type === 'pinned' || meta?.type === 'cloud') return;
      if (await hasAudioForUid(uid)) return; // Уже есть blob
    }

    let hasRoom = await this.hasSpace();
    if (!hasRoom) {
      if (kind === 'playbackCache') {
        toastWarn('Мало места, предзагрузка приостановлена');
        return;
      }
      // Для pinned/cloud — пробуем eviction
      const freed = await this._evictTransient(5 * MB);
      if (!freed) {
        toastWarn('Недостаточно места на устройстве');
        return;
      }
    }

    const q = this.getQuality();
    const url = getTrackUrl(uid, q);
    if (!url) return;

    // Создаём/обновляем meta если нужно
    const existingMeta = await getTrackMeta(uid);
    if (!existingMeta && kind === 'playbackCache') {
      await setTrackMeta(uid, {
        uid,
        type: 'playbackCache',
        quality: q,
        cachedComplete: false,
        needsReCache: false,
        createdAt: Date.now()
      });
    }

    this.queue.enqueue({ uid, url, quality: q, kind, priority });
  }

  /* --- QUALITY CHANGE (ТЗ Часть 4.3 + 4.4) --- */

  /**
   * ТЗ 4.4: Защита от "истерики" при частом переключении
   * Вызывается по событию quality:changed
   */
  async _onQualityChanged(newQuality) {
    const q = normQ(newQuality);
    const metas = await getAllTrackMetas();

    // Шаг 1: Отменить ВСЕ текущие reCache-загрузки в старом качестве
    // ТЗ 4.4 п.5.3: текущая загрузка отменяется, недокачанный файл удаляется
    for (const m of metas) {
      if ((m.type === 'pinned' || m.type === 'cloud') && this.queue.isDownloading(m.uid)) {
        this.queue.cancel(m.uid);
        // Удалить недокачанный — cancel уже вызывает deleteAudio через AbortError handler
      }
    }

    // Шаг 2: Пометить все файлы с несовпадающим качеством
    // ТЗ 4.4 п.5.5: сравнить текущее выбранное с фактическим
    let reCacheCount = 0;
    for (const m of metas) {
      if (m.type !== 'pinned' && m.type !== 'cloud') continue;

      if (m.quality && m.quality !== q) {
        await updateTrackMeta(m.uid, { needsReCache: true });
        reCacheCount++;
      } else if (m.quality === q && m.needsReCache) {
        // ТЗ 4.4 п.5.5: Совпадает → снять пометку
        await updateTrackMeta(m.uid, { needsReCache: false });
      }
    }

    // Шаг 3: Запустить тихую перекачку (по одному)
    // ТЗ 4.4 п.5.2: приоритет pinned → cloud
    if (reCacheCount > 0) {
      const toReCache = metas
        .filter(m => (m.type === 'pinned' || m.type === 'cloud') && m.quality && m.quality !== q)
        .sort((a, b) => {
          // pinned first
          if (a.type === 'pinned' && b.type !== 'pinned') return -1;
          if (a.type !== 'pinned' && b.type === 'pinned') return 1;
          return 0;
        });

      for (const m of toReCache) {
        // ТЗ 4.4 п.5.6: CUR НИКОГДА не заменяется на лету
        const curUid = window.PlayerCore?.getCurrentTrackUid?.();
        if (m.uid === curUid) continue;

        const url = getTrackUrl(m.uid, q);
        if (!url) continue;

        const prio = m.type === 'pinned'
          ? DOWNLOAD_PRIORITY.PINNED
          : DOWNLOAD_PRIORITY.RECACHE_CLOUD;

        this.queue.enqueue({ uid: m.uid, url, quality: q, kind: 'reCache', priority: prio });
      }
    }

    // Обновить UI
    emit('offline:stateChanged');
    emit('offline:reCacheStatus', { count: reCacheCount });
  }

  /* --- TRANSIENT EVICTION (для PlaybackCache) --- */

  async _evictTransient(bytesNeeded) {
    const metas = await getAllTrackMetas();
    const transients = metas
      .filter(m => m.type === 'playbackCache')
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); // oldest first

    let freed = 0;
    for (const m of transients) {
      // ТЗ 8.8: Защищённое окно не удаляем
      if (this._protectedUids?.has(m.uid)) continue;

      await deleteAudio(m.uid);
      await deleteTrackMeta(m.uid);
      freed += (m.size || 0);
      if (freed >= bytesNeeded) return true;
    }
    return freed >= bytesNeeded;
  }

  setProtectedUids(uids) {
    this._protectedUids = new Set(uids || []);
  }

  /* --- INTERNAL HELPERS --- */

  async hasSpace() {
    try {
      const est = await navigator.storage?.estimate?.();
      if (!est || !est.quota) return true; // Assume OK if API unavailable
      const free = est.quota - est.usage;
      this._spaceOk = free >= DEFAULTS.MIN_SPACE_MB * MB;
      return this._spaceOk;
    } catch {
      this._spaceOk = true;
      return true;
    }
  }

  async _checkSpace() {
    await this.hasSpace();
    // ТЗ 3.2: При старте если R1 сохранён но места нет — откат на R0
    if (!this._spaceOk && this.getMode() === 'R1') {
      localStorage.setItem(STORAGE_KEYS.MODE, 'R0');
      toastWarn('Недостаточно места, PlaybackCache отключён');
    }
  }

  async _cleanExpired() {
    const metas = await getAllTrackMetas();
    const now = Date.now();
    let cleaned = 0;

    for (const m of metas) {
      // ТЗ 6.7: Истечение TTL — только для cloud, не для pinned
      if (m.type === 'cloud' && m.cloudExpiresAt && m.cloudExpiresAt < now) {
        await deleteAudio(m.uid);
        await updateTrackMeta(m.uid, {
          type: null,
          cloudFullListenCount: 0,
          lastFullListenAt: null,
          cloudAddedAt: null,
          cloudExpiresAt: null,
          cachedComplete: false,
          quality: null,
          size: 0
        });
        cleaned++;
        toast(`Офлайн-доступ истёк. Трек "${getTrackTitle(m.uid)}" удалён из кэша.`);
      }
    }

    if (cleaned > 0) emit('offline:stateChanged');
  }

  /* --- CLOUD MENU ACTIONS (ТЗ 6.6) --- */

  async cloudMenuPin(uid) {
    const meta = await getTrackMeta(uid);
    if (!meta || meta.type !== 'cloud') return;

    // ТЗ 6.6 п.1: Cloud-статистика НЕ сбрасывается
    await updateTrackMeta(uid, {
      type: 'pinned',
      pinnedAt: Date.now(),
      // cloudFullListenCount, lastFullListenAt остаются
    });
    toast('Трек закреплён 🔒');
    emit('offline:stateChanged');
  }

  async cloudMenuRemove(uid) {
    // ТЗ 6.6 п.2: Удаление с confirm (confirm делается на уровне UI)
    await this.removeCached(uid);
    emit('offline:stateChanged');
  }

  /* --- UPDATES DETECTION (ТЗ Часть 11) --- */

  async checkForUpdates(remoteConfig) {
    if (!remoteConfig?.tracks) return 0;
    const metas = await getAllTrackMetas();
    let updatesCount = 0;

    for (const m of metas) {
      if (m.type !== 'pinned' && m.type !== 'cloud') continue;

      const remote = remoteConfig.tracks.find(t => t.uid === m.uid);
      if (!remote) continue;

      const q = m.quality || this.getQuality();
      const remoteSize = q === 'lo' ? remote.size_low : remote.size;

      // ТЗ 11.1: Детект по изменению size
      if (remoteSize && m.size && Math.abs(remoteSize * MB - m.size) > 1024) {
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

  /* --- HAS NEEDS RECACHE (для индикатора "!" на кнопке OFFLINE) --- */

  async hasNeedsAttention() {
    const metas = await getAllTrackMetas();
    return metas.some(m =>
      (m.type === 'pinned' || m.type === 'cloud') &&
      (m.needsReCache || m.needsUpdate)
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
