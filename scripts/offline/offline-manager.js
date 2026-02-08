/**
 * scripts/offline/offline-manager.js
 * OfflineManager v1.0 — compact, spec-first implementation.
 *
 * Spec sources:
 * - "Работа PlaybackCache.txt" (R0/R1, PlaybackCache window, Pinned/Cloud, unified qualityMode, no-duplicates)
 * - "Сетевая политика" (NetPolicy: allow/deny, airplane mode, wait instead of fail)
 *
 * HARD INVARIANTS:
 * - NEVER calls playerCore.stop()/play() and never seeks/changes volume.
 * - Does not mutate playing playlist.
 *
 * Public surface must stay compatible with current UI modules:
 * - getOfflineManager(), default export instance
 * - initialize(), getMode()/setMode(), getQuality()/setQuality()/setCacheQualitySetting()
 * - getCloudSettings(), confirmApplyCloudSettings()
 * - getTrackOfflineState(), togglePinned(), removeCached(), removeAllCached()
 * - enqueueAudioDownload() (used by playback-cache-bootstrap.js)
 * - queue facade: pause/resume/setParallel/getStatus()
 * - countNeedsReCache(), reCacheAll()
 * - getStorageBreakdown()
 * - getTrackMeta() (needed by track-resolver.js)
 */

import {
  openDB,
  setAudioBlob,
  getAudioBlob,
  deleteAudio,
  deleteAudioVariant,
  setTrackMeta,
  getTrackMeta,
  updateTrackMeta,
  getAllTrackMetas,
  hasAudioForUid,
  getStoredVariant,
  deleteTrackCache,
  estimateUsage
} from './cache-db.js';

const W = window;

const MB = 1024 * 1024;
const DAY = 86400000;

const LS = {
  quality: 'qualityMode:v1',
  mode: 'offline:mode:v1',
  cloudN: 'cloud:listenThreshold',
  cloudD: 'cloud:ttlDays'
};

const DEF = {
  N: 5,
  D: 31,
  MIN_FREE_MB: 60
};

const PRIO = {
  // Spec 10.2 (higher is more important)
  P0_CUR: 100,
  P1_NEIGHBOR: 90,
  P2_PINNED: 80,
  P3_CLOUD_UPDATE: 70,
  P4_CLOUD_FILL: 60
};

const now = () => Date.now();
const normQ = (q) => (String(q || '').toLowerCase() === 'lo' ? 'lo' : 'hi');
const safeUid = (uid) => (String(uid || '').trim() || null);

