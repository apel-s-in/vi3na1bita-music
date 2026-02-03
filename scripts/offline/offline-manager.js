import {
  ensureDbReady, setAudioBlob, setBytes, bytesByQuality, totalCachedBytes, deleteTrackCache,
  getCacheQuality as dbGetCQ, setCacheQuality as dbSetCQ, getCloudStats, setCloudStats, clearCloudStats,
  getCloudCandidate, setCloudCandidate, clearCloudCandidate, updateGlobalStats, getGlobalStatsAndTotal,
  getEvictionCandidates, getExpiredCloudUids, getDownloadMeta, setDownloadMeta, markLocalCloud, markLocalTransient,
  clearAllStores, computeCacheBreakdown
} from './cache-db.js';
import { getTrackByUid, getAllTracks } from '../app/track-registry.js';
import { getNetPolicy, isAllowedByNetPolicy } from './net-policy.js';
import { Utils } from '../core/utils.js';

const LS = { MODE: 'offlineMode:v1', CQ: 'offline:cacheQuality:v1', PINNED: 'pinnedUids:v1', CLOUD_N: 'offline:cloudN:v1', CLOUD_D: 'offline:cloudD:v1', LIMIT: 'offline:cacheLimitMB:v1', ALERT: 'offline:alert:v1' };
const MB = 1024 * 1024;
const COMPLETE_THRESHOLD = 0.92;
const PRIORITY = { P0_CUR: 100, P1_NEXT: 90, P2_PINNED: 80, P3_UPDATES: 70, P4_CLOUD: 60 };

class DownloadQueue {
  constructor() { this.q = []; this.active = null; this.paused = false; this._listeners = new Set(); }
  add({ uid, key, priority, taskFn }) {
    if (this.active?.key === key) return;
    const idx = this.q.findIndex(i => i.key === key);
    if (idx >= 0) { if (priority > this.q[idx].priority) { this.q[idx].priority = priority; this._sort(); } return; }
    this.q.push({ uid, key, priority, taskFn, ts: Date.now() });
    this._sort();
    this._processNext();
  }
  _sort() { this.q.sort((a, b) => (b.priority - a.priority) || (a.ts - b.ts)); }
  pause() { this.paused = true; }
  resume() { this.paused = false; this._processNext(); }
  getStatus() { return { activeUid: this.active?.uid || null, downloadingKey: this.active?.key || null, queued: this.q.length, isPaused: this.paused }; }
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
    }
    catch (err) { this._emit('error', { uid: item.uid, error: err.message }); }
    finally { this.active = null; this._processNext(); }
  }
}

