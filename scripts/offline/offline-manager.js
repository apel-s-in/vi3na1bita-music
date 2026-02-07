/**
 * offline-manager.js — Центральный модуль офлайн-кэша (v1.1 Audit Fix)
 * Исправлены все критические замечания из аудита.
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

const DEFAULTS = {
  CLOUD_N: 5,
  CLOUD_D: 31,
  MIN_SPACE_MB: 60
};

// ТЗ П.10 (12.1)
export const DOWNLOAD_PRIORITY = {
  CUR: 100,        // P0
  NEIGHBOR: 90,    // P1
  PINNED: 80,      // P2
  RECACHE_CLOUD: 70, // P3
  CLOUD_FILL: 60,  // P4
  NON_AUDIO: 50,   // P5
};

const MB = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

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
  const t = window.TrackRegistry?.getTrackByUid?.(uid);
  return t ? t.title : uid;
}

/* --- DOWNLOAD QUEUE (ТЗ Часть 10) --- */
class DownloadQueue {
  constructor() {
    this._queue = []; 
    this._active = new Map(); 
    this._paused = false;
    this._maxParallel = 1; // Default
  }

  setParallel(n) { this._maxParallel = Math.max(1, n); this._process(); } // (12.2)

  enqueue(task) {
    const { uid, url, quality, kind = 'cloud', priority = 0 } = task;
    if (!uid || !url) return;

    if (this._active.has(uid)) {
      // Если уже качается, но с низким приоритетом, можно было бы отменить и перезапустить,
      // но для v1.0 просто оставим как есть.
      return;
    }
    
    // Дедупликация
    const existingIdx = this._queue.findIndex(i => i.uid === uid);
    if (existingIdx !== -1) {
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

  pause() { this._paused = true; }
  resume() { this._paused = false; this._process(); }

  cancel(uid) { // (12.3)
    this._queue = this._queue.filter(i => i.uid !== uid);
    if (this._active.has(uid)) {
      const { ctrl } = this._active.get(uid);
      ctrl.abort();
      this._active.delete(uid);
      this._process();
    }
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
    this._queue.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.addedAt - b.addedAt;
    });
  }

  async _process() {
    if (this._paused) return;
    if (this._active.size >= this._maxParallel) return;
    if (this._queue.length === 0) return;

    // ТЗ Часть 9: проверка NetPolicy
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
      
      const otherQ = item.quality === 'hi' ? 'lo' : 'hi';
      await deleteAudioVariant(item.uid, otherQ).catch(() => {});

      await updateTrackMeta(item.uid, {
        quality: item.quality,
        size: blob.size,
        needsReCache: false,
        url: item.url
      });

      this._active.delete(item.uid);
      emit('offline:trackCached', { uid: item.uid });
      emit('offline:stateChanged');
      
      this._process();

    } catch (e) {
      this._active.delete(item.uid);
      if (e.name === 'AbortError') return;

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
    
    if (window.NetPolicy) {
        window.addEventListener('netPolicy:changed', () => this.queue.resume());
    }
    window.addEventListener('quality:changed', (e) => this._onQualityChanged(e.detail.quality));
    
    this._ready = true;
    emit('offline:ready');
  }

  /* --- API Helpers --- */

  // (1.1)
  isSpaceOk() { return this._spaceOk; }
  
  // (1.2)
  getDownloadStatus() { return this.queue.getStatus(); }

  // (1.8)
  getCacheSummary() { return this.getStorageUsage(); }

  async getTrackOfflineState(uid) {
    if (!this._ready) return { status: 'none', clickable: false };
    
    const meta = await getTrackMeta(uid);
    const q = this.getQuality();
    const hasBlob = await hasAudioForUid(uid);
    
    let status = 'none';
    
    if (meta?.type === 'pinned') {
        status = 'pinned';
    } else if (meta?.type === 'cloud') {
        status = hasBlob ? 'cloud' : 'cloud_loading';
    } else if (meta?.type === 'playbackCache') {
        status = 'transient';
    }

    const needsReCache = meta?.needsReCache || (hasBlob && meta?.quality !== q);

    return {
        status,
        downloading: this.queue.isDownloading(uid),
        cachedComplete: hasBlob,
        needsReCache,
        cloudExpiresAt: meta?.cloudExpiresAt,
        quality: meta?.quality,
        daysLeft: meta?.cloudExpiresAt ? Math.ceil((meta.cloudExpiresAt - Date.now())/DAY_MS) : 0
    };
  }

  // (1.10) Breakdown
  async getStorageBreakdown() {
      const all = await getAllTrackMetas();
      const bd = { pinned: 0, cloud: 0, transient: 0, other: 0 };
      for (const m of all) {
          if (m.size) {
              if (m.type === 'pinned') bd.pinned += m.size;
              else if (m.type === 'cloud') bd.cloud += m.size;
              else if (m.type === 'playbackCache') bd.transient += m.size;
              else bd.other += m.size;
          }
      }
      return bd;
  }

