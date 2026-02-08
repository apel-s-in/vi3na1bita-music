/**
 * scripts/offline/offline-manager.js
 * OfflineManager v1.0 (PlaybackCache R0/R1 + Pinned/Cloud + NetPolicy) — compact rewrite.
 *
 * Goals:
 * - 100% соответствие "Работа PlaybackCache.txt" (v1.0) + "Сетевая политика".
 * - NO STOP / NO forced PLAY: этот модуль не имеет права останавливать/запускать плеер.
 * - Единое качество: localStorage['qualityMode:v1'] ('hi'|'lo').
 * - R0/R1: localStorage['offline:mode:v1'] ('R0'|'R1').
 * - Pinned/Cloud/Transient (playbackCache) метаданные в IndexedDB (cache-db.js).
 * - Единая очередь загрузок:
 *   - default concurrency: 1
 *   - Re-cache boost: 2-3 (делает UI), но P0/P1 выше по приоритету (упрощённо приоритетами).
 * - NetPolicy: если сеть запрещена — задачи ЖДУТ, а не падают.
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
  deleteTrackMeta,
  estimateUsage
} from './cache-db.js';

const W = window;

const MB = 1024 * 1024;
const DAY_MS = 86400000;

const KEYS = {
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

// Priorities (spec 10.2). Bigger = higher.
const PRIO = {
  P0_CUR: 100,
  P1_NEIGHBOR: 90,
  P2_PINNED: 80,
  P3_UPDATE_CLOUD: 70,
  P4_CLOUD_FILL: 60,
  P5_ASSET: 50
};

const emit = (name, detail) => {
  try { W.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
};

const toast = (msg, type = 'info', duration) => {
  W.NotificationSystem?.show?.(msg, type, duration);
};

const normQ = (q) => (String(q || '').toLowerCase() === 'lo' ? 'lo' : 'hi');

const now = () => Date.now();

const netAllowed = () => (W.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine) === true;

const getTrackUrlByUid = (uid, quality) => {
  const t = W.TrackRegistry?.getTrackByUid?.(uid);
  if (!t) return null;
  const q = normQ(quality);
  return q === 'lo' ? (t.audio_low || t.audio || t.src) : (t.audio || t.src);
};

const safeUid = (uid) => String(uid || '').trim() || null;

async function hasEnoughSpaceStrict() {
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
 * DownloadQueue — одна очередь для всего аудио
 * - Дедуп по uid
 * - Anti-hysteria: если качество поменялось, активная загрузка uid отменяется
 * - NetPolicy WAIT: если сеть запрещена — держим задачу в очереди и ждём событий
 * ========================================================================== */

class DownloadQueue {
  constructor() {
    this.items = [];
    this.active = new Map(); // uid -> { ctrl, item }
    this.paused = false;
    this.parallel = 1;
    this._netWaitBound = false;
  }

  setParallel(n) {
    this.parallel = Math.max(1, Number(n) || 1);
    this._process();
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this._process();
  }

  getStatus() {
    return { active: this.active.size, queued: this.items.length };
  }

  isBusy(uid) {
    return this.active.has(uid);
  }

  cancel(uid) {
    const u = safeUid(uid);
    if (!u) return;
    this.items = this.items.filter((x) => x.uid !== u);
    const act = this.active.get(u);
    if (act) {
      try { act.ctrl.abort(); } catch {}
      this.active.delete(u);
      emit('offline:stateChanged');
    }
    this._process();
  }

  /**
   * @param {{uid:string, url:string, quality:'hi'|'lo', priority:number, kind?:string}} item
   */
  add(item) {
    const uid = safeUid(item?.uid);
    const url = String(item?.url || '').trim();
    const quality = normQ(item?.quality);
    const priority = Number(item?.priority || 0) || 0;
    const kind = String(item?.kind || '');

    if (!uid || !url) return;

    // If currently downloading same uid:
    const act = this.active.get(uid);
    if (act) {
      // if different quality => cancel in-flight (anti-hysteria)
      if (act.item.quality !== quality) this.cancel(uid);
      else return;
    }

    // Dedup in queue: keep the best task (priority, freshness)
    const idx = this.items.findIndex((x) => x.uid === uid);
    const wrapped = { uid, url, quality, priority, kind, addedAt: now() };

    if (idx >= 0) {
      const old = this.items[idx];
      if (old.quality !== quality) this.items[idx] = wrapped;
      else if (priority > old.priority) this.items[idx] = { ...old, priority, addedAt: now() };
    } else {
      this.items.push(wrapped);
    }

    this._process();
  }

