/**
 * offline-ui-bootstrap.js — Инициализация всех offline UI компонентов.
 *
 * Вызывается один раз при старте приложения.
 * Собирает воедино: indicators, modal, progress overlay.
 */

import { initOfflineIndicators } from '../ui/offline-indicators.js';
import { initOfflineModal } from '../ui/offline-modal.js';
import { initStatisticsModal } from '../ui/statistics-modal.js';
import { initCacheProgressOverlay } from '../ui/cache-progress-overlay.js';

let _initialized = false;

/**
 * initOfflineUI() — вызвать после DOMContentLoaded и после OfflineManager.init().
 */
export async function initOfflineUI() {
  if (_initialized) return;
  _initialized = true;

  /* 0. Инициализация OfflineManager (открыть IndexedDB, очистить expired) */
  try {
    const { getOfflineManager } = await import('../offline/offline-manager.js');
    await getOfflineManager().initialize();
  } catch (e) {
    console.warn('[OfflineUI] OfflineManager init failed:', e);
  }

  /* 1. Индикаторы 🔒/☁ в трек-листе */
  initOfflineIndicators();

  /* 2. Модальное окно OFFLINE */
  initOfflineModal();

  /* 3. Статистика */
  initStatisticsModal();

  /* 4. Overlay прогресса загрузки */
  initCacheProgressOverlay();

  console.log('[OfflineUI] All components initialized');
}

export default { initOfflineUI };
