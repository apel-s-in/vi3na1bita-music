/**
 * scripts/offline/offline-manager.js
 * OfflineManager v3.0 — Compact, Spec-Compliant.
 * Fully supports R0, R1, and R2 (SmartPrefetch Dynamic MRU).
 */

import * as DB from './cache-db.js';

const W = window;
const LS = { MODE: 'offline:mode:v1', QUAL: 'qualityMode:v1', CQ: 'offline:cacheQuality:v1', CN: 'cloud:listenThreshold', CD: 'cloud:ttlDays' };
const DEF = { N: 5, D: 31, MIN_MB: 60 };
const PRIO = { CUR: 100, NEXT: 90, PIN: 80, UPD: 70, FILL: 60, DYN: 50 }; // R2 DYN Priority added

const now = () => Date.now();
const normQ = (q) => (String(q || '').toLowerCase() === 'lo' ? 'lo' : 'hi');
const sUid = (u) => String(u || '').trim() || null;
const emit = (n, d) => W.dispatchEvent(new CustomEvent(n, { detail: d }));
const toast = (m, t = 'info') => W.NotificationSystem?.show?.(m, t);
const netOk = () => W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine;

const getUrl = (uid, q) => {
  const t = W.TrackRegistry?.getTrackByUid?.(uid);
  return t ? (normQ(q) === 'lo' ? (t.audio_low || t.audio) : t.audio) : null;
};

const hasSpace = async () => {
  try {
    if (!navigator.storage?.estimate) return true;
    const { quota, usage } = await navigator.storage.estimate();
    return (quota - usage) >= (DEF.MIN_MB * 1048576);
  } catch { return true; }
};

class DownloadQueue {
  constructor() {
    this.q = []; this.act = new Map(); this.par = 1; this.paused = false;
    const wake = () => this.pump();
    W.addEventListener('netPolicy:changed', wake); W.addEventListener('online', wake);
  }

  add(item) {
    const uid = sUid(item.uid);
    if (!uid || !item.url) return;
    if (this.act.has(uid) && this.act.get(uid).item.quality !== item.quality) this.cancel(uid);
    
    const idx = this.q.findIndex(i => i.uid === uid);
    const task = { ...item, uid, ts: now() };
    if (idx >= 0) { if (task.priority > this.q[idx].priority || task.quality !== this.q[idx].quality) this.q[idx] = task; } 
    else this.q.push(task);
    
    this.pump();
  }

  cancel(uid) {
    const u = sUid(uid);
    this.q = this.q.filter(i => i.uid !== u);
    if (this.act.has(u)) { this.act.get(u).ctrl.abort(); this.act.delete(u); emit('offline:stateChanged'); }
    this.pump();
  }

  getStatus() { return { active: this.act.size, queued: this.q.length }; }
  pause() { this.paused = true; }
  resume() { this.paused = false; this.pump(); }
  setParallel(n) { this.par = n; this.pump(); }

  pump() {
    if (this.paused || !netOk() || this.act.size >= this.par || !this.q.length) return;
    this.q.sort((a, b) => (b.priority - a.priority) || (a.ts - b.ts));
    while (this.act.size < this.par && this.q.length) this._run(this.q.shift());
  }

  async _run(item) {
    // R2 MRU Eviction Check before dynamic download
    if (item.priority === PRIO.DYN && !(await hasSpace())) {
      await W._offlineManagerInstance?.evictDynamic();
      if (!(await hasSpace())) return; // Skip if still full
    }

    const ctrl = new AbortController();
    this.act.set(item.uid, { ctrl, item });
    emit('offline:downloadStart', { uid: item.uid });

    try {
      const res = await fetch(item.url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();

      await DB.setAudioBlob(item.uid, item.quality, blob);
      await DB.updateTrackMeta(item.uid, { quality: item.quality, size: blob.size, cachedComplete: true, needsReCache: false, needsUpdate: false, lastAccessedAt: now() });

      const other = item.quality === 'hi' ? 'lo' : 'hi';
      if (W.playerCore?.getCurrentTrackUid?.() !== item.uid) DB.deleteAudioVariant(item.uid, other).catch(()=>{});

      emit('offline:trackCached', { uid: item.uid });
    } catch (e) {
      if (e.name !== 'AbortError') emit('offline:downloadFailed', { uid: item.uid, error: e.message });
    } finally {
      this.act.delete(item.uid);
      emit('offline:stateChanged');
      this.pump();
    }
  }
}

class OfflineManager {
  constructor() {
    this.queue = new DownloadQueue();
    this.ready = false;
    W._offlineManagerInstance = this;
    W.OfflineManager = this;
  }

