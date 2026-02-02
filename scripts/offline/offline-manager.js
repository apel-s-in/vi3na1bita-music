/**
 * scripts/offline/offline-manager.js
 * ТЗ v1.0: Интеллектуальный кэш, Очередь (P0-P5), Cloud, Statistics.
 * FIXED: Добавлены экспорты для совместимости с PlayerCore и UI.
 *
 * ОТВЕТСТВЕННОСТЬ:
 * - Управление очередью загрузок (строго одна активная).
 * - Логика Pinned 🔒 / Cloud ☁ / Updates.
 * - Две статистики: Global (вечная) и Cloud (сбрасываемая).
 * - Массовые операции (100% Offline).
 * - Инвариант: НЕ вызывает stop() и НЕ управляет воспроизведением.
 */

import {
  ensureDbReady,
  setAudioBlob, setBytes,
  bytesByQuality, totalCachedBytes, deleteTrackCache,
  getCacheQuality as dbGetCQ, setCacheQuality as dbSetCQ,
  getCloudStats, setCloudStats, clearCloudStats,
  getCloudCandidate, setCloudCandidate, clearCloudCandidate,
  updateGlobalStats, getGlobalStatsAndTotal,
  getEvictionCandidates, getExpiredCloudUids,
  getDownloadMeta, setDownloadMeta,
  markLocalCloud, markLocalTransient,
  clearAllStores
} from './cache-db.js';

import { getTrackByUid, getAllTracks } from '../app/track-registry.js';
import { getNetPolicy, isAllowedByNetPolicy } from './net-policy.js';

// --- КОНСТАНТЫ ХРАНИЛИЩА (ТЗ 1.2, 1.3) ---
const LS = {
  MODE: 'offlineMode:v1',            // '1' | '0'
  CQ: 'offline:cacheQuality:v1',     // 'hi' | 'lo'
  PINNED: 'pinnedUids:v1',           // JSON array of uids
  CLOUD_N: 'offline:cloudN:v1',      // number
  CLOUD_D: 'offline:cloudD:v1',      // days
  LIMIT: 'offline:cacheLimitMB:v1',  // MB
  ALERT: 'offline:alert:v1'          // state for UI '!'
};

const MB = 1024 * 1024;
// ТЗ 9.2: Считаем трек скачанным и засчитываем Full Listen, если есть >92%
const COMPLETE_THRESHOLD = 0.92;

// --- ПРИОРИТЕТЫ ОЧЕРЕДИ (ТЗ 14.2) ---
const PRIORITY = {
  P0_CUR: 100,      // Playback Cache: Текущий трек
  P1_NEXT: 90,      // Playback Cache: Сосед по направлению
  P2_PINNED: 80,    // Pinned (пользователь нажал 🔒)
  P3_UPDATES: 70,   // Updates / Re-cache
  P4_CLOUD: 60,     // Cloud fill / 100% Offline mass download
  P5_ASSETS: 50     // Covers, lyrics, etc.
};

