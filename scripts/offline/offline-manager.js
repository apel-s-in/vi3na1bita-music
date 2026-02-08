/**
 * scripts/offline/offline-manager.js
 * Central Offline Logic (v1.0 Final) - R0/R1, Pinned/Cloud, NetworkPolicy
 * Highly Optimized & Compact
 */

import {
  openDB, setAudioBlob, getAudioBlob, deleteAudioVariant, deleteAudio,
  setTrackMeta, getTrackMeta, updateTrackMeta, getAllTrackMetas,
  hasAudioForUid, getStoredVariant, deleteTrackCache
} from './cache-db.js';

const WIN = window;
const LS = localStorage;
const MB = 1024 * 1024;
const DAY_MS = 86400000;

// Config Keys & Defaults
const K = {
  Q: 'qualityMode:v1',
  MODE: 'offline:mode:v1',
  N: 'cloud:listenThreshold',
  D: 'cloud:ttlDays'
};
const DEF = { N: 5, D: 31, MIN_MB: 60 };

// Download Priorities
const PRIO = { CUR: 100, NEIGHBOR: 90, PIN: 80, UPD: 70, CLOUD: 60 };

// Events
const emit = (n, d) => WIN.dispatchEvent(new CustomEvent(n, { detail: d }));
const toast = (m, t='info') => WIN.NotificationSystem?.show?.(m, t);

// Helpers
const normQ = (v) => (String(v||'').toLowerCase() === 'lo' ? 'lo' : 'hi');
const getUrl = (u, q) => {
  const t = WIN.TrackRegistry?.getTrackByUid?.(u);
  if (!t) return null;
  return normQ(q) === 'lo' ? (t.audio_low || t.audio || t.src) : (t.audio || t.src);
};
const netOk = () => WIN.NetPolicy ? WIN.NetPolicy.isNetworkAllowed() : navigator.onLine;

/* ═══════ COMPACT DOWNLOAD QUEUE ═══════ */
class SimpleQueue {
  constructor() {
    this.q = [];
    this.active = new Map(); // uid -> {ctrl, item}
    this.paused = false;
    this.limit = 1;
  }

  add(item) { // item: {uid, url, quality, kind, prio}
    const { uid, quality, priority } = item;
    if (this.active.has(uid)) {
      if (this.active.get(uid).item.quality !== quality) this.cancel(uid); // Anti-hysteria
      else return; // Already downloading same quality
    }
    // Dedup in queue
    const idx = this.q.findIndex(i => i.uid === uid);
    if (idx > -1) {
      if (this.q[idx].quality !== quality) this.q.splice(idx, 1); // Replace
      else if (priority > this.q[idx].prio) { this.q[idx].prio = priority; this._sort(); } // Bump prio
      else return;
    }
    this.q.push({ ...item, added: Date.now() });
    this._sort();
    this._run();
  }

  cancel(uid) {
    this.q = this.q.filter(i => i.uid !== uid);
    const act = this.active.get(uid);
    if (act) { act.ctrl.abort(); this.active.delete(uid); }
    this._run();
  }

  pause(v=true) { this.paused = v; if(!v) this._run(); }
  setParallel(n) { this.limit = n; this._run(); }
  
  getStatus() { return { active: this.active.size, queued: this.q.length }; }
  isBusy(uid) { return this.active.has(uid); }

  _sort() { this.q.sort((a,b) => (b.prio - a.prio) || (a.added - b.added)); }

  async _run() {
    if (this.paused || this.active.size >= this.limit || !this.q.length || !netOk()) return;
    const item = this.q.shift();
    const ctrl = new AbortController();
    this.active.set(item.uid, { ctrl, item });
    emit('offline:downloadStart', { uid: item.uid });

    try {
      // 1. Fetch
      const res = await fetch(item.url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();

      // 2. Space Check (Soft)
      if (WIN.OfflineManager && !(await WIN.OfflineManager.hasSpace())) throw new Error('DiskFull');

      // 3. Save Blob & Meta
      await setAudioBlob(item.uid, item.quality, blob);
      await updateTrackMeta(item.uid, {
        quality: item.quality, size: blob.size, url: item.url,
        cachedComplete: true, needsReCache: false, needsUpdate: false
      });

      // 4. Two-Phase Replacement: Delete other quality variant (never delete current playing if same)
      const curUid = WIN.playerCore?.getCurrentTrackUid?.();
      if (curUid !== item.uid) {
        await deleteAudioVariant(item.uid, item.quality === 'hi' ? 'lo' : 'hi').catch(()=>{});
      }

      emit('offline:trackCached', { uid: item.uid });
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn(`[DL] ${item.uid} failed:`, e);
        emit('offline:downloadFailed', { uid: item.uid });
        if (e.message === 'DiskFull') toast('Мало места, загрузка остановлена', 'warning');
      }
      // Clean up partials if needed, though SetAudioBlob is atomic-ish in IDB
    } finally {
      this.active.delete(item.uid);
      emit('offline:stateChanged');
      this._run();
    }
  }
}

