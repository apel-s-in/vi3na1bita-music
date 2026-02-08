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

// Явная модель окна (строго 3 позиции по ТЗ 8.3)
let _win = { prev: null, cur: null, next: null };

// Что можно удалить (transient), но только после старта нового CUR (ТЗ 8.6/8.7)
let _pendingDelete = new Set();

export function initPlaybackCache() {
  if (_init) return;
  _init = true;

  // Track change from PlayerCore (dir важен для приоритета соседа)
  window.addEventListener('player:trackChanged', (e) => {
    const dir = Number(e.detail?.dir || 1) || 1;
    _rebuild(dir).catch(() => {});
  });

  // Playlist could change due to shuffle/repeat/favoritesOnly
  window.addEventListener('playlist:changed', () => _rebuild(1).catch(() => {}));

  // UI and connectivity changes can allow/restrict downloads
  window.addEventListener('offline:uiChanged', () => _rebuild(1).catch(() => {}));
  window.addEventListener('online', () => _rebuild(1).catch(() => {}));

  // Deferred delete: только когда новый CUR реально стартовал (onPlay)
  const pc = window.playerCore;
  // Используем хук onPlay, если playerCore его предоставляет, или подписываемся на события
  if (pc?.on) {
    pc.on({ onPlay: () => _flushPendingDelete().catch(() => {}) });
  } else {
    // Fallback на глобальное событие, если PC не имеет метода .on
    window.addEventListener('player:play', () => _flushPendingDelete().catch(() => {}));
  }
}

function _idxWrap(i, len) {
  if (len <= 0) return 0;
  return (i % len + len) % len;
}

function _calcWindow(playlist, curIdx) {
  const len = playlist.length;
  if (!len || curIdx < 0) return { prev: null, cur: null, next: null };

  const cur = playlist[curIdx]?.uid ? String(playlist[curIdx].uid).trim() : null;
  if (!cur) return { prev: null, cur: null, next: null };

  if (len === 1) return { prev: cur, cur, next: cur };

  const prevIdx = _idxWrap(curIdx - 1, len);
  const nextIdx = _idxWrap(curIdx + 1, len);

  const prev = playlist[prevIdx]?.uid ? String(playlist[prevIdx].uid).trim() : cur;
  const next = playlist[nextIdx]?.uid ? String(playlist[nextIdx].uid).trim() : cur;

  return { prev, cur, next };
}

function _asUniqueList(win, dir) {
  // Важно: при 2 треках prev==next — не дублировать
  const order = dir >= 0
    ? [win.cur, win.next, win.prev] // “вперёд”: CUR, NEXT, PREV
    : [win.cur, win.prev, win.next]; // “назад”: CUR, PREV, NEXT

  const out = [];
  const seen = new Set();
  for (const uid of order) {
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }
  return out;
}

async function _rebuild(dir = 1) {
  const mgr = getOfflineManager();
  const pc = window.playerCore;

  // R0: не создаём transient. Но удаление transient отложенно (ТЗ 3.2).
  if (mgr.getMode() !== 'R1') {
    for (const uid of [ _win.prev, _win.cur, _win.next ].filter(Boolean)) _pendingDelete.add(uid);
    _win = { prev: null, cur: null, next: null };
    // Если мы переключились в R0, можно попробовать почистить сразу, если ничего не играет
    if (pc && !pc.isPlaying) _flushPendingDelete().catch(()=>{});
    return;
  }

  const idx = pc?.getIndex?.() ?? -1;
  const playlist = pc?.getPlaylistSnapshot?.() || [];
  if (idx < 0 || !playlist.length) return;

  const nextWin = _calcWindow(playlist, idx);
  if (!nextWin.cur) return;

  // Запланировать удаление того, что вышло из окна (удалить ПОСЛЕ старта нового CUR)
  for (const uid of [ _win.prev, _win.cur, _win.next ].filter(Boolean)) {
    if (uid !== nextWin.prev && uid !== nextWin.cur && uid !== nextWin.next) _pendingDelete.add(uid);
  }
  _win = nextWin;

  // Докачки — только если сеть разрешена политикой (ТЗ NetPolicy)
  const netOk = window.NetPolicy?.isNetworkAllowed?.() ?? navigator.onLine;
  if (!netOk) return;

  // Мягкая проверка места (ТЗ 8.12): если мало — не выключаем R1, просто не докачиваем
  if (!(await mgr.hasSpace())) return;

  // Строгий порядок: CUR (P0) → сосед по направлению (P1) → второй сосед (P1 ниже)
  const list = _asUniqueList(_win, dir);
  const [curUid, n1, n2] = list;

  if (curUid) await mgr.enqueueAudioDownload(curUid, { priority: 100, kind: 'playbackCache' }); // P0
  if (n1) await mgr.enqueueAudioDownload(n1, { priority: 90, kind: 'playbackCache' }); // P1
  if (n2) await mgr.enqueueAudioDownload(n2, { priority: 80, kind: 'playbackCache' }); // P1 (lower)
}

async function _flushPendingDelete() {
  if (_protected) return;
  if (!_pendingDelete.size) return;

  // Не удаляем то, что снова в окне
  const keep = new Set([_win.prev, _win.cur, _win.next].filter(Boolean));

  const toDel = [..._pendingDelete].filter((uid) => uid && !keep.has(uid));
  _pendingDelete = new Set(); // сбрасываем сразу

  for (const uid of toDel) {
    // !CRITICAL FIX: Проверяем тип перед удалением.
    // Если пользователь успел нажать "Pin" (закрепить) или трек стал "Cloud" 
    // пока он лежал в _pendingDelete, мы НЕ должны его удалять.
    try {
      const m = await getTrackMeta(uid);
      if (m && (m.type === 'pinned' || m.type === 'cloud')) {
        continue; // Skip deletion
      }
      // Удаляем (и блоб, и мету), так как это transient и больше не нужен
      await deleteTrackCache(uid);
    } catch (e) {
      // ignore errors
    }
  }
}

export function protectWindow() { _protected = true; }
export function unprotectWindow() { _protected = false; _flushPendingDelete().catch(() => {}); }

export function getWindowState() {
  return {
    prev: _win.prev,
    cur: _win.cur,
    next: _win.next,
    protected: _protected,
    pendingGC: [..._pendingDelete]
  };
}
