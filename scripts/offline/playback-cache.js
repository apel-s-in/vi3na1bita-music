// scripts/offline/playback-cache.js
// PlaybackCache (ESM) — кэширование окна PREV/CUR/NEXT (ТЗ 7)
// Скачивает РЕАЛЬНЫЕ треки для playback, управляет окном воспроизведения

import { getTrackByUid } from '../app/track-registry.js';
import { isAllowedByNetPolicy, getNetPolicy } from './net-policy.js';
import { markLocalTransient } from './cache-db.js';

// ТЗ 7.3: окно всегда ровно 3 элемента PREV/CUR/NEXT
const WINDOW_PREV = 1;
const WINDOW_NEXT = 1;

// ТЗ 14.2: P0 (CUR) выше P1 (сосед)
const PRIORITY_CURRENT = 30;   // P0
const PRIORITY_ADJACENT = 20;  // P1

function normUid(v) {
  const s = String(v || '').trim();
  return s || null;
}

function normQ(v) {
  return String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi';
}

function getNetworkStatusSafe() {
  try {
    if (window.NetworkManager?.getStatus) {
      return window.NetworkManager.getStatus();
    }
  } catch {}
  return { online: navigator.onLine !== false, kind: 'unknown', saveData: false };
}

export class PlaybackCacheManager {
  constructor(opts = {}) {
    this._queue = opts.queue || null;
    this._getPlaylistCtx = opts.getPlaylistCtx || (() => ({ list: [], curUid: null, favoritesInactive: new Set(), direction: 'forward' }));
    this._currentIdx = -1;
    this._playlist = [];
    this._pq = 'hi';
    this._scheduled = new Set();
    this._lastWindow = { prev: [], cur: null, next: [] };
    this._direction = 'forward';
  }

  setQueue(queue) {
    this._queue = queue;
  }

  setPlaybackQuality(pq) {
    this._pq = normQ(pq);
  }

  getPlaybackQuality() {
    return this._pq;
  }

  getWindow(idx, playlist) {
    const pl = playlist || this._playlist;
    const len = pl.length;

    if (len === 0 || idx < 0 || idx >= len) {
      return { prev: [], cur: null, next: [] };
    }

    const cur = pl[idx] || null;
    const curUid = normUid(cur?.uid);
    const prev = [];
    const next = [];

    for (let i = 1; i <= WINDOW_PREV && (idx - i) >= 0; i++) {
      const t = pl[idx - i];
      if (t) prev.unshift(normUid(t.uid));
    }

    for (let i = 1; i <= WINDOW_NEXT && (idx + i) < len; i++) {
      const t = pl[idx + i];
      if (t) next.push(normUid(t.uid));
    }

    return { prev: prev.filter(Boolean), cur: curUid, next: next.filter(Boolean) };
  }

  async ensureWindowFullyCached(pq, trackProvider) {
    const ctx = this._getPlaylistCtx();
    const list = ctx.list || [];
    const curUid = ctx.curUid || null;
    const inactive = ctx.favoritesInactive || new Set();
    const direction = ctx.direction || 'forward';

    this._direction = direction;

    if (!list.length || !curUid) return;

    const idx = list.findIndex(t => normUid(t?.uid) === curUid);
    if (idx < 0) return;

    this._currentIdx = idx;
    this._playlist = list;

    const window = this.getWindow(idx, list);
    this._lastWindow = window;

    const mgr = window.OfflineUI?.offlineManager;
    if (!mgr) return;

    const offlineMode = mgr.isOfflineMode?.();
    if (!offlineMode) return;

    const policy = getNetPolicy();
    const net = getNetworkStatusSafe();

    if (!net.online) return;

    const allowed = isAllowedByNetPolicy({
      policy,
      net,
      quality: pq || this._pq,
      kind: 'playbackCache',
      userInitiated: false
    });

    if (!allowed) return;

    // ТЗ 7.7: строго CUR -> сосед по направлению.
    const tasks = [];

    if (window.cur && !inactive.has(window.cur)) {
      tasks.push({ uid: window.cur, priority: PRIORITY_CURRENT });
    }

    // сосед по направлению = один uid (так как окно 3-трековое)
    const neighbor = (direction === 'backward')
      ? (window.prev && window.prev.length ? window.prev[window.prev.length - 1] : null)
      : (window.next && window.next.length ? window.next[0] : null);

    if (neighbor && !inactive.has(neighbor)) {
      tasks.push({ uid: neighbor, priority: PRIORITY_ADJACENT });
    }

    const quality = normQ(pq || this._pq);

    for (const task of tasks) {
      const u = normUid(task.uid);
      if (!u) continue;

      const key = `playbackCache:${quality}:${u}`;

      if (this._scheduled.has(key)) continue;
      this._scheduled.add(key);

      const complete = await mgr.isTrackComplete(u, quality);
      if (complete) continue;

      const trackMeta = typeof trackProvider === 'function' ? trackProvider(u) : getTrackByUid(u);
      if (!trackMeta) continue;

      mgr.enqueueAudioDownload({
        uid: u,
        quality,
        key,
        priority: task.priority,
        userInitiated: false,
        isMass: false,
        kind: 'playbackCache',
        onResult: async (r) => {
          // ТЗ 7.6/1.3: файлы окна считаем transient(window)
          if (r && r.ok) {
            try { await markLocalTransient(u, 'window'); } catch {}
          }
        }
      });
    }
  }

  clearScheduled() {
    this._scheduled.clear();
  }

  getLastWindow() {
    return { ...this._lastWindow };
  }

  getCurrentIndex() {
    return this._currentIdx;
  }
}

let _instance = null;

export function getPlaybackCache() {
  if (!_instance) {
    _instance = new PlaybackCacheManager();
  }
  return _instance;
}

export const PlaybackCache = {
  setPlaybackQuality: (pq) => getPlaybackCache().setPlaybackQuality(pq),
  getPlaybackQuality: () => getPlaybackCache().getPlaybackQuality(),
  getWindow: (idx, pl) => getPlaybackCache().getWindow(idx, pl),
  ensureWindowFullyCached: (pq, tp) => getPlaybackCache().ensureWindowFullyCached(pq, tp),
  clearScheduled: () => getPlaybackCache().clearScheduled(),
  getLastWindow: () => getPlaybackCache().getLastWindow(),
  getCurrentIndex: () => getPlaybackCache().getCurrentIndex()
};