  _ensureNetWait() {
    if (this._netWaitBound) return;
    this._netWaitBound = true;

    const kick = () => this._process();
    W.addEventListener('netPolicy:changed', kick);
    W.addEventListener('online', kick);
  }

  _sort() {
    this.items.sort((a, b) => (b.priority - a.priority) || (a.addedAt - b.addedAt));
  }

  _process() {
    this._ensureNetWait();
    if (this.paused) return;
    if (this.active.size >= this.parallel) return;
    if (!this.items.length) return;

    // If network is blocked, do nothing (WAIT, not fail)
    if (!netAllowed()) return;

    this._sort();

    while (this.active.size < this.parallel && this.items.length && netAllowed() && !this.paused) {
      const next = this.items.shift();
      if (!next) break;
      this._run(next);
    }
  }

  async _run(item) {
    const ctrl = new AbortController();
    this.active.set(item.uid, { ctrl, item });
    emit('offline:downloadStart', { uid: item.uid, kind: item.kind });

    try {
      const res = await fetch(item.url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();

      // 1) Save new variant first (two-phase rule is enforced by caller when deleting old variant)
      await setAudioBlob(item.uid, item.quality, blob);

      // 2) Update meta basic fields (do NOT mutate type here)
      await updateTrackMeta(item.uid, {
        uid: item.uid,
        quality: item.quality,
        size: blob.size,
        url: item.url,
        cachedComplete: true,
        needsReCache: false,
        needsUpdate: false,
        lastAccessedAt: now()
      });

      // 3) Delete opposite variant if safe (CUR never replaced on the fly)
      const curUid = W.playerCore?.getCurrentTrackUid?.();
      if (safeUid(curUid) !== item.uid) {
        await deleteAudioVariant(item.uid, item.quality === 'hi' ? 'lo' : 'hi').catch(() => {});
      }

      emit('offline:trackCached', { uid: item.uid, kind: item.kind });
    } catch (e) {
      if (e?.name !== 'AbortError') {
        // Important: do NOT toast spam here. Only critical "disk full" or generic failure in UI overlay.
        emit('offline:downloadFailed', { uid: item.uid, kind: item.kind, error: String(e?.message || e) });
      }
    } finally {
      this.active.delete(item.uid);
      emit('offline:stateChanged');
      this._process();
    }
  }
}

/* ============================================================================
 * OfflineManager
 * ========================================================================== */

class OfflineManager {
  constructor() {
    this.q = new DownloadQueue();
    // UI in offline-modal.js currently tries to use `om.queue` (legacy)
    this.queue = this.q;

    this.ready = false;
    this.protectedUids = new Set();

    W._offlineManagerInstance = this;
    W.OfflineManager = this;
  }

  async initialize() {
    if (this.ready) return;
    await openDB();

    // Startup: validate R1 availability (strict)
    if (this.getMode() === 'R1' && !(await this.hasSpace())) {
      this.setMode('R0');
      toast('Недостаточно места, PlaybackCache отключён', 'warning');
    }

    // Startup: remove expired cloud
    await this._cleanExpiredCloudOnStart();

    // Events
    W.addEventListener('quality:changed', (e) => {
      const q = normQ(e?.detail?.quality);
      this._onQualityChanged(q).catch(() => {});
    });

    // If NetPolicy toggled to allowed: just kick queue
    W.addEventListener('netPolicy:changed', () => this.q.resume());

    this.ready = true;
    emit('offline:ready');
  }

  /* --- Modes --- */

  getMode() {
    return localStorage.getItem(KEYS.mode) === 'R1' ? 'R1' : 'R0';
  }

  setMode(mode) {
    const m = mode === 'R1' ? 'R1' : 'R0';
    localStorage.setItem(KEYS.mode, m);
    emit('offline:uiChanged', { mode: m });
  }

  /* --- Quality (single qualityMode:v1) --- */

