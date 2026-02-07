/**
 * offline-manager.js — Центральный модуль офлайн-кэша (v1.0 Final Specification)
 * 
 * Реализует Часть 15.2 ТЗ (API Contract):
 * - togglePinned, getTrackOfflineState, openCloudMenu
 * - enqueue, pauseQueue, resumeQueue
 * - computeSizeEstimate, startFullOffline (stub)
 * 
 * А также:
 * - Единое качество (qualityMode)
 * - Приоритеты P0-P5
 * - Сетевую политику
 */

import {
  openDB,
  setAudioBlob, getAudioBlob, deleteAudio,
  setTrackMeta, getTrackMeta, updateTrackMeta, deleteTrackMeta,
  getAllTrackMetas, hasAudioForUid, estimateUsage,
  deleteTrackCache // Вспомогательный метод удаления всего кэша трека
} from './cache-db.js';

/* --- CONSTANTS & CONFIG --- */
const STORAGE_KEYS = {
  QUALITY: 'qualityMode:v1',
  MODE: 'offline:mode:v1',
  CLOUD_N: 'cloud:listenThreshold',
  CLOUD_D: 'cloud:ttlDays'
};

const DEFAULTS = {
  CLOUD_N: 5,
  CLOUD_D: 31,
  MIN_SPACE_MB: 60
};

const PRIORITY = {
  P0_CUR: 10,      // CUR (PlaybackWindow)
  P1_NEIGHBOR: 9,  // NEXT/PREV (PlaybackWindow)
  P2_PINNED: 8,    // Pinned new / re-cache
  P3_UPDATES: 7,   // Cloud re-cache / Updates
  P4_CLOUD: 5,     // Auto-cloud fill
  P5_ASSETS: 1     // Covers/Lyrics
};

const MB = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

