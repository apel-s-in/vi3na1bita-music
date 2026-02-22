/**
 * scripts/offline/offline-manager.js
 * OfflineManager v3.3 — Ultra-Compact, 100% Spec-Compliant.
 * Fixes: 
 * 1. Prevent DB crashes if called before ready.
 * 2. UI freeze (relies on cachedComplete instead of heavy blob reads).
 * 3. Strict "No Duplicates" rule (deferred GC for currently playing tracks).
 * 4. Queue poisoning on rapid Hi/Lo swaps (clears pending conflicting tasks).
 */

import * as DB from './cache-db.js';

const W = window;
const LS = { MODE: 'offline:mode:v1', QUAL: 'qualityMode:v1', CQ: 'offline:cacheQuality:v1', CN: 'cloud:listenThreshold', CD: 'cloud:ttlDays' };
const DEF = { N: 5, D: 31, MIN_MB: 60, R2_DYN_MB: 80 };

// R2 globals (IndexedDB: offlineCache/global)
const G = { MRU: 'r2:mru:list:v1', DYN_MB: 'r2:dynamicLimitMB:v1' };
const PRIO = { CUR: 100, NEXT: 90, PIN: 80, UPD: 70, FILL: 60, DYN: 50 };

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
    this.q = new Map(); 
    this.act = new Map(); 
    this.par = 1; 
    this.paused = false;
    const wake = () => this.pump();
    W.addEventListener('netPolicy:changed', wake); 
    W.addEventListener('online', wake);
  }

  add(item) {
    const uid = sUid(item.uid);
    if (!uid || !item.url) return;
    if (this.act.has(uid)) {
      if (this.act.get(uid).item.quality !== item.quality) this.cancel(uid);
      else return; // already downloading correct quality
    }
    const exist = this.q.get(uid);
    if (!exist || exist.priority < item.priority || exist.quality !== item.quality) {
      this.q.set(uid, { ...item, uid, ts: now() });
      this.pump();
    }
  }

  cancel(uid) {
    const u = sUid(uid);
    this.q.delete(u);
    if (this.act.has(u)) { 
      this.act.get(u).ctrl.abort(); 
      this.act.delete(u); 
      emit('offline:stateChanged'); 
    }
    this.pump();
  }

  clearOldQualities(q) {
    for (const [u, task] of this.q) if (task.quality !== q) this.q.delete(u);
  }

  getStatus() { return { active: this.act.size, queued: this.q.size }; }
  pause() { this.paused = true; }
  resume() { this.paused = false; this.pump(); }
  setParallel(n) { this.par = n; this.pump(); }

  pump() {
    if (this.paused || !netOk() || this.act.size >= this.par || !this.q.size) return;
    const tasks = [...this.q.values()].sort((a, b) => (b.priority - a.priority) || (a.ts - b.ts));
    while (this.act.size < this.par && tasks.length) {
      const t = tasks.shift();
      this.q.delete(t.uid);
      this._run(t);
    }
  }

  async _run(item) {
    if (item.priority === PRIO.DYN && !(await hasSpace())) {
      await W._offlineManagerInstance?.evictDynamic();
      if (!(await hasSpace())) return; 
    }

    const ctrl = new AbortController();
    this.act.set(item.uid, { ctrl, item });
    emit('offline:downloadStart', { uid: item.uid });

    try {
      const res = await fetch(item.url, { signal: ctrl.signal, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();

      await DB.setAudioBlob(item.uid, item.quality, blob);
      await DB.updateTrackMeta(item.uid, { 
        quality: item.quality, size: blob.size, cachedComplete: true, 
        needsReCache: false, needsUpdate: false, lastAccessedAt: now() 
      });

      // R2 Q.9.2: MRU membership only after successful download (blob exists)
      try {
        const meta = await DB.getTrackMeta(item.uid);
        if (meta?.type === 'dynamic') {
          await W._offlineManagerInstance?.touchMRU?.(item.uid);
        }
      } catch {}

      // Strict No Duplicates Rule: Two-phase cleanup
      const other = item.quality === 'hi' ? 'lo' : 'hi';
      if (W.playerCore?.getCurrentTrackUid?.() !== item.uid) {
        await DB.deleteAudioVariant(item.uid, other).catch(()=>{});
      } else {
        W._orphanedBlobs = W._orphanedBlobs || new Set();
        W._orphanedBlobs.add(item.uid);
      }

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

    // NOTE: Do not monkey-patch Utils.pq.
    // UI must handle R2 CQ behavior explicitly (Q.4.3), without hidden global overrides.

    W.addEventListener('quality:changed', e => this._onQualChg(e.detail?.quality));
    
    // Связь новой аналитики с OfflineManager (SmartPrefetch R2)
    W.addEventListener('analytics:cloudThresholdReached', async (e) => {
      if (e.detail?.uid) this.registerFullListen(e.detail.uid, { forcedCloud: true });
    });

// Deferred GC for playing tracks (enforces No Duplicates without stopping playback)
    W.addEventListener('player:trackChanged', async (e) => {
      if (!W._orphanedBlobs?.size) return;
      const cur = e.detail?.uid;
      for (const uid of W._orphanedBlobs) {
        if (uid !== cur) {
          const m = await DB.getTrackMeta(uid);
          if (m?.quality) await DB.deleteAudioVariant(uid, m.quality === 'hi' ? 'lo' : 'hi').catch(()=>{});
          W._orphanedBlobs.delete(uid);
        }
      }
    });

    this.ready = true; emit('offline:ready');
  }

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

  // ─────────────────────────────────────────────
  // R2 MRU + Dynamic limit (Q.8/Q.10/Q.11)
  // ─────────────────────────────────────────────
  async getDynamicLimitMB() {
    try {
      const rec = await DB.getGlobal(G.DYN_MB);
      const v = Number(rec?.value);
      return Number.isFinite(v) && v >= 0 ? v : DEF.R2_DYN_MB;
    } catch {
      return DEF.R2_DYN_MB;
    }
  }

  async setDynamicLimitMB(mb) {
    const v = Math.max(0, Math.floor(Number(mb) || 0));
    await DB.setGlobal(G.DYN_MB, v);
    emit('offline:uiChanged');
  }

  async _getMRU() {
    try {
      const rec = await DB.getGlobal(G.MRU);
      const list = Array.isArray(rec?.value) ? rec.value : [];
      return list.map(sUid).filter(Boolean);
    } catch {
      return [];
    }
  }

  async _setMRU(list) {
    await DB.setGlobal(G.MRU, list);
  }

  async touchMRU(uid) {
    const u = sUid(uid);
    if (!u || this.getMode() !== 'R2') return;

    const m = await DB.getTrackMeta(u);
    // Pinned/Cloud/Window are not dynamic; they should not occupy MRU list (Q.11.2 + Q.3.3)
    if (m?.type === 'pinned' || m?.type === 'cloud' || m?.type === 'playbackCache') {
      await this._dropFromMRU(u);
      return;
    }

    const list = await this._getMRU();
    const next = [u, ...list.filter(x => x !== u)].slice(0, 2000); // safety cap
    await this._setMRU(next);
  }

  async _dropFromMRU(uid) {
    const u = sUid(uid);
    if (!u) return;
    const list = await this._getMRU();
    const next = list.filter(x => x !== u);
    if (next.length !== list.length) await this._setMRU(next);
  }

  async getDynamicUsedBytes() {
    const metas = await DB.getAllTrackMetas();
    let sum = 0;
    for (const m of metas) if (m.type === 'dynamic') sum += (m.size || 0);
    return sum;
  }

  async getTrackOfflineState(uid) {
    const u = sUid(uid);
    if (!u) return { status: 'none' };
    
    // GUARD: If DB/manager is not ready, return safe default without crashing
    if (!this.ready) {
      return { status: 'none', downloading: false, cachedComplete: false };
    }
    
    const m = await DB.getTrackMeta(u);
    const complete = !!m?.cachedComplete; // O(1) DB lookup. Replaces heavy Blob loading.
    const q = this.getEffectiveQuality();

    let status = 'none';
    if (m?.type === 'pinned') status = 'pinned';
    else if (m?.type === 'cloud') status = complete ? 'cloud' : 'cloud_loading';
    else if (m?.type === 'playbackCache' || m?.type === 'dynamic') status = 'transient';

    return {
      status, downloading: this.queue.act.has(u), cachedComplete: complete,
      needsReCache: !!m?.needsReCache || (complete && m.quality !== q), 
      needsUpdate: !!m?.needsUpdate,
      quality: m?.quality, daysLeft: m?.cloudExpiresAt ? Math.ceil((m.cloudExpiresAt - now()) / 86400000) : 0
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
      
      if (!m.cachedComplete || m.quality !== q) {
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

  async evictDynamic() {
    // Q.11: evict strictly from MRU tail, never touch pinned/cloud/protected window
    const win = W.PlaybackCache?.getWindowState?.() || {};
    const protectedSet = new Set([win.prev, win.cur, win.next].filter(Boolean));

    const metas = await DB.getAllTrackMetas();
    const metaByUid = new Map(metas.map(m => [m.uid, m]));

    // Clean MRU from non-existing / non-dynamic / protected / pinned/cloud
    const list = await this._getMRU();
    const cleaned = [];
    for (const uid of list) {
      const m = metaByUid.get(uid);
      if (!m) continue;
      if (protectedSet.has(uid)) continue;
      if (m.type === 'pinned' || m.type === 'cloud' || m.type === 'playbackCache') continue;
      if (m.type !== 'dynamic') continue;
      cleaned.push(uid);
    }

    // Store cleaned MRU (head..tail)
    await this._setMRU(cleaned);

    // Evict from tail
    for (let i = cleaned.length - 1; i >= 0; i--) {
      const uid = cleaned[i];
      const m = metaByUid.get(uid);
      if (!m || m.type !== 'dynamic') continue;
      if (protectedSet.has(uid)) continue;

      await DB.deleteTrackCache(uid).catch(() => {});
      await this._dropFromMRU(uid);

      if (await hasSpace()) return;
    }
  }

  async registerFullListen(uid, { forcedCloud } = {}) {
    const u = sUid(uid);
    if (!u || !forcedCloud) return; // Защита: вызывается только из StatsAggregator

    const m = (await DB.getTrackMeta(u)) || { uid: u };
    const { N, D } = this.getCloudSettings();
    const nextCount = (m.cloudFullListenCount || 0) + 1;
    const upd = { cloudFullListenCount: nextCount, lastFullListenAt: now() };

    if (m.type === 'cloud') upd.cloudExpiresAt = now() + D * 86400000;

    if (m.type !== 'pinned' && m.type !== 'cloud') {
      if (nextCount >= N) {
        if (await hasSpace()) {
          upd.type = 'cloud'; upd.cloud = true; upd.cloudOrigin = 'auto'; upd.cloudExpiresAt = now() + D * 86400000;
          if (!m.cachedComplete) {
            const q = this.getEffectiveQuality(); const url = getUrl(u, q);
            if (url) this.queue.add({ uid: u, url, quality: q, priority: PRIO.FILL, kind: 'cloud' });
          }
        }
      } else if (this.getMode() === 'R2' && m.type !== 'playbackCache') { 
        upd.type = 'dynamic';
        upd.lastAccessedAt = now();

        if (!m.cachedComplete) {
          const limitBytes = (await this.getDynamicLimitMB()) * 1048576;
          const usedBytes = await this.getDynamicUsedBytes();
          const q = this.getEffectiveQuality();
          const url = getUrl(u, q);

          if (url) {
            // If limit is 0 => dynamic disabled by user
            if (limitBytes <= 0) {
              // Still record meta.type=dynamic? No: keep as none to avoid fake states
              upd.type = null;
            } else if (usedBytes >= limitBytes) {
              await this.evictDynamic();
              const used2 = await this.getDynamicUsedBytes();
              if (used2 >= limitBytes) {
                toast('Хранилище переполнено', 'warning');
              } else {
                this.queue.add({ uid: u, url, quality: q, priority: PRIO.DYN, kind: 'dynamic' });
              }
            } else {
              this.queue.add({ uid: u, url, quality: q, priority: PRIO.DYN, kind: 'dynamic' });
            }
          }
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
    if (m?.type === 'dynamic') {
      DB.updateTrackMeta(u, { lastAccessedAt: now() });
      this.touchMRU(u).catch(() => {});
    }

    const b1 = await DB.getAudioBlob(u, q);
    if (b1) return { source: 'local', blob: b1, quality: q };

    const b2 = await DB.getAudioBlob(u, alt);
    if (b2) {
      // Spec 7.2: if requested is Lo and local Hi exists -> play Hi (upgrade).
      if (q === 'lo') return { source: 'local', blob: b2, quality: alt };

      // Requested is Hi but only Lo exists:
      // - R0/R1: do not degrade if network is available -> stream Hi (and may schedule recache)
      // - R2: streaming is allowed, but automatic recache on mismatch is NOT allowed (Q.6.2), only via CQ change / Re-cache / updates.
      if (isNet) {
        const url = getUrl(u, q);
        if (url) {
          if (this.getMode() !== 'R2') this._reCache(u, q);
          return { source: 'stream', url, quality: q };
        }
      }

      // Offline fallback: play any available local quality
      return { source: 'local', blob: b2, quality: alt };
    }

    if (isNet) { const url = getUrl(u, q); if (url) return { source: 'stream', url, quality: q }; }
    return { source: 'none' };
  }

  async enqueueAudioDownload(uid, { priority, kind } = {}) {
    const u = sUid(uid);
    if (!u) return;

    // Q.6: if blob exists on device -> never download again "just because"
    // (meta.cachedComplete may be stale after iOS cleanup/restarts/crashes)
    if (await DB.hasAudioForUid(u).catch(() => false)) return;

    const m = await DB.getTrackMeta(u);
    if (['pinned', 'cloud', 'dynamic'].includes(m?.type) || m?.cachedComplete) return;

    if (kind === 'playbackCache' && !(await hasSpace())) return;

    const q = this.getEffectiveQuality();
    const url = getUrl(u, q);

    if (kind === 'playbackCache' && m?.type !== 'playbackCache') {
      await DB.updateTrackMeta(u, { type: 'playbackCache', lastAccessedAt: now() });
    }

    if (url) {
      this.queue.add({ uid: u, url, quality: q, priority: priority || PRIO.UPD, kind });
    }
  }

  _reCache(uid, q, prio = PRIO.UPD) {
    if (W.playerCore?.getCurrentTrackUid?.() === uid) return; 
    const url = getUrl(uid, q);
    if (url) this.queue.add({ uid, url, quality: q, priority: prio, kind: 'reCache' });
  }

  async _onQualChg(newQ) {
    const q = normQ(newQ);
    this.queue.clearOldQualities(q);
    for (const [uid] of this.queue.act) this.queue.cancel(uid);
    
    const all = await DB.getAllTrackMetas();
    for (const m of all) {
      if (!['pinned', 'cloud', 'dynamic'].includes(m.type)) continue;
      if (m.cachedComplete && m.quality !== q) {
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
    return (await DB.getAllTrackMetas()).reduce((a, m) => {
      a[['pinned','cloud','playbackCache','dynamic'].includes(m.type) ? (m.type === 'playbackCache' ? 'transient' : m.type) : 'other'] += (m.size || 0);
      return a;
    }, { pinned: 0, cloud: 0, transient: 0, dynamic: 0, other: 0 });
  }

  getDownloadStatus() { return this.queue.getStatus(); }
  async getTrackMeta(uid) { return DB.getTrackMeta(uid); }
  async countNeedsReCache(q) { 
    if (this.getMode() === 'R2') return 0; 
    const all = await DB.getAllTrackMetas(); 
    return all.filter(m => ['pinned', 'cloud'].includes(m.type) && m.cachedComplete && m.quality !== normQ(q)).length; 
  }
  async reCacheAll(q) { this._onQualChg(q); }
  setCacheQualitySetting(q) { this.setCQ(q); }
  recordTickStats() {} getBackgroundPreset() { return 'balanced'; } setBackgroundPreset() {}
}

const instance = new OfflineManager();
export const getOfflineManager = () => instance;
export default instance;
