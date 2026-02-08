//=================================================
// FILE: /scripts/offline/offline-manager.js
/**
 * offline-manager.js — Core Offline Logic (v2.0 Optimized)
 * Implements: Pinned/Cloud, PlaybackCache (R1), Single Quality Mode.
 * Strict adherence to TDA 7.2 (Source Priority) and TDA 10 (Queue).
 */

import {
  openDB, setAudioBlob, getAudioBlob, deleteAudioVariant, deleteAudio,
  setTrackMeta, getTrackMeta, updateTrackMeta, getAllTrackMetas,
  hasAudioForUid, getStoredVariant, deleteTrackCache
} from './cache-db.js';

const KEYS = { Q: 'qualityMode:v1', MODE: 'offline:mode:v1', N: 'cloud:listenThreshold', D: 'cloud:ttlDays' };
const DEFAULTS = { N: 5, D: 31, MIN_MB: 60 };
const PRIO = { CUR: 100, NEIGHBOR: 90, PINNED: 80, RECACHE: 70, CLOUD: 60 };
const MB = 1024 * 1024;
const DAY = 86400000;

// Utils
const emit = (n, d={}) => window.dispatchEvent(new CustomEvent(n, { detail: d }));
const normQ = (v) => (String(v||'').toLowerCase() === 'lo' ? 'lo' : 'hi');
const toast = (m, t='info') => window.NotificationSystem?.[t]?.(m);
const netOk = () => window.NetPolicy ? window.NetPolicy.isNetworkAllowed() : navigator.onLine;
const getTrk = (id) => window.TrackRegistry?.getTrackByUid?.(id);
const getUrl = (id, q) => { const t = getTrk(id); return t ? (normQ(q)==='lo' ? (t.audio_low||t.audio||t.src) : (t.audio||t.src)) : null; };

// --- DOWNLOAD QUEUE ---
class Queue {
  constructor() { this.q = []; this.act = new Map(); this.par = 1; this.paused = false; }
  
  setParallel(n) { this.par = n || 1; this.run(); }
  pause() { this.paused = true; }
  resume() { this.paused = false; this.run(); }
  
  has(uid) { return this.act.has(uid) || this.q.some(i => i.uid === uid); }
  cancel(uid) {
    this.q = this.q.filter(i => i.uid !== uid);
    if (this.act.has(uid)) { this.act.get(uid).abort(); this.act.delete(uid); }
    this.run();
  }

  add(task) { // { uid, url, quality, kind, priority }
    if (!task.uid || !task.url) return;
    const exist = this.act.get(task.uid);
    if (exist) {
      if (exist.item.quality === task.quality) return; // Already downloading same Q
      exist.abort(); this.act.delete(task.uid); // Swapped quality, abort old
    }
    
    // Dedup in queue
    const idx = this.q.findIndex(i => i.uid === task.uid);
    if (idx > -1) {
      if (this.q[idx].quality !== task.quality || task.priority > this.q[idx].priority) {
        this.q[idx] = task; // Replace/Upgrade
      }
    } else {
      this.q.push({ ...task, added: Date.now(), retry: 0 });
    }
    this.q.sort((a,b) => b.priority - a.priority || a.added - b.added);
    this.run();
  }

