//=================================================
// FILE: /scripts/offline/offline-manager.js
// scripts/offline/offline-manager.js
// Eдиный менеджер офлайна: CQ, Pinned, Cloud, Queue, 100% Offline.
// Реализует TЗ v1.0. Инвариант: НЕ управляет воспроизведением (нет stop/play).

import {
  bytesByQuality, deleteTrackCache, getCacheQuality, setCacheQuality as dbSetCQ,
  ensureDbReady, getAudioBlob, setAudioBlob, setBytes,
  getCloudStats, setCloudStats, clearCloudStats,
  getCloudCandidate, setCloudCandidate, clearCloudCandidate,
  totalCachedBytes, clearAllStores, updateGlobalStats, getGlobalStatsAndTotal,
  getEvictionCandidates, getExpiredCloudUids, getDownloadMeta, setDownloadMeta,
  markLocalCloud, markLocalTransient
} from './cache-db.js';

import { resolvePlaybackSource, isTrackAvailableOffline } from './track-resolver.js';
import { getTrackByUid } from '../app/track-registry.js';
import { getNetPolicy, isAllowedByNetPolicy, shouldConfirmByPolicy } from './net-policy.js';

const LS = {
  MODE: 'offlineMode:v1', CQ: 'offline:cacheQuality:v1', PINNED: 'pinnedUids:v1',
  CN: 'offline:cloudN:v1', CD: 'offline:cloudD:v1', ALERT: 'offline:alert:v1'
};

const MB = 1024 * 1024;
const PRIORITY = { PINNED: 80, UPDATES: 70, CLOUD: 60, MASS: 50 }; // P0/P1 in playback-cache

// Utils
const normUid = (v) => String(v || '').trim() || null;
const normQ = (v) => String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi';
const json = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || '') || d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const getNet = () => window.Utils?.getNetworkStatusSafe?.() || { online: navigator.onLine !== false, kind: 'unknown' };
const alertUI = (on, r) => { save(LS.ALERT, { on: !!on, ts: Date.now(), reason: r || '' }); window.dispatchEvent(new CustomEvent('offline:uiChanged')); };
const notify = (m, type='info') => window.NotificationSystem?.[type]?.(m, 3000);

class DownloadQueue {
  constructor(cb) { this.q = []; this.act = null; this.paused = false; this.cb = cb; }
  has(k) { return this.act === k || this.q.some(t => t.key === k); }
  add(task) {
    if (this.has(task.key)) return false;
    this.q.push({ ...task, p: task.priority || 0, ts: Date.now() });
    this.q.sort((a, b) => b.p - a.p || a.ts - b.ts); // Descending priority
    this.tick();
    return true;
  }
  pause() { this.paused = true; }
  resume() { this.paused = false; this.tick(); }
  status() { return { downloadingKey: this.act, downloading: !!this.act, paused: this.paused, queued: this.q.length }; }
  
  async tick() {
    if (this.act || this.paused || !this.q.length) return;
    const t = this.q.shift();
    this.act = t.key;
    this.cb?.({ uid: t.uid, phase: 'start', key: t.key });
    try { await t.run(); this.cb?.({ uid: t.uid, phase: 'done', key: t.key }); }
    catch (e) { this.cb?.({ uid: t.uid, phase: 'error', key: t.key, error: e.message }); }
    this.act = null;
    this.tick();
  }
}

export class OfflineManager {
  constructor() {
    this._subs = new Set();
    this._needs = { ready: false, total: 0, upd: 0, rec: 0, ts: 0 };
    this.queue = new DownloadQueue((e) => this._emit('progress', e));
    this.mass = { active: false, total: 0, done: 0, err: 0, skip: 0 };
  }

  async initialize() {
    await ensureDbReady().catch(() => {});
    this._checkExpired();
    setInterval(() => this._checkExpired(), 3600000);
    this.refreshNeedsAggregates({ force: true });
  }

  on(t, cb) { if(t==='progress') this._subs.add(cb); return () => this._subs.delete(cb); }
  _emit(t, d) { this._subs.forEach(f => { try { f(d); } catch {} }); }

  // --- Settings ---
  isOfflineMode() { return localStorage.getItem(LS.MODE) === '1'; }
  setOfflineMode(v) { localStorage.setItem(LS.MODE, v ? '1' : '0'); window.dispatchEvent(new CustomEvent('offline:uiChanged')); }
  
