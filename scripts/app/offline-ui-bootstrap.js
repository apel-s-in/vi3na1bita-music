/**
 * offline-ui-bootstrap.js — Инициализация офлайн-UI.
 *
 * Экспортирует bootstrapOfflineUI + alias attachOfflineUI (ТЗ: рассогласование G).
 */

import { getOfflineManager } from '../offline/offline-manager.js';
import { initOfflineIndicators } from '../ui/offline-indicators.js';

export async function bootstrapOfflineUI() {
  try {
    const mgr = getOfflineManager();
    await mgr.initialize();

    /* Запустить систему индикаторов */
    initOfflineIndicators();

    console.log('[OfflineUI] Bootstrap complete');
  } catch (err) {
    console.error('[OfflineUI] Bootstrap failed:', err);
  }
}

/* Alias для совместимости с app.js (boot.attachOfflineUI?.
()) */
export const attachOfflineUI = bootstrapOfflineUI;
