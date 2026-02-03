import { getTrackByUid } from '../app/track-registry.js';
import { isAllowedByNetPolicy, getNetPolicy } from './net-policy.js';
import { markLocalTransient } from './cache-db.js';
import { Utils } from '../core/utils.js';

// ТЗ 14.2: Приоритеты (P0 > P1)
const P_CUR = 100;
const P_ADJ = 90;

export class PlaybackCacheManager {
  constructor(opts = {}) {
    this._q = opts.queue || null;
    this._getCtx = opts.getPlaylistCtx || (() => ({ list: [], curUid: null, favoritesInactive: new Set(), direction: 'forward' }));
    this._pq = 'hi';
    this._sched = new Set();
    this._last = { prev: [], cur: null, next: [] };
  }

  setPlaybackQuality(pq) { this._pq = Utils.obj.normQuality(pq); }
  getPlaybackQuality() { return this._pq; }
  
  // ТЗ 7.3: Цикличное окно
  getWindow(idx, list) {
    const len = list?.length || 0;
    if (!len || idx < 0) return { prev: [], cur: null, next: [] };

    const get = (i) => Utils.obj.trim(list[(idx + i + len) % len]?.uid);
    return {
      prev: [get(-1)].filter(Boolean),
      cur: get(0),
      next: [get(1)].filter(Boolean)
    };
  }

  getLastWindow() { return { ...this._last }; }
  clearScheduled() { this._sched.clear(); }

  async ensureWindowFullyCached(pqArg, trackProvider) {
    const { list, curUid, favoritesInactive: bad, direction } = this._getCtx();
    const pq = Utils.obj.normQuality(pqArg || this._pq);
    
    if (!list.length || !curUid) return;

    const idx = list.findIndex(t => Utils.obj.trim(t?.uid) === curUid);
    if (idx < 0) return;

    const win = this.getWindow(idx, list);
    this._last = win;

    const mgr = window.OfflineUI?.offlineManager;
    if (!mgr || mgr.isOfflineMode()) return;
    
    const net = Utils.getNet();
    if (!net.online || !isAllowedByNetPolicy({ policy: getNetPolicy(), net, quality: pq, kind: 'playbackCache' })) return;

    const tasks = [];
    
    // P0: Текущий трек
    if (win.cur && !bad.has(win.cur)) tasks.push({ u: win.cur, p: P_CUR });

    // P1: Сосед по направлению (forward -> NEXT, backward -> PREV)
    const neighbor = (direction === 'backward') ? win.prev[0] : win.next[0];
    if (neighbor && !bad.has(neighbor)) tasks.push({ u: neighbor, p: P_ADJ });

    for (const { u, p } of tasks) {
      const key = `pbc:${pq}:${u}`;
      if (this._sched.has(key)) continue;

      if (await mgr.isTrackComplete(u, pq)) continue;

      const meta = (typeof trackProvider === 'function' ? trackProvider(u) : getTrackByUid(u));
      if (!meta) continue;

      this._sched.add(key);

      mgr.enqueueAudioDownload({
        uid: u,
        quality: pq,
        key,
        priority: p,
        kind: 'playbackCache',
        onResult: (res) => {
          if (res?.ok) markLocalTransient(u, 'window').catch(() => {});
        }
      });
    }
  }
}

export const PlaybackCache = new PlaybackCacheManager();
export const getPlaybackCache = () => PlaybackCache;