  async initialize() {
    if (this.ready) return;
    await DB.openDB();

    if (['R1', 'R2'].includes(this.getMode()) && !(await hasSpace())) {
      this.setMode('R0');
      toast('Недостаточно места, кэширование отключено', 'warning');
    }

    const all = await DB.getAllTrackMetas();
    const t = now();
    for (const m of all) {
      if (m.type === 'cloud' && m.cloudExpiresAt && m.cloudExpiresAt < t) {
        await this.removeCached(m.uid);
        toast('Офлайн-доступ истёк. Трек удалён.', 'warning');
      }
    }

    // R2: Proxy PQ button directly in Utils to open Modal instead of hot-swapping
    const u = W.Utils?.pq;
    if (u && !u.__r2patched) {
      u.__r2patched = true;
      const ogM = u.getMode, ogT = u.toggle;
      u.getMode = () => this.getMode() === 'R2' ? this.getCQ() : ogM();
      u.toggle = () => {
        if (this.getMode() === 'R2') { W.Modals?.openOfflineModal?.(); return { ok: true, next: this.getCQ() }; }
        return ogT();
      };
    }

    W.addEventListener('quality:changed', e => this._onQualChg(e.detail?.quality));
    this.ready = true; emit('offline:ready');
  }

  // --- Modes & Settings ---
  getMode() { return localStorage.getItem(LS.MODE) || 'R0'; }
  setMode(m) { localStorage.setItem(LS.MODE, m); emit('offline:uiChanged'); }
  getQuality() { return normQ(localStorage.getItem(LS.QUAL)); }
  setQuality(q) { localStorage.setItem(LS.QUAL, normQ(q)); emit('offline:uiChanged'); }
  getCQ() { return normQ(localStorage.getItem(LS.CQ)); }
  setCQ(q) { localStorage.setItem(LS.CQ, normQ(q)); this._onQualChg(normQ(q)); emit('offline:uiChanged'); }
  getEffectiveQuality() { return this.getMode() === 'R2' ? this.getCQ() : this.getQuality(); }
  getCloudSettings() { return { N: parseInt(localStorage.getItem(LS.CN)) || DEF.N, D: parseInt(localStorage.getItem(LS.CD)) || DEF.D }; }
  async hasSpace() { return hasSpace(); }
  async isSpaceOk() { return hasSpace(); }

  // --- Track State & Actions ---
  async getTrackOfflineState(uid) {
    const u = sUid(uid);
    if (!u) return { status: 'none' };
    const m = await DB.getTrackMeta(u);
    const has = await DB.hasAudioForUid(u);
    const complete = !!(m?.cachedComplete && has);
    const q = this.getEffectiveQuality();
    const stored = await DB.getStoredVariant(u).catch(()=>null);

    let status = 'none';
    if (m?.type === 'pinned') status = 'pinned';
    else if (m?.type === 'cloud') status = complete ? 'cloud' : 'cloud_loading';
    else if (m?.type === 'playbackCache' || m?.type === 'dynamic') status = 'transient';

    return {
      status, downloading: this.queue.act.has(u), cachedComplete: complete,
      needsReCache: !!m?.needsReCache || (!!stored && stored !== q), needsUpdate: !!m?.needsUpdate,
      quality: m?.quality || stored, daysLeft: m?.cloudExpiresAt ? Math.ceil((m.cloudExpiresAt - now()) / 86400000) : 0
    };
  }

