// scripts/offline/playback-cache.js
// PlaybackCache (ESM) — кэширование окна PREV/CUR/NEXT (ТЗ 11)
// Скачивает РЕАЛЬНЫЕ треки для playback (в качестве PQ), а не только планирует

import { getOfflineManager } from './offline-manager.js';
import { getTrackByUid } from '../app/track-registry.js';
import { isAllowedByNetPolicy, getNetPolicy } from './net-policy.js';

const WINDOW_PREV = 1;
const WINDOW_NEXT = 2;
const PRIORITY_CURRENT = 30;
const PRIORITY_ADJACENT = 20;

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
  return { online: navigator.onLine !== false, kind: 'unknown' };
}

class PlaybackCacheManager {
  constructor() {
    this._currentIdx = -1;
    this._playlist = [];
    this._pq = 'hi';
    this._scheduled = new Set();
    this._lastWindow = { prev: [], cur: null, next: [] };
  }

  /**
   * setPlaylist — устанавливает текущий плейлист
   * @param {Array} uids — массив uid треков
   */
  setPlaylist(uids) {
    this._playlist = Array.isArray(uids)
      ? uids.map(x => String(x || '').trim()).filter(Boolean)
      : [];
    this._currentIdx = -1;
    this._scheduled.clear();
    this._lastWindow = { prev: [], cur: null, next: [] };
  }

  /**
   * getPlaylist — возвращает текущий плейлист
   */
  getPlaylist() {
    return [...this._playlist];
  }

  /**
   * setPlaybackQuality — устанавливает PQ для playback cache
   * @param {string} pq — 'hi' или 'lo'
   */
  setPlaybackQuality(pq) {
    this._pq = normQ(pq);
  }

  /**
   * getPlaybackQuality — возвращает текущее PQ
   */
  getPlaybackQuality() {
    return this._pq;
  }

  /**
   * getWindow — вычисляет окно PREV/CUR/NEXT
   * @param {number} idx — индекс текущего трека
   * @returns {{ prev: string[], cur: string|null, next: string[] }}
   */
  getWindow(idx) {
    const pl = this._playlist;
    const len = pl.length;

    if (len === 0 || idx < 0 || idx >= len) {
      return { prev: [], cur: null, next: [] };
    }

    const cur = pl[idx] || null;
    const prev = [];
    const next = [];

    // Collect PREV (up to WINDOW_PREV)
    for (let i = 1; i <= WINDOW_PREV && (idx - i) >= 0; i++) {
      prev.unshift(pl[idx - i]);
    }

    // Collect NEXT (up to WINDOW_NEXT)
    for (let i = 1; i <= WINDOW_NEXT && (idx + i) < len; i++) {
      next.push(pl[idx + i]);
    }

    return { prev, cur, next };
  }

  /**
   * onTrackChange — вызывается при смене трека (ТЗ 11.2)
   * Планирует и ВЫПОЛНЯЕТ скачивание треков в окне
   * @param {number} idx — индекс нового текущего трека
   * @param {Object} options — { force?: boolean }
   */
  async onTrackChange(idx, options = {}) {
    const force = !!options?.force;
    const safeIdx = Math.max(0, Math.min(Number(idx) || 0, this._playlist.length - 1));

    if (!force && safeIdx === this._currentIdx) return;

    this._currentIdx = safeIdx;
    const window = this.getWindow(safeIdx);
    this._lastWindow = window;

    // ТЗ 11.2.A: Playback Cache работает только при OFFLINE mode ON
    const mgr = getOfflineManager();
    if (!mgr.isOfflineMode()) {
      return;
    }

    // Net policy check
    const policy = getNetPolicy();
    const net = getNetworkStatusSafe();

    if (!net.online) return;

    const allowed = isAllowedByNetPolicy({
      policy,
      net,
      quality: this._pq,
      kind: 'playbackCache',
      userInitiated: false
    });

    if (!allowed) return;

    // Schedule downloads: CUR with highest priority, then NEXT, then PREV
    const tasks = [];

    if (window.cur) {
      tasks.push({ uid: window.cur, priority: PRIORITY_CURRENT });
    }

    window.next.forEach((uid, i) => {
      tasks.push({ uid, priority: PRIORITY_ADJACENT - i });
    });

    window.prev.forEach((uid, i) => {
      tasks.push({ uid, priority: PRIORITY_ADJACENT - WINDOW_NEXT - i });
    });

    for (const task of tasks) {
      const u = normUid(task.uid);
      if (!u) continue;

      const key = `playbackCache:${this._pq}:${u}`;

      // Skip if already scheduled in this session
      if (this._scheduled.has(key)) continue;
      this._scheduled.add(key);

      // Check if already complete
      const complete = await mgr.isTrackComplete(u, this._pq);
      if (complete) continue;

      // Enqueue actual download
      mgr.enqueueAudioDownload({
        uid: u,
        quality: this._pq,
        key,
        priority: task.priority,
        userInitiated: false,
        isMass: false,
        kind: 'playbackCache'
      });
    }
  }

