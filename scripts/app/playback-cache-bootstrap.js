/**
 * playback-cache-bootstrap.js — Мост между PlayerCore и OfflineManager.
 *
 * ТЗ: П.7 (Playback Window), П.3.1 (качество)
 *
 * Слушает события плеера и обновляет playback-window.
 */

import { getOfflineManager } from '../offline/offline-manager.js';

let _booted = false;

export async function bootstrapPlaybackCache() {
  if (_booted) return;
  _booted = true;

  const mgr = getOfflineManager();

  /* Слушаем смену трека от плеера */
  window.addEventListener('player:trackChanged', async (e) => {
    const { uid, playlist } = e.detail || {};
    if (!uid) return;

    const mode = mgr.getMode();

    /* В R2/R3 режимах обновляем playback window (ТЗ П.7) */
    if (mode === 'R2' || mode === 'R3') {
      try {
        await mgr.updatePlaybackWindow(uid, playlist || [], 2);
      } catch (err) {
        console.warn('[PlaybackCache] updatePlaybackWindow failed:', err.message);
      }
    }
  });

  /* Слушаем завершение прослушивания */
  window.addEventListener('player:listenComplete', async (e) => {
    const { uid, pct } = e.detail || {};
    if (uid && pct >= 0.97) {
      try {
        await mgr.registerFullListen(uid);
      } catch (err) {
        console.warn('[PlaybackCache] registerFullListen failed:', err.message);
      }
    }
  });

  console.log('[PlaybackCache] Bootstrap complete.');
}

export default bootstrapPlaybackCache;
