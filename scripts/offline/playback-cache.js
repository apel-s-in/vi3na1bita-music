import { getTrackByUid } from '../app/track-registry.js';
import { isAllowedByNetPolicy, getNetPolicy } from './net-policy.js';
import { markLocalTransient } from './cache-db.js';

const Utils = window.Utils;

// Priorities (ТЗ 14.2)
const P_CUR = 100;
const P_NEXT = 95; 
const P_PREV = 80;

export class PlaybackCacheManager {
  constructor(opts = {}) {
    this._q = opts.queue || null;
    this._getCtx = opts.getPlaylistCtx || (() => ({ list: [], curUid: null, favoritesInactive: new Set(), direction: 'forward' }));
    this._pq = 'hi';
    this._sched = new Set(); // Set of scheduled task keys to prevent duplicates
    this._last = { prev: [], cur: null, next: [] };
  }

  setPlaybackQuality(pq) { this._pq = Utils.obj.normQuality(pq); }
  getPlaybackQuality() { return this._pq; }
  
  /**
   * Вычисляет окно PREV/CUR/NEXT на основе индекса и списка
   */
  getWindow(idx, list) {
    const len = list?.length || 0;
    if (!len || idx < 0) return { prev: [], cur: null, next: [] };

    const get = (i) => {
      // Циклический индекс с поддержкой отрицательных значений
      const t = list[(idx + i + len) % len];
      return Utils.obj.trim(t?.uid);
    };

    return {
      prev: [get(-1)].filter(Boolean),
      cur: get(0),
      next: [get(1)].filter(Boolean)
    };
  }

  getLastWindow() { return { ...this._last }; }
  clearScheduled() { this._sched.clear(); }

  /**
   * Основной метод: планирует загрузку окна
   */
  async ensureWindowFullyCached(pqArg, trackProvider) {
    const { list, curUid, favoritesInactive: bad } = this._getCtx();
    const pq = Utils.obj.normQuality(pqArg || this._pq);
    
    if (!list.length || !curUid) return;

    const idx = list.findIndex(t => Utils.obj.trim(t?.uid) === curUid);
    if (idx < 0) return;

    // 1. Вычисляем окно
    const win = this.getWindow(idx, list);
    this._last = win; // Сохраняем для OfflineManager (чтобы не удалил их при очистке)

    const mgr = window.OfflineUI?.offlineManager;
    if (!mgr || mgr.isOfflineMode()) return; // В Offline режиме не качаем
    
    // Проверка политики сети (ТЗ 7.6)
    const net = Utils.getNet();
    if (!net.online || !isAllowedByNetPolicy({ policy: getNetPolicy(), net, quality: pq, kind: 'playbackCache' })) return;

    const tasks = [];
    
    // Формируем задачи с приоритетами (ТЗ 7.7, D1)
    const { direction } = this._getCtx();
    
    // 1. CUR (P0)
    if (win.cur && !bad.has(win.cur)) tasks.push({ u: win.cur, p: P_CUR });

    // 2. Сосед по направлению (P1)
    const primary = direction === 'backward' ? win.prev[0] : win.next[0];
    if (primary && !bad.has(primary)) tasks.push({ u: primary, p: P_NEXT });

    // 3. Обратный сосед (P2)
    const secondary = direction === 'backward' ? win.next[0] : win.prev[0];
    if (secondary && !bad.has(secondary)) tasks.push({ u: secondary, p: P_PREV });

    for (const { u, p } of tasks) {
      const key = `pbc:${pq}:${u}`;
      if (this._sched.has(key)) continue;

      // D3: Если есть локально в качестве >= PQ, качать не нужно
      const hasHi = await mgr.isTrackComplete(u, 'hi');
      const hasLo = await mgr.isTrackComplete(u, 'lo');
      // Если требуем Lo, а есть Hi - ок. Если требуем Hi, а есть только Lo - качаем.
      if ((pq === 'lo' && (hasLo || hasHi)) || (pq === 'hi' && hasHi)) continue;

      // Проверяем наличие метаданных
      const meta = (typeof trackProvider === 'function' ? trackProvider(u) : getTrackByUid(u));
      if (!meta) continue;

      this._sched.add(key);

      // Ставим в очередь OfflineManager
      mgr.enqueueAudioDownload({
        uid: u,
        quality: pq,
        priority: p,
        kind: 'playbackCache', // Важно: помечается как transient 'window'
        onResult: (res) => {
          if (res?.ok) {
             // Явно помечаем как transient window после скачивания
             markLocalTransient(u, 'window').catch(() => {});
          }
        }
      });
    }
  }
}

export const PlaybackCache = new PlaybackCacheManager();
export const getPlaybackCache = () => PlaybackCache;