  /**
   * prefetchNext — явный вызов для предзагрузки следующих треков
   * @param {number} count — количество треков для предзагрузки
   */
  async prefetchNext(count = WINDOW_NEXT) {
    const idx = this._currentIdx;
    if (idx < 0 || !this._playlist.length) return;

    const mgr = getOfflineManager();
    if (!mgr.isOfflineMode()) return;

    const net = getNetworkStatusSafe();
    if (!net.online) return;

    const policy = getNetPolicy();
    const allowed = isAllowedByNetPolicy({
      policy,
      net,
      quality: this._pq,
      kind: 'playbackCache',
      userInitiated: false
    });

    if (!allowed) return;

    const start = idx + 1;
    const end = Math.min(start + count, this._playlist.length);

    for (let i = start; i < end; i++) {
      const u = normUid(this._playlist[i]);
      if (!u) continue;

      const key = `playbackCache:${this._pq}:${u}`;
      if (this._scheduled.has(key)) continue;
      this._scheduled.add(key);

      const complete = await mgr.isTrackComplete(u, this._pq);
      if (complete) continue;

      mgr.enqueueAudioDownload({
        uid: u,
        quality: this._pq,
        key,
        priority: PRIORITY_ADJACENT - (i - start),
        userInitiated: false,
        isMass: false,
        kind: 'playbackCache'
      });
    }
  }

  /**
   * clearScheduled — очищает историю запланированных задач
   */
  clearScheduled() {
    this._scheduled.clear();
  }

  /**
   * getLastWindow — возвращает последнее вычисленное окно
   */
  getLastWindow() {
    return { ...this._lastWindow };
  }

  /**
   * getCurrentIndex — возвращает текущий индекс
   */
  getCurrentIndex() {
    return this._currentIdx;
  }
}

// Singleton
let _instance = null;

export function getPlaybackCache() {
  if (!_instance) {
    _instance = new PlaybackCacheManager();
  }
  return _instance;
}

export const PlaybackCache = {
  setPlaylist: (uids) => getPlaybackCache().setPlaylist(uids),
  getPlaylist: () => getPlaybackCache().getPlaylist(),
  setPlaybackQuality: (pq) => getPlaybackCache().setPlaybackQuality(pq),
  getPlaybackQuality: () => getPlaybackCache().getPlaybackQuality(),
  getWindow: (idx) => getPlaybackCache().getWindow(idx),
  onTrackChange: (idx, opts) => getPlaybackCache().onTrackChange(idx, opts),
  prefetchNext: (count) => getPlaybackCache().prefetchNext(count),
  clearScheduled: () => getPlaybackCache().clearScheduled(),
  getLastWindow: () => getPlaybackCache().getLastWindow(),
  getCurrentIndex: () => getPlaybackCache().getCurrentIndex()
};