  async run() {
    if (this.paused || this.act.size >= this.par || !this.q.length || !netOk()) return;
    const item = this.q.shift();
    
    const ctrl = new AbortController();
    this.act.set(item.uid, { ...ctrl, item });
    emit('offline:downloadStart', { uid: item.uid, kind: item.kind });

    try {
      const res = await fetch(item.url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      
      if (window.OfflineManager && !(await window.OfflineManager.hasSpace())) throw new Error('DiskFull');

      await setAudioBlob(item.uid, item.quality, blob);
      await updateTrackMeta(item.uid, { quality: item.quality, size: blob.size, cachedComplete: true, needsReCache: false });
      
      // TDA 1.7: Cleanup other variant (Two-phase replacement)
      const cur = window.playerCore?.getCurrentTrackUid?.();
      if (cur !== item.uid) await deleteAudioVariant(item.uid, item.quality === 'hi' ? 'lo' : 'hi').catch(()=>{});

      this.act.delete(item.uid);
      emit('offline:trackCached', { uid: item.uid });
      emit('offline:stateChanged');
    } catch (e) {
      this.act.delete(item.uid);
      if (e.name === 'AbortError') {
        // TDA 4.4: If aborted, remove incomplete chunk, keep old valid file
        await deleteAudioVariant(item.uid, item.quality).catch(()=>{});
      } else {
        if (item.retry < 3 && e.message !== 'DiskFull') {
          setTimeout(() => this.add({ ...item, retry: item.retry + 1 }), 1000 * Math.pow(2, item.retry));
        } else {
          emit('offline:downloadFailed', { uid: item.uid });
          if (e.message === 'DiskFull') toast('Мало места, загрузка пауза', 'warning');
        }
      }
    }
    this.run();
  }
  
  getStatus() { return { active: this.act.size, queued: this.q.length }; }
}

// --- MANAGER ---
class OfflineManager {
  constructor() {
    this.q = new Queue();
    this.ready = false;
    this.spaceOk = true;
    window._offlineManagerInstance = this;
  }

  async initialize() {
    if (this.ready) return;
    await openDB();
    await this.hasSpace(); // Check space
    await this._cleanExpired();
    
    window.addEventListener('netPolicy:changed', () => this.q.resume());
    window.addEventListener('quality:changed', (e) => this._onQChange(e.detail?.quality));
    
    this.ready = true;
    emit('offline:ready');
  }

  // --- API ---
  getMode() { return localStorage.getItem(KEYS.MODE) || 'R0'; }
  async setMode(m) {
    if (m === 'R1' && !(await this.hasSpace())) { toast('Недостаточно места', 'warning'); m = 'R0'; }
    localStorage.setItem(KEYS.MODE, m);
    emit('offline:uiChanged');
  }

  getQuality() { return normQ(localStorage.getItem(KEYS.Q)); }
  setCacheQualitySetting(q) { localStorage.setItem(KEYS.Q, normQ(q)); } // No emit here, UI triggers it

  async hasSpace() {
    try {
      const e = await navigator.storage?.estimate?.();
      if (e?.quota) this.spaceOk = ((e.quota - e.usage) / MB) >= DEFAULTS.MIN_MB;
    } catch {}
    return this.spaceOk;
  }

  async getTrackOfflineState(uid) {
    if (!this.ready || !uid) return { status: 'none' };
    const m = await getTrackMeta(uid);
    const has = await hasAudioForUid(uid);
    const q = this.getQuality();
    
    let s = 'none';
    if (m?.type === 'pinned') s = (has && m.cachedComplete && !this.q.has(uid)) ? 'pinned' : 'pinned'; // Visual fix
    if (m?.type === 'pinned' && this.q.has(uid)) s = 'pinned'; // Keep pinned even if loading
    else if (m?.type === 'cloud') s = (has && m.cachedComplete) ? 'cloud' : 'cloud_loading';
    else if (m?.type === 'playbackCache') s = 'transient';

    return {
      status: s,
      downloading: this.q.has(uid),
      cachedComplete: has && !!m?.cachedComplete,
      needsReCache: !!m?.needsReCache || (has && m?.quality && m.quality !== q),
      needsUpdate: !!m?.needsUpdate,
      cloudExpiresAt: m?.cloudExpiresAt,
      daysLeft: m?.cloudExpiresAt ? Math.max(0, Math.ceil((m.cloudExpiresAt - Date.now()) / DAY)) : 0
    };
  }