  async getCacheQuality() { return normQ(localStorage.getItem(LS.CQ) || await getCacheQuality()); }
  async setCacheQuality(v) {
    const q = normQ(v);
    localStorage.setItem(LS.CQ, q);
    await dbSetCQ(q);
    this._emit('progress', { phase: 'cqChanged', cq: q });
    alertUI(true, 'CQ changed');
    this.enqueueReCacheAllByCQ({ userInitiated: false }); // T3 5.2
    return q;
  }

  getCloudSettings() { return { n: Math.min(50, Number(localStorage.getItem(LS.CN)) || 5), d: Math.min(365, Number(localStorage.getItem(LS.CD)) || 31) }; }
  setCloudSettings(s) { 
    localStorage.setItem(LS.CN, s.n); localStorage.setItem(LS.CD, s.d); 
    this._emit('progress', { phase: 'cloudSettingsChanged', ...s }); 
  }

  // --- Pinned ---
  _pins() { return new Set(json(LS.PINNED, [])); }
  isPinned(uid) { return this._pins().has(normUid(uid)); }
  
  async pin(uid) {
    const u = normUid(uid); if (!u) return;
    const s = this._pins(); s.add(u); save(LS.PINNED, Array.from(s));
    await setCloudCandidate(u, false);
    this.enqueueAudioDownload({ uid: u, quality: await this.getCacheQuality(), priority: PRIORITY.PINNED, kind: 'pinned', userInitiated: true });
    notify('Трек будет доступен офлайн');
    this._emit('progress', { uid: u, phase: 'pinned' });
  }

  async unpin(uid) {
    const u = normUid(uid); if (!u) return;
    const s = this._pins(); s.delete(u); save(LS.PINNED, Array.from(s));
    await setCloudCandidate(u, true); // T3 8.3
    notify('Закрепление снято. Кандидат в Cloud');
    this.enqueueAudioDownload({ uid: u, quality: await this.getCacheQuality(), priority: PRIORITY.CLOUD, kind: 'cloudCandidate' });
    this._emit('progress', { uid: u, phase: 'unpinned' });
  }

  // --- Queue Operations (T3 13, 14) ---
  async enqueueUpdateAll() {
    const cq = await this.getCacheQuality();
    const uids = await this._getAllTrackUids();
    let count = 0;
    
    for (const u of uids) {
      if (this.isPinned(u) || await this.isCloudEligible(u)) {
        this.enqueueAudioDownload({ uid: u, quality: cq, priority: PRIORITY.UPDATES, kind: 'update', isMass: true });
        count++;
      }
    }
    alertUI(true, 'Updates started');
    return { ok: true, count };
  }

  async enqueueReCacheAllByCQ(opts={}) {
    const cq = await this.getCacheQuality();
    const uids = await this._getAllTrackUids();
    let count = 0;

    for (const u of uids) {
      if ((this.isPinned(u) || await this.isCloudEligible(u)) && !(await this.isTrackComplete(u, cq))) {
        this.enqueueAudioDownload({ uid: u, quality: cq, priority: PRIORITY.UPDATES, kind: 'recache', isMass: true, userInitiated: opts.userInitiated });
        count++;
      }
    }
    if (count) alertUI(true, 'Re-cache started');
    return { ok: true, count };
  }

  enqueueAudioDownload(p) { // {uid, quality, priority, kind, userInitiated, isMass, onResult}
    const u = normUid(p.uid), q = normQ(p.quality);
    if (!u) return { ok: false };
    const key = `${p.kind || 'gen'}:${q}:${u}`;
    
    const added = this.queue.add({
      key, uid: u, priority: p.priority,
      run: async () => {
        const r = await this._downloadTask(u, q, p);
        p.onResult?.(r);
      }
    });
    return { ok: true, enqueued: added, key };
  }

