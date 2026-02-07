/**
 * playback-cache-bootstrap.js — Контроллер Playback Cache (R1).
 * 
 * Реализует стратегию "Трёхтрекового окна" (Current + Next + Prev).
 * - Если Mode = R0: Не делает ничего (или очищает динамический кэш).
 * - Если Mode = R1: 
 *    1. При смене трека ставит в очередь Current (P10), Next (P9), Prev (P8).
 *    2. Удаляет из кэша треки типа 'playbackCache', которые выпали из этого окна.
 */

import { getOfflineManager } from '../offline/offline-manager.js';
import { getTrackByUid } from './track-registry.js';
import { $ } from './utils/app-utils.js';

let _initialized = false;
let _currentWindow = new Set(); // UIDs currently in window

export function initPlaybackCache() {
  if (_initialized) return;
  _initialized = true;

  const mgr = getOfflineManager();

  // 1. Слушаем смену трека в плеере
  window.addEventListener('player:trackChanged', (e) => {
    _updateWindow(e.detail?.trackData);
  });

  // 2. Слушаем смену режима (R0 <-> R1) или появление сети
  window.addEventListener('offline:uiChanged', () => {
    _updateWindow(window.playerCore?.getCurrentTrack());
  });

  window.addEventListener('online', () => {
    _updateWindow(window.playerCore?.getCurrentTrack());
  });

  console.log('[PlaybackCache] Controller initialized');
}

/**
 * Главная логика обновления окна
 */
async function _updateWindow(currentTrack) {
  const mgr = getOfflineManager();
  const mode = mgr.getMode(); // 'R0' or 'R1'

  // Если R0 (стриминг) — очищаем окно и выходим
  if (mode !== 'R1') {
    if (_currentWindow.size > 0) {
      _currentWindow.clear();
      await _gc([]); // Удалить всё динамическое
    }
    return;
  }

  if (!currentTrack || !currentTrack.uid) return;

  const pc = window.playerCore;
  const playlist = pc.getPlaylistSnapshot() || [];
  const idx = pc.getIndex();
  if (idx === -1) return;

  // 1. Определяем окно [Prev, Curr, Next]
  const windowUids = new Set();
  const tasks = [];

  // Helper to add task
  const add = (i, prio) => {
    if (i < 0 || i >= playlist.length) return;
    const t = playlist[i];
    const uid = String(t.uid).trim();
    if (uid) {
      windowUids.add(uid);
      tasks.push({ uid, priority: prio });
    }
  };

  // Current (Priority 10 - Highest)
  add(idx, 10);
  
  // Next (Priority 9)
  const nextIdx = (idx + 1) % playlist.length;
  if (nextIdx !== idx) add(nextIdx, 9);

  // Prev (Priority 8) - если треков достаточно
  if (playlist.length > 2) {
    const prevIdx = (idx - 1 + playlist.length) % playlist.length;
    if (prevIdx !== idx && prevIdx !== nextIdx) add(prevIdx, 8);
  }

  _currentWindow = windowUids;

  // 2. Garbage Collection (удаляем то, что выпало)
  await _gc([...windowUids]);

  // 3. Запуск скачивания (если есть место)
  if (!(await mgr.hasSpace())) return;

  for (const task of tasks) {
    // Проверяем, есть ли уже (pinned/cloud/dynamic)
    const state = await mgr.getTrackOfflineState(task.uid);
    
    // Если уже есть blob (любого типа) и качество совпадает - пропускаем
    // Если качество отличается -> reCache (это делает сам менеджер)
    if (state.status !== 'none' && !state.needsReCache && !state.downloading) {
       // Уже скачан или в процессе
       continue;
    }

    // Если это Cloud или Pinned — менеджер сам разберётся, не трогаем.
    // Нас интересуют только те, которых нет.
    if (state.status === 'pinned' || state.status === 'cloud') continue;

    // Ставим в очередь как 'playbackCache' (dynamic)
    mgr.enqueueAudioDownload(task.uid, {
      priority: task.priority,
      kind: 'playbackCache'
    });
  }
}

/**
 * Garbage Collection для Playback Cache
 * Удаляет треки типа 'playbackCache', которых нет в keepUids.
 */
async function _gc(keepUids) {
  const mgr = getOfflineManager();
  // Получаем список всех кэшированных (этот метод мы добавили в cache-db, 
  // но доступ к нему через getAllTrackMetas внутри менеджера)
  
  // Примечание: В публичном API OfflineManager нет метода getAllMetas, 
  // но мы можем реализовать чистку через cache-db напрямую или добавить метод.
  // Для надежности используем cache-db.
  
  try {
    const { getAllTrackMetas, deleteTrackCache } = await import('../offline/cache-db.js');
    const metas = await getAllTrackMetas();
    
    for (const m of metas) {
      // Удаляем ТОЛЬКО если тип playbackCache (или dynamic) И его нет в текущем окне
      if ((m.type === 'playbackCache' || m.type === 'dynamic') && !keepUids.includes(m.uid)) {
        console.log(`[PlaybackCache] GC removing: ${m.uid}`);
        await deleteTrackCache(m.uid);
      }
    }
  } catch (e) {
    console.warn('[PlaybackCache] GC failed', e);
  }
}

export default { initPlaybackCache };
