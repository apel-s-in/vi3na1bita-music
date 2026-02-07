/**
 * offline-manager.js — Центральный модуль офлайн-кэша (v1.0 Refactored)
 *
 * Реализует:
 * - Единое качество (qualityMode) для всех типов кэша.
 * - Механику Pinned (🔒) и Cloud (☁).
 * - Раздельную статистику (Cloud vs Global).
 * - Очередь загрузки с приоритетами.
 */

import {
  openDB,
  setAudioBlob, getAudioBlob, getAudioBlobAny, deleteAudio,
  setTrackMeta, getTrackMeta, updateTrackMeta, deleteTrackMeta,
  getAllTrackMetas, hasAudioForUid, estimateUsage
} from './cache-db.js';

/* Константы */
const QUALITY_KEY = 'qualityMode:v1'; // Единый ключ качества
const MODE_KEY = 'offline:mode:v1';
const CLOUD_N_KEY = 'cloud:listenThreshold';
const CLOUD_D_KEY = 'cloud:ttlDays';
const MIN_SPACE_MB = 60;
const MB = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

/* Утилиты */
const emit = (name, detail = {}) => window.dispatchEvent(new CustomEvent(name, { detail }));
const normQ = (v) => (String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi');
const toast = (msg) => window.NotificationSystem?.info?.(msg);
const toastWarn = (msg) => window.NotificationSystem?.warning?.(msg);

function getTrackUrl(uid, quality) {
  const t = window.TrackRegistry?.getTrackByUid?.(uid);
  if (!t) return null;
  return normQ(quality) === 'lo' ? (t.audio_low || t.audio || t.src) : (t.audio || t.src);
}

/* Очередь загрузки */
class DownloadQueue {
  constructor() {
    this._queue = [];
    this._active = new Map();
    this._paused = false;
    this._maxParallel = 1; // Default 1 (iOS safe)
  }

  setMaxParallel(n) { this._maxParallel = Math.max(1, Math.min(n, 4)); }

  enqueue({ uid, url, quality, kind = 'cloud', priority = 0 }) {
    if (!uid || !url) return;
    if (this._active.has(uid)) return;
    if (this._queue.some(i => i.uid === uid)) return; // No duplicates in queue
    
    this._queue.push({ uid, url, quality: normQ(quality), kind, priority, retries: 0 });
    this._sort();
    this._process();
  }

  cancel(uid) {
    this._queue = this._queue.filter(i => i.uid !== uid);
    const act = this._active.get(uid);
    if (act) { act.ctrl.abort(); this._active.delete(uid); this._process(); }
  }

  pause() { this._paused = true; }
  resume() { this._paused = false; this._process(); }
  
  clear() {
    this._active.forEach(v => v.ctrl.abort());
    this._active.clear();
    this._queue = [];
  }

  isDownloading(uid) { return this._active.has(uid) || this._queue.some(i => i.uid === uid); }
  
  getStatus() {
    return { active: this._active.size, queued: this._queue.length };
  }

  _sort() { this._queue.sort((a, b) => b.priority - a.priority); }

  async _process() {
    if (this._paused || !navigator.onLine) return;
    // Проверка сетевой политики (NetPolicy)
    if (window.Utils?.getNetworkStatusSafe) {
        const net = window.Utils.getNetworkStatusSafe();
        // Если NetPolicy блокирует - не начинаем новые
        if (window.NetPolicy?.isNetworkAllowed && !window.NetPolicy.isNetworkAllowed()) return;
    }

    while (this._active.size < this._maxParallel && this._queue.length > 0) {
      this._start(this._queue.shift());
    }
  }

  async _start(item) {
    const ctrl = new AbortController();
    this._active.set(item.uid, { ctrl, item });
    emit('offline:downloadStart', { uid: item.uid, kind: item.kind });

    try {
      const resp = await fetch(item.url, { signal: ctrl.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();

      if (!this._active.has(item.uid)) return; // Cancelled during fetch

      // Двухфазная замена: Сохраняем новый -> Удаляем старый (в cache-db setAudioBlob перезапишет по ключу [uid, quality])
      // Но нужно удалить "другое" качество, если оно есть?
      // ТЗ 1.7: "Замена качества = двухфазная... Временное наличие двух копий разрешено".
      // cache-db хранит по [uid, quality]. Мы запишем новое. Старое удалим явно.
      
      await setAudioBlob(item.uid, item.quality, blob);
      
      // Удаляем противоположное качество (No duplicates rule)
      const otherQ = item.quality === 'hi' ? 'lo' : 'hi';
      await deleteAudio(item.uid, otherQ).catch(() => {}); // Игнорируем ошибки если нет файла

      await updateTrackMeta(item.uid, {
        quality: item.quality,
        size: blob.size,
        needsReCache: false, // Флаг сбрасывается после успеха
        url: item.url
      });

      this._active.delete(item.uid);
      emit('offline:trackCached', { uid: item.uid });
      emit('offline:stateChanged');
      this._process();

    } catch (e) {
      this._active.delete(item.uid);
      if (e.name === 'AbortError') return;
      
      console.warn(`[Offline] Fail ${item.uid}:`, e);
      if (item.retries < 3) {
        item.retries++;
        setTimeout(() => { this._queue.push(item); this._sort(); this._process(); }, 2000 * item.retries);
      } else {
        emit('offline:downloadFailed', { uid: item.uid, error: e.message });
      }
      this._process();
    }
  }
}

class OfflineManager {
  constructor() {
    this.queue = new DownloadQueue();
    this._ready = false;
    this._spaceOk = true;
    this._tickBatch = {}; // { uid: seconds }
  }

  async initialize() {
    if (this._ready) return;
    await openDB();
    await this._checkSpace();
    await this._cleanExpired(); // Удаление протухших cloud
    this._ready = true;
    emit('offline:ready');
    
    // Слушаем смену качества для ре-кэша
    window.addEventListener('quality:changed', (e) => this._onQualityChanged(e.detail.quality));
  }

  /* --- Settings --- */
  getMode() { return localStorage.getItem(MODE_KEY) || 'R0'; }
  async setMode(m) { 
      if (m === 'R1' && !(await this.hasSpace())) {
          toastWarn('Недостаточно места для PlaybackCache');
          return;
      }
      localStorage.setItem(MODE_KEY, m); 
      emit('offline:uiChanged'); 
  }
  
  getQuality() { return normQ(localStorage.getItem(QUALITY_KEY)); }
  
  getCloudSettings() {
      return {
          N: parseInt(localStorage.getItem(CLOUD_N_KEY) || '5', 10),
          D: parseInt(localStorage.getItem(CLOUD_D_KEY) || '31', 10)
      };
  }

  /* --- Logic --- */

  async togglePinned(uid) {
    if (!this._ready || !(await this.hasSpace())) {
        if (!this._spaceOk) toastWarn('Недостаточно места');
        return;
    }

    const meta = (await getTrackMeta(uid)) || { uid };
    const q = this.getQuality();

    if (meta.type === 'pinned') {
        // Unpin -> Cloud (ТЗ 5.6)
        const { D } = this.getCloudSettings();
        const now = Date.now();
        await updateTrackMeta(uid, {
            type: 'cloud',
            pinnedAt: null,
            cloudAddedAt: now,
            cloudExpiresAt: now + (D * DAY_MS)
        });
        toast(`Офлайн-закрепление снято. Доступен как облачный кэш на ${D} дней.`);
    } else {
        // Pin (New or Cloud->Pin)
        const isNew = meta.type !== 'cloud';
        await updateTrackMeta(uid, {
            type: 'pinned',
            pinnedAt: Date.now(),
            quality: q, // Целевое качество
            cloudExpiresAt: null // У pinned нет TTL
        });
        
        // Проверяем наличие файла в НУЖНОМ качестве
        const blob = await getAudioBlob(uid, q);
        if (blob) {
            toast('Трек закреплён 🔒');
        } else {
            // Если файла нет или качество не то - в очередь
            const url = getTrackUrl(uid, q);
            if (url) {
                this.queue.enqueue({ uid, url, quality: q, kind: 'pinned', priority: 5 }); // P2 по ТЗ (high)
                toast('Трек будет доступен офлайн. Начинаю скачивание...');
            }
        }
    }
    emit('offline:stateChanged');
  }

  // ТЗ 6.4: Автоматическое появление облачка
  async registerFullListen(uid, { duration, position }) {
    if (!uid || !duration) return;
    // Flush ticks
    await this.flushTicks(uid);

    // Check 90%
    if ((position / duration) < 0.9) return;

    const meta = (await getTrackMeta(uid)) || { uid };
    const { N, D } = this.getCloudSettings();
    
    // 1. Global Stats (Никогда не сбрасывается)
    const gCount = (meta.globalFullListenCount || 0) + 1;
    
    // 2. Cloud Stats
    const cCount = (meta.cloudFullListenCount || 0) + 1;
    const now = Date.now();

    const updates = {
        globalFullListenCount: gCount,
        cloudFullListenCount: cCount,
        lastFullListenAt: now
    };

    // Продление TTL (ТЗ 6.7)
    if (meta.type === 'cloud') {
        updates.cloudExpiresAt = now + (D * DAY_MS);
    }

    // Авто-Cloud (ТЗ 6.4)
    if (meta.type !== 'pinned' && meta.type !== 'cloud' && cCount >= N) {
        if (await this.hasSpace()) {
            updates.type = 'cloud';
            updates.cloudAddedAt = now;
            updates.cloudExpiresAt = now + (D * DAY_MS);
            updates.quality = this.getQuality();
            
            // Скачать, если нет
            if (!(await hasAudioForUid(uid))) {
                const url = getTrackUrl(uid, updates.quality);
                if (url) this.queue.enqueue({ uid, url, quality: updates.quality, kind: 'cloud', priority: 1 }); // P4 cloud fill
            }
        }
    }

    await updateTrackMeta(uid, updates);
    emit('offline:stateChanged');
  }

  // ТЗ 9.3: Счетчик секунд (Global)
  async recordTickStats(uid, { deltaSec = 1 } = {}) {
      if (!this._tickBatch[uid]) this._tickBatch[uid] = 0;
      this._tickBatch[uid] += deltaSec;
      
      // Flush every 30s or active change handled by PlayerCore/StatsTracker
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

  // ТЗ 6.6: Удалить из кэша (сброс только Cloud статистики)
  async removeCached(uid) {
      const meta = await getTrackMeta(uid);
      if (!meta) return;

      await deleteAudio(uid); // Удаляет Hi и Lo
      
      // Сброс cloud-статистики, Global оставляем
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
          if (m.type === 'pinned' || m.type === 'cloud') {
              await this.removeCached(m.uid);
          }
      }
  }

  // ТЗ 4.3: Смена качества
  async _onQualityChanged(newQ) {
      const q = normQ(newQ);
      this.queue.cancelMismatchedQuality?.(q); // (If implemented in Queue)
      
      const metas = await getAllTrackMetas();
      let count = 0;
      
      for (const m of metas) {
          if ((m.type === 'pinned' || m.type === 'cloud') && m.quality !== q) {
              await updateTrackMeta(m.uid, { needsReCache: true });
              count++;
              // Тихая очередь (ТЗ 4.4)
              const url = getTrackUrl(m.uid, q);
              if (url) {
                  // Pinned (P2/4) or Cloud (P3) logic handled by priority
                  const prio = m.type === 'pinned' ? 4 : 3;
                  this.queue.enqueue({ uid: m.uid, url, quality: q, kind: 'reCache', priority: prio });
              }
          }
      }
      if (count > 0) emit('offline:stateChanged');
  }

  /* --- Helpers --- */
  async hasSpace() { 
      try {
          const est = await estimateUsage();
          this._spaceOk = est.free > (MIN_SPACE_MB * MB);
          return this._spaceOk;
      } catch { return true; }
  }
  isSpaceOk() { return this._spaceOk; }

  async getTrackOfflineState(uid) {
      if (!this._ready) return { status: 'none', clickable: false };
      const meta = await getTrackMeta(uid);
      const q = this.getQuality();
      const hasFile = await hasAudioForUid(uid); // Checks both, effectively
      const dl = this.queue.isDownloading(uid);
      
      let status = 'none';
      if (meta?.type === 'pinned') status = 'pinned';
      else if (meta?.type === 'cloud') {
          // ТЗ 5.4: Облачко только если 100% скачан
          status = hasFile ? 'cloud' : 'cloud_loading'; // cloud_loading визуально как серый замок
      } else if (meta?.type === 'playbackCache') {
          status = 'transient';
      }

      // Качество файла: совпадает с выбранным?
      const needsReCache = meta?.needsReCache || (hasFile && meta?.quality !== q);

      return {
          status,
          downloading: dl,
          cachedComplete: hasFile,
          needsReCache,
          cloudExpiresAt: meta?.cloudExpiresAt,
          daysLeft: meta?.cloudExpiresAt ? Math.ceil((meta.cloudExpiresAt - Date.now())/DAY_MS) : 0
      };
  }

  // Мост для PlayerCore / PlaybackCache
  async enqueueAudioDownload(uid, { priority, kind }) {
      if (!this._ready || !(await this.hasSpace())) return;
      const q = this.getQuality();
      const url = getTrackUrl(uid, q);
      if (url) this.queue.enqueue({ uid, url, quality: q, kind, priority });
  }

  async resolveTrackSource(uid) {
      const q = this.getQuality();
      // 1. Local Current Quality
      const exact = await getAudioBlob(uid, q);
      if (exact) return { source: 'local', blob: exact, quality: q };
      
      // 2. Local Other Quality (ТЗ 7.2 - Улучшение/Fallback)
      const other = q === 'hi' ? 'lo' : 'hi';
      const fallback = await getAudioBlob(uid, other);
      if (fallback) {
          // Если есть локально другое качество - играем его, но помечаем reCache
          await updateTrackMeta(uid, { needsReCache: true }); 
          // Запускаем тихую перекачку
          const url = getTrackUrl(uid, q);
          if (url) this.queue.enqueue({ uid, url, quality: q, kind: 'reCache', priority: 3 });
          return { source: 'local', blob: fallback, quality: other };
      }

      // 3. Network (Stream)
      const url = getTrackUrl(uid, q);
      if (url && navigator.onLine) {
          // Check NetPolicy in PlayerCore via TrackResolver, returning stream here
          return { source: 'stream', url, quality: q };
      }

      return { source: 'unavailable' };
  }

  async _checkSpace() { await this.hasSpace(); }
  
  async _cleanExpired() {
      const metas = await getAllTrackMetas();
      const now = Date.now();
      for (const m of metas) {
          if (m.type === 'cloud' && m.cloudExpiresAt && m.cloudExpiresAt < now) {
              await this.removeCached(m.uid);
              toast(`Офлайн-доступ истёк: ${m.uid}`);
          }
      }
  }
}

const instance = new OfflineManager();
export function getOfflineManager() { return instance; }
export default instance;