  async togglePinned(uid) {
    const u = sUid(uid); if (!u) return;
    const m = (await DB.getTrackMeta(u)) || { uid: u };
    const { D } = this.getCloudSettings();
    const q = this.getEffectiveQuality();

    if (m.type === 'pinned') {
      await DB.updateTrackMeta(u, { type: 'cloud', cloud: true, pinnedAt: null, cloudAddedAt: now(), cloudExpiresAt: now() + D * 86400000 });
      toast(`Закрепление снято. Доступно как облако на ${D} дн.`, 'info');
    } else {
      if (!(await hasSpace())) return toast('Недостаточно места', 'warning');
      await DB.updateTrackMeta(u, { type: 'pinned', cloud: false, pinnedAt: now() });
      const stored = await DB.getStoredVariant(u);
      if (stored !== q) {
        const url = getUrl(u, q);
        if (url) { toast('Закреплён. Скачивание...', 'info'); this.queue.add({ uid: u, url, quality: q, priority: PRIO.PIN, kind: 'pinned' }); }
      } else toast('Трек закреплён 🔒', 'success');
    }
    emit('offline:stateChanged');
  }

  async removeCached(uid) {
    const u = sUid(uid); if (!u) return;
    this.queue.cancel(u); await DB.deleteAudio(u);
    await DB.updateTrackMeta(u, { type: null, cloud: false, cachedComplete: false, quality: null, size: 0, cloudFullListenCount: 0, lastFullListenAt: null, cloudAddedAt: null, cloudExpiresAt: null });
    emit('offline:stateChanged');
  }

  async removeAllCached() {
    const all = await DB.getAllTrackMetas();
    for (const m of all) if (['pinned', 'cloud', 'dynamic'].includes(m.type)) await this.removeCached(m.uid);
  }

  // --- Dynamic Eviction (R2) ---
  async evictDynamic() {
    const metas = await DB.getAllTrackMetas();
    const dyns = metas.filter(m => m.type === 'dynamic').sort((a,b) => (a.lastAccessedAt||0) - (b.lastAccessedAt||0));
    for (const m of dyns) {
      const win = W.PlaybackCache?.getWindowState?.() || {};
      if (win.cur === m.uid || win.prev === m.uid || win.next === m.uid) continue;
      await DB.deleteTrackCache(m.uid);
      if (await hasSpace()) break;
    }
  }

  // --- Cloud & Dynamic Automation ---
  async registerFullListen(uid, { duration, position } = {}) {
    const u = sUid(uid);
    if (!u || !duration || (position / duration) < 0.9) return;

    const m = (await DB.getTrackMeta(u)) || { uid: u };
    const { N, D } = this.getCloudSettings();
    const nextCount = (m.cloudFullListenCount || 0) + 1;
    const upd = { cloudFullListenCount: nextCount, lastFullListenAt: now() };

    if (m.type === 'cloud') upd.cloudExpiresAt = now() + D * 86400000;

    if (m.type !== 'pinned' && m.type !== 'cloud') {
      if (nextCount >= N) {
        if (await hasSpace()) {
          upd.type = 'cloud'; upd.cloud = true; upd.cloudOrigin = 'auto'; upd.cloudExpiresAt = now() + D * 86400000;
          if (!(await DB.hasAudioForUid(u))) {
            const q = this.getEffectiveQuality(); const url = getUrl(u, q);
            if (url) this.queue.add({ uid: u, url, quality: q, priority: PRIO.FILL, kind: 'cloud' });
          }
        }
      } else if (this.getMode() === 'R2' && m.type !== 'playbackCache') { // R2 MRU Logic
        upd.type = 'dynamic'; upd.lastAccessedAt = now();
        if (!(await DB.hasAudioForUid(u))) {
          const q = this.getEffectiveQuality(); const url = getUrl(u, q);
          if (url) this.queue.add({ uid: u, url, quality: q, priority: PRIO.DYN, kind: 'dynamic' });
        }
      }
    }
    await DB.updateTrackMeta(u, upd);
    emit('offline:stateChanged');
  }

