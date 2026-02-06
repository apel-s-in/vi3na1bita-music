/**
 * playback-cache-bootstrap.js — Инициализация кэширования при воспроизведении.
 *
 * Экспортирует bootstrapPlaybackCache + alias initPlaybackCache (ТЗ: рассогласование G).
 */

import { getOfflineManager } from '../offline/offline-manager.js';

export async function bootstrapPlaybackCache() {
  try {
    const mgr = getOfflineManager();

    /* Слушаем событие окончания трека для registerFullListen */
    window.addEventListener('player:trackEnded', async (e) => {
      const uid = e.detail?.uid;
      if (!uid) return;

      const fullPlay = e.detail?.fullPlay ?? false;
      if (fullPlay) {
        await mgr.registerFullListen(uid);
      }
    });

    /* Слушаем событие начала воспроизведения — обновляем индикаторы */
    window.addEventListener('player:trackStarted', () => {
      window.dispatchEvent(new CustomEvent('offline:stateChanged'));
    });

    console.log('[PlaybackCache] Bootstrap complete');
  } catch (err) {
    console.error('[PlaybackCache] Bootstrap failed:', err);
  }
}

/* Alias для совместимости с app.js (pb.initPlaybackCache?.()) */
export const initPlaybackCache = bootstrapPlaybackCache;