const emit = (name, detail) => {
  try { W.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
};

const toast = (msg, type = 'info', duration) => {
  W.NotificationSystem?.show?.(msg, type, duration);
};

const isNetAllowed = () => (W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine) === true;

const curUid = () => safeUid(W.playerCore?.getCurrentTrackUid?.());

const getCloudSettingsFromLS = () => {
  const N = Math.max(1, parseInt(localStorage.getItem(LS.cloudN) || String(DEF.N), 10) || DEF.N);
  const D = Math.max(1, parseInt(localStorage.getItem(LS.cloudD) || String(DEF.D), 10) || DEF.D);
  return { N, D };
};

const getTrackUrlByUid = (uid, quality) => {
  const t = W.TrackRegistry?.getTrackByUid?.(uid);
  if (!t) return null;
  const q = normQ(quality);
  return q === 'lo'
    ? (t.audio_low || t.audio || t.src || null)
    : (t.audio || t.src || null);
};

async function hasEnoughSpace60MB() {
  try {
    if (!navigator.storage?.estimate) return true;
    const est = await navigator.storage.estimate();
    const free = Math.max(0, (est.quota || 0) - (est.usage || 0));
    return free >= DEF.MIN_FREE_MB * MB;
  } catch {
    return true;
  }
}

/* ============================================================================
 * DownloadQueue (single queue, default 1 active; wait-on-policy; cancel-on-hysteria)
 * ========================================================================== */

class DownloadQueue {
  constructor() {
    this._queued = [];
    this._active = new Map(); // uid -> { ctrl, item }
    this._paused = false;
    this._parallel = 1;
    this._bound = false;
  }

  setParallel(n) {
    this._parallel = Math.max(1, Number(n) || 1);
    this._pump();
  }

  pause() {
    this._paused = true;
  }

  resume() {
    this._paused = false;
    this._pump();
  }

  getStatus() {
    return { active: this._active.size, queued: this._queued.length };
  }

  isBusy(uid) {
    const u = safeUid(uid);
    return !!u && this._active.has(u);
  }

  cancel(uid) {
    const u = safeUid(uid);
    if (!u) return;
    this._queued = this._queued.filter((x) => x.uid !== u);
    const a = this._active.get(u);
    if (a) {
      try { a.ctrl.abort(); } catch {}
      this._active.delete(u);
      emit('offline:stateChanged');
    }
    this._pump();
  }

  add(item) {
    const uid = safeUid(item?.uid);
    const url = String(item?.url || '').trim();
    const quality = normQ(item?.quality);
    const priority = Number(item?.priority || 0) || 0;
    const kind = String(item?.kind || '');

    if (!uid || !url) return;

    // If downloading same uid in different quality => cancel (anti-hysteria).
    const a = this._active.get(uid);
    if (a) {
      if (a.item.quality !== quality) this.cancel(uid);
      else return;
    }

    // Dedup queued: keep the newer/higher priority task (and always replace on quality change).
    const idx = this._queued.findIndex((x) => x.uid === uid);
    const wrapped = { uid, url, quality, priority, kind, ts: now() };

    if (idx >= 0) {
      const prev = this._queued[idx];
      const shouldReplace = prev.quality !== quality || priority > prev.priority;
      this._queued[idx] = shouldReplace ? wrapped : prev;
    } else {
      this._queued.push(wrapped);
    }

    this._pump();
  }

  _bindNetWake() {
    if (this._bound) return;
    this._bound = true;
    const wake = () => this._pump();
    W.addEventListener('netPolicy:changed', wake);
    W.addEventListener('online', wake);
  }

  _sort() {
    this._queued.sort((a, b) => (b.priority - a.priority) || (a.ts - b.ts));
  }

  _pump() {
    this._bindNetWake();
    if (this._paused) return;
    if (this._active.size >= this._parallel) return;
    if (!this._queued.length) return;

    // Spec: if policy blocks network — WAIT (no fail, no removing).
    if (!isNetAllowed()) return;

    this._sort();

    while (!this._paused && isNetAllowed() && this._active.size < this._parallel && this._queued.length) {
      const next = this._queued.shift();
      if (!next) break;
      this._run(next);
    }
  }

  async _run(item) {
    const ctrl = new AbortController();
    this._active.set(item.uid, { ctrl, item });
    emit('offline:downloadStart', { uid: item.uid, kind: item.kind });

    try {
      const res = await fetch(item.url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();

      // Save new variant first.
      await setAudioBlob(item.uid, item.quality, blob);

      // Update meta (do NOT change type here; type is managed by OfflineManager logic).
      await updateTrackMeta(item.uid, {
        uid: item.uid,
        quality: item.quality,
        size: blob.size,
        cachedComplete: true,
        needsReCache: false,
        needsUpdate: false,
        lastAccessedAt: now()
      });

      // Enforce no-duplicates only when it's safe: never delete opposite for CUR.
      if (curUid() !== item.uid) {
        const other = item.quality === 'hi' ? 'lo' : 'hi';
        await deleteAudioVariant(item.uid, other).catch(() => {});
      }

      emit('offline:trackCached', { uid: item.uid, kind: item.kind });
    } catch (e) {
      if (e?.name !== 'AbortError') {
        emit('offline:downloadFailed', { uid: item.uid, kind: item.kind, error: String(e?.message || e) });
      }
    } finally {
      this._active.delete(item.uid);
      emit('offline:stateChanged');
      this._pump();
    }
  }
}

/* ============================================================================
 * OfflineManager
 * ========================================================================== */

class OfflineManager {
  constructor() {
    this.queue = new DownloadQueue(); // UI expects .queue
    this.ready = false;

    // Protect-list for eviction-like operations (used by PlaybackCache protectWindow scenario)
    this.protectedUids = new Set();

    W._offlineManagerInstance = this;
    W.OfflineManager = this; // legacy global
  }

  async initialize() {
    if (this.ready) return;
    await openDB();

    // Startup strict check: if R1 saved but no guaranteed 60MB => fallback to R0.
    if (this.getMode() === 'R1' && !(await this.hasSpace())) {
      this.setMode('R0');
      toast('Недостаточно места, PlaybackCache отключён', 'warning');
    }

    // Startup TTL cleanup (cloud only).
    await this._cleanupExpiredCloud();

    W.addEventListener('quality:changed', (e) => {
      const q = normQ(e?.detail?.quality);
      this._onQualityChanged(q).catch(() => {});
    });

    // If policy changes to allow network again — just resume queue pump.
    W.addEventListener('netPolicy:changed', () => this.queue.resume());

    this.ready = true;
    emit('offline:ready');
  }

  /* --- required by track-resolver.js --- */
  async getTrackMeta(uid) {
    const u = safeUid(uid);
    return u ? getTrackMeta(u) : null;
  }

  /* --- Modes R0/R1 --- */

  getMode() {
    return localStorage.getItem(LS.mode) === 'R1' ? 'R1' : 'R0';
  }

  setMode(mode) {
    const m = mode === 'R1' ? 'R1' : 'R0';
    localStorage.setItem(LS.mode, m);
    emit('offline:uiChanged', { mode: m });
  }

  /* --- Unified Quality (qualityMode:v1) --- */

  getQuality() {
    return normQ(localStorage.getItem(LS.quality) || 'hi');
  }

  setQuality(q) {
    localStorage.setItem(LS.quality, normQ(q));
  }

  // UI compat
  setCacheQualitySetting(q) {
    this.setQuality(q);
  }

  /* --- Space --- */

  async hasSpace() {
    return hasEnoughSpace60MB();
  }

  // UI compat
  async isSpaceOk() {
    return this.hasSpace();
  }

  /* --- Cloud Settings --- */

  getCloudSettings() {
    return getCloudSettingsFromLS();
  }

  /* --- Offline indicator state --- */

  async getTrackOfflineState(uid) {
    const u = safeUid(uid);
    if (!u) return { status: 'none' };

    const meta = await getTrackMeta(u);
    const hasAny = await hasAudioForUid(u);
    const cachedComplete = !!(meta?.cachedComplete && hasAny);

    const status =
      meta?.type === 'pinned' ? 'pinned' :
      meta?.type === 'cloud' ? (cachedComplete ? 'cloud' : 'cloud_loading') :
      meta?.type === 'playbackCache' ? 'transient' :
      'none';

    const daysLeft = meta?.cloudExpiresAt
      ? Math.max(0, Math.ceil((meta.cloudExpiresAt - now()) / DAY))
      : 0;

    const qSel = this.getQuality();
    const stored = await getStoredVariant(u).catch(() => null);
    const needsReCache = !!meta?.needsReCache || (!!stored && stored !== qSel);

    return {
      status,
      downloading: this.queue.isBusy(u),
      cachedComplete,
      needsReCache,
      needsUpdate: !!meta?.needsUpdate,
      quality: meta?.quality || stored || null,
      daysLeft
    };
  }

  /* --- Pinned toggle --- */

  async togglePinned(uid) {
    const u = safeUid(uid);
    if (!u) return;

    const meta = (await getTrackMeta(u)) || { uid: u };
    const qSel = this.getQuality();
    const { D } = this.getCloudSettings();
    const t = now();

    // Unpin => becomes cloud immediately, TTL starts now (spec 5.6)
    if (meta.type === 'pinned') {
      await updateTrackMeta(u, {
        type: 'cloud',
        cloud: true,
        cloudOrigin: meta.cloudOrigin || 'unpin',
        pinnedAt: null,
        cloudAddedAt: t,
        cloudExpiresAt: t + D * DAY
      });
      toast(`Офлайн-закрепление снято. Трек доступен как облачный кэш на ${D} дней.`, 'info');
      emit('offline:stateChanged');
      return;
    }

    // Pin requires >= 60MB
    if (!(await this.hasSpace())) {
      toast('Недостаточно места на устройстве. Освободите память для офлайн-кэша.', 'warning');
      return;
    }

    // Mark pinned (do not delete file if already cloud)
    await updateTrackMeta(u, {
      type: 'pinned',
      cloud: false,
      pinnedAt: t,
      cloudExpiresAt: null
    });

    // If already have local file in selected quality -> done
    const stored = await getStoredVariant(u);
    if (stored === qSel) {
      toast('Трек закреплён офлайн 🔒', 'success');
      emit('offline:stateChanged');
      return;
    }

    // If file exists but wrong quality => mark needsReCache and enqueue silent replacement
    if (stored && stored !== qSel) {
      await updateTrackMeta(u, { needsReCache: true }).catch(() => {});
    }

    const url = getTrackUrlByUid(u, qSel);
    if (url) this.queue.add({ uid: u, url, quality: qSel, priority: PRIO.P2_PINNED, kind: 'pinned' });

    toast('Трек будет доступен офлайн. Начинаю скачивание…', 'info');
    emit('offline:stateChanged');
  }

  /* --- Cloud-menu delete (resets cloud stats only) --- */

  async removeCached(uid) {
    const u = safeUid(uid);
    if (!u) return;

    this.queue.cancel(u);
    await deleteAudio(u);

    // Spec 6.6: reset cloud stats, keep global stats untouched (stored in other module)
    await updateTrackMeta(u, {
      type: null,
      cloud: false,
      cachedComplete: false,
      quality: null,
      size: 0,

      cloudFullListenCount: 0,
      lastFullListenAt: null,
      cloudAddedAt: null,
      cloudExpiresAt: null,
      cloudOrigin: null,

      needsReCache: false,
      needsUpdate: false
    });

    emit('offline:stateChanged');
  }

  async removeAllCached() {
    const all = await getAllTrackMetas();
    const targets = all.filter((m) => m?.type === 'pinned' || m?.type === 'cloud');
    for (const m of targets) await this.removeCached(m.uid);
    emit('offline:stateChanged');
  }

  /* --- Cloud full listen tracking (cloud stats only) --- */

  async registerFullListen(uid, { duration, position } = {}) {
    const u = safeUid(uid);
    const dur = Number(duration) || 0;
    const pos = Number(position) || 0;
    if (!u || dur <= 0 || (pos / dur) < 0.9) return;

    const meta = (await getTrackMeta(u)) || { uid: u };
    const { N, D } = this.getCloudSettings();
    const t = now();

    const nextCount = (meta.cloudFullListenCount || 0) + 1;

    const upd = {
      cloudFullListenCount: nextCount,
      lastFullListenAt: t
    };

    // Extend TTL for existing cloud
    if (meta.type === 'cloud') {
      upd.cloudExpiresAt = t + D * DAY;
    }

    // Auto cloud add when threshold reached (spec 6.4)
    if (meta.type !== 'pinned' && meta.type !== 'cloud' && nextCount >= N) {
      if (await this.hasSpace()) {
        upd.type = 'cloud';
        upd.cloud = true;
        upd.cloudOrigin = 'auto';
        upd.cloudAddedAt = t;
        upd.cloudExpiresAt = t + D * DAY;

        // Queue download only if not already cached in any quality.
        if (!(await hasAudioForUid(u))) {
          const qSel = this.getQuality();
          const url = getTrackUrlByUid(u, qSel);
          if (url) this.queue.add({ uid: u, url, quality: qSel, priority: PRIO.P4_CLOUD_FILL, kind: 'cloud' });
          toast(`Трек добавлен в офлайн на ${D} дней.`, 'info');
        }
      }
    }

    await updateTrackMeta(u, upd);
    emit('offline:stateChanged');
  }

  async _cleanupExpiredCloud() {
    const metas = await getAllTrackMetas();
    const t = now();

    for (const m of metas) {
      if (m?.type !== 'cloud') continue;
      if (!m.cloudExpiresAt) continue;
      if (m.cloudExpiresAt >= t) continue;

      await this.removeCached(m.uid);
      toast('Офлайн-доступ истёк. Трек удалён из кэша.', 'warning');
    }
  }

  /* --- Track source resolving (spec 7.2) --- */

  async resolveTrackSource(uid, reqQuality) {
    const u = safeUid(uid);
    if (!u) return { source: 'none' };

    const qSel = normQ(reqQuality || this.getQuality());
    const alt = qSel === 'hi' ? 'lo' : 'hi';
    const netOk = isNetAllowed();

    // 1) local in selected quality
    const b1 = await getAudioBlob(u, qSel);
    if (b1) return { source: 'local', blob: b1, quality: qSel };

    // 2) local in other quality
    const b2 = await getAudioBlob(u, alt);
    if (b2) {
      // If selected Lo but have Hi => upgrade allowed
      if (qSel === 'lo') {
        await updateTrackMeta(u, { needsReCache: true }).catch(() => {});
        return { source: 'local', blob: b2, quality: alt };
      }

      // Selected Hi but only Lo exists:
      if (netOk) {
        const url = getTrackUrlByUid(u, qSel);
        if (url) {
          await updateTrackMeta(u, { needsReCache: true }).catch(() => {});
          this._enqueueReCacheIfNotCur(u, qSel, PRIO.P3_CLOUD_UPDATE);
          return { source: 'stream', url, quality: qSel };
        }
      }

      // No net => fallback to lo
      return { source: 'local', blob: b2, quality: alt };
    }

    // 3) network stream
    if (netOk) {
      const url = getTrackUrlByUid(u, qSel);
      if (url) return { source: 'stream', url, quality: qSel };
    }

    return { source: 'none' };
  }

  _enqueueReCacheIfNotCur(uid, quality, priority) {
    if (curUid() === uid) return;
    const url = getTrackUrlByUid(uid, quality);
    if (!url) return;
    this.queue.add({ uid, url, quality: normQ(quality), priority: Number(priority || 0), kind: 'reCache' });
  }

  /* --- PlaybackCache (R1) enqueue hook --- */

  async enqueueAudioDownload(uid, { priority, kind } = {}) {
    const u = safeUid(uid);
    if (!u) return;

    const qSel = this.getQuality();
    const url = getTrackUrlByUid(u, qSel);
    if (!url) return;

    if (String(kind || '') === 'playbackCache') {
      // Spec: never duplicate pinned/cloud, and never duplicate any already local file.
      const meta = await getTrackMeta(u);
      if (meta?.type === 'pinned' || meta?.type === 'cloud' || (await hasAudioForUid(u))) return;

      // Soft space check during runtime: if no space => do not disable R1, just pause prefetch
      if (!(await this.hasSpace())) {
        toast('Мало места, предзагрузка приостановлена.', 'warning');
        return;
      }

      // Ensure meta type playbackCache
      if (!meta) await setTrackMeta(u, { uid: u, type: 'playbackCache', createdAt: now(), lastAccessedAt: now() });
      else if (meta.type !== 'playbackCache') await updateTrackMeta(u, { type: 'playbackCache', lastAccessedAt: now() });
    }

    this.queue.add({
      uid: u,
      url,
      quality: qSel,
      priority: Number(priority || PRIO.P3_CLOUD_UPDATE),
      kind: String(kind || '')
    });
  }

  setProtectedUids(uids) {
    this.protectedUids = new Set(Array.isArray(uids) ? uids.map(safeUid).filter(Boolean) : []);
  }

  /* --- Quality change handling (spec 4.3/4.4) --- */

  async _onQualityChanged(newQ) {
    const qSel = normQ(newQ);

    // Cancel all active downloads: simplest anti-hysteria baseline.
    // Queue dedup + new tasks will re-fill correctly.
    for (const [uid] of this.queue._active) this.queue.cancel(uid);

    const all = await getAllTrackMetas();
    const cur = curUid();

    let affected = 0;

    for (const m of all) {
      if (m?.type !== 'pinned' && m?.type !== 'cloud') continue;

      const stored = await getStoredVariant(m.uid).catch(() => null);
      const actual = stored || m.quality || null;

      if (actual && actual !== qSel) {
        await updateTrackMeta(m.uid, { needsReCache: true }).catch(() => {});
        if (m.uid !== cur) {
          const pr = m.type === 'pinned' ? PRIO.P2_PINNED : PRIO.P3_CLOUD_UPDATE;
          this._enqueueReCacheIfNotCur(m.uid, qSel, pr);
        }
        affected++;
      } else if (m?.needsReCache) {
        await updateTrackMeta(m.uid, { needsReCache: false }).catch(() => {});
      }
    }

    emit('offline:reCacheStatus', { count: affected });
    emit('offline:stateChanged');
    emit('offline:uiChanged');
  }

  /* --- UI helpers --- */

  getDownloadStatus() {
    return this.queue.getStatus();
  }

  async countNeedsReCache(targetQuality) {
    const qSel = normQ(targetQuality);
    const all = await getAllTrackMetas();

    let cnt = 0;
    for (const m of all) {
      if (m?.type !== 'pinned' && m?.type !== 'cloud') continue;
      const stored = await getStoredVariant(m.uid).catch(() => null);
      const actual = stored || m.quality || null;
      if (actual && actual !== qSel) cnt++;
    }
    return cnt;
  }

  async reCacheAll(targetQuality) {
    const qSel = normQ(targetQuality);
    const all = await getAllTrackMetas();
    const cur = curUid();

    let enq = 0;
    for (const m of all) {
      if (m?.type !== 'pinned' && m?.type !== 'cloud') continue;
      const stored = await getStoredVariant(m.uid).catch(() => null);
      const actual = stored || m.quality || null;
      if (!actual || actual === qSel) continue;
      if (m.uid === cur) continue;

      const pr = m.type === 'pinned' ? PRIO.P2_PINNED : PRIO.P3_CLOUD_UPDATE;
      this._enqueueReCacheIfNotCur(m.uid, qSel, pr);
      enq++;
    }
    return enq;
  }

  async confirmApplyCloudSettings({ newN, newD } = {}) {
    const N = Math.max(1, parseInt(String(newN || DEF.N), 10) || DEF.N);
    const D = Math.max(1, parseInt(String(newD || DEF.D), 10) || DEF.D);

    localStorage.setItem(LS.cloudN, String(N));
    localStorage.setItem(LS.cloudD, String(D));

    const all = await getAllTrackMetas();
    const t = now();
    let removed = 0;

    for (const m of all) {
      if (m?.type !== 'cloud') continue;

      // N increased: remove auto-cloud that no longer qualifies
      if (m.cloudOrigin === 'auto' && (m.cloudFullListenCount || 0) < N) {
        await this.removeCached(m.uid);
        removed++;
        continue;
      }

      // D change: recalc expiry = lastFullListenAt + D days
      if (m.lastFullListenAt) {
        const exp = m.lastFullListenAt + D * DAY;
        if (exp < t) {
          await this.removeCached(m.uid);
          removed++;
        } else {
          await updateTrackMeta(m.uid, { cloudExpiresAt: exp }).catch(() => {});
        }
      }
    }

    emit('offline:uiChanged');
    return removed;
  }

  async getStorageBreakdown() {
    const metas = await getAllTrackMetas();
    const out = { pinned: 0, cloud: 0, transient: 0, other: 0 };

    for (const m of metas) {
      const sz = Number(m?.size || 0) || 0;
      if (m?.type === 'pinned') out.pinned += sz;
      else if (m?.type === 'cloud') out.cloud += sz;
      else if (m?.type === 'playbackCache') out.transient += sz;
      else out.other += sz;
    }
    return out;
  }

  async estimateUsage() {
    return estimateUsage();
  }

  // UI stubs (kept to avoid regressions)
  getBackgroundPreset() { return 'balanced'; }
  setBackgroundPreset() {}

  // Legacy no-op (PlayerCore references it via optional chaining)
  recordTickStats() {}
}

const instance = new OfflineManager();

export function getOfflineManager() {
  return instance;
}

export default instance;
