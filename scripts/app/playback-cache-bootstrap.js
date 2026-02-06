/**
 * playback-cache-bootstrap.js — Инициализация кэша воспроизведения
 * Связывает PlayerCore с OfflineManager для кэширования при прослушивании
 */

import { getOfflineManager } from '../offline/offline-manager.js';

export function initPlaybackCache() {
  const mgr = getOfflineManager();

  // Слушаем события смены трека от плеера
  window.addEventListener('player:trackChanged', async (e) => {
    const { uid, quality } = e.detail || {};
    if (!uid) return;
    if (mgr.getMode() === 'R0') return;

    // Проверяем, закэширован ли уже
    const complete = await mgr.isTrackComplete(uid, quality || mgr.getActivePlaybackQuality());
    if (complete) return;

    // Ставим в очередь загрузки с приоритетом «воспроизведение»
    mgr.enqueueAudioDownload({
      uid,
      quality: quality || mgr.getActivePlaybackQuality(),
      priority: 100,
      kind: 'playbackCache'
    });
  });

  // Предзагрузка следующих треков из playback window
  window.addEventListener('player:playbackWindowUpdate', (e) => {
    const uids = e.detail?.uids || [];
    mgr.updatePlaybackWindow(uids);

    if (mgr.getMode() === 'R0') return;

    uids.forEach((uid, i) => {
      mgr.enqueueAudioDownload({
        uid,
        quality: mgr.getActivePlaybackQuality(),
        priority: 50 - i,
        kind: 'playbackCache'
      });
    });
  });

  console.log('[PlaybackCache] initialized');
}

export default initPlaybackCache;