  // --- Actions ---
  async togglePinned(uid) {
    if (!uid) return;
    const m = (await getTrackMeta(uid)) || { uid };
    const now = Date.now();
    const q = this.getQuality();
    const { D } = this.getSettings();

    if (m.type === 'pinned') {
      // Unpin -> Cloud immediately (TDA 5.6)
      await updateTrackMeta(uid, { type: 'cloud', cloudOrigin: 'unpin', pinnedAt: null, cloudAddedAt: now, cloudExpiresAt: now + D * DAY });
      toast(`Откреплено. Доступно как ☁ (${D} дн.)`);
    } else {
      // Pin
      if (!this.spaceOk) return toast('Недостаточно места', 'warning');
      await updateTrackMeta(uid, { type: 'pinned', pinnedAt: now, quality: q, cloudExpiresAt: null });
      
      // Check if we need to download
      const hasQ = await getStoredVariant(uid);
      if (!hasQ) {
        this.addDl(uid, q, 'pinned', PRIO.PINNED);
        toast('Скачивание 🔒...');
      } else if (hasQ !== q) {
        await updateTrackMeta(uid, { needsReCache: true });
        this.addDl(uid, q, 'reCache', PRIO.PINNED);
        toast('Закреплено 🔒 (обновление качества)');
      } else {
        toast('Закреплено 🔒');
      }
    }
    emit('offline:stateChanged');
  }

  async removeCached(uid) {
    if (!uid) return;
    this.q.cancel(uid);
    await deleteAudio(uid);
    // TDA 6.6: Wipe cloud stats, Keep global stats
    await updateTrackMeta(uid, {
      type: null, cloudOrigin: null, pinnedAt: null, cloudExpiresAt: null,
      cloudFullListenCount: 0, lastFullListenAt: null,
      cachedComplete: false, needsReCache: false, quality: null, size: 0
    });
    emit('offline:stateChanged');
  }

  async removeAllCached() {
    const all = await getAllTrackMetas();
    for (const m of all) if (m.type === 'pinned' || m.type === 'cloud') await this.removeCached(m.uid);
    toast('Кэш очищен');
  }

  // --- Logic & Stats ---
  async registerFullListen(uid, { duration, position }) {
    if (!uid || duration <= 0 || (position/duration) <= 0.9) return;
    
    const m = (await getTrackMeta(uid)) || { uid };
    const { N, D } = this.getSettings();
    const now = Date.now();
    const count = (m.cloudFullListenCount || 0) + 1;
    
    const up = { cloudFullListenCount: count, lastFullListenAt: now };
    if (m.type === 'cloud') up.cloudExpiresAt = now + D * DAY; // Extend TTL

    // Auto-Cloud (TDA 6.4)
    if (m.type !== 'pinned' && m.type !== 'cloud' && count >= N && await this.hasSpace()) {
      up.type = 'cloud'; up.cloudOrigin = 'auto'; up.cloudAddedAt = now; up.cloudExpiresAt = now + D * DAY; up.quality = this.getQuality();
      if (!(await hasAudioForUid(uid))) {
        this.addDl(uid, up.quality, 'cloud', PRIO.CLOUD);
        toast(`Добавлено в ☁ (${D} дн.)`);
      }
    }
    await updateTrackMeta(uid, up);
    emit('offline:stateChanged');
  }

  // --- Source Resolution (TDA 7.2 Strict) ---
  async resolveTrackSource(uid, reqQ) {
    if (!uid) return { source: 'none' };
    
    const selQ = normQ(reqQ || this.getQuality());
    const othQ = selQ === 'hi' ? 'lo' : 'hi';
    const isNet = netOk();

    // 1. Local Exact
    const b1 = await getAudioBlob(uid, selQ);
    if (b1) return { source: 'local', blob: b1, quality: selQ };

    // 2. Local Other
    const b2 = await getAudioBlob(uid, othQ);
    if (b2) {
      if (selQ === 'lo') {
        // Upgrade: Wanted Lo, have Hi -> Use Hi
        await updateTrackMeta(uid, { needsReCache: true }); // Mark to download Lo eventually
        return { source: 'local', blob: b2, quality: othQ };
      }
      // Downgrade: Wanted Hi, have Lo
      if (isNet) {
        // 3. Network (if available and local was downgrade)
        const url = getUrl(uid, selQ);
        if (url) {
          // Queue background upgrade
          await updateTrackMeta(uid, { needsReCache: true });
          this.addDl(uid, selQ, 'reCache', PRIO.RECACHE);
          return { source: 'stream', url, quality: selQ };
        }
      }
      // Fallback to local Lo
      return { source: 'local', blob: b2, quality: othQ };
    }

    // 3. Network Exact (No local at all)
    if (isNet) {
      const url = getUrl(uid, selQ);
      if (url) return { source: 'stream', url, quality: selQ };
    }

    return { source: 'none', quality: selQ };
  }