/* ═══════ MANAGER CLASS ═══════ */
class OfflineManager {
  constructor() {
    this.q = new SimpleQueue();
    this.ready = false;
    this.protected = new Set();
    WIN._offlineManagerInstance = this; // Legacy hook for PlayerUI
  }

  async initialize() {
    if (this.ready) return;
    await openDB();
    
    // Listeners
    WIN.addEventListener('netPolicy:changed', () => this.q.pause(false));
    WIN.addEventListener('quality:changed', (e) => this._onQualChg(e.detail?.quality));
    
    // Startup Tasks
    this._cleanExpired();
    if (this.getMode() === 'R1' && !(await this.hasSpace())) {
      this.setMode('R0');
      toast('Мало места, PlaybackCache отключён', 'warning');
    }

    this.ready = true;
    emit('offline:ready');
  }

  /* --- API: State & Info --- */
  getMode() { return LS.getItem(K.MODE) || 'R0'; }
  setMode(m) { LS.setItem(K.MODE, m === 'R1' ? 'R1' : 'R0'); emit('offline:uiChanged'); }
  
  getQuality() { return normQ(LS.getItem(K.Q)); }
  setQuality(v) { LS.setItem(K.Q, normQ(v)); } // Setter only, event driven by PlayerCore

  getCloudSettings() {
    return { N: parseInt(LS.getItem(K.N)||DEF.N), D: parseInt(LS.getItem(K.D)||DEF.D) };
  }

  getDownloadStatus() { return this.q.getStatus(); }

  async hasSpace() {
    try {
      const est = await navigator.storage?.estimate?.();
      return !est || ((est.quota||0) - (est.usage||0)) >= (DEF.MIN_MB * MB);
    } catch { return true; }
  }

  async getTrackOfflineState(uid) {
    if (!uid) return { status: 'none' };
    const m = await getTrackMeta(uid);
    const has = await hasAudioForUid(uid);
    const q = this.getQuality();
    
    let st = 'none';
    if (m?.type === 'pinned') st = 'pinned';
    else if (m?.type === 'cloud') st = (has && m.cachedComplete) ? 'cloud' : 'cloud_loading';
    else if (m?.type === 'playbackCache') st = 'transient';

    return {
      status: st,
      downloading: this.q.isBusy(uid),
      cachedComplete: has && !!m?.cachedComplete,
      needsReCache: !!m?.needsReCache || (has && m?.quality && m.quality !== q),
      needsUpdate: !!m?.needsUpdate,
      quality: m?.quality,
      daysLeft: m?.cloudExpiresAt ? Math.ceil((m.cloudExpiresAt - Date.now()) / DAY_MS) : 0
    };
  }

  /* --- API: Actions --- */
  
  // ТЗ 5.5 / 5.6 / 6.5
  async togglePinned(uid) {
    const m = (await getTrackMeta(uid)) || { uid };
    const q = this.getQuality();
    const now = Date.now();
    const { D } = this.getCloudSettings();

    if (m.type === 'pinned') {
      // Unpin -> Cloud immediately
      await updateTrackMeta(uid, { type: 'cloud', cloudOrigin: 'unpin', pinnedAt: null, cloudAddedAt: now, cloudExpiresAt: now + (D * DAY_MS) });
      toast(`Закрепление снято. Доступно в облаке ${D} дн.`);
    } else {
      // Pin / Upgrade
      if (!(await this.hasSpace())) return toast('Нет места для закрепления', 'warning');
      
      await updateTrackMeta(uid, { type: 'pinned', pinnedAt: now, quality: q, cloudExpiresAt: null });
      
      // Check if we need to download
      const hasQ = await getStoredVariant(uid);
      if (!hasQ || hasQ !== q) {
        if (hasQ && hasQ !== q) await updateTrackMeta(uid, { needsReCache: true });
        this._enqueue(uid, q, 'pinned', PRIO.PIN);
        toast(hasQ ? 'Трек закреплён 🔒' : 'Начинаю скачивание...');
      } else {
        toast('Трек закреплён 🔒');
      }
    }
    emit('offline:stateChanged');
  }

