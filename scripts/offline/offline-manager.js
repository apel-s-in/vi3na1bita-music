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
        // Update priority if higher
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
    this._lastWindow = []; // uids currently in window
  }
  
  async initialize() {
    await ensureDbReady();
    this._enforceLimitCheck();
    // Default Mode is R0 if not set
    if (!localStorage.getItem(LS.MODE)) localStorage.setItem(LS.MODE, 'R0');
    // Sync CQ with FOQ if R3
    if (this.getMode() === 'R3') {
       const foq = localStorage.getItem(LS.FOQ) || 'hi';
       localStorage.setItem(LS.CQ, foq);
    }
    this._checkExpiredCloud();
    setInterval(() => this._checkExpiredCloud(), 3600000);
  }

  // --- Modes & Quality ---
  getMode() { return localStorage.getItem(LS.MODE) || 'R0'; }
  
  async setMode(mode) {
    if (!['R0', 'R1', 'R2', 'R3'].includes(mode)) return;
    
    // Check 60MB limit
    if (mode !== 'R0' && !(await this._checkSpaceGuarantee())) {
        Utils.ui.toast('Недостаточно места (нужно 60MB+)', 'error');
        return;
    }

    const prev = this.getMode();
    localStorage.setItem(LS.MODE, mode);
    
    // R2 logic: Activate CQ, cleanup R1 garbage if any
    if (mode === 'R2') {
        // Enforce dependencies if any
    }
    // R3 logic: Sync CQ = FOQ
    if (mode === 'R3') {
        const foq = this.getFullOfflineQuality();
        localStorage.setItem(LS.CQ, foq); 
        // Note: R3 enable is usually done via modal after check
    }

    window.dispatchEvent(new CustomEvent('offline:uiChanged'));
    this._emit({ phase: 'modeChanged', mode, prev });
  }

  getActivePlaybackQuality() {
    const mode = this.getMode();
    if (mode === 'R0' || mode === 'R1') return Utils.pq.getMode(); // User PQ
    if (mode === 'R2') return this.getCacheQuality(); // CQ
    if (mode === 'R3') return this.getFullOfflineQuality(); // FOQ
    return 'hi';
  }

  getCacheQuality() { return Utils.obj.normQuality(localStorage.getItem(LS.CQ) || 'hi'); }
  async setCacheQuality(q) {
    const val = Utils.obj.normQuality(q);
    localStorage.setItem(LS.CQ, val);
    // Needs ReCache for Pinned/Cloud/Dynamic
    this.enqueueReCacheAll({ userInitiated: false });
    this._emit({ phase: 'cqChanged', cq: val });
  }

  getFullOfflineQuality() { return Utils.obj.normQuality(localStorage.getItem(LS.FOQ) || 'hi'); }
  setFullOfflineQuality(q) {
      const val = Utils.obj.normQuality(q);
      localStorage.setItem(LS.FOQ, val);
      if (this.getMode() === 'R3') {
          localStorage.setItem(LS.CQ, val); // Sync CQ
      }
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

  // --- Cloud ---
  async isCloudEligible(uid) {
    const u = Utils.obj.trim(uid); if (!u || this.isPinned(u)) return false;
    // Check candidate manual flag
    if (await getCloudCandidate(u)) return true;
    
    // Check Full Listen Count
    const stats = await getCloudStats(u);
    const n = parseInt(localStorage.getItem(LS.CLOUD_N)||'5');
    if ((Number(stats?.cloudFullListenCount) || 0) >= n) return true;
    
    // Check active TTL
    if (stats?.cloud && (stats.cloudExpiresAt || 0) > Date.now()) return true;
    
    return false;
  }

  // --- StatsCore Integration ---
  async recordListenStats(uid, { deltaSec, isFullListen }) {
    const u = Utils.obj.trim(uid); if (!u) return;
    
    // Global Stats (Permanent)
    if (deltaSec > 0 || isFullListen) await updateGlobalStats(u, deltaSec, isFullListen ? 1 : 0);
    
    // Cloud Stats (Resettable)
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
        
        // Auto-download if needed
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
    
    // R3 blocks downloads unless user explicitly starts 100% offline sync (which uses explicit P4 tasks)
    // But normal playback requests in R3 should assume content is there.
    
    const key = `dl:${u}`; // Simple key to prevent duplicates
    this.queue.add({ 
        uid: u, key, priority: priority || 0, 
        taskFn: async () => { 
            const res = await this._performDownload(u, q, kind, userInitiated); 
            if (onResult) onResult(res); 
        } 
    });
  }

  async _performDownload(uid, quality, kind, userInitiated) {
    // 1. Check if we already have it in correct quality
    if (await this.isTrackComplete(uid, quality)) {
       // Update metadata/kind if needed
       if (kind === 'pinned' || kind === 'cloudAuto') await markLocalKind(uid, kind === 'pinned' ? 'pinned' : 'cloud');
       return { ok: true, skipped: true };
    }

    // 2. Network Check
    const net = Utils.getNet(), policy = getNetPolicy();
    const allowed = isAllowedByNetPolicy({ policy, net, userInitiated });
    
    if (!net.online || !allowed) return { ok: false, reason: 'network' };

    // 3. Limit Check (for Dynamic/Transient only)
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
      
      // SAVE (Enforces No Duplicates)
      await setAudioBlob(uid, quality, blob);
      
      // Update Meta
      const expSize = quality === 'lo' ? meta.sizeLo : meta.sizeHi;
      await setDownloadMeta(uid, quality, { ts: Date.now(), bytes: blob.size, exp: Number(expSize)||0 });
      
      // Mark Kind
      let k = 'unknown';
      let grp = null;
      if (kind === 'pinned' || this.isPinned(uid)) k = 'pinned'; // Pinned overrides all
      else if (kind === 'cloudAuto') k = 'cloud';
      else if (kind === 'fullOffline') k = 'fullOffline';
      else if (kind === 'playbackCache') { k = 'transient'; grp = 'window'; }
      else if (this.getMode() === 'R2') k = 'dynamic'; // Dynamic logic
      
      await markLocalKind(uid, k, grp);
      
      return { ok: true };
    } catch (e) { return { ok: false, reason: e.message }; }
  }

  async _enforceEvictionLimit() {
    const limitBytes = parseInt(localStorage.getItem(LS.LIMIT_MB) || '500', 10) * MB;
    const current = await totalCachedBytes();
    if (current < limitBytes) return;
    
    // Eviction logic: Pinned/Cloud/FullOffline are protected
    const candidates = await getEvictionCandidates(this._getPinnedSet());
    let freed = 0;
    
    for (const c of candidates) {
        if (current - freed <= limitBytes) break;
        // Don't delete protected
        if (c.weight >= 99) continue;
        // Don't delete current playback window
        if (this._lastWindow.includes(c.uid)) continue; 
        
        await deleteTrackCache(c.uid);
        freed += c.bytes;
    }
    
    if (freed > 0 && current - freed > limitBytes) {
        // Still over limit (Pinned/Cloud took it all)
        // Show warning if not shown recently?
    }
  }

  // --- Public API ---
  async getTrackOfflineState(uid) {
    const u = Utils.obj.trim(uid); if (!u) return {};
    const pinned = this.isPinned(u);
    const cq = this.getCacheQuality();
    const cachedCQ = await this.isTrackComplete(u, cq);
    
    // Cloud Logic
    const eligible = await this.isCloudEligible(u);
    const isCloud = !pinned && eligible && cachedCQ;
    
    const needsReCache = (pinned || isCloud) && !cachedCQ; // Want specific quality but don't have it
    const needsUpdate = false; // Implement size check if needed

    return { pinned, cloud: isCloud, cachedComplete: cachedCQ, needsReCache, needsUpdate };
  }

  async isTrackComplete(uid, q) {
    // Check if we have the specific quality stored
    // "No Duplicates" means we only have ONE quality. 
    // If we have 'hi' and q is 'hi' -> true.
    // If we have 'lo' and q is 'hi' -> false.
    const { getBytes } = await import('./cache-db.js');
    const b = await getBytes(uid, q);
    // Simple check: > 0 means we have it (since we delete others)
    // We can also check against expected size
    const meta = getTrackByUid(uid);
    const exp = q === 'lo' ? meta?.sizeLo : meta?.sizeHi;
    if (exp) {
        return b >= (exp * MB * COMPLETE_THRESHOLD);
    }
    return b > 0;
  }

  // --- Maintenance ---
  async enqueueReCacheAll({ userInitiated } = {}) {
    const uids = getAllTracks().map(t => t.uid);
    const cq = this.getCacheQuality();
    
    for (const uid of uids) {
        if (this.isPinned(uid) || await this.isCloudEligible(uid)) {
            // If we don't have the target quality, download it (which will delete the old one)
            if (!(await this.isTrackComplete(uid, cq))) {
                const kind = this.isPinned(uid) ? 'pinned' : 'cloudAuto';
                this.enqueueAudioDownload({ uid, quality: cq, priority: PRIORITY.P3_UPDATES, kind, userInitiated });
            }
        }
    }
  }

  updatePlaybackWindow(uids) {
      this._lastWindow = uids;
      // In R2/R1 we might want to clean up transient stuff outside window immediately?
      // For now, let Eviction handle it or explicitly clean 'transient'
  }

  // --- Full Offline (R3) Setup ---
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

  // --- Utils ---
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
      // Logic to find expired cloud items and delete them
      import('./cache-db.js').then(({ getExpiredCloudUids }) => {
          getExpiredCloudUids().then(list => {
              list.forEach(u => {
                  if (!this.isPinned(u)) deleteTrackCache(u);
              });
          });
      });
  }

  async getGlobalStatistics() { return getGlobalStatsAndTotal(); }
  getQueueStatus() { return this.queue.getStatus(); }
  pauseQueue() { this.queue.pause(); }
  resumeQueue() { this.queue.resume(); }
  
  // Events
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
