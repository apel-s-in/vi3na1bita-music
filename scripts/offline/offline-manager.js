// scripts/offline/offline-manager.js
import {
  ensureDbReady, setAudioBlob, setBytes, totalCachedBytes, deleteTrackCache,
  getCloudStats, setCloudStats, clearCloudStats,
  setCloudCandidate, getCloudCandidate, updateGlobalStats, getGlobalStatsAndTotal,
  getEvictionCandidates, setDownloadMeta, markLocalKind, getLocalMeta,
  computeCacheBreakdown, clearAllStores
} from './cache-db.js';
import { getTrackByUid, getAllTracks } from '../app/track-registry.js';
import { getNetPolicy, isAllowedByNetPolicy } from './net-policy.js';
import { Favorites } from '../core/favorites-manager.js';

const Utils = window.Utils; 

const LS = { 
  MODE: 'offline:mode:v1', // R0, R1, R2, R3
  CQ: 'offline:cacheQuality:v1', 
  FOQ: 'offline:fullQuality:v1',
  PINNED: 'pinnedUids:v1', 
  CLOUD_N: 'offline:cloudN:v1', 
  CLOUD_D: 'offline:cloudD:v1', 
  LIMIT_MB: 'offline:cacheLimitMB:v1',
  FULL_SET: 'offline:fullSetUids:v1'
};

const MB = 1024 * 1024;
const MIN_SPACE_MB = 60;
const COMPLETE_THRESHOLD = 0.92;

const PRIORITY = { 
  P0_CUR: 100, 
  P1_NEXT: 95, 
  P2_PINNED: 80, 
  P3_UPDATES: 70, 
  P4_CLOUD: 60,
  P5_ASSETS: 50 
};

// --- Queue Implementation ---
class DownloadQueue {
  constructor() { this.q = []; this.active = null; this.paused = false; this._listeners = new Set(); }
  
  add({ uid, key, priority, taskFn }) {
    if (this.active?.key === key) return; // Already running
    const idx = this.q.findIndex(i => i.key === key);
    if (idx >= 0) { 
        if (priority > this.q[idx].priority) { this.q[idx].priority = priority; this._sort(); } 
        return; 
    }
    this.q.push({ uid, key, priority, taskFn, ts: Date.now() });
    this._sort();
    this._processNext();
  }

  _sort() { this.q.sort((a, b) => (b.priority - a.priority) || (a.ts - b.ts)); }
  pause() { this.paused = true; }
  resume() { this.paused = false; this._processNext(); }
  getStatus() { return { activeUid: this.active?.uid, downloadingKey: this.active?.key, queued: this.q.length, isPaused: this.paused }; }
  subscribe(cb) { this._listeners.add(cb); return () => this._listeners.delete(cb); }
  _emit(event, data) { this._listeners.forEach(cb => cb({ event, data })); }

  async _processNext() {
    if (this.active || this.paused || this.q.length === 0) return;
    const item = this.q.shift();
    this.active = item;
    this._emit('start', { uid: item.uid, key: item.key });
    try { 
      await item.taskFn(); 
      this._emit('done', { uid: item.uid, key: item.key }); 
    } catch (err) { 
      this._emit('error', { uid: item.uid, error: err.message }); 
    } finally { 
      this.active = null; this._processNext(); 
    }
  }
}

export class OfflineManager {
  constructor() {
    this._pinnedCache = null;
    this.queue = new DownloadQueue();
    this._subs = new Set();
    this._lastWindow = []; 
  }
  
  async initialize() {
    await ensureDbReady();
    this._enforceLimitCheck();
    if (!localStorage.getItem(LS.MODE)) localStorage.setItem(LS.MODE, 'R0');
    if (this.getMode() === 'R3') {
       const foq = localStorage.getItem(LS.FOQ) || 'hi';
       localStorage.setItem(LS.CQ, foq);
    }
    // this._checkExpiredCloud(); // Временно отключено, пока нет реализации в DB
    // setInterval(() => this._checkExpiredCloud(), 3600000);
  }