  // ТЗ 6.6
  async removeCached(uid) {
    this.q.cancel(uid);
    await deleteAudio(uid); // delete blob
    // Reset meta completely (Global Stats preserved in global-stats.js)
    await deleteTrackMeta(uid); 
    emit('offline:stateChanged');
  }

  async removeAllCached() {
    const all = await getAllTrackMetas();
    for (const m of all) if (m.type === 'pinned' || m.type === 'cloud') await this.removeCached(m.uid);
    toast('Все офлайн-треки удалены');
  }

  // ТЗ 6.3 - 6.4: Cloud Logic
  async registerFullListen(uid, { duration, position }) {
    if (!duration || (position / duration) < 0.9) return; // Strict 90%
    const m = (await getTrackMeta(uid)) || { uid };
    const { N, D } = this.getCloudSettings();
    const now = Date.now();
    
    const count = (m.cloudFullListenCount || 0) + 1;
    const upd = { cloudFullListenCount: count, lastFullListenAt: now };

    if (m.type === 'cloud') upd.cloudExpiresAt = now + (D * DAY_MS); // Extend TTL

    // Auto-cloud
    if (m.type !== 'pinned' && m.type !== 'cloud' && count >= N) {
      if (await this.hasSpace()) {
        upd.type = 'cloud'; upd.cloudOrigin = 'auto'; upd.cloudAddedAt = now;
        upd.cloudExpiresAt = now + (D * DAY_MS); upd.quality = this.getQuality();
        if (!(await hasAudioForUid(uid))) {
          this._enqueue(uid, upd.quality, 'cloud', PRIO.CLOUD);
          toast(`Трек добавлен в офлайн на ${D} дн.`);
        }
      }
    }
    await updateTrackMeta(uid, upd);
    emit('offline:stateChanged');
  }

  /* --- API: Playback Resolution (ТЗ 7.2) --- */
  async resolveTrackSource(uid, reqQ) {
    const u = String(uid||'').trim();
    if (!u) return { source: 'none' };
    
    const q = normQ(reqQ || this.getQuality());
    const altQ = q === 'hi' ? 'lo' : 'hi';
    const isNet = netOk();

    // 1. Local Current
    const blob = await getAudioBlob(u, q);
    if (blob) return { source: 'local', blob, quality: q };

    // 2. Local Alternate
    const altBlob = await getAudioBlob(u, altQ);
    if (altBlob) {
      // Upgrade available? (User wants Lo, has Hi)
      if (q === 'lo') {
        await updateTrackMeta(u, { needsReCache: true }); // Mark for possible downgrade later if space allows
        return { source: 'local', blob: altBlob, quality: altQ }; 
      }
      // Downgrade needed? (User wants Hi, has Lo)
      if (isNet) {
        // Stream Hi, queue silent background upgrade
        const url = getUrl(u, q);
        if (url) {
          await updateTrackMeta(u, { needsReCache: true });
          this._enqueue(u, q, 'reCache', PRIO.UPD);
          return { source: 'stream', url, quality: q };
        }
      }
      // No net -> Fallback to what we have
      return { source: 'local', blob: altBlob, quality: altQ };
    }

    // 3. Network
    if (isNet) {
      const url = getUrl(u, q);
      if (url) return { source: 'stream', url, quality: q };
    }

    // 4. Fallback (Fail)
    return { source: 'none' };
  }

  // R1 Logic Hooks
  async enqueueAudioDownload(uid, { priority, kind }) {
    if (kind === 'playbackCache') {
      const m = await getTrackMeta(uid);
      if (m?.type === 'pinned' || m?.type === 'cloud' || await hasAudioForUid(uid)) return; // Already have
      if (!(await this.hasSpace())) {
        // Try evict oldest transient
        if (!(await this._evictTransient())) return toast('Мало места, предзагрузка пауза', 'warning');
      }
      // Register transient meta
      if (!m) await setTrackMeta(uid, { uid, type: 'playbackCache', createdAt: Date.now() });
    }
    this._enqueue(uid, this.getQuality(), kind, priority);
  }