  getQuality() {
    return normQ(localStorage.getItem(KEYS.quality) || 'hi');
  }

  // IMPORTANT: by spec setting quality should also emit quality:changed elsewhere (PlayerCore does).
  // We keep it as a pure setter for UI compat.
  setQuality(q) {
    localStorage.setItem(KEYS.quality, normQ(q));
  }

  // UI compat (offline-modal.js uses setCacheQualitySetting)
  setCacheQualitySetting(q) {
    this.setQuality(q);
  }

  /* --- Space --- */

  async hasSpace() {
    return hasEnoughSpaceStrict();
  }

  async isSpaceOk() {
    return this.hasSpace();
  }

  /* --- Cloud settings N/D --- */

  getCloudSettings() {
    const N = Math.max(1, parseInt(localStorage.getItem(KEYS.cloudN) || String(DEF.N), 10) || DEF.N);
    const D = Math.max(1, parseInt(localStorage.getItem(KEYS.cloudD) || String(DEF.D), 10) || DEF.D);
    return { N, D };
  }

  /* --- Public: state for indicator --- */

  async getTrackOfflineState(uid) {
    const u = safeUid(uid);
    if (!u) return { status: 'none' };

    const meta = await getTrackMeta(u);
    const has = await hasAudioForUid(u);
    const qSel = this.getQuality();

    const type = meta?.type || null;
    const cachedComplete = !!(meta?.cachedComplete && has);

    let status = 'none';
    if (type === 'pinned') status = 'pinned';
    else if (type === 'cloud') status = cachedComplete ? 'cloud' : 'cloud_loading';
    else if (type === 'playbackCache') status = 'transient';

    const daysLeft = meta?.cloudExpiresAt
      ? Math.ceil((meta.cloudExpiresAt - now()) / DAY_MS)
      : 0;

    return {
      status,
      downloading: this.q.isBusy(u),
      cachedComplete,
      // needsReCache if meta flag OR stored quality mismatch to selected quality
      needsReCache: !!meta?.needsReCache || (!!meta?.quality && meta.quality !== qSel),
      needsUpdate: !!meta?.needsUpdate,
      quality: meta?.quality || null,
      daysLeft: Number.isFinite(daysLeft) ? Math.max(0, daysLeft) : 0
    };
  }

  /* --- Actions: pin/unpin --- */

  /**
   * Toggle pinned status for uid.
   * Spec:
   * - If no space => toast + do nothing.
   * - Pin: type='pinned', enqueue download to 100% in current quality if needed.
   * - Unpin: type='cloud' immediately, TTL starts now+ D days, file not deleted.
   */
  async togglePinned(uid) {
    const u = safeUid(uid);
    if (!u) return;

    const meta = (await getTrackMeta(u)) || { uid: u };
    const qSel = this.getQuality();
    const { D } = this.getCloudSettings();

    if (meta.type === 'pinned') {
      // Unpin => become cloud immediately (no stats reset)
      const t = now();
      await updateTrackMeta(u, {
        type: 'cloud',
        cloudOrigin: 'unpin',
        pinnedAt: null,
        cloud: true,
        cloudAddedAt: t,
        cloudExpiresAt: t + D * DAY_MS
      });
      toast(`Офлайн-закрепление снято. Трек доступен как облачный кэш на ${D} дней.`, 'info');
      emit('offline:stateChanged');
      return;
    }

    // Pin
    if (!(await this.hasSpace())) {
      toast('Недостаточно места на устройстве. Освободите память для офлайн-кэша.', 'warning');
      return;
    }

    await updateTrackMeta(u, {
      type: 'pinned',
      cloud: false,
      pinnedAt: now(),
      quality: qSel,
      cloudExpiresAt: null
    });

    // If already exists locally in desired quality, no download needed
    const stored = await getStoredVariant(u);
    if (stored === qSel) {
      toast('Трек закреплён офлайн 🔒', 'success');
      emit('offline:stateChanged');
      return;
    }

    // If exists in other quality -> mark for recache and enqueue silently
    if (stored) {
      await updateTrackMeta(u, { needsReCache: true });
    }

    const url = getTrackUrlByUid(u, qSel);
    if (url) this.q.add({ uid: u, url, quality: qSel, priority: PRIO.P2_PINNED, kind: 'pinned' });

    toast('Трек будет доступен офлайн. Начинаю скачивание…', 'info');
    emit('offline:stateChanged');
  }