  // --- Modes & Quality ---
  getMode() { return localStorage.getItem(LS.MODE) || 'R0'; }
  
  async setMode(mode) {
    if (!['R0', 'R1', 'R2', 'R3'].includes(mode)) return;
    if (mode !== 'R0' && !(await this._checkSpaceGuarantee())) {
        Utils.ui.toast('Недостаточно места (нужно 60MB+)', 'error');
        return;
    }
    const prev = this.getMode();
    localStorage.setItem(LS.MODE, mode);
    if (mode === 'R3') {
        const foq = this.getFullOfflineQuality();
        localStorage.setItem(LS.CQ, foq); 
    }
    window.dispatchEvent(new CustomEvent('offline:uiChanged'));
    this._emit({ phase: 'modeChanged', mode, prev });
  }

  getActivePlaybackQuality() {
    const mode = this.getMode();
    if (mode === 'R0' || mode === 'R1') return Utils.pq.getMode(); 
    if (mode === 'R2') return this.getCacheQuality(); 
    if (mode === 'R3') return this.getFullOfflineQuality(); 
    return 'hi';
  }

  getCacheQuality() { return Utils.obj.normQuality(localStorage.getItem(LS.CQ) || 'hi'); }
  
  async setCacheQuality(q) {
    const val = Utils.obj.normQuality(q);
    localStorage.setItem(LS.CQ, val);
    this.enqueueReCacheAll({ userInitiated: false });
    this._emit({ phase: 'cqChanged', cq: val });
  }

  getFullOfflineQuality() { return Utils.obj.normQuality(localStorage.getItem(LS.FOQ) || 'hi'); }
  
  setFullOfflineQuality(q) {
      const val = Utils.obj.normQuality(q);
      localStorage.setItem(LS.FOQ, val);
      if (this.getMode() === 'R3') {
          localStorage.setItem(LS.CQ, val); 
      }
  }

  // --- UI Public Helpers (Fixes for Modal) ---
  async computeCacheBreakdown() {
    return computeCacheBreakdown(this._getPinnedSet());
  }

  getCloudSettings() {
    const n = parseInt(localStorage.getItem(LS.CLOUD_N) || '5', 10);
    const d = parseInt(localStorage.getItem(LS.CLOUD_D) || '31', 10);
    return { n: Number.isFinite(n) && n > 0 ? n : 5, d: Number.isFinite(d) && d > 0 ? d : 31 };
  }

  async isSpaceOk() {
    return this._checkSpaceGuarantee();
  }

  isOfflineMode() {
    return this.getMode() === 'R3';
  }

  async clearAllCache() {
    await clearAllStores();
    window.dispatchEvent(new CustomEvent('offline:uiChanged'));
    this._emit({ phase: 'cacheCleared' });
    return true;
  }

  // --- Pinned ---
  _getPinnedSet() {
    if (!this._pinnedCache) { try { this._pinnedCache = new Set(JSON.parse(localStorage.getItem(LS.PINNED) || '[]')); } catch { this._pinnedCache = new Set(); } }
    return this._pinnedCache;
  }
  _savePinned() { if (this._pinnedCache) localStorage.setItem(LS.PINNED, JSON.stringify([...this._pinnedCache])); }
  
  isPinned(uid) { return this._getPinnedSet().has(Utils.obj.trim(uid)); }

  async togglePinned(uid) {
    const u = Utils.obj.trim(uid); if (!u) return;
    if (this.isPinned(u)) {
      this._getPinnedSet().delete(u); this._savePinned(); 
      await setCloudCandidate(u, true);
      Utils.ui.toast('Офлайн-закрепление снято');
    } else {
      this._getPinnedSet().add(u); this._savePinned(); 
      await setCloudCandidate(u, false);
      const cq = this.getCacheQuality();
      this.enqueueAudioDownload({ uid: u, quality: cq, priority: PRIORITY.P2_PINNED, kind: 'pinned', userInitiated: true });
      Utils.ui.toast('Трек закреплён офлайн');
    }
    window.dispatchEvent(new CustomEvent('offline:uiChanged'));
  }