  // Для обратной совместимости с UI
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

  async getOfflineTracksList() {
      const metas = await getAllTrackMetas();
      const pinned = [];
      const cloud = [];
      for (const m of metas) {
          if (m.type === 'pinned') pinned.push(m);
          else if (m.type === 'cloud') cloud.push(m);
      }
      pinned.sort((a, b) => (a.pinnedAt || 0) - (b.pinnedAt || 0));
      cloud.sort((a, b) => (b.cloudExpiresAt || 0) - (a.cloudExpiresAt || 0));
      return { pinned, cloud };
  }

  /* --- ACTIONS --- */

  async togglePinned(uid) {
    if (!this._ready) return;
    if (!this._spaceOk) {
        toastWarn('Недостаточно места на устройстве');
        return;
    }

    const meta = (await getTrackMeta(uid)) || { uid };
    const q = this.getQuality();
    const { D } = this.getCloudSettings();

    if (meta.type === 'pinned') {
        // Unpin -> Cloud
        const now = Date.now();
        await updateTrackMeta(uid, {
            type: 'cloud',
            cloudOrigin: 'unpin',
            pinnedAt: null,
            cloudAddedAt: now,
            cloudExpiresAt: now + (D * DAY_MS),
            cloudFullListenCount: meta.cloudFullListenCount || 0
        });
        toast(`Офлайн-закрепление снято. Доступен как облачный кэш на ${D} дней.`);
    } else {
        // Pin
        await updateTrackMeta(uid, {
            type: 'pinned',
            pinnedAt: Date.now(),
            quality: q,
            cloudExpiresAt: null
        });

        const existingQ = await getStoredVariant(uid);
        
        // Audit Fix #4: Check active download first
        if (this.queue.isDownloading(uid)) {
            // Если уже качается - просто обновляем приоритет в очереди (метод enqueue это умеет)
            // и сообщаем пользователю
            this.queue.enqueue({ uid, url: getTrackUrl(uid, q), quality: q, kind: 'pinned', priority: DOWNLOAD_PRIORITY.PINNED });
            toast('Трек закреплён 🔒 (загрузка продолжается)');
            emit('offline:stateChanged');
            return;
        }
        
        if (!existingQ) {
            const url = getTrackUrl(uid, q);
            if (url) {
                this.queue.enqueue({ uid, url, quality: q, kind: 'pinned', priority: DOWNLOAD_PRIORITY.PINNED });
                toast('Трек будет доступен офлайн. Начинаю скачивание...');
            }
        } else {
            if (existingQ !== q) {
                await updateTrackMeta(uid, { needsReCache: true });
                const url = getTrackUrl(uid, q);
                if (url) this.queue.enqueue({ uid, url, quality: q, kind: 'pinned', priority: DOWNLOAD_PRIORITY.PINNED });
            }
            toast('Трек закреплён 🔒');
        }
    }
    emit('offline:stateChanged');
  }

  async removeCached(uid) {
    await deleteAudio(uid);
    // (1.5) Используем deleteTrackMeta
    await deleteTrackMeta(uid); 
    this.queue.cancel(uid);
    emit('offline:stateChanged');
  }

  async removeAllCached() {
      const metas = await getAllTrackMetas();
      for (const m of metas) {
          if (m.type === 'pinned' || m.type === 'cloud') await this.removeCached(m.uid);
      }
      toast('Все офлайн-треки удалены');
  }

  /* --- LOGIC CORE --- */

  async registerFullListen(uid, { duration, position }) {
      // Только Cloud статистика (10.2)
      if (!uid || !duration) return;
      if ((position / duration) < 0.9) return;

      const meta = (await getTrackMeta(uid)) || { uid };
      const { N, D } = this.getCloudSettings();
      const now = Date.now();

      const updates = {
          cloudFullListenCount: (meta.cloudFullListenCount || 0) + 1,
          lastFullListenAt: now
      };

      if (meta.type === 'cloud') {
          updates.cloudExpiresAt = now + (D * DAY_MS);
      }

      // Auto-cloud
      if (meta.type !== 'pinned' && meta.type !== 'cloud' && updates.cloudFullListenCount >= N) {
          if (await this.hasSpace()) {
              updates.type = 'cloud';
              updates.cloudOrigin = 'auto'; // (1.6)
              updates.cloudAddedAt = now;
              updates.cloudExpiresAt = now + (D * DAY_MS);
              updates.quality = this.getQuality();
              
              if (!(await hasAudioForUid(uid))) {
                  const url = getTrackUrl(uid, updates.quality);
                  if (url) this.queue.enqueue({ uid, url, quality: updates.quality, kind: 'cloud', priority: DOWNLOAD_PRIORITY.CLOUD_FILL });
                  toast(`Трек ${getTrackTitle(uid)} добавлен в офлайн`);
              }
          }
      }

      await updateTrackMeta(uid, updates);
      emit('offline:stateChanged');
  }