  /* --- Actions: cloud menu delete --- */

  /**
   * Spec 6.6: "Удалить из кэша" (cloud-menu)
   * - delete audio
   * - reset cloud stats fields
   * - DO NOT touch global stats (stored elsewhere)
   */
  async removeCached(uid) {
    const u = safeUid(uid);
    if (!u) return;

    this.q.cancel(u);

    await deleteAudio(u);

    // Explicit reset of cloud stats, do not just drop meta entirely (future-safe)
    await updateTrackMeta(u, {
      type: null,
      cloud: false,
      cachedComplete: false,
      quality: null,
      size: 0,
      url: null,

      cloudFullListenCount: 0,
      lastFullListenAt: null,
      cloudAddedAt: null,
      cloudExpiresAt: null,
      cloudOrigin: null,

      needsReCache: false,
      needsUpdate: false
    });

    // If you want to keep meta store lean, you can delete meta if it is empty-ish.
    // But for compatibility we keep minimal record; it is safe for indicators too.
    emit('offline:stateChanged');
  }

  /**
   * Spec 12.5: "Удалить все закреплённые и облачные" (double confirm is in UI)
   * - delete audio for all pinned/cloud
   * - reset cloud stats for all
   */
  async removeAllCached() {
    const all = await getAllTrackMetas();
    const targets = all.filter((m) => m?.type === 'pinned' || m?.type === 'cloud');
    for (const m of targets) {
      // No toast spam here; UI shows summary
      await this.removeCached(m.uid);
    }
    emit('offline:stateChanged');
  }

  /* --- Cloud: register full listen & TTL --- */

  /**
   * Called from PlayerCore stats-tracker via OfflineManager.registerFullListen(uid, {duration,position})
   * Spec:
   * - full listen if duration valid and position/duration > 90%
   * - increments cloudFullListenCount always (all modes)
   * - if count >= N and not pinned -> becomes cloud and enqueues download if space
   * - if already cloud -> extend TTL now + D days
   */
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

    // TTL extension for existing cloud
    if (meta.type === 'cloud') {
      upd.cloudExpiresAt = t + D * DAY_MS;
    }

    // auto cloud add
    if (meta.type !== 'pinned' && meta.type !== 'cloud' && nextCount >= N) {
      if (await this.hasSpace()) {
        upd.type = 'cloud';
        upd.cloud = true;
        upd.cloudOrigin = 'auto';
        upd.cloudAddedAt = t;
        upd.cloudExpiresAt = t + D * DAY_MS;
        upd.quality = this.getQuality();

        // enqueue only if not already cached
        if (!(await hasAudioForUid(u))) {
          const url = getTrackUrlByUid(u, upd.quality);
          if (url) this.q.add({ uid: u, url, quality: upd.quality, priority: PRIO.P4_CLOUD_FILL, kind: 'cloud' });
          toast(`Трек добавлен в офлайн на ${D} дней.`, 'info');
        }
      }
    }

    await updateTrackMeta(u, upd);
    emit('offline:stateChanged');
  }

  async _cleanExpiredCloudOnStart() {
    const all = await getAllTrackMetas();
    const t = now();

    for (const m of all) {
      if (m?.type !== 'cloud') continue;
      if (!m.cloudExpiresAt) continue;
      if (m.cloudExpiresAt >= t) continue;

      // expired and not pinned (pinned handled by type)
      await this.removeCached(m.uid);
      toast('Офлайн-доступ истёк. Трек удалён из кэша.', 'warning');
    }
  }

  /* --- Resolve for TrackResolver (spec 7.2) --- */

