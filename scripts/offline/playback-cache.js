import { getTrackByUid } from '../app/track-registry.js';
import { isAllowedByNetPolicy, getNetPolicy } from './net-policy.js';
import { markLocalTransient } from './cache-db.js';

// ТЗ 14.2: Приоритеты (P0 > P1)
const P_CUR = 100;
const P_ADJ = 90;

// Утилиты
const norm = (v) => (String(v || '').toLowerCase() === 'lo' ? 'lo' : 'hi');
const sUid = (v) => (v ? String(v).trim() : null);
const getNet = () => window.Utils?.getNetworkStatusSafe?.() || { online: true };

/**
 * PlaybackCacheManager v2.0
 * Реализует "Интеллектуальный кэш" (ТЗ п.7)
 * - Окно: PREV / CUR / NEXT (3 трека)
 * - Приоритет: CUR (100%) -> Сосед по направлению (90%)
 * - Тип: Transient (удаляется при eviction первым)
 * - Качество: Playback Quality (PQ), не зависит от CQ
 */
export class PlaybackCacheManager {
  constructor(opts = {}) {
    this._q = opts.queue || null;
    this._getCtx = opts.getPlaylistCtx || (() => ({ list: [], curUid: null, favoritesInactive: new Set(), direction: 'forward' }));
    this._pq = 'hi';
    this._sched = new Set(); // Дедупликация задач в рамках сессии
    this._last = { prev: [], cur: null, next: [] };
  }

  setPlaybackQuality(pq) { this._pq = norm(pq); }
  getPlaybackQuality() { return this._pq; }
  
  // ТЗ 7.3: Цикличное окно
  getWindow(idx, list) {
    const len = list?.length || 0;
    if (!len || idx < 0) return { prev: [], cur: null, next: [] };

    const get = (i) => sUid(list[(idx + i + len) % len]?.uid);
    return {
      prev: [get(-1)].filter(Boolean),
      cur: get(0),
      next: [get(1)].filter(Boolean)
    };
  }

  getLastWindow() { return { ...this._last }; }
  clearScheduled() { this._sched.clear(); }

  // ТЗ 7.6, 7.7: Планирование загрузок окна
  async ensureWindowFullyCached(pqArg, trackProvider) {
    const { list, curUid, favoritesInactive: bad, direction } = this._getCtx();
    const pq = norm(pqArg || this._pq);
    
    if (!list.length || !curUid) return;

    const idx = list.findIndex(t => sUid(t?.uid) === curUid);
    if (idx < 0) return;

    // 1. Вычисляем окно
    const win = this.getWindow(idx, list);
    this._last = win;

    // 2. Проверка прав (Network Policy)
    const mgr = window.OfflineUI?.offlineManager;
    if (!mgr || mgr.isOfflineMode()) return; // В офлайн-режиме не качаем
    
    const net = getNet();
    if (!net.online || !isAllowedByNetPolicy({ policy: getNetPolicy(), net, quality: pq, kind: 'playbackCache' })) return;

    // 3. Формирование очереди (Строго: CUR -> Сосед)
    const tasks = [];
    
    // P0: Текущий трек
    if (win.cur && !bad.has(win.cur)) tasks.push({ u: win.cur, p: P_CUR });

    // P1: Сосед по направлению (ТЗ 7.8)
    // forward -> качаем NEXT, backward -> качаем PREV
    const neighbor = (direction === 'backward') ? win.prev[0] : win.next[0];
    if (neighbor && !bad.has(neighbor)) tasks.push({ u: neighbor, p: P_ADJ });

    // 4. Постановка задач
    for (const { u, p } of tasks) {
      const key = `pbc:${pq}:${u}`;
      if (this._sched.has(key)) continue; // Уже планировали

      // Если уже есть локально в нужном качестве — пропускаем
      if (await mgr.isTrackComplete(u, pq)) continue;

      // Проверка наличия метаданных
      const meta = (typeof trackProvider === 'function' ? trackProvider(u) : getTrackByUid(u));
      if (!meta) continue;

      this._sched.add(key);

      mgr.enqueueAudioDownload({
        uid: u,
        quality: pq,
        key,
        priority: p,
        kind: 'playbackCache', // ТЗ 7.6
        onResult: (res) => {
          // После скачивания помечаем как transient window (удаляется последним из transient)
          if (res?.ok) markLocalTransient(u, 'window').catch(() => {});
        }
      });
    }
  }
}

// Singleton export
export const PlaybackCache = new PlaybackCacheManager();
export const getPlaybackCache = () => PlaybackCache;