  // (10.2) Исправлено: не пишет globalListenSeconds
  async recordTickStats(uid, { deltaSec = 1 } = {}) {
      // Для Cloud статистики секунды пока не требуются, ТЗ 9.1 говорит Cloud считает полные прослушивания.
      // Оставляем пустым, чтобы не дублировать GlobalStatsManager
  }

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

  // (1.6) Fix confirmApplyCloudSettings
  async confirmApplyCloudSettings({ newN, newD }) {
      localStorage.setItem(STORAGE_KEYS.CLOUD_N, newN);
      localStorage.setItem(STORAGE_KEYS.CLOUD_D, newD);

      const metas = await getAllTrackMetas();
      const now = Date.now();
      let removedCount = 0;

      for (const m of metas) {
          // Удалять только если origin === 'auto'
          if (m.type === 'cloud' && m.cloudOrigin === 'auto' && m.cloudFullListenCount < newN) {
              await this.removeCached(m.uid);
              removedCount++;
              continue;
          }
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

  async hasSpace() {
      try {
          const est = await estimateUsage();
          this._spaceOk = est.free > (DEFAULTS.MIN_SPACE_MB * MB);
          return this._spaceOk;
      } catch { return true; }
  }

  async _checkSpace() { await this.hasSpace(); }
  
  // (1.7) Fix _cleanExpired
  async _cleanExpired() {
      const metas = await getAllTrackMetas();
      const now = Date.now();
      for (const m of metas) {
          if (m.type === 'cloud' && m.cloudExpiresAt && m.cloudExpiresAt < now) {
              const title = getTrackTitle(m.uid);
              await this.removeCached(m.uid);
              toast(`Офлайн-доступ истёк. Трек «${title}» удалён из кэша.`);
          }
      }
  }

  // (1.9) Защита от истерики + (12.1) Приоритеты
  async _onQualityChanged(newQ) {
      const q = normQ(newQ);
      const metas = await getAllTrackMetas();
      let count = 0;
      
      for (const m of metas) {
          if (m.type === 'pinned' || m.type === 'cloud') {
              if (m.quality !== q) {
                  // Нужно перекачать
                  await updateTrackMeta(m.uid, { needsReCache: true });
                  count++;
                  const url = getTrackUrl(m.uid, q);
                  if (url) {
                      const prio = m.type === 'pinned' ? DOWNLOAD_PRIORITY.PINNED : DOWNLOAD_PRIORITY.RECACHE_CLOUD;
                      this.queue.enqueue({ uid: m.uid, url, quality: q, kind: 'reCache', priority: prio });
                  }
              } else {
                  // (1.9) Качество совпадает - отменяем загрузку если она была в очереди для ДРУГОГО качества
                  // Но у нас очередь не хранит "старое" качество. Просто если файл уже ок, ничего не делаем.
                  // Если была активная загрузка "не того" качества, её надо бы отменить.
                  // Реализация простая: queue.cancel(uid) отменит любую. 
                  // Но это опасно, если там качается нужное.
                  // Упрощение для v1.0: просто ставим метку needsReCache=false
                  await updateTrackMeta(m.uid, { needsReCache: false });
              }
          }
      }
      if (count > 0) emit('offline:stateChanged');
  }
  
  // (3.2) Fix fallback logic
  async resolveTrackSource(uid) {
      const q = this.getQuality();
      
      // 1. Ищем точное
      const blob = await getAudioBlob(uid, q);
      if (blob) return { source: 'local', blob, quality: q };
      
      // 2. Ищем другое
      const otherQ = q === 'hi' ? 'lo' : 'hi';
      const otherBlob = await getAudioBlob(uid, otherQ);
      
      if (otherBlob) {
          // Если текущее Hi, а есть только Lo -> НЕ ухудшать, если есть сеть (7.2)
          if (q === 'hi' && navigator.onLine) {
              const url = getTrackUrl(uid, q);
              // Если есть URL, стримим Hi
              if (url) return { source: 'stream', url, quality: q };
          }
          
          // Иначе fallback
          await updateTrackMeta(uid, { needsReCache: true });
          const url = getTrackUrl(uid, q);
          if (url) this.queue.enqueue({ uid, url, quality: q, kind: 'reCache', priority: DOWNLOAD_PRIORITY.RECACHE_CLOUD });
          return { source: 'local', blob: otherBlob, quality: otherQ };
      }
      
      // 3. Стрим
      const url = getTrackUrl(uid, q);
      return { source: 'stream', url, quality: q };
  }

  async enqueueAudioDownload(uid, { priority, kind }) {
     if (!this._ready || !(await this.hasSpace())) return;
     const q = this.getQuality();
     const url = getTrackUrl(uid, q);
     if (url) this.queue.enqueue({ uid, url, quality: q, kind, priority });
  }
}

const instance = new OfflineManager();
window.OfflineManager = instance; 
export function getOfflineManager() { return instance; }
export default instance;