  /**
   * @returns {Promise<{source:'local'|'stream'|'none', blob?:Blob, url?:string, quality?:'hi'|'lo'}>}
   */
  async resolveTrackSource(uid, reqQuality) {
    const u = safeUid(uid);
    if (!u) return { source: 'none' };

    const q = normQ(reqQuality || this.getQuality());
    const alt = q === 'hi' ? 'lo' : 'hi';
    const isNet = netAllowed();

    // 1) Local in requested quality
    const b1 = await getAudioBlob(u, q);
    if (b1) return { source: 'local', blob: b1, quality: q };

    // 2) Local in other quality (upgrade allowed for Lo)
    const b2 = await getAudioBlob(u, alt);
    if (b2) {
      if (q === 'lo') {
        // Upgrade: play hi while selected lo. Mark for recache (optional).
        await updateTrackMeta(u, { needsReCache: true }).catch(() => {});
        return { source: 'local', blob: b2, quality: alt };
      }

      // q === 'hi' but only lo exists:
      if (isNet) {
        const url = getTrackUrlByUid(u, q);
        if (url) {
          await updateTrackMeta(u, { needsReCache: true }).catch(() => {});
          // schedule silent replacement (but never for CUR in queue deletion logic)
          this._enqueueReCacheIfNotCur(u, q, PRIO.P3_UPDATE_CLOUD);
          return { source: 'stream', url, quality: q };
        }
      }

      // no net -> fallback to lo
      return { source: 'local', blob: b2, quality: alt };
    }

    // 3) Network stream in requested quality
    if (isNet) {
      const url = getTrackUrlByUid(u, q);
      if (url) return { source: 'stream', url, quality: q };
    }

    return { source: 'none' };
  }

  _enqueueReCacheIfNotCur(uid, quality, priority) {
    const curUid = safeUid(W.playerCore?.getCurrentTrackUid?.());
    if (curUid === uid) return;
    const url = getTrackUrlByUid(uid, quality);
    if (!url) return;
    this.q.add({ uid, url, quality: normQ(quality), priority, kind: 'reCache' });
  }

  /* --- PlaybackCache R1 integration --- */

  /**
   * Called by playback-cache-bootstrap.js
   * - For R1 kind 'playbackCache' create meta.type='playbackCache' if needed
   * - Respect space soft-check: if no space -> try evict transient; else toast "Мало места, предзагрузка приостановлена."
   */
  async enqueueAudioDownload(uid, { priority, kind } = {}) {
    const u = safeUid(uid);
    if (!u) return;

    const qSel = this.getQuality();

    if (kind === 'playbackCache') {
      const meta = await getTrackMeta(u);

      // If already pinned/cloud OR already has audio -> do not duplicate transient
      if (meta?.type === 'pinned' || meta?.type === 'cloud' || (await hasAudioForUid(u))) return;

      if (!(await this.hasSpace())) {
        const evicted = await this._evictOldestTransient();
        if (!evicted) {
          toast('Мало места, предзагрузка приостановлена.', 'warning');
          return;
        }
      }

      if (!meta) {
        await setTrackMeta(u, { uid: u, type: 'playbackCache', createdAt: now(), lastAccessedAt: now() });
      } else if (meta.type !== 'playbackCache') {
        await updateTrackMeta(u, { type: 'playbackCache', lastAccessedAt: now() });
      }
    }

    const url = getTrackUrlByUid(u, qSel);
    if (!url) return;

    this.q.add({
      uid: u,
      url,
      quality: qSel,
      priority: Number(priority || PRIO.P3_UPDATE_CLOUD),
      kind: String(kind || '')
    });
  }

  setProtectedUids(uids) {
    this.protectedUids = new Set(Array.isArray(uids) ? uids.map(safeUid).filter(Boolean) : []);
  }

  async _evictOldestTransient() {
    const all = await getAllTrackMetas();
    const trans = all
      .filter((m) => m?.type === 'playbackCache' && !this.protectedUids.has(m.uid))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    if (!trans.length) return false;

    await deleteTrackCache(trans[0].uid).catch(() => {});
    return true;
  }

  /* --- Quality changed: mark needsReCache + schedule replacements (spec 4.3/4.4) --- */