  // --- Cloud & Stats ---
  async isCloudEligible(uid) {
    const u = Utils.obj.trim(uid); if (!u || this.isPinned(u)) return false;
    if (await getCloudCandidate(u)) return true;
    const stats = await getCloudStats(u);
    const n = parseInt(localStorage.getItem(LS.CLOUD_N)||'5');
    if ((Number(stats?.cloudFullListenCount) || 0) >= n) return true;
    if (stats?.cloud && (stats.cloudExpiresAt || 0) > Date.now()) return true;
    return false;
  }

  async recordListenStats(uid, { deltaSec, isFullListen }) {
    const u = Utils.obj.trim(uid); if (!u) return;
    if (deltaSec > 0 || isFullListen) await updateGlobalStats(u, deltaSec, isFullListen ? 1 : 0);
    
    if (isFullListen) {
      const stats = await getCloudStats(u) || {};
      const newCount = (Number(stats.cloudFullListenCount) || 0) + 1;
      const n = parseInt(localStorage.getItem(LS.CLOUD_N)||'5');
      const d = parseInt(localStorage.getItem(LS.CLOUD_D)||'31');
      const becameCloud = newCount >= n || stats.cloud;
      const newStats = { ...stats, cloudFullListenCount: newCount, lastFullListenAt: Date.now() };
      
      if (becameCloud) {
        newStats.cloud = true; 
        newStats.cloudExpiresAt = Date.now() + (d * 24 * 60 * 60 * 1000);
        await markLocalKind(u, 'cloud');
        const cq = this.getCacheQuality();
        if (!(await this.isTrackComplete(u, cq))) {
            this.enqueueAudioDownload({ uid: u, quality: cq, priority: PRIORITY.P4_CLOUD, kind: 'cloudAuto' });
        }
      }
      await setCloudStats(u, newStats);
    }
  }

  // --- Download & Queue ---
  enqueueAudioDownload({ uid, quality, priority, kind, userInitiated, onResult }) {
    const u = Utils.obj.trim(uid), q = Utils.obj.normQuality(quality); if (!u) return;
    const key = `dl:${u}`;
    this.queue.add({ 
        uid: u, key, priority: priority || 0, 
        taskFn: async () => { 
            const res = await this._performDownload(u, q, kind, userInitiated); 
            if (onResult) onResult(res); 
        } 
    });
  }

  async _performDownload(uid, quality, kind, userInitiated) {
    if (await this.isTrackComplete(uid, quality)) {
       if (kind === 'pinned' || kind === 'cloudAuto') await markLocalKind(uid, kind === 'pinned' ? 'pinned' : 'cloud');
       return { ok: true, skipped: true };
    }
    const net = Utils.getNet(), policy = getNetPolicy();
    const allowed = isAllowedByNetPolicy({ policy, net, userInitiated });
    if (!net.online || !allowed) return { ok: false, reason: 'network' };

    if (kind !== 'pinned' && kind !== 'fullOffline' && kind !== 'cloudAuto') {
        await this._enforceEvictionLimit();
    }

    try {
      const meta = getTrackByUid(uid); if (!meta) throw new Error('No meta');
      const src = meta.sources?.audio || {};
      const url = quality === 'lo' ? (src.lo || meta.audio_low) : (src.hi || meta.audio);
      if (!url) throw new Error('No URL');

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      
      await setAudioBlob(uid, quality, blob); // No duplicates enforced inside
      const expSize = quality === 'lo' ? meta.sizeLo : meta.sizeHi;
      await setDownloadMeta(uid, quality, { ts: Date.now(), bytes: blob.size, exp: Number(expSize)||0 });
      
      let k = 'unknown', grp = null;
      if (kind === 'pinned' || this.isPinned(uid)) k = 'pinned';
      else if (kind === 'cloudAuto') k = 'cloud';
      else if (kind === 'fullOffline') k = 'fullOffline';
      else if (kind === 'playbackCache') { k = 'transient'; grp = 'window'; }
      else if (this.getMode() === 'R2') k = 'dynamic';
      
      await markLocalKind(uid, k, grp);
      return { ok: true };
    } catch (e) { return { ok: false, reason: e.message }; }
  }