export class OfflineManager {
  constructor() {
    this._pinnedCache = null;
    this.queue = new DownloadQueue();
    this._needsState = { update: 0, recache: 0, ts: 0 };
    this._subs = new Set();
  }
  async initialize() {
    await ensureDbReady();
    this._checkExpiredCloud();
    setInterval(() => this._checkExpiredCloud(), 3600000); // 1h
    setTimeout(() => this.refreshNeedsAggregates({ force: true }), 3000);
  }
  on(event, cb) {
    if (event === 'progress') { this._subs.add(cb); this.queue.subscribe((e) => cb({ phase: 'queue_' + e.event, ...e.data })); }
    return () => this._subs.delete(cb);
  }
  _emit(data) { this._subs.forEach(cb => { try { cb(data); } catch {} }); }
  isOfflineMode() { return localStorage.getItem(LS.MODE) === '1'; }
  setOfflineMode(v) { localStorage.setItem(LS.MODE, v ? '1' : '0'); window.dispatchEvent(new CustomEvent('offline:uiChanged')); }
  async getCacheQuality() { const local = localStorage.getItem(LS.CQ); if (local) return Utils.obj.normQuality(local); return await dbGetCQ() || 'hi'; }
  async setCacheQuality(val) {
    const q = Utils.obj.normQuality(val);
    localStorage.setItem(LS.CQ, q);
    await dbSetCQ(q);
    this._emit({ phase: 'cqChanged', cq: q });
    this.enqueueReCacheAllByCQ({ userInitiated: false });
    return q;
  }
  getCloudSettings() { return { n: parseInt(localStorage.getItem(LS.CLOUD_N) || '5', 10), d: parseInt(localStorage.getItem(LS.CLOUD_D) || '31', 10) }; }
  setCloudSettings({ n, d }) { localStorage.setItem(LS.CLOUD_N, n); localStorage.setItem(LS.CLOUD_D, d); }
  _getPinnedSet() {
    if (!this._pinnedCache) { try { this._pinnedCache = new Set(JSON.parse(localStorage.getItem(LS.PINNED) || '[]')); } catch { this._pinnedCache = new Set(); } }
    return this._pinnedCache;
  }
  _savePinned() { if (this._pinnedCache) localStorage.setItem(LS.PINNED, JSON.stringify([...this._pinnedCache])); }
  isPinned(uid) { return this._getPinnedSet().has(Utils.obj.trim(uid)); }
  async pin(uid) { const u = Utils.obj.trim(uid); if (u && !this.isPinned(u)) await this.togglePinned(u); }
  async unpin(uid) { const u = Utils.obj.trim(uid); if (u && this.isPinned(u)) await this.togglePinned(u); }
  async togglePinned(uid) {
    const u = Utils.obj.trim(uid); if (!u) return;
    if (this.isPinned(u)) {
      this._getPinnedSet().delete(u); this._savePinned(); await setCloudCandidate(u, true);
      Utils.ui.toast('Офлайн-закрепление снято. Кандидат в Cloud.');
      this._emit({ phase: 'unpinned', uid: u });
    } else {
      this._getPinnedSet().add(u); this._savePinned(); await setCloudCandidate(u, false);
      const cq = await this.getCacheQuality();
      this.enqueueAudioDownload({ uid: u, quality: cq, priority: PRIORITY.P2_PINNED, kind: 'pinned', userInitiated: true });
      Utils.ui.toast('Трек закреплён офлайн');
      this._emit({ phase: 'pinned', uid: u });
    }
    window.dispatchEvent(new CustomEvent('offline:uiChanged'));
  }
  async isCloudEligible(uid) {
    const u = Utils.obj.trim(uid); if (!u || this.isPinned(u)) return false;
    const stats = await getCloudStats(u), candidate = await getCloudCandidate(u), { n } = this.getCloudSettings();
    if (candidate) return true;
    if ((Number(stats?.cloudFullListenCount) || 0) >= n) return true;
    if (stats?.cloud && (stats.cloudExpiresAt || 0) > Date.now()) return true;
    return false;
  }
  async shouldShowCloudIcon(uid, cq) { if (this.isPinned(uid)) return false; if (!await this.isCloudEligible(uid)) return false; return await this.isTrackComplete(uid, cq); }
  async recordListenStats(uid, { deltaSec, isFullListen }) {
    const u = Utils.obj.trim(uid); if (!u) return;
    if (deltaSec > 0 || isFullListen) await updateGlobalStats(u, deltaSec, isFullListen ? 1 : 0);
    if (isFullListen) {
      const stats = await getCloudStats(u), newCount = (Number(stats?.cloudFullListenCount) || 0) + 1;
      const { n, d } = this.getCloudSettings(), becameCloud = newCount >= n || stats?.cloud;
      const newStats = { ...stats, cloudFullListenCount: newCount, lastFullListenAt: Date.now() };
      if (becameCloud) {
        newStats.cloud = true; newStats.cloudExpiresAt = Date.now() + (d * 24 * 60 * 60 * 1000);
        await markLocalCloud(u);
        const cq = await this.getCacheQuality();
        if (!(await this.isTrackComplete(u, cq))) this.enqueueAudioDownload({ uid: u, quality: cq, priority: PRIORITY.P4_CLOUD, kind: 'cloudAuto' });
      }
      await setCloudStats(u, newStats); this._emit({ phase: 'statsUpdated', uid: u });
    }
  }
  async _checkExpiredCloud() {
    const expired = await getExpiredCloudUids(); let cleaned = 0;
    for (const u of expired) { if (!this.isPinned(u)) { await deleteTrackCache(u); await clearCloudStats(u); await clearCloudCandidate(u); cleaned++; } }
    if (cleaned > 0) Utils.ui.toast(`Срок действия истёк у ${cleaned} треков`);
  }
  async cloudMenu(uid, action) { return this.cloudMenuAction(uid, action); }
  async cloudMenuAction(uid, action) {
    const u = Utils.obj.trim(uid);
    if (action === 'remove-cache') { await deleteTrackCache(u); await clearCloudStats(u); await clearCloudCandidate(u); Utils.ui.toast('Удалено из кэша'); this._emit({ phase: 'cloudRemoved', uid: u }); }
  }
  enqueueAudioDownload({ uid, quality, priority, kind, userInitiated, onResult }) {
    const u = Utils.obj.trim(uid), q = Utils.obj.normQuality(quality); if (!u) return;
    const key = `${kind}:${q}:${u}`;
    this.queue.add({ uid: u, key, priority: priority || 0, taskFn: async () => { const res = await this._performDownload(u, q, kind, userInitiated); if (onResult) onResult(res); } });
  }
  async _performDownload(uid, quality, kind, userInitiated) {
    const meta = getTrackByUid(uid); if (!meta) return { ok: false, reason: 'no_meta' };
    if (await this.isTrackComplete(uid, quality)) {
      if (kind === 'cloudAuto' || kind === 'pinned') { const stats = await getCloudStats(uid); if (stats?.cloud || kind === 'pinned') await this._finalizeCloudStatus(uid); }
      return { ok: true, skipped: true };
    }
    const net = Utils.getNet(), policy = getNetPolicy(), allowed = isAllowedByNetPolicy({ policy, net, userInitiated });
    if (!net.online) return { ok: false, reason: 'offline' };
    if (!allowed) return { ok: false, reason: 'policy_restricted' };
    await this._enforceEvictionLimit();
    try {
      const url = quality === 'lo' ? (meta.urlLo || meta.urlHi) : (meta.urlHi || meta.urlLo);
      if (!url) throw new Error('No URL');
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      if (blob.size < 1024) throw new Error('Blob too small');
      await setAudioBlob(uid, quality, blob); await setBytes(uid, quality, blob.size);
      const expSize = quality === 'lo' ? (meta.sizeLo || meta.size_low) : (meta.sizeHi || meta.size);
      await setDownloadMeta(uid, quality, { ts: Date.now(), bytes: blob.size, exp: Number(expSize) || 0 });
      if (kind === 'playbackCache') await markLocalTransient(uid, 'window');
      else if (kind === 'pinned' || kind === 'cloudAuto' || kind === 'cloudCandidate') await this._finalizeCloudStatus(uid);
      else await markLocalTransient(uid, 'extra');
      return { ok: true };
    } catch (e) { return { ok: false, reason: e.message }; }
  }
  async _finalizeCloudStatus(uid) { if (this.isPinned(uid)) return; await markLocalCloud(uid); }
  async _enforceEvictionLimit() {
    const limitBytes = parseInt(localStorage.getItem(LS.LIMIT) || '500', 10) * MB;
    const current = await totalCachedBytes();
    if (current < limitBytes) return;
    const candidates = await getEvictionCandidates(this._getPinnedSet());
    let freed = 0;
    for (const c of candidates) {
      if (current - freed <= limitBytes) break;
      await deleteTrackCache(c.uid); freed += c.bytes;
    }
    if (freed > 0) Utils.ui.toast(`Очищено ${Math.round(freed/MB)} MB кэша`);
  }
  async refreshNeedsAggregates(opts = {}) {
    const NOW = Date.now();
    if (!opts.force && (NOW - this._needsState.ts < 10000)) return this._needsState;
    const uids = getAllTracks().map(t => t.uid);
    let update = 0, recache = 0;
    for (const uid of uids) {
      if (this.isPinned(uid) || (await this.isCloudEligible(uid))) {
        const s = await this.getTrackOfflineState(uid);
        if (s.needsUpdate) update++;
        if (s.needsReCache) recache++;
      }
    }
    this._needsState = { update, recache, ts: NOW };
    const hasAlert = update > 0 || recache > 0;
    localStorage.setItem(LS.ALERT, JSON.stringify({ on: hasAlert, ts: NOW }));
    window.dispatchEvent(new CustomEvent('offline:uiChanged'));
    return this._needsState;
  }
  async enqueueReCacheAllByCQ({ userInitiated } = {}) {
    const uids = getAllTracks().map(t => t.uid), cq = await this.getCacheQuality();
    let count = 0;
    uids.forEach(async (uid) => {
      if (this.isPinned(uid) || await this.isCloudEligible(uid)) {
        if (!(await this.isTrackComplete(uid, cq))) {
          count++;
          this.enqueueAudioDownload({ uid, quality: cq, priority: PRIORITY.P3_UPDATES, kind: 'recache', userInitiated });
        }
      }
    });
    return { ok: true, count };
  }
  async enqueueUpdateAll() {
    const uids = getAllTracks().map(t => t.uid), cq = await this.getCacheQuality();
    let count = 0;
    for (const uid of uids) {
      if (this.isPinned(uid) || (await this.isCloudEligible(uid))) {
        const s = await this.getTrackOfflineState(uid);
        if (s.needsUpdate) {
          count++;
          this.enqueueAudioDownload({ uid, quality: cq, priority: PRIORITY.P3_UPDATES, kind: 'update', userInitiated: true });
        }
      }
    }
    return { ok: true, count };
  }
  async computeSizeEstimate(selection) {
    const uids = new Set(), all = getAllTracks();
    if (selection.mode === 'favorites') {
      if (Array.isArray(selection.keys)) selection.keys.forEach(u => uids.add(u));
      else this._getPinnedSet().forEach(u => uids.add(u));
    } else {
      all.forEach(t => { if (selection.albumKeys && selection.albumKeys.includes(t.sourceAlbum)) uids.add(t.uid); });
    }
    const cq = await this.getCacheQuality();
    let totalMB = 0;
    for (const u of uids) {
      const t = getTrackByUid(u);
      if (t) { const sz = cq === 'lo' ? (t.sizeLo || t.size_low) : (t.sizeHi || t.size); totalMB += (Number(sz) || 0); }
    }
    let canGuarantee = true;
    if (navigator.storage?.estimate) {
      try { const est = await navigator.storage.estimate(); if ((est.quota || 0) - (est.usage || 0) < totalMB * MB * 1.2) canGuarantee = false; } catch { canGuarantee = false; }
    }
    return { ok: true, totalMB, count: uids.size, canGuarantee, uids: [...uids], cq };
  }
  async startFullOffline(uids) {
    const cq = await this.getCacheQuality();
    Utils.ui.toast(`Старт загрузки ${uids.length} треков`);
    uids.forEach(uid => { this.enqueueAudioDownload({ uid, quality: cq, priority: PRIORITY.P4_CLOUD, kind: 'fullOffline', userInitiated: true }); });
    return { ok: true, total: uids.length };
  }
  async getTrackOfflineState(uid) {
    const u = Utils.obj.trim(uid); if (!u) return {};
    const pinned = this.isPinned(u), cq = await this.getCacheQuality(), cloudEligible = await this.isCloudEligible(u);
    const cachedCQ = await this.isTrackComplete(u, cq);
    const cachedHi = await this.isTrackComplete(u, 'hi'), cachedLo = await this.isTrackComplete(u, 'lo');
    const isCloud = !pinned && cloudEligible && cachedCQ;
    let needsUpdate = false;
    if (cachedCQ) {
      const meta = getTrackByUid(u), dm = await getDownloadMeta(u, cq), cfgSize = cq === 'lo' ? (meta?.sizeLo || meta?.size_low) : (meta?.sizeHi || meta?.size);
      if (dm?.bytes && cfgSize && Math.abs(dm.bytes - (cfgSize * MB)) > 0.05 * (cfgSize * MB)) needsUpdate = true;
    }
    const needsReCache = (pinned || cloudEligible) && !cachedCQ;
    return { pinned, cloud: isCloud, cachedHiComplete: cachedHi, cachedLoComplete: cachedLo, needsUpdate, needsReCache };
  }
  async getIndicators(uid) {
    const s = await this.getTrackOfflineState(uid);
    return { pinned: s.pinned, cloud: s.cloud, cachedComplete: s.cachedHiComplete || s.cachedLoComplete, unknown: false };
  }
  async isTrackComplete(uid, quality) {
    const u = Utils.obj.trim(uid), q = Utils.obj.normQuality(quality), meta = getTrackByUid(u);
    if (!meta) return false;
    const expMB = q === 'lo' ? (meta.sizeLo || meta.size_low) : (meta.sizeHi || meta.size);
    if (!expMB) return false;
    const stored = await bytesByQuality(u), has = q === 'hi' ? stored.hi : stored.lo;
    return has >= (expMB * MB * COMPLETE_THRESHOLD);
  }
  async clearAllCache() {
    await clearAllStores({ keepCacheQuality: true });
    this._pinnedCache = new Set(); this._savePinned();
    localStorage.removeItem(LS.ALERT);
    window.dispatchEvent(new CustomEvent('offline:uiChanged'));
    Utils.ui.toast('Кэш полностью очищен', 'success');
  }
  getGlobalStats() { return getGlobalStatsAndTotal(); }
  async getCacheBreakdown() { return computeCacheBreakdown(this._getPinnedSet()); }
  async getCacheSizeBytes() { return totalCachedBytes(); }
  async getGlobalStatistics() { return getGlobalStatsAndTotal(); }
  getQueueStatus() { return this.queue.getStatus(); }
  pauseQueue() { this.queue.pause(); }
  resumeQueue() { this.queue.resume(); }
  getNeedsAggregates() { return this._needsState; }
  async canGuaranteeStorageForMB(mb) {
    if (navigator.storage?.estimate) {
      try { const est = await navigator.storage.estimate(); return { ok: (est.quota - est.usage) > (mb * 1024 * 1024 * 1.2) }; } catch { return { ok: true }; }
    } return { ok: true };
  }
}
export const OfflineManagerInstance = new OfflineManager();
export function getOfflineManager() { return OfflineManagerInstance; }
export default OfflineManagerInstance;
