/**
 * offline-manager.js — Центральный модуль управления офлайн-режимом.
 *
 * Отвечает за:
 *   - Режимы R0 / R1 / R2 / R3
 *   - Очередь загрузок (DownloadQueue) с Background Presets
 *   - Pinning / unpinning альбомов и треков
 *   - Cloud TTL проверки
 *   - Квоты и проверка свободного места
 *   - Сохранение / восстановление R1 при переходе в R2
 *   - Recovery target для FOQ (S3)
 *
 * Зависимости:
 *   - ./cache-db.js
 *   - ./net-policy.js
 *
 * Глобально:  window.OfflineManager
 * События:    offline:modeChanged, offline:queueUpdate,
 *             offline:trackCached, offline:trackRemoved,
 *             offline:spaceWarning, offline:fullOfflineReady
 */

import {
  openDB,
  setAudioBlob, getAudioBlob, deleteAudio,
  setTrackMeta, getTrackMeta, deleteTrackMeta, getAllTrackMetas,
  getAllKeys, getCloudStats,
  getGlobal, setGlobal,
  estimateUsage
} from './cache-db.js';

/* ═══════════════════════════════════════════
   Константы
   ═══════════════════════════════════════════ */

const MODE_KEY       = 'offline-mode';
const R1_BACKUP_KEY  = 'offline-r1-before-r2';
const NET_POLICY_KEY = 'offline-net-policy';
const PRESET_KEY     = 'offline-bg-preset';
const MIN_SPACE_MB   = 60;
const MB             = 1024 * 1024;
const CLOUD_TTL_MS   = 31 * 24 * 60 * 60 * 1000;

/* ═══════════════════════════════════════════
   Background Presets (ТЗ §7.10.1)
   ═══════════════════════════════════════════ */

const BG_PRESETS = {
  conservative: {
    label: 'Экономный',
    concurrency: 1,
    pauseBetweenMs: 3000,
    retryLimit: 2,
    retryBaseMs: 5000
  },
  balanced: {
    label: 'Сбалансированный',
    concurrency: 2,
    pauseBetweenMs: 1000,
    retryLimit: 3,
    retryBaseMs: 3000
  },
  aggressive: {
    label: 'Быстрый',
    concurrency: 3,
    pauseBetweenMs: 200,
    retryLimit: 4,
    retryBaseMs: 2000
  }
};

function detectDefaultPreset() {
  const conn = navigator.connection || navigator.mozConnection;
  if (!conn) return 'balanced';
  if (conn.saveData) return 'conservative';
  const type = conn.effectiveType || '';
  if (type === '4g') return 'aggressive';
  if (type === '3g') return 'balanced';
  return 'conservative';
}

/* ═══════════════════════════════════════════
   Network Policy (ТЗ §11.2.D)
   ═══════════════════════════════════════════ */

const DEFAULT_NET_POLICY = {
  wifi: true,
  mobile: true
};

function loadNetPolicy() {
  try {
    const raw = localStorage.getItem(NET_POLICY_KEY);
    return raw ? JSON.parse(raw) : { ...DEFAULT_NET_POLICY };
  } catch {
    return { ...DEFAULT_NET_POLICY };
  }
}

function saveNetPolicy(policy) {
  localStorage.setItem(NET_POLICY_KEY, JSON.stringify(policy));
}

function isNetworkAllowedByPolicy(policy) {
  if (!navigator.onLine) return false;

  const conn = navigator.connection || navigator.mozConnection;
  if (!conn || !conn.type) return policy.wifi; // unknown → treat as wifi

  if (conn.type === 'wifi') return policy.wifi;
  if (conn.type === 'cellular') return policy.mobile;
  return true;
}

/* ═══════════════════════════════════════════
   DownloadQueue — очередь фоновых загрузок
   ═══════════════════════════════════════════ */

class DownloadQueue {
  constructor(manager) {
    this._mgr = manager;
    this._queue = [];          // { uid, url, quality, type, retries, priority }
    this._active = new Map();  // uid → AbortController
    this._paused = false;
    this._preset = null;
    this._loadPreset();
  }

