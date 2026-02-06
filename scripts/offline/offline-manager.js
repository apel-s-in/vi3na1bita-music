/**
 * offline-manager.js — Центральный модуль управления офлайн-режимом.
 */

import {
  openDB,
  setAudioBlob, getAudioBlob, deleteAudio,
  setTrackMeta, getTrackMeta, deleteTrackMeta, getAllTrackMetas,
  getAllKeys, getCloudStats, setCloudStats, updateGlobalStats,
  getGlobal, setGlobal,
  estimateUsage
} from './cache-db.js';

/* ═══════════════════════════════════════════
   Константы
   ═══════════════════════════════════════════ */

const MODE_KEY       = 'offline:mode:v1';
const R1_BACKUP_KEY  = 'offline-r1-before-r2';
const NET_POLICY_KEY = 'offline-net-policy';
const PRESET_KEY     = 'offline-bg-preset';
const CQ_KEY         = 'offline:cacheQuality:v1';
const PQ_KEY         = 'qualityMode:v1';
const MIN_SPACE_MB   = 60;
const MB             = 1024 * 1024;
const CLOUD_TTL_MS   = 31 * 24 * 60 * 60 * 1000;

/* ═══════════════════════════════════════════
   Background Presets
   ═══════════════════════════════════════════ */

const BG_PRESETS = {
  conservative: { label: 'Экономный',       concurrency: 1, pauseBetweenMs: 3000, retryLimit: 2, retryBaseMs: 5000 },
  balanced:     { label: 'Сбалансированный', concurrency: 2, pauseBetweenMs: 1000, retryLimit: 3, retryBaseMs: 3000 },
  aggressive:   { label: 'Быстрый',         concurrency: 3, pauseBetweenMs: 200,  retryLimit: 4, retryBaseMs: 2000 }
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
   Network Policy
   ═══════════════════════════════════════════ */

const DEFAULT_NET_POLICY = { wifi: true, mobile: true };

function loadNetPolicy() {
  try {
    const raw = localStorage.getItem(NET_POLICY_KEY);
    return raw ? JSON.parse(raw) : { ...DEFAULT_NET_POLICY };
  } catch { return { ...DEFAULT_NET_POLICY }; }
}

function saveNetPolicy(policy) {
  localStorage.setItem(NET_POLICY_KEY, JSON.stringify(policy));
}

function isNetworkAllowedByPolicy(policy) {
  if (!navigator.onLine) return false;
  const conn = navigator.connection || navigator.mozConnection;
  if (!conn || !conn.type) return policy.wifi;
  if (conn.type === 'wifi') return policy.wifi;
  if (conn.type === 'cellular') return policy.mobile;
  return true;
}

/* ═══════════════════════════════════════════
   Утилита emit
   ═══════════════════════════════════════════ */

function emit(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/* ═══════════════════════════════════════════
   DownloadQueue
   ═══════════════════════════════════════════ */

class DownloadQueue {
  constructor(manager) {
    this._mgr = manager;
    this._queue = [];
    this._active = new Map();
    this._paused = false;
    this._preset = null;
    this._loadPreset();
  }

  _loadPreset() {
    const saved = localStorage.getItem(PRESET_KEY);
    const name = saved && BG_PRESETS[saved] ? saved : detectDefaultPreset();
    this._preset = { name, ...BG_PRESETS[name] };
  }

  getPreset() { return { ...this._preset }; }

  setPreset(name) {
    if (!BG_PRESETS[name]) return;
    this._preset = { name, ...BG_PRESETS[name] };
    localStorage.setItem(PRESET_KEY, name);
  }

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
    if (ctrl) { ctrl.abort(); this._active.delete(uid); }
    this._emitUpdate();
  }

  pause()  { this._paused = true;  this._emitUpdate(); }
  resume() { this._paused = false; this._emitUpdate(); this._processNext(); }
  isPaused() { return this._paused; }

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

  async _processNext() {
    if (this._paused) return;
    const { concurrency, pauseBetweenMs } = this._preset;
    while (this._active.size < concurrency && this._queue.length > 0) {
      if (!isNetworkAllowedByPolicy(this._mgr.getNetPolicy())) return;
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
      await setTrackMeta(uid, {
        type, quality, size: blob.size, url,
        ttl: type === 'cloud' ? CLOUD_TTL_MS : null
      });

      emit('offline:trackCached', { uid, quality, type, size: blob.size });
      this._emitUpdate();
      this._processNext();
    } catch (err) {
      this._active.delete(uid);
      if (err.name === 'AbortError') { this._emitUpdate(); return; }

      const { retryLimit, retryBaseMs } = this._preset;
      if (item.retries < retryLimit) {
        item.retries++;
        const delay = retryBaseMs * Math.pow(2, item.retries - 1);
        setTimeout(() => {
          this._queue.unshift(item);
          this._emitUpdate();
          this._processNext();
        }, delay);
      } else {
        emit('offline:downloadFailed', { uid, error: err.message });
        this._emitUpdate();
        this._processNext();
      }
    }
  }

  _emitUpdate() { emit('offline:queueUpdate', this.getStatus()); }
}

/* ═══════════════════════════════════════════
   OfflineManager
   ═══════════════════════════════════════════ */

class OfflineManager {
  constructor() {
    this._mode = 'R0';
    this._netPolicy = loadNetPolicy();
    this._queue = new DownloadQueue(this);
    this._pinnedAlbums = new Set();
    this._ready = false;
    this._subs = new Map();
    this._playbackWindow = [];
  }

  /* ─── Event emitter ─── */

  on(eventOrObj, fn) {
    if (typeof eventOrObj === 'string' && typeof fn === 'function') {
      if (!this._subs.has(eventOrObj)) this._subs.set(eventOrObj, new Set());
      this._subs.get(eventOrObj).add(fn);
      return () => this._subs.get(eventOrObj)?.delete(fn);
    }
    if (typeof eventOrObj === 'object' && eventOrObj !== null) {
      const unsubs = [];
      for (const [k, v] of Object.entries(eventOrObj)) {
        unsubs.push(this.on(k, v));
      }
      return () => unsubs.forEach(u => u?.());
    }
  }

  off(event, fn) {
    this._subs.get(event)?.delete(fn);
  }

  _emit(event, data) {
    this._subs.get(event)?.forEach(fn => { try { fn(data); } catch(e) { console.error(e); } });
  }

  /* ─── Инициализация ─── */

  async init() { return this.initialize(); }

  async initialize() {
    if (this._ready) return this;

    await openDB();

    const savedMode = localStorage.getItem(MODE_KEY);
    if (savedMode && ['R0','R1','R2','R3'].includes(savedMode)) {
      this._mode = savedMode;
    }

    const spaceOk = await this._checkSpaceGuarantee();
    if (!spaceOk && this._mode !== 'R0') {
      this._mode = 'R0';
      localStorage.setItem(MODE_KEY, 'R0');
    }

    await this._loadPinnedAlbums();
    await this._checkExpiredCloud();

    this._ready = true;
    emit('offline:ready', { mode: this._mode });
    return this;
  }

  /* ─── Mode ─── */

  getMode() { return this._mode; }
  isOfflineMode() { return this._mode !== 'R0'; }

  async setMode(newMode) {
    if (!['R0','R1','R2','R3'].includes(newMode)) return;
    const prev = this._mode;
    if (prev === newMode) return;

    if (newMode !== 'R0') {
      const ok = await this._checkSpaceGuarantee();
      if (!ok) {
        emit('offline:spaceWarning', { message: `Нужно минимум ${MIN_SPACE_MB} МБ.` });
        return;
      }
    }

    if (newMode === 'R2' && prev === 'R1') this._saveR1State();
    if (prev === 'R2' && newMode === 'R1') await this._restoreR1State();
    if (newMode === 'R0') this._queue.clear();

    this._mode = newMode;
    localStorage.setItem(MODE_KEY, newMode);
    emit('offline:modeChanged', { prev, mode: newMode });
    emit('offline:uiChanged');
    this._emit('modeChanged', { prev, mode: newMode });
  }

  /* ─── Quality ─── */

  getActivePlaybackQuality() {
    switch (this._mode) {
      case 'R2':
      case 'R3':
        return this.getCacheQualitySetting();
      default:
        return (localStorage.getItem(PQ_KEY) || 'hi') === 'lo' ? 'lo' : 'hi';
    }
  }

  getCacheQualitySetting() {
    return (localStorage.getItem(CQ_KEY) || 'hi') === 'lo' ? 'lo' : 'hi';
  }

  setCacheQualitySetting(q) {
    localStorage.setItem(CQ_KEY, q === 'lo' ? 'lo' : 'hi');
    emit('offline:uiChanged');
    this._emit('qualityChanged', { quality: q });
  }

  getFullOfflineQuality() { return this.getCacheQualitySetting(); }

  /* ─── Track offline state ─── */

  async getTrackOfflineState(uid) {
    const u = String(uid || '').trim();
    if (!u) return { pinned: false, cloud: false, cacheKind: 'none', cachedVariant: null, cachedComplete: 0 };

    const meta = await getTrackMeta(u);
    const blobHi = await getAudioBlob(u, 'high');
    const blobLo = await getAudioBlob(u, 'low');
    const hasBlob = !!(blobHi || blobLo);
    const variant = blobHi ? 'hi' : (blobLo ? 'lo' : null);

    return {
      pinned: meta?.type === 'pinned',
      cloud: meta?.type === 'cloud' && hasBlob,
      cacheKind: meta?.type || 'none',
      cachedVariant: variant,
      cachedComplete: hasBlob ? 100 : 0,
      needsUpdate: !!(meta?.needsUpdate),
      needsReCache: !!(meta?.needsReCache),
      cachedSize: (blobHi || blobLo)?.size || 0
    };
  }

  async isTrackComplete(uid, quality) {
    const u = String(uid || '').trim();
    if (!u) return false;
    const q = quality === 'lo' ? 'low' : 'high';
    const blob = await getAudioBlob(u, q);
    return !!blob;
  }

  /* ─── Toggle pinned ─── */

  async togglePinned(uid) {
    const u = String(uid || '').trim();
    if (!u) return;

    const meta = await getTrackMeta(u);
    if (meta?.type === 'pinned') {
      await setTrackMeta(u, { ...meta, type: 'cloud' });
      window.NotificationSystem?.info('Офлайн-закрепление снято');
    } else {
      await setTrackMeta(u, { ...(meta || {}), uid: u, type: 'pinned', ts: Date.now() });
      window.NotificationSystem?.info('Трек закреплён офлайн 🔒');
    }

    emit('offline:uiChanged');
    this._emit('progress', { phase: 'pinnedChanged' });
  }

  /* ─── Playback window ─── */

  updatePlaybackWindow(uids) {
    this._playbackWindow = Array.isArray(uids) ? uids : [];
  }

  /* ─── Enqueue audio download ─── */

  enqueueAudioDownload({ uid, quality, priority = 0, kind = 'playbackCache' }) {
    if (this._mode === 'R0') return;
    const track = window.TrackRegistry?.getTrackByUid(uid);
    const q = quality === 'lo' ? 'low' : 'high';
    let url;

    if (track) {
      url = quality === 'lo' ? (track.audio_low || track.audio) : track.audio;
    }

    if (!url) {
      // Fallback — try meta
      getTrackMeta(uid).then(meta => {
        if (meta?.url) this._queue.enqueue(uid, meta.url, q, kind, priority);
      }).catch(() => {});
      return;
    }

    this._queue.enqueue(uid, url, q, kind, priority);
  }

  /* ─── Stats recording ─── */

  recordListenStats(uid, { deltaSec = 0, isFullListen = false } = {}) {
    updateGlobalStats(uid, deltaSec, isFullListen ? 1 : 0).catch(err => {
      console.warn('[OfflineManager] recordListenStats error:', err);
    });
  }

  /* ─── Global statistics for modal ─── */

  async getGlobalStatistics() {
    const allMetas = await getAllTrackMetas();
    const uidSet = new Set(allMetas.map(m => m.uid).filter(Boolean));

    let totalSeconds = 0;
    const tracks = [];

    for (const uid of uidSet) {
      const stat = await getGlobal(`stats:${uid}`);
      if (stat) {
        tracks.push({
          uid,
          seconds: stat.seconds || 0,
          fullListens: stat.fullPlays || 0
        });
        totalSeconds += stat.seconds || 0;
      }
    }

    // Also check stats:total for totals
    const totalStat = await getGlobal('stats:total');
    if (totalStat && totalStat.seconds > totalSeconds) {
      totalSeconds = totalStat.seconds;
    }

    return { totalSeconds, tracks };
  }

  /* ─── R1 backup/restore ─── */

  _saveR1State() {
    try {
      localStorage.setItem(R1_BACKUP_KEY, JSON.stringify({
        pinnedAlbums: [...this._pinnedAlbums]
      }));
    } catch {}
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
    } catch {}
  }

  /* ─── Network Policy ─── */

  getNetPolicy() { return { ...this._netPolicy }; }

  setNetPolicy(policy) {
    this._netPolicy = { ...DEFAULT_NET_POLICY, ...policy };
    saveNetPolicy(this._netPolicy);
    emit('offline:netPolicyChanged', this._netPolicy);
    if (isNetworkAllowedByPolicy(this._netPolicy) && !this._queue.isPaused()) {
      this._queue.resume();
    }
  }

  isNetworkAllowed() { return isNetworkAllowedByPolicy(this._netPolicy); }

  /* ─── Queue facade ─── */

  get queue() { return this._queue; }
  enqueueDownload(uid, url, quality, type = 'cloud', priority = 0) {
    if (this._mode === 'R0') return;
    this._queue.enqueue(uid, url, quality, type, priority);
  }
  dequeueDownload(uid) { this._queue.dequeue(uid); }
  pauseDownloads()     { this._queue.pause(); }
  resumeDownloads()    { this._queue.resume(); }
  getQueueStatus()     { return this._queue.getStatus(); }
  getPreset()          { return this._queue.getPreset(); }
  setPreset(name)      { this._queue.setPreset(name); }

  /* ─── Pinned albums ─── */

  async pinAlbum(albumId, tracks, quality) {
    if (this._mode === 'R0') {
      emit('offline:toast', { message: 'Включите офлайн-режим.' });
      return;
    }
    this._pinnedAlbums.add(albumId);
    await setGlobal('pinned-albums', [...this._pinnedAlbums]);

    for (const track of tracks) {
      const uid = track.uid || track.id;
      if (!uid || !track.url) continue;
      await setTrackMeta(uid, {
        type: 'pinned', quality, albumId,
        title: track.title || '', url: track.url, ttl: null
      });
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

  isAlbumPinned(albumId) { return this._pinnedAlbums.has(albumId); }
  getPinnedAlbums() { return [...this._pinnedAlbums]; }

  async _loadPinnedAlbums() {
    const saved = await getGlobal('pinned-albums');
    if (Array.isArray(saved)) this._pinnedAlbums = new Set(saved);
  }

  /* ─── Track management ─── */

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
    return { ...meta, cached: !!blob, size: blob ? blob.size : 0 };
  }

  /* ─── Recovery target ─── */

  async getRecoveryTarget() {
    const allMetas = await getAllTrackMetas();
    const cached = [];

    for (const m of allMetas) {
      const blob = (await getAudioBlob(m.uid, 'high')) || (await getAudioBlob(m.uid, 'low'));
      if (blob) cached.push(m);
    }

    if (!cached.length) return null;

    cached.sort((a, b) => {
      const order = { pinned: 0, cloud: 1 };
      const ta = order[a.type] ?? 2;
      const tb = order[b.type] ?? 2;
      if (ta !== tb) return ta - tb;
      return (b.lastPlayed || 0) - (a.lastPlayed || 0);
    });

    return { uid: cached[0].uid, meta: cached[0] };
  }

  /* ─── Cloud TTL ─── */

  async _checkExpiredCloud() {
    try {
      const { expired, expiredUids } = await getCloudStats();
      if (!expired) return;
      for (const uid of expiredUids) {
        await deleteAudio(uid);
        await deleteTrackMeta(uid);
      }
      emit('offline:cloudExpired', { count: expired, uids: expiredUids });
    } catch {}
  }

  /* ─── Space ─── */

  async _checkSpaceGuarantee() {
    try {
      const u = await estimateUsage();
      if (u.quota === 0) return true; // Can't determine — allow
      return u.free >= MIN_SPACE_MB * MB;
    } catch { return true; }
  }

  /* ─── Clear ─── */

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
    const counts = { pinned: 0, cloud: 0, dynamic: 0, total: 0 };
    const sizes  = { pinned: 0, cloud: 0, dynamic: 0, total: 0 };

    for (const m of allMetas) {
      const type = m.type || 'dynamic';
      counts[type] = (counts[type] || 0) + 1;
      sizes[type]  = (sizes[type] || 0) + (m.size || 0);
      counts.total++;
      sizes.total += (m.size || 0);
    }

    return { counts, sizes };
  }

  async refreshAll(quality) {
    const allMetas = await getAllTrackMetas();
    let enqueued = 0;

    for (const m of allMetas) {
      if (!m.url) continue;
      const q = quality || m.quality || this.getCacheQualitySetting();
      this._queue.enqueue(m.uid, m.url, q, m.type || 'cloud', 1);
      enqueued++;
    }

    emit('offline:refreshStarted', { count: enqueued });
    return enqueued;
  }

  async checkFullOfflineReady() {
    if (this._mode !== 'R2') return false;
    const allMetas = await getAllTrackMetas();
    if (!allMetas.length) return false;

    for (const m of allMetas) {
      if (m.type !== 'pinned') continue;
      const blob = (await getAudioBlob(m.uid, 'high')) || (await getAudioBlob(m.uid, 'low'));
      if (!blob) return false;
    }

    emit('offline:fullOfflineReady', { totalTracks: allMetas.length });
    return true;
  }

  async getStorageInfo() {
    const u = await estimateUsage();
    const catStats = await this.getCategoryStats();
    return { ...u, categories: catStats, minRequired: MIN_SPACE_MB * MB };
  }
}

/* ═══════════════════════════════════════════
   Синглтон
   ═══════════════════════════════════════════ */

const instance = new OfflineManager();
window.OfflineManager = instance;

export function getOfflineManager() { return instance; }
export default instance;
export { BG_PRESETS, OfflineManager };
