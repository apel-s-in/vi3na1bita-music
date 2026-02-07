/**
 * offline-manager.js — Центральный модуль офлайн-кэша (v1.0 Final Verified)
 * 
 * Реализует полную логику ТЗ:
 * - Единое качество (ТЗ 1.2)
 * - Логика Pinned/Cloud/Transient (ТЗ 5, 6, 8)
 * - Раздельная статистика (ТЗ 9)
 * - Данные для UI Модалки и Хранилища (ТЗ 12)
 * - No duplicates rule (ТЗ 1.7)
 */

import {
  openDB,
  setAudioBlob, getAudioBlob, deleteAudioVariant, deleteAudio,
  setTrackMeta, getTrackMeta, updateTrackMeta, deleteTrackMeta,
  getAllTrackMetas, hasAudioForUid, estimateUsage
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

function getTrackUrl(uid, quality) {
  const t = window.TrackRegistry?.getTrackByUid?.(uid);
  if (!t) return null;
  return normQ(quality) === 'lo' ? (t.audio_low || t.audio || t.src) : (t.audio || t.src);
}

/* --- DOWNLOAD QUEUE (ТЗ Часть 10) --- */
class DownloadQueue {
  constructor() {
    this._queue = []; 
    this._active = new Map(); 
    this._paused = false;
    this._maxParallel = 1; // ТЗ 8.11: iOS safe
  }

  enqueue(task) {
    const { uid, url, quality, kind = 'cloud', priority = 0 } = task;
    if (!uid || !url) return;

    if (this._active.has(uid)) return;
    
    // Дедупликация
    const existingIdx = this._queue.findIndex(i => i.uid === uid);
    if (existingIdx !== -1) {
      // Обновляем приоритет, если новый выше
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

  cancel(uid) {
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

    // ТЗ Часть 9 (Спец. Сети): проверка NetPolicy
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

      // ТЗ 8.12: Проверка места
      if (window.OfflineManager && !(await window.OfflineManager.hasSpace())) {
          throw new Error('DiskFull');
      }

      // ТЗ 1.7: Two-phase replacement
      await setAudioBlob(item.uid, item.quality, blob);
      
      // Удаляем противоположное качество (через исправленный deleteAudioVariant)
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
      
      // ТЗ 10.3: Retry with backoff
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
    this._tickBatch = {};
  }

  async initialize() {
    if (this._ready) return;
    await openDB();
    await this._checkSpace();
    await this._cleanExpired(); // ТЗ 6.7
    
    if (window.NetPolicy) {
        window.addEventListener('netPolicy:changed', () => this.queue.resume());
    }
    window.addEventListener('quality:changed', (e) => this._onQualityChanged(e.detail.quality));
    
    this._ready = true;
    emit('offline:ready');
  }

  /* --- UI / API HELPERS (Для модалки и индикаторов) --- */

  // ТЗ 5.4: Возврат статуса для отрисовки иконки
  async getTrackOfflineState(uid) {
    if (!this._ready) return { status: 'none', clickable: false };
    
    const meta = await getTrackMeta(uid);
    const q = this.getQuality();
    const hasBlob = await hasAudioForUid(uid);
    
    let status = 'none';
    
    if (meta?.type === 'pinned') {
        status = 'pinned';
    } else if (meta?.type === 'cloud') {
        // ТЗ 5.4: Облачко только если 100% скачан
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

  // ТЗ 12.2: Данные для секции "Хранилище"
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

  // ТЗ 12.4: Список для кнопки "Список закреплённых и облачных"
  async getOfflineTracksList() {
      const metas = await getAllTrackMetas();
      const pinned = [];
      const cloud = [];

      for (const m of metas) {
          if (m.type === 'pinned') pinned.push(m);
          else if (m.type === 'cloud') cloud.push(m);
      }

      // Сортировка по ТЗ 12.4
      // Pinned: по порядку добавления (pinnedAt ASC)
      pinned.sort((a, b) => (a.pinnedAt || 0) - (b.pinnedAt || 0));
      
      // Cloud: по cloudExpiresAt DESC (больше осталось = выше)
      cloud.sort((a, b) => (b.cloudExpiresAt || 0) - (a.cloudExpiresAt || 0));

      return { pinned, cloud };
  }

  /* --- ACTIONS (Взаимодействие пользователя) --- */

  // ТЗ 5.5 и 5.6: Пиннинг / Снятие
  async togglePinned(uid) {
    if (!this._ready) return;
    
    // ТЗ 5.2: Проверка места
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
        // Pin (ТЗ 5.5)
        await updateTrackMeta(uid, {
            type: 'pinned',
            pinnedAt: Date.now(),
            quality: q,
            cloudExpiresAt: null
        });

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

  // ТЗ 6.6 и 12.5: Удаление из кэша
  async removeCached(uid) {
    // Удаляем аудио
    await deleteAudio(uid);
    // Сбрасываем Cloud статистику, но НЕ Global (ТЗ 9.1)
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

  /* --- LOGIC CORE (Автоматика) --- */

  // ТЗ 6.4: Автоматическое появление облачка
  async registerFullListen(uid, { duration, position }) {
      if (!uid || !duration) return;
      await this.flushTicks(uid);

      if ((position / duration) < 0.9) return; // < 90%

      const meta = (await getTrackMeta(uid)) || { uid };
      const { N, D } = this.getCloudSettings();
      const now = Date.now();

      // ТЗ 9.1: Global vs Cloud stats
      const updates = {
          globalFullListenCount: (meta.globalFullListenCount || 0) + 1,
          cloudFullListenCount: (meta.cloudFullListenCount || 0) + 1,
          lastFullListenAt: now
      };

      // ТЗ 6.7: Продление TTL
      if (meta.type === 'cloud') {
          updates.cloudExpiresAt = now + (D * DAY_MS);
      }

      // ТЗ 6.4: Превращение в Cloud (если не pinned и не cloud уже)
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
      if (this._tickBatch[uid] >= 30) await this.flushTicks(uid);
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

  /* --- SETTINGS & HELPERS --- */

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

  // ТЗ 6.8: Пересчет при смене настроек
  async confirmApplyCloudSettings({ newN, newD }) {
      localStorage.setItem(STORAGE_KEYS.CLOUD_N, newN);
      localStorage.setItem(STORAGE_KEYS.CLOUD_D, newD);

      const metas = await getAllTrackMetas();
      const now = Date.now();
      let removedCount = 0;

      for (const m of metas) {
          if (m.type === 'cloud' && m.cloudFullListenCount < newN) {
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
  
  // ТЗ 6.7: Очистка протухших при старте
  async _cleanExpired() {
      const metas = await getAllTrackMetas();
      const now = Date.now();
      for (const m of metas) {
          if (m.type === 'cloud' && m.cloudExpiresAt && m.cloudExpiresAt < now) {
              await this.removeCached(m.uid);
          }
      }
  }

  // ТЗ 4.3 + 4.4: Смена качества (фоновая перекачка)
  async _onQualityChanged(newQ) {
      const q = normQ(newQ);
      const metas = await getAllTrackMetas();
      let count = 0;
      
      for (const m of metas) {
          if ((m.type === 'pinned' || m.type === 'cloud') && m.quality !== q) {
              await updateTrackMeta(m.uid, { needsReCache: true });
              count++;
              // Ставим в очередь на перекачку (P2/P3)
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
          await updateTrackMeta(uid, { needsReCache: true });
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
}

const instance = new OfflineManager();
window.OfflineManager = instance; 
export function getOfflineManager() { return instance; }
export default instance;