  /* --- Preset --- */

  _loadPreset() {
    const saved = localStorage.getItem(PRESET_KEY);
    const name = saved && BG_PRESETS[saved] ? saved : detectDefaultPreset();
    this._preset = { name, ...BG_PRESETS[name] };
  }

  getPreset() {
    return { ...this._preset };
  }

  setPreset(name) {
    if (!BG_PRESETS[name]) return;
    this._preset = { name, ...BG_PRESETS[name] };
    localStorage.setItem(PRESET_KEY, name);
  }

  /* --- Queue control --- */

  enqueue(uid, url, quality, type = 'cloud', priority = 0) {
    if (this._queue.some(item => item.uid === uid)) return;
    if (this._active.has(uid)) return;

    this._queue.push({ uid, url, quality, type, retries: 0, priority });
    this._queue.sort((a, b) => b.priority - a.priority);
    this._emitUpdate();
    this._processNext();
  }

  dequeue(uid) {
    this._queue = this._queue.filter(item => item.uid !== uid);

    const ctrl = this._active.get(uid);
    if (ctrl) {
      ctrl.abort();
      this._active.delete(uid);
    }
    this._emitUpdate();
  }

  pause() {
    this._paused = true;
    this._emitUpdate();
  }

  resume() {
    this._paused = false;
    this._emitUpdate();
    this._processNext();
  }

  isPaused() {
    return this._paused;
  }

  clear() {
    for (const [, ctrl] of this._active) ctrl.abort();
    this._active.clear();
    this._queue = [];
    this._emitUpdate();
  }

  getStatus() {
    return {
      queued: this._queue.length,
      active: this._active.size,
      paused: this._paused,
      preset: this._preset.name,
      items: this._queue.map(i => ({ uid: i.uid, type: i.type }))
    };
  }

  /* --- Processing --- */

  async _processNext() {
    if (this._paused) return;

    const { concurrency, pauseBetweenMs } = this._preset;

    while (this._active.size < concurrency && this._queue.length > 0) {
      if (!isNetworkAllowedByPolicy(this._mgr.getNetPolicy())) {
        return; // сеть запрещена политикой
      }

      const item = this._queue.shift();
      this._download(item);

      if (pauseBetweenMs > 0 && this._queue.length > 0) {
        await new Promise(r => setTimeout(r, pauseBetweenMs));
      }
    }
  }

  async _download(item) {
    const { uid, url, quality, type } = item;
    const ctrl = new AbortController();
    this._active.set(uid, ctrl);
    this._emitUpdate();

    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const blob = await resp.blob();
      this._active.delete(uid);

      await setAudioBlob(uid, quality, blob);
      await setTrackMeta(uid, { type, quality, size: blob.size, url, ttl: type === 'cloud' ? CLOUD_TTL_MS : null });

      emit('offline:trackCached', { uid, quality, type, size: blob.size });
      this._emitUpdate();
      this._processNext();
    } catch (err) {
      this._active.delete(uid);

      if (err.name === 'AbortError') {
        this._emitUpdate();
        return;
      }

      // Retry с exponential backoff
      const { retryLimit, retryBaseMs } = this._preset;
      if (item.retries < retryLimit) {
        item.retries++;
        const delay = retryBaseMs * Math.pow(2, item.retries - 1);
        console.warn(`[DQ] Retry ${item.retries}/${retryLimit} for ${uid} in ${delay}ms`);
        setTimeout(() => {
          this._queue.unshift(item);
          this._emitUpdate();
          this._processNext();
        }, delay);
      } else {
        console.error(`[DQ] Failed after ${retryLimit} retries:`, uid);
        emit('offline:downloadFailed', { uid, error: err.message });
        this._emitUpdate();
        this._processNext();
      }
    }
  }

  _emitUpdate() {
    emit('offline:queueUpdate', this.getStatus());
  }
}

