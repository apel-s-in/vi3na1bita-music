/**
 * offline-ui-bootstrap.js — Инициализация офлайн-UI при старте приложения.
 *
 * Подключается в app.js.
 * Инициализирует OfflineManager, подписывается на события,
 * обновляет UI-индикаторы.
 */

import { getOfflineManager } from '../offline/offline-manager.js';

let _booted = false;

export async function bootstrapOfflineUI() {
  if (_booted) return;
  _booted = true;

  try {
    const mgr = getOfflineManager();
    await mgr.initialize();

    console.log('[OfflineUI] OfflineManager initialized. Mode:', mgr.getMode());

    /* Подписка на прогресс */
    mgr.on('progress', (data) => {
      if (data.phase === 'reCache') {
        console.log(`[OfflineUI] Re-cache progress: ${data.done}/${data.total}`);
      }
    });

    /* Подгружаем индикаторы */
    try {
      const { initOfflineIndicators } = await import('../ui/offline-indicators.js');
      initOfflineIndicators();
    } catch (e) {
      console.warn('[OfflineUI] Indicators module not loaded:', e.message);
    }

    /* Отслеживание online/offline */
    window.addEventListener('online', () => {
      console.log('[OfflineUI] Back online — resuming downloads.');
      mgr.resumeDownloads();
    });

    window.addEventListener('offline', () => {
      console.log('[OfflineUI] Gone offline — pausing downloads.');
      mgr.pauseDownloads();
    });

    /* Если режим офлайн — показать уведомление */
    if (mgr.isOfflineMode()) {
      window.NotificationSystem?.info?.('Режим офлайн активен.');
    }

  } catch (err) {
    console.error('[OfflineUI] Bootstrap failed:', err);
  }
}

export default bootstrapOfflineUI;