  async _onQualityChanged(newQ) {
    const qSel = normQ(newQ);

    // Cancel active downloads that are now "wrong direction"
    // (anti-hysteria; spec allows cancel + remove partial)
    for (const [uid] of this.q.active) this.q.cancel(uid);

    const all = await getAllTrackMetas();
    const curUid = safeUid(W.playerCore?.getCurrentTrackUid?.());

    let count = 0;

    for (const m of all) {
      if (m?.type !== 'pinned' && m?.type !== 'cloud') continue;

      const hasAny = await hasAudioForUid(m.uid).catch(() => false);
      const actualQ = m.quality || (hasAny ? await getStoredVariant(m.uid) : null);

      if (actualQ && actualQ !== qSel) {
        await updateTrackMeta(m.uid, { needsReCache: true }).catch(() => {});
        // never recache CUR on the fly
        if (m.uid !== curUid) {
          const pr = m.type === 'pinned' ? PRIO.P2_PINNED : PRIO.P3_UPDATE_CLOUD;
          this._enqueueReCacheIfNotCur(m.uid, qSel, pr);
        }
        count++;
      } else if (m?.needsReCache) {
        await updateTrackMeta(m.uid, { needsReCache: false }).catch(() => {});
      }
    }

    emit('offline:reCacheStatus', { count });
    emit('offline:stateChanged');
    emit('offline:uiChanged');
  }

  /* --- UI helpers --- */

  getDownloadStatus() {
    return this.q.getStatus();
  }

  async countNeedsReCache(targetQuality) {
    const qSel = normQ(targetQuality);
    const all = await getAllTrackMetas();
    return all.filter((m) => (m?.type === 'pinned' || m?.type === 'cloud') && m?.quality && m.quality !== qSel).length;
  }

  /**
   * Re-cache all pinned/cloud to target quality.
   * UI decides parallelism (2-3). Here we just enqueue.
   */
  async reCacheAll(targetQuality) {
    const qSel = normQ(targetQuality);
    const all = await getAllTrackMetas();
    const curUid = safeUid(W.playerCore?.getCurrentTrackUid?.());

    let enq = 0;

    for (const m of all) {
      if (m?.type !== 'pinned' && m?.type !== 'cloud') continue;
      if (!m.quality || m.quality === qSel) continue;
      if (m.uid === curUid) continue;

      const pr = m.type === 'pinned' ? PRIO.P2_PINNED : PRIO.P3_UPDATE_CLOUD;
      this._enqueueReCacheIfNotCur(m.uid, qSel, pr);
      enq++;
    }

    return enq;
  }

  /**
   * Apply cloud N/D settings (spec 6.8) — used by offline-modal.js.
   * NOTE: Confirm dialogs are in UI; here we only apply.
   * Returns number of removed tracks.
   */
  async confirmApplyCloudSettings({ newN, newD } = {}) {
    const N = Math.max(1, parseInt(String(newN || DEF.N), 10) || DEF.N);
    const D = Math.max(1, parseInt(String(newD || DEF.D), 10) || DEF.D);

    localStorage.setItem(KEYS.cloudN, String(N));
    localStorage.setItem(KEYS.cloudD, String(D));

    const all = await getAllTrackMetas();
    const t = now();
    let removed = 0;

    for (const m of all) {
      if (m?.type !== 'cloud') continue;

      // N increased: remove auto-cloud tracks that no longer qualify
      if (m.cloudOrigin === 'auto' && (m.cloudFullListenCount || 0) < N) {
        await this.removeCached(m.uid);
        removed++;
        continue;
      }

      // D changed: recompute expiry = lastFullListenAt + D days
      if (m.lastFullListenAt) {
        const exp = m.lastFullListenAt + D * DAY_MS;
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

  /**
   * Storage breakdown used by offline-modal.js.
   * Uses meta.size which is blob.size stored on cache.
   */
  async getStorageBreakdown() {
    const all = await getAllTrackMetas();
    const out = { pinned: 0, cloud: 0, transient: 0, other: 0 };

    for (const m of all) {
      const sz = Number(m?.size || 0) || 0;
      if (m?.type === 'pinned') out.pinned += sz;
      else if (m?.type === 'cloud') out.cloud += sz;
      else if (m?.type === 'playbackCache') out.transient += sz;
      else out.other += sz;
    }

    // include SW caches "other" is handled separately by SW manager; keep here only IDB meta-size approximation.
    return out;
  }

  // compatibility no-op: offline-modal expects these methods to exist (future presets)
  getBackgroundPreset() { return 'balanced'; }
  setBackgroundPreset() {}

  // Expose estimate for UI if needed
  async estimateUsage() {
    return estimateUsage();
  }
}

const instance = new OfflineManager();
export function getOfflineManager() { return instance; }
export default instance;