  async resolveTrackSource(uid, reqQ) {
    const u = sUid(uid); if (!u) return { source: 'none' };
    const q = normQ(reqQ || this.getEffectiveQuality());
    const alt = q === 'hi' ? 'lo' : 'hi';
    const isNet = netOk();

    const m = await DB.getTrackMeta(u);
    if (m?.type === 'dynamic') DB.updateTrackMeta(u, { lastAccessedAt: now() }); // Bump MRU

    const b1 = await DB.getAudioBlob(u, q);
    if (b1) return { source: 'local', blob: b1, quality: q };

    const b2 = await DB.getAudioBlob(u, alt);
    if (b2) {
      if (q === 'lo') return { source: 'local', blob: b2, quality: alt };
      if (isNet) { const url = getUrl(u, q); if (url) { this._reCache(u, q); return { source: 'stream', url, quality: q }; } }
      return { source: 'local', blob: b2, quality: alt };
    }

    if (isNet) { const url = getUrl(u, q); if (url) return { source: 'stream', url, quality: q }; }
    return { source: 'none' };
  }

  async enqueueAudioDownload(uid, { priority, kind } = {}) {
    const u = sUid(uid); if (!u) return;
    const m = await DB.getTrackMeta(u);
    if (['pinned', 'cloud', 'dynamic'].includes(m?.type) || (await DB.hasAudioForUid(u))) return;
    if (kind === 'playbackCache' && !(await hasSpace())) return;

    const q = this.getEffectiveQuality(); const url = getUrl(u, q);
    if (kind === 'playbackCache' && m?.type !== 'playbackCache') await DB.updateTrackMeta(u, { type: 'playbackCache', lastAccessedAt: now() });
    if (url) this.queue.add({ uid: u, url, quality: q, priority: priority || PRIO.UPD, kind });
  }

  _reCache(uid, q, prio = PRIO.UPD) {
    if (W.playerCore?.getCurrentTrackUid?.() === uid) return; 
    const url = getUrl(uid, q);
    if (url) this.queue.add({ uid, url, quality: q, priority: prio, kind: 'reCache' });
  }

  async _onQualChg(newQ) {
    const q = normQ(newQ);
    for (const [uid] of this.queue.act) this.queue.cancel(uid);
    const all = await DB.getAllTrackMetas();
    for (const m of all) {
      if (!['pinned', 'cloud', 'dynamic'].includes(m.type)) continue;
      const stored = await DB.getStoredVariant(m.uid).catch(()=>null);
      if (stored && stored !== q) {
        await DB.updateTrackMeta(m.uid, { needsReCache: true });
        this._reCache(m.uid, q, m.type === 'pinned' ? PRIO.PIN : (m.type === 'cloud' ? PRIO.UPD : PRIO.DYN));
      }
    }
    emit('offline:uiChanged');
  }

  async confirmApplyCloudSettings({ newN, newD }) {
    localStorage.setItem(LS.CN, newN); localStorage.setItem(LS.CD, newD);
    emit('offline:uiChanged');
  }
  
  async getStorageBreakdown() {
    const all = await DB.getAllTrackMetas();
    const out = { pinned: 0, cloud: 0, transient: 0, dynamic: 0, other: 0 };
    for (const m of all) {
      const sz = m.size || 0;
      if (m.type === 'pinned') out.pinned += sz;
      else if (m.type === 'cloud') out.cloud += sz;
      else if (m.type === 'playbackCache') out.transient += sz;
      else if (m.type === 'dynamic') out.dynamic += sz;
      else out.other += sz;
    }
    return out;
  }

  getDownloadStatus() { return this.queue.getStatus(); }
  async getTrackMeta(uid) { return DB.getTrackMeta(uid); }
  async countNeedsReCache(q) { 
    if (this.getMode() === 'R2') return 0; // Handled directly in Modal for R2
    const all = await DB.getAllTrackMetas(); 
    return all.filter(m => ['pinned', 'cloud'].includes(m.type) && m.quality && m.quality !== normQ(q)).length; 
  }
  async reCacheAll(q) { this._onQualChg(q); }
  setCacheQualitySetting(q) { this.setCQ(q); } // Proxy to CQ
  recordTickStats() {} getBackgroundPreset() { return 'balanced'; } setBackgroundPreset() {}
}

const instance = new OfflineManager();
export const getOfflineManager = () => instance;
export default instance;