/* ═══════════════════════════════════════════
   OfflineManager — основной класс
   ═══════════════════════════════════════════ */

class OfflineManager {
  constructor() {
    this._mode = 'R0';
    this._netPolicy = loadNetPolicy();
    this._queue = new DownloadQueue(this);
    this._pinnedAlbums = new Set();
    this._ready = false;
  }

  /* --- Инициализация --- */

  async init() {
    await openDB();

    // Загружаем сохранённый режим
    const savedMode = localStorage.getItem(MODE_KEY);
    if (savedMode && ['R0', 'R1', 'R2', 'R3'].includes(savedMode)) {
      this._mode = savedMode;
    }

    // Проверяем доступность хранилища
    const spaceOk = await this._checkSpaceGuarantee();
    if (!spaceOk && this._mode !== 'R0') {
      console.warn('[OM] Not enough space, falling back to R0');
      this._mode = 'R0';
      localStorage.setItem(MODE_KEY, 'R0');
    }

    // Загружаем pinned альбомы
    await this._loadPinnedAlbums();

    // Проверяем expired cloud треки
    await this._checkExpiredCloud();

    this._ready = true;
    emit('offline:ready', { mode: this._mode });

    return this;
  }

  /* --- Режим R0/R1/R2/R3 --- */

  getMode() {
    return this._mode;
  }

  async setMode(newMode) {
    if (!['R0', 'R1', 'R2', 'R3'].includes(newMode)) return;

    const prev = this._mode;
    if (prev === newMode) return;

    // Проверка места для R1+
    if (newMode !== 'R0') {
      const ok = await this._checkSpaceGuarantee();
      if (!ok) {
        emit('offline:spaceWarning', {
          message: `Недостаточно места (нужно минимум ${MIN_SPACE_MB} МБ). Режим ${newMode} недоступен.`
        });
        return;
      }
    }

    // Сохраняем R1 перед переходом в R2 (ТЗ §11.2.A.3)
    if (newMode === 'R2' && prev === 'R1') {
      this._saveR1State();
    }

    // Восстанавливаем R1 при выключении R2
    if (prev === 'R2' && newMode === 'R1') {
      await this._restoreR1State();
    }

    // Очистка при переходе в R0
    if (newMode === 'R0') {
      this._queue.clear();
    }

    this._mode = newMode;
    localStorage.setItem(MODE_KEY, newMode);
    emit('offline:modeChanged', { prev, mode: newMode });
  }

  /* --- R1 backup/restore (ТЗ §11.2.A.3) --- */

