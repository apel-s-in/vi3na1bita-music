/**
 * playback-cache-bootstrap.js — Контроллер окна (R1).
 * Строгое соблюдение ТЗ: R0 = нет кэша, R1 = 3 трека.
 */
import { getOfflineManager } from '../offline/offline-manager.js';

let _initialized = false;
let _currentWindow = new Set(); 

export function initPlaybackCache() {
  if (_initialized) return;
  _initialized = true;

  window.addEventListener('player:trackChanged', (e) => _updateWindow());
  window.addEventListener('offline:uiChanged', () => _updateWindow()); // Mode change or Net change
  window.addEventListener('online', () => _updateWindow());
}

async function _updateWindow() {
  const mgr = getOfflineManager();
  const mode = mgr.getMode(); // 'R0' or 'R1'
  const pc = window.playerCore;
  
  // R0: Очистка всего transient
  if (mode !== 'R1') {
    if (_currentWindow.size > 0) {
      _currentWindow.clear();
      await _gc([]); // Keep nothing transient
    }
    return;
  }

  // R1: Расчет окна 3 треков
  const idx = pc.getIndex();
  const playlist = pc.getPlaylistSnapshot() || [];
  if (idx === -1 || !playlist.length) return;

  const windowUids = new Set();
  const tasks = [];

  const add = (i, p) => {
      const t = playlist[i];
      if (t && t.uid) {
          const u = String(t.uid).trim();
          windowUids.add(u);
          tasks.push({ uid: u, priority: p });
      }
  };

  // CUR (P10), NEXT (P9), PREV (P8)
  add(idx, 10);
  
  if (playlist.length > 1) {
      const nextIdx = (idx + 1) % playlist.length;
      add(nextIdx, 9);
  }
  
  if (playlist.length > 2) {
      const prevIdx = (idx - 1 + playlist.length) % playlist.length;
      add(prevIdx, 8);
  }

  _currentWindow = windowUids;

  // GC: Удалить transient, которых нет в окне
  await _gc([...windowUids]);

  // Запуск загрузки
  if (await mgr.hasSpace()) {
      for (const t of tasks) {
          // OfflineManager сам решит, качать ли (если уже есть Pinned/Cloud - пропустит)
          // kind='playbackCache' означает transient
          mgr.enqueueAudioDownload(t.uid, { priority: t.priority, kind: 'playbackCache' });
      }
  }
}

async function _gc(keepUids) {
  // Вызов метода удаления transient файлов
  // В cache-db мы добавим метод удаления по типу, или переберем здесь
  // Для упрощения предполагаем, что OfflineManager имеет доступ к чистке
  // В данной реализации: удаляем файлы типа 'playbackCache' которых нет в keepUids
  try {
      const { getAllTrackMetas, deleteTrackCache } = await import('../offline/cache-db.js');
      const metas = await getAllTrackMetas();
      for (const m of metas) {
          if (m.type === 'playbackCache' && !keepUids.includes(m.uid)) {
              await deleteTrackCache(m.uid);
          }
      }
  } catch (e) { console.error(e); }
}