// --- УТИЛИТЫ ---
const normUid = (v) => String(v || '').trim() || null;
const normQ = (v) => (String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi');
const getNet = () => window.Utils?.getNetworkStatusSafe?.() || { online: navigator.onLine !== false, kind: 'unknown' };
const notify = (msg, type = 'info') => window.NotificationSystem?.[type]?.(msg, 3000);


// ====================================================================================
// CLASS: DOWNLOAD QUEUE (ТЗ 14)
// Единый механизм для всех загрузок. 1 активный поток.
// ====================================================================================
class DownloadQueue {
  constructor() {
    this.q = []; // { key, uid, priority, taskFn, ts }
    this.active = null;
    this.paused = false;
    this._listeners = new Set();
  }

  // Добавление задачи
  add({ uid, key, priority, taskFn }) {
    if (this.active?.key === key) return; // Уже качается
    const idx = this.q.findIndex(i => i.key === key);
    
    if (idx >= 0) {
      // Если уже в очереди, обновляем приоритет если он выше
      if (priority > this.q[idx].priority) {
        this.q[idx].priority = priority;
        this._sort();
      }
      return;
    }

    this.q.push({ uid, key, priority, taskFn, ts: Date.now() });
    this._sort();
    this._processNext();
  }

  // Сортировка: Сначала высокий приоритет, внутри - кто раньше добавлен
  _sort() {
    this.q.sort((a, b) => (b.priority - a.priority) || (a.ts - b.ts));
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; this._processNext(); }

  getStatus() {
    return {
      activeUid: this.active?.uid || null,
      queuedCount: this.q.length,
      isPaused: this.paused
    };
  }

  subscribe(cb) { this._listeners.add(cb); return () => this._listeners.delete(cb); }
  _emit(event, data) { this._listeners.forEach(cb => cb({ event, data })); }

  async _processNext() {
    if (this.active || this.paused || this.q.length === 0) return;

    const item = this.q.shift();
    this.active = item;
    
    this._emit('start', { uid: item.uid, key: item.key });

    try {
      await item.taskFn(); // Выполняем задачу
      this._emit('done', { uid: item.uid, key: item.key });
    } catch (err) {
      // console.warn(`[Queue] Failed ${item.key}:`, err);
      // Если ошибка сети - просто emit error, PlaybackCache сам решит
      this._emit('error', { uid: item.uid, error: err.message });
    } finally {
      this.active = null;
      this._processNext();
    }
  }
}


// ====================================================================================
// CLASS: OFFLINE MANAGER (MAIN)
// ====================================================================================
export class OfflineManager {
  constructor() {
    this._pinnedCache = null; // Set<uid>
    
    // Очередь загрузок
    this.queue = new DownloadQueue();

    // Состояние для UI ("!")
    this._needsState = { update: 0, recache: 0, ts: 0 };
    
    // Подписчики
    this._subs = new Set();
  }

  async initialize() {
    await ensureDbReady();
    
    // Запуск проверки протухших Cloud (раз в час)
    this._checkExpiredCloud();
    setInterval(() => this._checkExpiredCloud(), 60 * 60 * 1000);

    // Первичный расчет needsUpdate (лениво через 3 сек)
    setTimeout(() => this.refreshNeedsAggregates({ force: true }), 3000);
  }

  on(event, cb) {
    // Подписка на события менеджера (progress, stats, etc)
    if (event === 'progress') {
      this._subs.add(cb);
      // Proxy queue events
      this.queue.subscribe((e) => cb({ phase: 'queue_' + e.event, ...e.data }));
    }
    return () => this._subs.delete(cb);
  }

  _emit(data) {
    this._subs.forEach(cb => { try { cb(data); } catch {} });
  }

  // ----------------------------------------------------------------------
  // 1. Settings & Policy
  // ----------------------------------------------------------------------

  isOfflineMode() { return localStorage.getItem(LS.MODE) === '1'; }
  setOfflineMode(v) { localStorage.setItem(LS.MODE, v ? '1' : '0'); window.dispatchEvent(new CustomEvent('offline:uiChanged')); }

  async getCacheQuality() {
    // ТЗ 1.2: CQ
    const local = localStorage.getItem(LS.CQ);
    if (local) return normQ(local);
    return await dbGetCQ() || 'hi';
  }

  async setCacheQuality(val) {
    const q = normQ(val);
    localStorage.setItem(LS.CQ, q);
    await dbSetCQ(q);
    
    this._emit({ phase: 'cqChanged', cq: q });
    
    // ТЗ 5.2: Тихая замена "по одному" (не удаляем старое, ставим в очередь re-cache)
    this.enqueueReCacheAllByCQ({ userInitiated: false });
    return q;
  }

  getCloudSettings() {
    return {
      n: parseInt(localStorage.getItem(LS.CLOUD_N) || '5', 10),
      d: parseInt(localStorage.getItem(LS.CLOUD_D) || '31', 10)
    };
  }

  setCloudSettings({ n, d }) {
    localStorage.setItem(LS.CLOUD_N, n);
    localStorage.setItem(LS.CLOUD_D, d);
  }

  // ----------------------------------------------------------------------
  // 2. Pinned Logic (ТЗ 8)
  // ----------------------------------------------------------------------

  _getPinnedSet() {
    if (!this._pinnedCache) {
      try {
        const raw = JSON.parse(localStorage.getItem(LS.PINNED) || '[]');
        this._pinnedCache = new Set(Array.isArray(raw) ? raw : []);
      } catch { this._pinnedCache = new Set(); }
    }
    return this._pinnedCache;
  }

  _savePinned() {
    if (this._pinnedCache) localStorage.setItem(LS.PINNED, JSON.stringify([...this._pinnedCache]));
  }

  isPinned(uid) { return this._getPinnedSet().has(normUid(uid)); }

  // API для UI: pin() и unpin() для offline-indicators.js
  async pin(uid) {
    const u = normUid(uid);
    if (u && !this.isPinned(u)) await this.togglePinned(u);
  }

  async unpin(uid) {
    const u = normUid(uid);
    if (u && this.isPinned(u)) await this.togglePinned(u);
  }

  async togglePinned(uid) {
    const u = normUid(uid); if (!u) return;
    const isP = this.isPinned(u);

    if (isP) {
      // ТЗ 8.2: Снятие pinned -> Cloud-кандидат
      this._getPinnedSet().delete(u);
      this._savePinned();
      await setCloudCandidate(u, true); // Мгновенный кандидат
      notify('Офлайн-закрепление снято. Кандидат в Cloud.');
      this._emit({ phase: 'unpinned', uid: u });
    } else {
      // ТЗ 8.1: Включение pinned
      this._getPinnedSet().add(u);
      this._savePinned();
      await setCloudCandidate(u, false); // Уже не кандидат, а pinned
      
      const cq = await this.getCacheQuality();
      // Ставим задачу P2
      this.enqueueAudioDownload({
        uid: u,
        quality: cq,
        priority: PRIORITY.P2_PINNED,
        kind: 'pinned',
        userInitiated: true
      });
      
      notify('Трек закреплён офлайн');
      this._emit({ phase: 'pinned', uid: u });
    }
    window.dispatchEvent(new CustomEvent('offline:uiChanged'));
  }

  // ----------------------------------------------------------------------
  // 3. Cloud Logic & Statistics (ТЗ 9, 11)
  // ----------------------------------------------------------------------

  async isCloudEligible(uid) {
    const u = normUid(uid);
    if (!u || this.isPinned(u)) return false;

    const stats = await getCloudStats(u);
    const candidate = await getCloudCandidate(u);
    const { n } = this.getCloudSettings();

    // A) Кандидат (после снятия pinned)
    if (candidate) return true;
    // B) Авто (N full listens)
    if ((Number(stats?.cloudFullListenCount) || 0) >= n) return true;
    // C) Уже был cloud и срок не истёк
    if (stats?.cloud && (stats.cloudExpiresAt || 0) > Date.now()) return true;

    return false;
  }

  // ТЗ 9.3: ☁ отображаем только при 100% cached
  async shouldShowCloudIcon(uid, cq) {
    if (this.isPinned(uid)) return false;
    const isEligible = await this.isCloudEligible(uid);
    if (!isEligible) return false;
    
    // Проверка наличия файла
    return await this.isTrackComplete(uid, cq);
  }

  // ТЗ 17: Статистика
  // Вызывается из PlayerCore / PlaybackCache (onSecondTick, onEnded)
  async recordListenStats(uid, { deltaSec, isFullListen }) {
    const u = normUid(uid); if (!u) return;

    // 1. Глобальная статистика (ТЗ 1.4, 17.3 - никогда не сбрасывается)
    if (deltaSec > 0 || isFullListen) {
      await updateGlobalStats(u, deltaSec, isFullListen ? 1 : 0);
    }

    // 2. Cloud статистика (сбрасываемая)
    if (isFullListen) {
      const stats = await getCloudStats(u);
      const newCount = (Number(stats?.cloudFullListenCount) || 0) + 1;
      
      const { n, d } = this.getCloudSettings();
      // Становится ли он Cloud?
      const becameCloud = newCount >= n || stats?.cloud; // Достиг порога или уже был

      const newStats = {
        ...stats,
        cloudFullListenCount: newCount,
        lastFullListenAt: Date.now()
      };

      // ТЗ 9.4: Продление TTL
      if (becameCloud) {
        newStats.cloud = true;
        newStats.cloudExpiresAt = Date.now() + (d * 24 * 60 * 60 * 1000);
        await markLocalCloud(u); // Помечаем локально, чтобы Eviction знал
        
        // Если стал Cloud, но файла нет (например, слушали онлайн) -> качаем (P4)
        const cq = await this.getCacheQuality();
        if (!(await this.isTrackComplete(u, cq))) {
          this.enqueueAudioDownload({
            uid: u,
            quality: cq,
            priority: PRIORITY.P4_CLOUD,
            kind: 'cloudAuto'
          });
        }
      }
      
      await setCloudStats(u, newStats);
      this._emit({ phase: 'statsUpdated', uid: u });
    }
  }

  async _checkExpiredCloud() {
    const expired = await getExpiredCloudUids();
    let cleaned = 0;
    for (const u of expired) {
      if (!this.isPinned(u)) { // Pinned защищает
        // ТЗ: Истёк -> удаляем из кэша и сбрасываем cloud статус
        await deleteTrackCache(u);
        await clearCloudStats(u);
        await clearCloudCandidate(u);
        cleaned++;
      }
    }
    if (cleaned > 0) notify(`Срок действия истёк у ${cleaned} треков`);
  }

  // ТЗ 9.5: Меню Cloud
  // Alias for cloudMenuAction used by UI
  async cloudMenu(uid, action) {
    return this.cloudMenuAction(uid, action);
  }

  async cloudMenuAction(uid, action) {
    const u = normUid(uid);
    if (action === 'remove-cache') {
      // "Удалить из кэша": удалить файл, сбросить cloud-статистику
      await deleteTrackCache(u);
      await clearCloudStats(u);
      await clearCloudCandidate(u);
      notify('Удалено из кэша. Статистика облачка сброшена.');
      this._emit({ phase: 'cloudRemoved', uid: u });
    }
  }

  // ----------------------------------------------------------------------
  // 4. Download Queue Implementation (ТЗ 14)
  // ----------------------------------------------------------------------

  /**
   * Добавить задачу на скачивание аудио
   * @param {Object} p
   * @param {string} p.uid
   * @param {string} p.quality - 'hi' | 'lo'
   * @param {number} p.priority - use PRIORITY const
   * @param {string} p.kind - 'playbackCache' | 'pinned' | 'cloud' | 'update' | 'fullOffline'
   * @param {boolean} p.userInitiated - для политики сети
   * @param {Function} p.onResult - callback
   */
  enqueueAudioDownload({ uid, quality, priority, kind, userInitiated, onResult }) {
    const u = normUid(uid);
    const q = normQ(quality);
    if (!u) return;

    const key = `${kind}:${q}:${u}`;

    this.queue.add({
      uid: u,
      key,
      priority: priority || 0,
      taskFn: async () => {
        const res = await this._performDownload(u, q, kind, userInitiated);
        if (onResult) onResult(res);
      }
    });
  }

  async _performDownload(uid, quality, kind, userInitiated) {
    const meta = getTrackByUid(uid);
    if (!meta) return { ok: false, reason: 'no_meta' };

    // 1. Check if already complete
    if (await this.isTrackComplete(uid, quality)) {
      // Если это Cloud fill, нужно убедиться что он помечен как cloud
      if (kind === 'cloudAuto' || kind === 'pinned') {
        const stats = await getCloudStats(uid);
        if (stats?.cloud || kind === 'pinned') await this._finalizeCloudStatus(uid);
      }
      return { ok: true, skipped: true };
    }

    // 2. Check Network Policy (ТЗ 14.3)
    const net = getNet();
    const policy = getNetPolicy();
    const allowed = isAllowedByNetPolicy({ policy, net, userInitiated });
    
    if (!net.online) return { ok: false, reason: 'offline' };
    if (!allowed) {
      // ТЗ: задача ждёт. В v1.0 просто отклоняем, вызывающая сторона может ретраить
      // Для PlaybackCache это означает пропуск докачки.
      return { ok: false, reason: 'policy_restricted' };
    }

    // 3. Eviction (ТЗ 11.2.E)
    await this._enforceEvictionLimit();

    // 4. Download
    try {
      const url = quality === 'lo' ? (meta.urlLo || meta.urlHi) : (meta.urlHi || meta.urlLo);
      if (!url) throw new Error('No URL');

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      
      if (blob.size < 1024) throw new Error('Blob too small');

      await setAudioBlob(uid, quality, blob);
      await setBytes(uid, quality, blob.size);
      
      // Save download meta for Updates (ТЗ 13.1)
      const expSize = quality === 'lo' ? (meta.sizeLo || meta.size_low) : (meta.sizeHi || meta.size);
      await setDownloadMeta(uid, quality, {
        ts: Date.now(),
        bytes: blob.size,
        exp: Number(expSize) || 0
      });

      // Update Local kind (transient vs cloud vs pinned)
      if (kind === 'playbackCache') {
        await markLocalTransient(uid, 'window');
      } else if (kind === 'pinned' || kind === 'cloudAuto' || kind === 'cloudCandidate') {
        await this._finalizeCloudStatus(uid);
      } else {
        await markLocalTransient(uid, 'extra'); // Default
      }

      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  async _finalizeCloudStatus(uid) {
    if (this.isPinned(uid)) return; // Pinned is separate set
    await markLocalCloud(uid);
  }

  async _enforceEvictionLimit() {
    // Простой алгоритм очистки самых старых transient/extra
    const limitMB = parseInt(localStorage.getItem(LS.LIMIT) || '500', 10);
    const limitBytes = limitMB * MB;
    
    const current = await totalCachedBytes();
    if (current < limitBytes) return;

    const candidates = await getEvictionCandidates(this._getPinnedSet()); // Исключает pinned
    let freed = 0;
    
    for (const c of candidates) {
      if (current - freed <= limitBytes) break;
      await deleteTrackCache(c.uid); // Удаляем физически
      freed += c.bytes;
    }
    if (freed > 0) notify(`Очищено ${Math.round(freed/MB)} MB кэша`);
  }

  // ----------------------------------------------------------------------
  // 5. Updates & Re-cache (ТЗ 13)
  // ----------------------------------------------------------------------

  async refreshNeedsAggregates(opts = {}) {
    const NOW = Date.now();
    // Throttle 10s
    if (!opts.force && (NOW - this._needsState.ts < 10000)) return this._needsState;

    const uids = getAllTracks().map(t => t.uid);
    const cq = await this.getCacheQuality();
    
    let update = 0;
    let recache = 0;

    for (const uid of uids) {
      // Проверяем только Pinned и CloudEligible
      if (this.isPinned(uid) || (await this.isCloudEligible(uid))) {
        const s = await this.getTrackOfflineState(uid);
        if (s.needsUpdate) update++;
        if (s.needsReCache) recache++;
      }
    }

    this._needsState = { update, recache, ts: NOW };
    
    // UI "!" alert
    const hasAlert = update > 0 || recache > 0;
    localStorage.setItem(LS.ALERT, JSON.stringify({ on: hasAlert, ts: NOW }));
    window.dispatchEvent(new CustomEvent('offline:uiChanged'));

    return this._needsState;
  }

  async enqueueReCacheAllByCQ({ userInitiated } = {}) {
    const uids = getAllTracks().map(t => t.uid);
    const cq = await this.getCacheQuality();
    
    uids.forEach(async (uid) => {
      // Докачиваем (Re-cache) только то, что должно быть офлайн (Pinned/Cloud), но не имеет CQ
      if (this.isPinned(uid) || await this.isCloudEligible(uid)) {
        if (!(await this.isTrackComplete(uid, cq))) {
          this.enqueueAudioDownload({
            uid,
            quality: cq,
            priority: PRIORITY.P3_UPDATES,
            kind: 'recache',
            userInitiated
          });
        }
      }
    });
  }

  // ----------------------------------------------------------------------
  // 6. 100% OFFLINE (ТЗ 11.2.I)
  // ----------------------------------------------------------------------

  async computeSizeEstimate(selection) {
    // selection: { mode: 'favorites'|'albums', keys: [] }
    const uids = new Set();
    const all = getAllTracks();
    
    if (selection.mode === 'favorites') {
      // В v1.0 берем из глобальной модели (предполагаем доступность) или фильтруем all
      // Для надежности фильтруем all по Pinned (как пример) или передаем uids явно
      // Здесь предположим что selection.keys - это массив UIDs для favorites
      if (Array.isArray(selection.keys)) {
        selection.keys.forEach(u => uids.add(u));
      } else {
        // Fallback: взять все pinned, если список не передан (хотя offline-modal должен передать)
        const pinned = this._getPinnedSet();
        pinned.forEach(u => uids.add(u));
      }
    } else {
      all.forEach(t => {
        if (selection.keys.includes(t.sourceAlbum)) uids.add(t.uid);
      });
    }

    const cq = await this.getCacheQuality();
    let totalMB = 0;
    
    for (const u of uids) {
      const t = getTrackByUid(u);
      if (t) {
        const sz = cq === 'lo' ? (t.sizeLo || t.size_low) : (t.sizeHi || t.size);
        totalMB += (Number(sz) || 0);
      }
    }

    // ТЗ 22: iOS Risk
    let canGuarantee = true;
    if (navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const available = (est.quota || 0) - (est.usage || 0);
        if (available < totalMB * MB * 1.2) canGuarantee = false; // +20% buffer
      } catch (e) { canGuarantee = false; }
    }

    return { totalMB, count: uids.size, canGuarantee, uids: [...uids] };
  }

  async startFullOffline(uids) {
    const cq = await this.getCacheQuality();
    notify(`Старт загрузки ${uids.length} треков (100% Offline)`);
    
    uids.forEach(uid => {
      this.enqueueAudioDownload({
        uid,
        quality: cq,
        priority: PRIORITY.P4_CLOUD, // Mass download = Cloud/Fill level
        kind: 'fullOffline',
        userInitiated: true // Разрешает загрузку по сети (если включено в policy)
      });
    });
  }

  // ----------------------------------------------------------------------
  // 7. Helpers & API Definitions (ТЗ 19.2)
  // ----------------------------------------------------------------------

  async getTrackOfflineState(uid) {
    const u = normUid(uid); if (!u) return {};
    
    const pinned = this.isPinned(u);
    const cq = await this.getCacheQuality();
    const cloudEligible = await this.isCloudEligible(u);

    // Checks
    const cachedCQ = await this.isTrackComplete(u, cq);
    const cachedHi = await this.isTrackComplete(u, 'hi');
    const cachedLo = await this.isTrackComplete(u, 'lo');
    
    // Cloud icon only if eligible AND cached
    const isCloud = !pinned && cloudEligible && cachedCQ;

    // Detect Update (ТЗ 13.1)
    let needsUpdate = false;
    if (cachedCQ) {
      const meta = getTrackByUid(u);
      const dm = await getDownloadMeta(u, cq);
      const cfgSize = cq === 'lo' ? (meta?.sizeLo || meta?.size_low) : (meta?.sizeHi || meta?.size);
      
      if (dm?.bytes && cfgSize) {
        const diff = Math.abs(dm.bytes - (cfgSize * MB));
        if (diff > 0.05 * (cfgSize * MB)) needsUpdate = true; // >5% diff
      }
    }

    // ReCache needed if pinned/cloud but current CQ missing
    const needsReCache = (pinned || cloudEligible) && !cachedCQ;

    return {
      pinned,
      cloud: isCloud,
      cachedHiComplete: cachedHi,
      cachedLoComplete: cachedLo,
      needsUpdate,
      needsReCache
    };
  }

  async getIndicators(uid) {
    // Облегченная версия для списков (offline-indicators.js)
    const s = await this.getTrackOfflineState(uid);
    return {
      pinned: s.pinned,
      cloud: s.cloud,
      cachedComplete: s.cachedHiComplete || s.cachedLoComplete, // Любое качество считается
      unknown: false
    };
  }

  async isTrackComplete(uid, quality) {
    const u = normUid(uid);
    const q = normQ(quality);
    const meta = getTrackByUid(u);
    if (!meta) return false;

    // Ожидаемый размер
    const expMB = q === 'lo' ? (meta.sizeLo || meta.size_low) : (meta.sizeHi || meta.size);
    if (!expMB) return false;

    const stored = await bytesByQuality(u);
    const has = q === 'hi' ? stored.hi : stored.lo;

    // Проверка порога
    return has >= (expMB * MB * COMPLETE_THRESHOLD);
  }

  async clearAllCache() {
    await clearAllStores({ keepCacheQuality: true });
    // ТЗ 11.2.H: Очистить все
    this._pinnedCache = new Set();
    this._savePinned();
    
    // Сброс Alert
    localStorage.removeItem(LS.ALERT);
    window.dispatchEvent(new CustomEvent('offline:uiChanged'));
    
    notify('Кэш полностью очищен', 'success');
  }

  getGlobalStats() {
    return getGlobalStatsAndTotal();
  }
}

// Singleton export
export const OfflineManagerInstance = new OfflineManager();

// FIX: Экспорт функции для PlayerCore.js (согласно ошибке в консоли)
export function getOfflineManager() {
  return OfflineManagerInstance;
}

export default OfflineManagerInstance;