  _saveR1State() {
    try {
      const state = {
        pinnedAlbums: [...this._pinnedAlbums],
        queueStatus: this._queue.getStatus()
      };
      localStorage.setItem(R1_BACKUP_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }

  async _restoreR1State() {
    try {
      const raw = localStorage.getItem(R1_BACKUP_KEY);
      if (!raw) return;

      const state = JSON.parse(raw);
      if (state.pinnedAlbums) {
        this._pinnedAlbums = new Set(state.pinnedAlbums);
        await setGlobal('pinned-albums', [...this._pinnedAlbums]);
      }
      localStorage.removeItem(R1_BACKUP_KEY);
    } catch {
      // ignore
    }
  }

  /* --- Network Policy --- */

  getNetPolicy() {
    return { ...this._netPolicy };
  }

  setNetPolicy(policy) {
    this._netPolicy = { ...DEFAULT_NET_POLICY, ...policy };
    saveNetPolicy(this._netPolicy);
    emit('offline:netPolicyChanged', this._netPolicy);

    // Если сеть стала доступна, возобновляем очередь
    if (isNetworkAllowedByPolicy(this._netPolicy) && !this._queue.isPaused()) {
      this._queue.resume();
    }
  }

  isNetworkAllowed() {
    return isNetworkAllowedByPolicy(this._netPolicy);
  }

  /* --- Download Queue facade --- */

  enqueueDownload(uid, url, quality, type = 'cloud', priority = 0) {
    if (this._mode === 'R0') return;
    this._queue.enqueue(uid, url, quality, type, priority);
  }

  dequeueDownload(uid) {
    this._queue.dequeue(uid);
  }

  pauseDownloads() {
    this._queue.pause();
  }

  resumeDownloads() {
    this._queue.resume();
  }

  getQueueStatus() {
    return this._queue.getStatus();
  }

  getPreset() {
    return this._queue.getPreset();
  }

  setPreset(name) {
    this._queue.setPreset(name);
  }

  /* --- Pinning альбомов (ТЗ §11.2.I) --- */

  async pinAlbum(albumId, tracks, quality) {
    if (this._mode === 'R0') {
      emit('offline:toast', { message: 'Включите офлайн-режим для сохранения альбомов.' });
      return;
    }

    this._pinnedAlbums.add(albumId);
    await setGlobal('pinned-albums', [...this._pinnedAlbums]);

    for (const track of tracks) {
      const uid = track.uid || track.id;
      if (!uid || !track.url) continue;

      await setTrackMeta(uid, { type: 'pinned', quality, albumId, title: track.title || '', url: track.url, ttl: null });

      this._queue.enqueue(uid, track.url, quality, 'pinned', 10);
    }

    emit('offline:albumPinned', { albumId, count: tracks.length });
  }

  async unpinAlbum(albumId) {
    this._pinnedAlbums.delete(albumId);
    await setGlobal('pinned-albums', [...this._pinnedAlbums]);

    const allMetas = await getAllTrackMetas();
    for (const m of allMetas) {
      if (m.albumId === albumId && m.type === 'pinned') {
        this._queue.dequeue(m.uid);
        await deleteAudio(m.uid);
        await deleteTrackMeta(m.uid);
      }
    }

    emit('offline:albumUnpinned', { albumId });
  }

  isAlbumPinned(albumId) {
    return this._pinnedAlbums.has(albumId);
  }

  getPinnedAlbums() {
    return [...this._pinnedAlbums];
  }

  async _loadPinnedAlbums() {
    const saved = await getGlobal('pinned-albums');
    if (Array.isArray(saved)) {
      this._pinnedAlbums = new Set(saved);
    }
  }

  /* --- Управление отдельными треками --- */

  async removeTrack(uid) {
    this._queue.dequeue(uid);
    await deleteAudio(uid);
    await deleteTrackMeta(uid);
    emit('offline:trackRemoved', { uid });
  }

  async getTrackInfo(uid) {
    const meta = await getTrackMeta(uid);
    if (!meta) return null;

    const blob = (await getAudioBlob(uid, 'high')) || (await getAudioBlob(uid, 'low'));
    return {
      ...meta,
      cached: !!blob,
      size: blob ? blob.size : 0
    };
  }

  /* --- Cache Quality (для UI кнопки Hi/Lo) --- */

  getCacheQuality(uid) {
    // Синхронный — возвращает текущую настройку, не фактическое качество файла
    const modeQ = localStorage.getItem('offline-quality') || 'low';
    return modeQ;
  }

  setQualityPreference(quality) {
    localStorage.setItem('offline-quality', quality);
  }

  getQualityPreference() {
    return localStorage.getItem('offline-quality') || 'low';
  }

  /* --- Recovery target для FOQ (S3) --- */

  async getRecoveryTarget() {
    const allMetas = await getAllTrackMetas();
    const cached = [];

    for (const m of allMetas) {
      const blob = (await getAudioBlob(m.uid, 'high')) || (await getAudioBlob(m.uid, 'low'));
      if (blob) {
        cached.push(m);
      }
    }

    if (cached.length === 0) return null;

    // Приоритет: pinned > cloud, затем по lastPlayed
    cached.sort((a, b) => {
      const typeOrder = { pinned: 0, cloud: 1 };
      const ta = typeOrder[a.type] ?? 2;
      const tb = typeOrder[b.type] ?? 2;
      if (ta !== tb) return ta - tb;
      return (b.lastPlayed || 0) - (a.lastPlayed || 0);
    });

    return { uid: cached[0].uid, meta: cached[0] };
  }

  /* --- Cloud TTL проверка (ТЗ §9.4) --- */

  async _checkExpiredCloud() {
    try {
      const { expired, expiredUids } = await getCloudStats();

      if (expired === 0) return;

      console.log(`[OM] Found ${expired} expired cloud tracks, removing...`);

      for (const uid of expiredUids) {
        await deleteAudio(uid);
        await deleteTrackMeta(uid);
      }

      emit('offline:cloudExpired', { count: expired, uids: expiredUids });
    } catch (err) {
      console.warn('[OM] Cloud TTL check failed:', err.message);
    }
  }

  /* --- Проверка места (ТЗ §1.6) --- */

  async _checkSpaceGuarantee() {
    try {
      const usage = await estimateUsage();
      if (usage.quota === 0) {
        // API недоступен — безопасный fallback: запрещаем офлайн
        return false;
      }
      return usage.free >= MIN_SPACE_MB * MB;
    } catch {
      return false;
    }
  }

  /* --- Очистка кэша (ТЗ §11.2.H) --- */

  async clearByCategory(category) {
    const allMetas = await getAllTrackMetas();
    let count = 0;

    for (const m of allMetas) {
      if (category === 'all' || m.type === category) {
        await deleteAudio(m.uid);
        await deleteTrackMeta(m.uid);
        count++;
      }
    }

    if (category === 'all' || category === 'pinned') {
      this._pinnedAlbums.clear();
      await setGlobal('pinned-albums', []);
    }

    emit('offline:cacheCleared', { category, count });
    return count;
  }

  async getCategoryStats() {
    const allMetas = await getAllTrackMetas();
    const stats = { pinned: 0, cloud: 0, dynamic: 0, total: 0 };
    const sizes = { pinned: 0, cloud: 0, dynamic: 0, total: 0 };

    for (const m of allMetas) {
      const type = m.type || 'dynamic';
      stats[type] = (stats[type] || 0) + 1;
      sizes[type] = (sizes[type] || 0) + (m.size || 0);
      stats.total++;
      sizes.total += (m.size || 0);
    }

    return { counts: stats, sizes };
  }

  /* --- Обновление всех файлов (ТЗ §11.2.G) --- */

  async refreshAll(quality) {
    const allMetas = await getAllTrackMetas();
    let enqueued = 0;

    for (const m of allMetas) {
      if (!m.url) continue;
      const q = quality || m.quality || this.getQualityPreference();
      this._queue.enqueue(m.uid, m.url, q, m.type || 'cloud', 1);
      enqueued++;
    }

    emit('offline:refreshStarted', { count: enqueued });
    return enqueued;
  }

  /* --- 100% OFFLINE (R3) readiness check --- */

  async checkFullOfflineReady() {
    if (this._mode !== 'R2') return false;

    const allMetas = await getAllTrackMetas();
    if (allMetas.length === 0) return false;

    for (const m of allMetas) {
      if (m.type !== 'pinned') continue;
      const blob = (await getAudioBlob(m.uid, 'high')) || (await getAudioBlob(m.uid, 'low'));
      if (!blob) return false;
    }

    emit('offline:fullOfflineReady', { totalTracks: allMetas.length });
    return true;
  }

  /* --- Storage usage --- */

  async getStorageInfo() {
    const usage = await estimateUsage();
    const catStats = await this.getCategoryStats();

    return {
      ...usage,
      categories: catStats,
      minRequired: MIN_SPACE_MB * MB
    };
  }
}

/* ═══════════════════════════════════════════
   Утилита emit (общая)
   ═══════════════════════════════════════════ */

function emit(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/* ═══════════════════════════════════════════
   Инициализация синглтона
   ═══════════════════════════════════════════ */

const instance = new OfflineManager();
window.OfflineManager = instance;

// Named export для единообразных импортов по проекту
export function getOfflineManager() {
  return instance;
}

export default instance;
export { BG_PRESETS, OfflineManager };