  setProtectedUids(uids) { this.protected = new Set(uids || []); }

  /* --- INTERNAL --- */
  _enqueue(uid, q, kind, prio) {
    const url = getUrl(uid, q);
    if (url) this.q.add({ uid, url, quality: q, kind, priority: prio });
  }

  // ТЗ 4.4: Quality Change Orchestration
  async _onQualChg(nq) {
    const q = normQ(nq);
    const all = await getAllTrackMetas();
    const curUid = WIN.playerCore?.getCurrentTrackUid?.();
    let cnt = 0;

    // 1. Cancel wrong-quality downloads
    for (const m of all) if (this.q.isBusy(m.uid)) this.q.cancel(m.uid);

    // 2. Mark & Queue
    const targets = all.filter(m => (m.type === 'pinned' || m.type === 'cloud'));
    for (const m of targets) {
      if (m.quality && m.quality !== q) {
        await updateTrackMeta(m.uid, { needsReCache: true });
        // Don't re-download current playing track immediately (skip hysteria)
        if (m.uid !== curUid) {
          this._enqueue(m.uid, q, 'reCache', m.type === 'pinned' ? PRIO.PIN : PRIO.UPD);
        }
        cnt++;
      } else if (m.needsReCache) {
        await updateTrackMeta(m.uid, { needsReCache: false });
      }
    }
    emit('offline:stateChanged');
    emit('offline:reCacheStatus', { count: cnt });
  }

  async _cleanExpired() {
    const all = await getAllTrackMetas();
    const now = Date.now();
    for (const m of all) {
      if (m.type === 'cloud' && m.cloudExpiresAt && m.cloudExpiresAt < now) {
        await this.removeCached(m.uid);
        toast(`Срок истёк. Трек удалён: ${m.uid}`);
      }
    }
  }

  async _evictTransient() {
    const all = await getAllTrackMetas();
    const trans = all.filter(m => m.type === 'playbackCache' && !this.protected.has(m.uid))
                     .sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
    if (!trans.length) return false;
    await deleteTrackCache(trans[0].uid);
    return true;
  }

  // UI Helpers for Modal
  async countNeedsReCache(tq) {
    const q = normQ(tq);
    const all = await getAllTrackMetas();
    return all.filter(m => (m.type === 'pinned' || m.type === 'cloud') && m.quality !== q).length;
  }
  
  async reCacheAll(tq) {
    const q = normQ(tq);
    this.q.setParallel(3);
    const all = await getAllTrackMetas();
    let c = 0;
    for (const m of all) {
      if ((m.type === 'pinned' || m.type === 'cloud') && m.quality !== q) {
        this._enqueue(m.uid, q, 'reCache', m.type === 'pinned' ? PRIO.PIN : PRIO.UPD);
        c++;
      }
    }
    return c;
  }

  // Settings Apply (N/D)
  async confirmApplyCloudSettings({ newN, newD }) {
    LS.setItem(K.N, newN); LS.setItem(K.D, newD);
    const all = await getAllTrackMetas();
    const now = Date.now();
    let rm = 0;
    for (const m of all) {
      if (m.type !== 'cloud') continue;
      // Recalc TTL or Remove
      if (m.cloudOrigin === 'auto' && (m.cloudFullListenCount||0) < newN) { await this.removeCached(m.uid); rm++; continue; }
      if (m.lastFullListenAt) {
        const exp = m.lastFullListenAt + (newD * DAY_MS);
        if (exp < now) { await this.removeCached(m.uid); rm++; }
        else await updateTrackMeta(m.uid, { cloudExpiresAt: exp });
      }
    }
    return rm;
  }
  
  // Storage Stats
  async getStorageBreakdown() {
    const all = await getAllTrackMetas();
    const b = { pinned:0, cloud:0, transient:0, other:0 };
    for(const m of all) {
        const sz = m.size||0;
        if(m.type==='pinned') b.pinned+=sz;
        else if(m.type==='cloud') b.cloud+=sz;
        else if(m.type==='playbackCache') b.transient+=sz;
        else b.other+=sz;
    }
    return b;
  }
  
  // Legacy stubs (safe to remove logic, keep methods for call safety)
  async checkForUpdates() { return 0; } 
  async updateAll() { return 0; }
}

const instance = new OfflineManager();
WIN.OfflineManager = instance;
export function getOfflineManager() { return instance; }
export default instance;