  // --- Core Download Logic ---
  async _downloadTask(u, q, opts) {
    const meta = getTrackByUid(u);
    if (!meta) return { ok: false, reason: 'noMeta' };
    
    if (await this.isTrackComplete(u, q)) {
      await this._activateCloudIfReady(u);
      return { ok: true, skipped: true };
    }

    const url = q === 'lo' ? (meta.urlLo || meta.urlHi) : (meta.urlHi || meta.urlLo);
    if (!url) return { ok: false, reason: 'noUrl' };

    const net = getNet(), pol = getNetPolicy();
    if (!net.online) return { ok: false, reason: 'offline' };
    
    if (!isAllowedByNetPolicy({ policy: pol, net, userInitiated: opts.userInitiated })) {
      if (opts.userInitiated && shouldConfirmByPolicy({ policy: pol, net })) return { ok: false, reason: 'confirm' };
      return { ok: false, reason: 'policy' };
    }

    await this.checkEviction();
    this._emit('progress', { uid: u, phase: 'downloading', quality: q });

    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (blob.size < 1000) throw new Error('Empty');

      await setAudioBlob(u, q, blob);
      await setBytes(u, q, blob.size);
      
      // Meta for updates (T3 13)
      const expMB = q === 'lo' ? (meta.sizeLo || meta.size_low) : (meta.sizeHi || meta.size);
      await setDownloadMeta(u, q, { ts: Date.now(), bytes: blob.size, exp: Number(expMB) || 0, f: q==='lo'?'size_low':'size' });
      
      // Local meta for eviction
      await markLocalTransient(u, opts.kind === 'playbackCache' ? 'window' : 'window'); // Will prompt to cloud later
      
      this._emit('progress', { uid: u, phase: 'downloaded', bytes: blob.size });
      await this._activateCloudIfReady(u);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  // --- Cloud Logic (T3 9) ---
  async isCloudEligible(uid) {
    const u = normUid(uid); if (!u || this.isPinned(u)) return false;
    const st = await getCloudStats(u), cand = await getCloudCandidate(u);
    const now = Date.now();
    
    if (st?.cloud) return (st.cloudExpiresAt || 0) >= now;
    return !!cand || (Number(st?.cloudFullListenCount || 0) >= this.getCloudSettings().n);
  }

  async _activateCloudIfReady(u) {
    if (this.isPinned(u) || !(await this.isTrackComplete(u, await this.getCacheQuality()))) return;
    
    const st = await getCloudStats(u);
    if (st?.cloud) return; // Already cloud

    if (await this.isCloudEligible(u)) {
      const { d } = this.getCloudSettings();
      await setCloudStats(u, { ...st, cloud: true, cloudExpiresAt: Date.now() + d * 86400000, cloudAddedAt: Date.now() });
      await clearCloudCandidate(u);
      await markLocalCloud(u);
      notify(`Трек добавлен в офлайн на ${d} дн.`);
      this._emit('progress', { uid: u, phase: 'cloudActivated' });
    }
  }

  async _checkExpired() {
    const exp = await getExpiredCloudUids();
    for (const u of exp) {
      if (!this.isPinned(u)) {
        await deleteTrackCache(u); await clearCloudStats(u); await clearCloudCandidate(u);
      }
    }
    if (exp.length) notify(`Офлайн истёк для ${exp.length} треков`);
  }

  // --- Statistics (T3 1.4, 7.11) ---
  async recordListenStats(uid, { deltaSec, isFullListen }) {
    const u = normUid(uid); if(!u) return;
    if (deltaSec || isFullListen) await updateGlobalStats(u, deltaSec, isFullListen ? 1 : 0);
    
    if (isFullListen) {
      const { n, d } = this.getCloudSettings();
      const st = await getCloudStats(u);
      const cnt = (Number(st?.cloudFullListenCount)||0) + 1;
      const isCloud = cnt >= n || st?.cloud;
      
      await setCloudStats(u, {
        ...st, cloudFullListenCount: cnt, lastFullListenAt: Date.now(),
        cloud: isCloud, cloudExpiresAt: isCloud ? Date.now() + d * 86400000 : 0
      });
      if (isCloud) await markLocalCloud(u);
      this._emit('progress', { uid: u, phase: 'cloudStats' });
    }
  }

  // --- Mass Operations (100% OFFLINE) ---
  async startFullOffline(uids) { // T3 11.2.I
    const list = Array.from(new Set(uids.map(normUid).filter(Boolean)));
    if (!list.length) return { ok: false };
    
    await this.checkEviction();
    this.mass = { active: true, total: list.length, done: 0, err: 0, skip: 0, start: Date.now() };
    const cq = await this.getCacheQuality();

    list.forEach(u => this.enqueueAudioDownload({
      uid: u, quality: cq, priority: PRIORITY.MASS, kind: 'offlineAll', isMass: true,
      onResult: (r) => {
        if(r.ok) this.mass.done++; else if(r.skipped) this.mass.skip++; else this.mass.err++;
        if (this.mass.done + this.mass.err + this.mass.skip >= this.mass.total) {
          this.mass.active = false;
          notify('Загрузка завершена', 'success');
          this._emit('progress', { phase: 'massDone' });
        }
      }
    }));
    return { ok: true, total: list.length };
  }

  // --- State & Helpers ---
  async isTrackComplete(uid, q) {
    const u = normUid(uid); if (!u) return false;
    const meta = getTrackByUid(u); if (!meta) return false;
    const exp = q === 'hi' ? (meta.sizeHi||meta.size) : (meta.sizeLo||meta.size_low);
    if (!exp) return false;
    const has = await bytesByQuality(u);
    return (q === 'hi' ? has.hi : has.lo) >= Math.floor(exp * 1024 * 1024 * 0.92);
  }

  async getTrackOfflineState(uid) { // T3 19.2
    const u = normUid(uid); if (!u) return {};
    const pinned = this.isPinned(u);
    const cq = await this.getCacheQuality();
    const complete = await this.isTrackComplete(u, cq);
    const eligible = await this.isCloudEligible(u);
    
    // Updates detect
    let needsUpdate = false;
    if (complete) {
      const meta = getTrackByUid(u);
      const dm = await getDownloadMeta(u, cq);
      const curExp = cq==='lo' ? (meta?.sizeLo||meta?.size_low) : (meta?.sizeHi||meta?.size);
      if (dm?.exp && curExp && Math.abs(curExp - dm.exp) > 0.05) needsUpdate = true;
    }

    return {
      pinned, cloud: !pinned && eligible && complete,
      cachedHiComplete: await this.isTrackComplete(u, 'hi'),
      cachedLoComplete: await this.isTrackComplete(u, 'lo'),
      needsUpdate, needsReCache: (pinned || eligible) && !complete
    };
  }

  async getIndicators(uid) {
    const s = await this.getTrackOfflineState(uid);
    return { pinned: s.pinned, cloud: s.cloud, cachedComplete: s.cachedHiComplete || s.cachedLoComplete };
  }

  async checkEviction(limMB = 500) {
    const total = await totalCachedBytes();
    const lim = limMB * MB;
    if (total <= lim) return;
    
    const cands = await getEvictionCandidates(this._pins());
    let freed = 0;
    for (const c of cands) {
      if (total - freed <= lim) break;
      await deleteTrackCache(c.uid);
      freed += c.bytes;
    }
    if (freed) notify('Кэш очищен (авто)');
  }

  async _getAllTrackUids() {
    return (window.TrackRegistry?.getAllTracks?.() || []).map(t => t.uid).filter(Boolean);
  }

  async refreshNeedsAggregates(opts={}) {
    if (!opts.force && Date.now() - this._needs.ts < 5000) return this._needs;
    let upd = 0, rec = 0, total = 0;
    const uids = await this._getAllTrackUids();
    for (const u of uids) {
      const s = await this.getTrackOfflineState(u);
      if (s.needsUpdate) upd++;
      if (s.needsReCache) rec++;
      total++;
    }
    this._needs = { ready: true, total, upd, rec, ts: Date.now() };
    alertUI(upd > 0 || rec > 0, 'Needs updates');
    return this._needs;
  }

  // --- Proxies ---
  resolveForPlayback(t, pq) { return resolvePlaybackSource({ track: t, pq, cq: localStorage.getItem(LS.CQ), offlineMode: this.isOfflineMode() }); }
  hasAnyComplete(uids) { return Promise.all(uids.map(u => isTrackAvailableOffline(u))).then(r => r.some(Boolean)); }
  getCacheSizeBytes() { return totalCachedBytes(); }
  getGlobalStatistics() { return getGlobalStatsAndTotal(); }
  getQueueStatus() { return this.queue.status(); }
  pauseQueue() { this.queue.pause(); }
  resumeQueue() { this.queue.resume(); }
  async clearAllCache() { await clearAllStores({ keepCacheQuality: true }); save(LS.PINNED, []); this._emit('progress', { phase: 'cleared' }); }
  async cloudMenu(uid, act) {
    if (act === 'remove-cache') {
      await deleteTrackCache(uid); await clearCloudStats(uid); await clearCloudCandidate(uid);
      notify('Удалено из кэша');
    }
  }
}

let instance;
export function getOfflineManager() { return instance || (instance = new OfflineManager()); }