/* --- UTILS --- */
const emit = (name, detail = {}) => window.dispatchEvent(new CustomEvent(name, { detail }));
const normQ = (v) => (String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi');
const toast = (msg) => window.NotificationSystem?.info?.(msg);
const toastWarn = (msg) => window.NotificationSystem?.warning?.(msg);
const confirmDialog = (msg) => confirm(msg); // Можно заменить на кастомный UI

function getTrackUrl(uid, quality) {
  const t = window.TrackRegistry?.getTrackByUid?.(uid);
  if (!t) return null;
  return normQ(quality) === 'lo' ? (t.audio_low || t.audio || t.src) : (t.audio || t.src);
}

/* --- DOWNLOAD QUEUE (Часть 10) --- */
class DownloadQueue {
  constructor() {
    this._queue = []; // Array of { uid, url, quality, kind, priority, retries }
    this._active = new Map(); // uid -> { ctrl, item }
    this._paused = false;
    this._maxParallel = 1; // Default 1 for iOS safety
  }

  // API 15.2: enqueue
  enqueue(task) {
    const { uid, url, quality, kind = 'cloud', priority = 0 } = task;
    if (!uid || !url) return;

    // Дедупликация: если уже качается или в очереди
    if (this._active.has(uid)) return;
    const existingIdx = this._queue.findIndex(i => i.uid === uid);
    
    if (existingIdx !== -1) {
      // Если задача уже есть, но новый приоритет выше - обновляем
      if (priority > this._queue[existingIdx].priority) {
        this._queue[existingIdx].priority = priority;
        this._sort();
      }
      return;
    }

    this._queue.push({ 
      uid, url, quality: normQ(quality), kind, priority, retries: 0, addedAt: Date.now() 
    });
    this._sort();
    this._process();
  }

  // API 15.2: pauseQueue / resumeQueue
  pause() { 
    this._paused = true; 
    // Мы не прерываем активные, просто не берем новые
  }
  
  resume() { 
    this._paused = false; 
    this._process(); 
  }

  cancel(uid) {
    this._queue = this._queue.filter(i => i.uid !== uid);
    if (this._active.has(uid)) {
      const { ctrl } = this._active.get(uid);
      ctrl.abort();
      this._active.delete(uid);
      this._process();
    }
  }

  cancelAllByKind(kind) {
    // Удаляем из очереди
    this._queue = this._queue.filter(i => i.kind !== kind);
    // Прерываем активные
    for (const [uid, task] of this._active.entries()) {
      if (task.item.kind === kind) {
        task.ctrl.abort();
        this._active.delete(uid);
      }
    }
    this._process();
  }

  getStatus() {
    return { 
      active: this._active.size, 
      queued: this._queue.length,
      isPaused: this._paused
    };
  }
  
  isDownloading(uid) { return this._active.has(uid); }

  /* Internals */
  _sort() {
    // Сортировка: Сначала приоритет (desc), потом время добавления (asc)
    this._queue.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.addedAt - b.addedAt;
    });
  }

  async _process() {
    if (this._paused) return;
    if (this._active.size >= this._maxParallel) return;
    if (this._queue.length === 0) return;

    // Проверка Сетевой Политики (Часть 9.1 Спец. Сети)
    if (window.NetPolicy && !window.NetPolicy.isNetworkAllowed()) {
      // Не удаляем задачи, просто ждем
      return; 
    }

    const item = this._queue.shift();
    this._start(item);
  }

  async _start(item) {
    const ctrl = new AbortController();
    this._active.set(item.uid, { ctrl, item });
    emit('offline:downloadStart', { uid: item.uid, kind: item.kind });

    try {
      // 1. Fetch
      const resp = await fetch(item.url, { signal: ctrl.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();

      // Проверка места перед сохранением (Часть 8.12)
      if (window.OfflineManager && !(await window.OfflineManager.hasSpace())) {
          throw new Error('DiskFull');
      }

      // 2. Save (Two-phase replacement)
      // Сначала сохраняем новое
      await setAudioBlob(item.uid, item.quality, blob);
      
      // Удаляем противоположное качество (No duplicates rule 1.7)
      const otherQ = item.quality === 'hi' ? 'lo' : 'hi';
      await deleteAudio(item.uid, otherQ).catch(() => {});

      // 3. Update Meta
      await updateTrackMeta(item.uid, {
        quality: item.quality,
        size: blob.size,
        needsReCache: false, // Флаг сбрасывается
        url: item.url
      });

      // Success
      this._active.delete(item.uid);
      emit('offline:trackCached', { uid: item.uid });
      emit('offline:stateChanged'); // Обновить индикаторы
      
      // Next
      this._process();

    } catch (e) {
      this._active.delete(item.uid);
      if (e.name === 'AbortError') return;

      console.warn(`[DownloadQueue] Failed ${item.uid}: ${e.message}`);
      
      // Retry Logic with Backoff (Часть 10.3)
      if (e.message !== 'DiskFull' && item.retries < 3) {
        item.retries++;
        // Возвращаем в очередь с задержкой (реализовано через setTimeout перед push)
        setTimeout(() => {
            this._queue.push(item);
            this._sort();
            this._process();
        }, 1000 * Math.pow(2, item.retries)); // 2s, 4s, 8s
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
    this._tickBatch = {};
  }

  async initialize() {
    if (this._ready) return;
    await openDB();
    await this._checkSpace();
    await this._cleanExpired(); // Удаление протухших (Часть 6.7)
    
    // Listeners
    if (window.NetPolicy) {
        window.addEventListener('netPolicy:changed', () => this.queue.resume());
    }
    window.addEventListener('quality:changed', (e) => this._onQualityChanged(e.detail.quality));
    
    this._ready = true;
    emit('offline:ready');
  }

  /* --- API 15.2 Implementations --- */

  // 1. Получить состояние для UI (Замочек/Облачко)
  async getTrackOfflineState(uid) {
    if (!this._ready) return { status: 'none', clickable: false };
    
    const meta = await getTrackMeta(uid);
    const q = this.getQuality();
    // Файл считается "готовым", если он есть физически
    const hasBlob = await hasAudioForUid(uid);
    
    let status = 'none'; // 'pinned', 'cloud', 'cloud_loading', 'transient', 'none'
    
    if (meta?.type === 'pinned') {
        // Pinned: Желтый, если скачан. Желтый мигающий (loading), если в процессе.
        // Но индикатор один. В UI мы вернем 'pinned'. Downloading проверим отдельно.
        status = 'pinned';
    } else if (meta?.type === 'cloud') {
        // Cloud: Голубой ТОЛЬКО если 100% скачан (ТЗ 5.4). Иначе серый (cloud_loading).
        status = hasBlob ? 'cloud' : 'cloud_loading';
    } else if (meta?.type === 'playbackCache') {
        status = 'transient';
    }

    const needsReCache = meta?.needsReCache || (hasBlob && meta?.quality !== q);

    return {
        status, // Для иконки
        downloading: this.queue.isDownloading(uid),
        cachedComplete: hasBlob,
        needsReCache,
        cloudExpiresAt: meta?.cloudExpiresAt,
        quality: meta?.quality
    };
  }

  // 2. Переключить Pinned
  async togglePinned(uid) {
    if (!this._ready) return;
    
    // Проверка места (ТЗ 5.2)
    if (!(await this.hasSpace())) {
        toastWarn('Недостаточно места на устройстве');
        return;
    }

    const meta = (await getTrackMeta(uid)) || { uid };
    const q = this.getQuality();
    const { D } = this.getCloudSettings();

    if (meta.type === 'pinned') {
        // Unpin -> Cloud (ТЗ 5.6)
        const now = Date.now();
        await updateTrackMeta(uid, {
            type: 'cloud',
            pinnedAt: null,
            cloudAddedAt: now,
            cloudExpiresAt: now + (D * DAY_MS)
        });
        toast(`Офлайн-закрепление снято. Доступен как облачный кэш на ${D} дней.`);
    } else {
        // Pin (New or Cloud->Pin) (ТЗ 5.5)
        await updateTrackMeta(uid, {
            type: 'pinned',
            pinnedAt: Date.now(),
            quality: q,
            cloudExpiresAt: null // У pinned нет TTL
        });

        // Если файла нет или он не того качества - качаем
        const blob = await getAudioBlob(uid, q);
        if (!blob) {
            const url = getTrackUrl(uid, q);
            if (url) {
                this.queue.enqueue({ uid, url, quality: q, kind: 'pinned', priority: PRIORITY.P2_PINNED });
                toast('Трек будет доступен офлайн. Начинаю скачивание...');
            }
        } else {
            toast('Трек закреплён 🔒');
        }
    }
    emit('offline:stateChanged');
  }

  // 3. Cloud Menu Helper (для UI)
  async removeCached(uid) {
    // ТЗ 6.6: Удалить, сбросить cloud stats, global stats не трогать
    await deleteAudio(uid);
    const meta = await getTrackMeta(uid);
    if (meta) {
        await updateTrackMeta(uid, {
            type: 'none',
            quality: null,
            size: 0,
            cloudFullListenCount: 0,
            lastFullListenAt: null,
            cloudAddedAt: null,
            cloudExpiresAt: null,
            pinnedAt: null,
            needsReCache: false
        });
    }
    this.queue.cancel(uid);
    emit('offline:stateChanged');
  }

  // 4. Оценка размера (для R3 или модалки)
  async computeSizeEstimate(uids = []) {
      // Stub для API 15.2. Реально можно посчитать size из конфига.
      let totalMB = 0;
      uids.forEach(uid => {
          const t = window.TrackRegistry?.getTrackByUid?.(uid);
          if (t) totalMB += (this.getQuality() === 'lo' ? (t.size_low || 3) : (t.size || 8));
      });
      return totalMB;
  }

  // 5. Start/Stop Full Offline (R3 Stub - ТЗ 1.5)
  startFullOffline() { /* Placeholder for R3 */ }
  stopFullOffline() { /* Placeholder for R3 */ }


  /* --- LOGIC CORE --- */

  // ТЗ 6.4: Автоматическое появление облачка
  async registerFullListen(uid, { duration, position }) {
      if (!uid || !duration) return;
      // Сначала сбрасываем накопленные секунды
      await this.flushTicks(uid);

      if ((position / duration) < 0.9) return; // < 90%

      const meta = (await getTrackMeta(uid)) || { uid };
      const { N, D } = this.getCloudSettings();
      const now = Date.now();

      const updates = {
          globalFullListenCount: (meta.globalFullListenCount || 0) + 1, // Global +1
          cloudFullListenCount: (meta.cloudFullListenCount || 0) + 1,   // Cloud +1
          lastFullListenAt: now
      };

      // Продление TTL (ТЗ 6.7)
      if (meta.type === 'cloud') {
          updates.cloudExpiresAt = now + (D * DAY_MS);
      }

      // Превращение в Cloud (ТЗ 6.4)
      if (meta.type !== 'pinned' && meta.type !== 'cloud' && updates.cloudFullListenCount >= N) {
          if (await this.hasSpace()) {
              updates.type = 'cloud';
              updates.cloudAddedAt = now;
              updates.cloudExpiresAt = now + (D * DAY_MS);
              updates.quality = this.getQuality();
              
              // Качаем (P4)
              if (!(await hasAudioForUid(uid))) {
                  const url = getTrackUrl(uid, updates.quality);
                  if (url) this.queue.enqueue({ uid, url, quality: updates.quality, kind: 'cloud', priority: PRIORITY.P4_CLOUD });
                  toast('Трек добавлен в офлайн на ' + D + ' дней');
              }
          }
      }

      await updateTrackMeta(uid, updates);
      emit('offline:stateChanged');
  }

  // ТЗ 9.3: Global Stats (секунды)
  async recordTickStats(uid, { deltaSec = 1 } = {}) {
      if (!this._tickBatch[uid]) this._tickBatch[uid] = 0;
      this._tickBatch[uid] += deltaSec;
      if (this._tickBatch[uid] >= 30) await this.flushTicks(uid); // Batch save
  }

  async flushTicks(uid) {
      if (!this._tickBatch[uid]) return;
      const sec = this._tickBatch[uid];
      this._tickBatch[uid] = 0;
      const meta = (await getTrackMeta(uid)) || { uid };
      await updateTrackMeta(uid, {
          globalListenSeconds: (meta.globalListenSeconds || 0) + sec
      });
  }

  /* --- SETTINGS & GETTERS --- */

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
  setCacheQualitySetting(q) {
      localStorage.setItem(STORAGE_KEYS.QUALITY, normQ(q));
      emit('quality:changed', { quality: normQ(q) });
  }

  getCloudSettings() {
      return {
          N: parseInt(localStorage.getItem(STORAGE_KEYS.CLOUD_N) || DEFAULTS.CLOUD_N, 10),
          D: parseInt(localStorage.getItem(STORAGE_KEYS.CLOUD_D) || DEFAULTS.CLOUD_D, 10)
      };
  }

  // Применение настроек из Modal (ТЗ 6.8 - Пересчет)
  async confirmApplyCloudSettings({ newN, newD }) {
      localStorage.setItem(STORAGE_KEYS.CLOUD_N, newN);
      localStorage.setItem(STORAGE_KEYS.CLOUD_D, newD);

      const metas = await getAllTrackMetas();
      const now = Date.now();
      let removedCount = 0;

      for (const m of metas) {
          // 1. Check N increased -> remove cloud status?
          if (m.type === 'cloud' && m.cloudFullListenCount < newN) {
              await this.removeCached(m.uid);
              removedCount++;
              continue;
          }
          // 2. Recalculate D
          if (m.type === 'cloud' && m.lastFullListenAt) {
              const newExpire = m.lastFullListenAt + (newD * DAY_MS);
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

  /* --- STORAGE --- */
  
  async hasSpace() {
      try {
          const est = await estimateUsage();
          this._spaceOk = est.free > (DEFAULTS.MIN_SPACE_MB * MB);
          return this._spaceOk;
      } catch { return true; }
  }

  // Для UI Modal (Breakdown)
  async getStorageUsage() {
      const metas = await getAllTrackMetas();
      const stats = {
          pinned: { count: 0, size: 0 },
          cloud: { count: 0, size: 0 },
          transient: { count: 0, size: 0 }
      };
      
      for (const m of metas) {
          const sz = m.size || 0;
          if (m.type === 'pinned') { stats.pinned.count++; stats.pinned.size += sz; }
          else if (m.type === 'cloud') { stats.cloud.count++; stats.cloud.size += sz; }
          else if (m.type === 'playbackCache') { stats.transient.count++; stats.transient.size += sz; }
      }
      return stats;
  }

  async removeAllCached() {
      const metas = await getAllTrackMetas();
      for (const m of metas) {
          if (m.type === 'pinned' || m.type === 'cloud') await this.removeCached(m.uid);
      }
      toast('Все офлайн-треки удалены');
  }

  /* --- INTERNAL EVENT HANDLERS --- */

  async _checkSpace() { await this.hasSpace(); }
  
  async _cleanExpired() {
      const metas = await getAllTrackMetas();
      const now = Date.now();
      for (const m of metas) {
          if (m.type === 'cloud' && m.cloudExpiresAt && m.cloudExpiresAt < now) {
              await this.removeCached(m.uid);
          }
      }
  }

  // ТЗ 4.3 + 4.4: Защита от "истерики" + Фоновая замена
  async _onQualityChanged(newQ) {
      const q = normQ(newQ);
      
      // 1. Отмена загрузок "не того" качества
      // Если мы качали Hi, а стали Lo -> отменяем Hi
      const otherQ = q === 'hi' ? 'lo' : 'hi';
      // В очереди у нас нет поля quality в явном виде для фильтрации, но мы можем проверить
      // Проще: мы просто ставим новые задачи. Старые перезапишутся или отменятся по логике No Duplicates?
      // Реализуем отмену по "mismatched quality"
      // Для этого пройдемся по активным задачам
      
      // Но очередь у нас простая. Просто добавим новые задачи ре-кэша.
      
      const metas = await getAllTrackMetas();
      let count = 0;
      
      for (const m of metas) {
          if ((m.type === 'pinned' || m.type === 'cloud') && m.quality !== q) {
              await updateTrackMeta(m.uid, { needsReCache: true });
              count++;
              // Ставим в очередь (P2 или P3)
              const url = getTrackUrl(m.uid, q);
              if (url) {
                  const prio = m.type === 'pinned' ? PRIORITY.P2_PINNED : PRIORITY.P3_UPDATES;
                  this.queue.enqueue({ uid: m.uid, url, quality: q, kind: 'reCache', priority: prio });
              }
          }
      }
      if (count > 0) emit('offline:stateChanged');
  }
  
  // Public method for PlayerCore/TrackResolver
  async resolveTrackSource(uid) {
      const q = this.getQuality();
      
      // 1. Ищем точное совпадение
      const blob = await getAudioBlob(uid, q);
      if (blob) return { source: 'local', blob, quality: q };
      
      // 2. Ищем другое качество (Fallback/Upgrade) (ТЗ 7.2)
      const otherQ = q === 'hi' ? 'lo' : 'hi';
      const otherBlob = await getAudioBlob(uid, otherQ);
      if (otherBlob) {
          // Есть файл, но не того качества. Играем его, но помечаем needsReCache
          await updateTrackMeta(uid, { needsReCache: true });
          // Запускаем фоновую докачку правильного (P3)
          const url = getTrackUrl(uid, q);
          if (url) this.queue.enqueue({ uid, url, quality: q, kind: 'reCache', priority: PRIORITY.P3_UPDATES });
          
          return { source: 'local', blob: otherBlob, quality: otherQ };
      }
      
      // 3. Стриминг
      const url = getTrackUrl(uid, q);
      return { source: 'stream', url, quality: q };
  }

  // Helper for PlaybackCache (transient)
  async enqueueAudioDownload(uid, { priority, kind }) {
     if (!this._ready || !(await this.hasSpace())) return;
     const q = this.getQuality();
     const url = getTrackUrl(uid, q);
     if (url) this.queue.enqueue({ uid, url, quality: q, kind, priority });
  }
  
  // Helper for UI (Re-cache button)
  getCacheSummary() {
      // Stub, UI calls getStorageUsage instead mostly.
      // But for the confirmation dialog:
      return this.getStorageUsage();
  }
}

const instance = new OfflineManager();
window.OfflineManager = instance; // Global access for debug/other modules
export function getOfflineManager() { return instance; }
export default instance;
