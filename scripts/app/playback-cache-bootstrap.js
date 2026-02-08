/**
 * playback-cache-bootstrap.js — PlaybackCache (R1) window controller (v1.0 spec).
 *
 * Контракт (из ТЗ):
 * - Работает ТОЛЬКО в R1 и держит transient окно ровно PREV+CUR+NEXT (3 позиции).
 * - Докачка: CUR (P0) → сосед по направлению (P1) → второй сосед (P1 ниже).
 * - Ничего не останавливает и не запускает (no stop/play), не сбрасывает позицию/громкость.
 * - Удаление transient — отложенно: удаляем только после успешного старта нового CUR.
 * - Protect/unprotect: во время сценариев офлайна окно не подлежит eviction/GC.
 */

import { getOfflineManager } from '../offline/offline-manager.js';
import { deleteTrackCache, getTrackMeta } from '../offline/cache-db.js';

let _init = false;
let _protected = false;

// Строго 3 позиции окна (ТЗ 8.3)
let _win = { prev: null, cur: null, next: null };

// Удаляем transient только после старта нового CUR (ТЗ 8.6/8.7)
let _pendingDelete = new Set();

const uidOf = (t) => String(t?.uid || '').trim() || null;

function calcWindow(playlist, idx) {
  const len = playlist.length;
  const cur = len > 0 && idx >= 0 ? uidOf(playlist[idx]) : null;
  if (!cur) return { prev: null, cur: null, next: null };
  if (len === 1) return { prev: cur, cur, next: cur };

  const wrap = (i) => (i % len + len) % len;
  const prev = uidOf(playlist[wrap(idx - 1)]) || cur;
  const next = uidOf(playlist[wrap(idx + 1)]) || cur;
  return { prev, cur, next };
}

function buildPriorityList(win, dir) {
  const order = dir >= 0 ? [win.cur, win.next, win.prev] : [win.cur, win.prev, win.next];
  const out = [];
  const seen = new Set();
  for (const u of order) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function planGC(oldWin, newWin) {
  const keep = new Set([newWin.prev, newWin.cur, newWin.next].filter(Boolean));
  for (const u of [oldWin.prev, oldWin.cur, oldWin.next].filter(Boolean)) {
    if (!keep.has(u)) _pendingDelete.add(u);
  }
}

async function rebuild(dir = 1) {
  const mgr = getOfflineManager();
  const pc = window.playerCore;

  // R0: transient не создаём; удаление — отложенно (ТЗ 3.2)
  if (mgr.getMode() !== 'R1') {
    for (const u of [_win.prev, _win.cur, _win.next].filter(Boolean)) _pendingDelete.add(u);
    _win = { prev: null, cur: null, next: null };

    // Если ничего не играет — можно попробовать очистить сразу (без влияния на playback)
    if (pc && typeof pc.isPlaying === 'function' && !pc.isPlaying()) {
      flushPendingDelete().catch(() => {});
    }
    return;
  }

  const idx = pc?.getIndex?.() ?? -1;
  const playlist = pc?.getPlaylistSnapshot?.() || [];
  if (idx < 0 || playlist.length === 0) return;

  const nextWin = calcWindow(playlist, idx);
  if (!nextWin.cur) return;

  planGC(_win, nextWin);
  _win = nextWin;

  // Докачки — только если сеть разрешена политикой (ТЗ NetPolicy)
  const netOk = window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine;
  if (!netOk) return;

  // Мягкая проверка места (ТЗ 8.12): если мало — не выключаем R1, просто не докачиваем
  if (!(await mgr.hasSpace())) return;

  // Строгий порядок: CUR (P0) → сосед по направлению (P1) → второй сосед (P1 ниже)
  const [curUid, n1, n2] = buildPriorityList(_win, dir);

  if (curUid) await mgr.enqueueAudioDownload(curUid, { priority: 100, kind: 'playbackCache' });
  if (n1) await mgr.enqueueAudioDownload(n1, { priority: 90, kind: 'playbackCache' });
  if (n2) await mgr.enqueueAudioDownload(n2, { priority: 80, kind: 'playbackCache' });
}

async function flushPendingDelete() {
  if (_protected || !_pendingDelete.size) return;

  const keep = new Set([_win.prev, _win.cur, _win.next].filter(Boolean));
  const toDel = [..._pendingDelete].filter((u) => u && !keep.has(u));
  _pendingDelete = new Set();

  for (const uid of toDel) {
    // Не удаляем pinned/cloud (могли сменить тип пока uid лежал в pending)
    try {
      const meta = await getTrackMeta(uid);
      if (meta && (meta.type === 'pinned' || meta.type === 'cloud')) continue;
      await deleteTrackCache(uid);
    } catch {
      // ignore
    }
  }
}

export function initPlaybackCache() {
  if (_init) return;
  _init = true;

  window.addEventListener('player:trackChanged', (e) => {
    const dir = Number(e.detail?.dir || 1) || 1;
    rebuild(dir).catch(() => {});
  });

  // setPlaylist/shuffle/repeat/favoritesOnly → перестройка окна
  window.addEventListener('playlist:changed', () => rebuild(1).catch(() => {}));

  // UI/сеть → может измениться разрешение докачек
  window.addEventListener('offline:uiChanged', () => rebuild(1).catch(() => {}));
  window.addEventListener('online', () => rebuild(1).catch(() => {}));

  // Deferred delete: только когда новый CUR реально стартовал (ТЗ 8.6/8.7)
  window.playerCore?.on?.({ onPlay: () => flushPendingDelete().catch(() => {}) });
}

export function protectWindow() {
  _protected = true;
}

export function unprotectWindow() {
  _protected = false;
  flushPendingDelete().catch(() => {});
}

export function getWindowState() {
  return {
    prev: _win.prev,
    cur: _win.cur,
    next: _win.next,
    protected: _protected,
    pendingGC: [..._pendingDelete]
  };
}