  // --- Internals ---
  addDl(uid, q, k, p) { 
    const url = getUrl(uid, q);
    if (url) this.q.add({ uid, url, quality: q, kind: k, priority: p });
  }

  async _onQChange(newQ) {
    const q = normQ(newQ);
    const all = await getAllTrackMetas();
    const cur = window.playerCore?.getCurrentTrackUid?.();
    let cnt = 0;

    // TDA 4.4: Cancel active if quality mismatch (anti-hysteresis)
    // Mark needsReCache
    for (const m of all) {
      if (m.type !== 'pinned' && m.type !== 'cloud') continue;
      
      if (m.quality && m.quality !== q) {
        await updateTrackMeta(m.uid, { needsReCache: true });
        cnt++;
        // Quiet queue (skip CUR)
        if (m.uid !== cur) {
          const p = m.type === 'pinned' ? PRIO.PINNED : PRIO.RECACHE;
          this.addDl(m.uid, q, 'reCache', p);
        }
      } else if (m.quality === q && m.needsReCache) {
        await updateTrackMeta(m.uid, { needsReCache: false });
      }
    }
    emit('offline:stateChanged');
    emit('offline:reCacheStatus', { count: cnt });
  }

  async _cleanExpired() {
    const all = await getAllTrackMetas();
    const now = Date.now();
    let c = 0;
    for (const m of all) {
      if (m.type === 'cloud' && m.cloudExpiresAt && m.cloudExpiresAt < now) {
        await this.removeCached(m.uid);
        c++;
      }
    }
    if (c) toast(`Удалено истёкших: ${c}`);
  }

  // Settings & Helpers
  getSettings() { 
    return { 
      N: parseInt(localStorage.getItem(KEYS.N)) || DEFAULTS.N, 
      D: parseInt(localStorage.getItem(KEYS.D)) || DEFAULTS.D 
    }; 
  }
  
  async confirmApplyCloudSettings({ newN, newD }) {
    localStorage.setItem(KEYS.N, newN); localStorage.setItem(KEYS.D, newD);
    const all = await getAllTrackMetas();
    const now = Date.now();
    let rm = 0;
    for (const m of all) {
      if (m.type !== 'cloud') continue;
      // Remove if N increased and not enough listens
      if (m.cloudOrigin === 'auto' && (m.cloudFullListenCount||0) < newN) { await this.removeCached(m.uid); rm++; continue; }
      // Recalc TTL
      if (m.lastFullListenAt) {
        const exp = m.lastFullListenAt + newD * DAY;
        if (exp < now) { await this.removeCached(m.uid); rm++; }
        else await updateTrackMeta(m.uid, { cloudExpiresAt: exp });
      }
    }
    toast(rm ? `Обновлено. Удалено: ${rm}` : 'Настройки применены');
  }

  async countNeedsReCache(tQ) {
    const q = normQ(tQ || this.getQuality());
    const all = await getAllTrackMetas();
    return all.filter(m => (m.type==='pinned'||m.type==='cloud') && m.quality && m.quality !== q).length;
  }

  async reCacheAll(tQ) {
    const q = normQ(tQ || this.getQuality());
    this.q.setParallel(3); // Boost
    await this._onQChange(q);
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
  
  // Proxies for other modules
  enqueueAudioDownload(uid, { priority, kind }) {
    this.addDl(uid, this.getQuality(), kind, priority || 50);
  }
  getDownloadStatus() { return this.q.getStatus(); }
  isSpaceOk() { return this.spaceOk; }
}

const instance = new OfflineManager();
window.OfflineManager = instance;
export function getOfflineManager() { return instance; }
export default instance;