  async _enforceEvictionLimit() {
    const limitBytes = parseInt(localStorage.getItem(LS.LIMIT_MB) || '500', 10) * MB;
    const current = await totalCachedBytes();
    if (current < limitBytes) return;
    
    const candidates = await getEvictionCandidates(this._getPinnedSet());
    let freed = 0;
    
    for (const c of candidates) {
        if (current - freed <= limitBytes) break;
        if (c.weight >= 99) continue; 
        if (this._lastWindow.includes(c.uid)) continue; 
        
        await deleteTrackCache(c.uid);
        freed += c.bytes;
    }
  }

  async getTrackOfflineState(uid) {
    const u = Utils.obj.trim(uid); if (!u) return {};
    const pinned = this.isPinned(u);
    const cq = this.getCacheQuality();
    const cachedCQ = await this.isTrackComplete(u, cq);
    const eligible = await this.isCloudEligible(u);
    const isCloud = !pinned && eligible && cachedCQ;
    const needsReCache = (pinned || isCloud) && !cachedCQ;
    const needsUpdate = false; 
    return { pinned, cloud: isCloud, cachedComplete: cachedCQ, needsReCache, needsUpdate };
  }

  async isTrackComplete(uid, q) {
    const { getBytes } = await import('./cache-db.js');
    const b = await getBytes(uid, q);
    const meta = getTrackByUid(uid);
    const exp = q === 'lo' ? meta?.sizeLo : meta?.sizeHi;
    if (exp) return b >= (exp * MB * COMPLETE_THRESHOLD);
    return b > 0;
  }

  async enqueueReCacheAll({ userInitiated } = {}) {
    const uids = getAllTracks().map(t => t.uid);
    const cq = this.getCacheQuality();
    for (const uid of uids) {
        if (this.isPinned(uid) || await this.isCloudEligible(uid)) {
            if (!(await this.isTrackComplete(uid, cq))) {
                const kind = this.isPinned(uid) ? 'pinned' : 'cloudAuto';
                this.enqueueAudioDownload({ uid, quality: cq, priority: PRIORITY.P3_UPDATES, kind, userInitiated });
            }
        }
    }
  }

  updatePlaybackWindow(uids) { this._lastWindow = uids; }

  async startFullOffline(uids) {
      const foq = this.getFullOfflineQuality();
      localStorage.setItem(LS.FULL_SET, JSON.stringify(uids));
      uids.forEach(uid => {
          this.enqueueAudioDownload({ 
              uid, quality: foq, priority: PRIORITY.P4_CLOUD, 
              kind: 'fullOffline', userInitiated: true 
          });
      });
      return { ok: true, total: uids.length };
  }

  async _checkSpaceGuarantee() {
      if (navigator.storage?.estimate) {
          try {
              const est = await navigator.storage.estimate();
              if ((est.quota - est.usage) < MIN_SPACE_MB * MB) return false;
          } catch {}
      }
      return true;
  }
  
  _checkExpiredCloud() {
      // Placeholder: Implementation postponed
  }

  async getGlobalStatistics() { return getGlobalStatsAndTotal(); }
  getQueueStatus() { return this.queue.getStatus(); }
  pauseQueue() { this.queue.pause(); }
  resumeQueue() { this.queue.resume(); }
  
  on(event, cb) { 
      if(event === 'progress') this.queue.subscribe(e => cb({phase: 'queue_'+e.event, ...e.data}));
      this._subs.add(cb); 
      return () => this._subs.delete(cb); 
  }
  _emit(d) { this._subs.forEach(cb => { try{cb(d)}catch{} }); }
}

export const OfflineManagerInstance = new OfflineManager();
export function getOfflineManager() { return OfflineManagerInstance; }
export default OfflineManagerInstance;
