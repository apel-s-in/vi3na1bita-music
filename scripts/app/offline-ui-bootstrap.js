/**
 * offline-ui-bootstrap.js — Инициализация всех offline UI компонентов.
 * Fix #4.6/#15.1: вызов initNetPolicy()
 * Fix #15.2: проверка 60 МБ при старте R1
 */

import { initOfflineIndicators } from '../ui/offline-indicators.js';
import { initOfflineModal } from '../ui/offline-modal.js';
import { initStatisticsModal } from '../ui/statistics-modal.js';
import { initCacheProgressOverlay } from '../ui/cache-progress-overlay.js';
import { initNetPolicy } from '../offline/net-policy.js';

let _initialized = false;

export async function initOfflineUI() {
  if (_initialized) return;
  _initialized = true;

  /* 0. NetPolicy — MUST be first (Fix #4.6, #15.1) */
  initNetPolicy();

  /* 0a. GlobalStatsManager */
  try {
    const { default: GlobalStats } = await import('../stats/global-stats.js');
    await GlobalStats.initialize();
  } catch (e) {
    console.warn('[OfflineUI] GlobalStatsManager init failed:', e);
  }

  /* 0b. OfflineManager */
  try {
    const { getOfflineManager } = await import('../offline/offline-manager.js');
    const mgr = getOfflineManager();
    await mgr.initialize();
    // Fix #1.7: TrackResolver
    try {
      const { initTrackResolver } = await import('../offline/track-resolver.js');
      initTrackResolver(mgr);
    } catch (e) {
      console.warn('[OfflineUI] TrackResolver init failed:', e);
    }

    /* Fix #15.2: Check 60 MB at R1 startup */
    if (mgr.getMode() === 'R1') {
      const hasEnough = await mgr.hasSpace();
      if (!hasEnough) {
        mgr.setMode('R0');
        window.NotificationSystem?.warning?.('Недостаточно места, PlaybackCache отключён');
      }
    }
  } catch (e) {
    console.warn('[OfflineUI] OfflineManager init failed:', e);
  }

  /* 1. Индикаторы 🔒/☁ */
  initOfflineIndicators();

  /* 2. Модальное окно OFFLINE */
  initOfflineModal();

  /* 3. Статистика */
  initStatisticsModal();

  /* 4. Overlay прогресса */
  initCacheProgressOverlay();

  /* 5. Playback Cache */
  try {
    const { initPlaybackCache } = await import('./playback-cache-bootstrap.js');
    initPlaybackCache();
  } catch (e) {
    console.warn('[OfflineUI] PlaybackCache init failed:', e);
  }

  /* 6. Offline Playback — skip при потере сети (#19.1-19.3) */
  try {
    const { initOfflinePlayback } = await import('../offline/offline-playback.js');
    initOfflinePlayback();
  } catch (e) {
    console.warn('[OfflineUI] OfflinePlayback init failed:', e);
  }

  /* 7. Update Checker — детекция обновлений config.json (#1.9, #21.1) */
  try {
    const { initUpdateChecker } = await import('../offline/update-checker.js');
    initUpdateChecker();
  } catch (e) {
    console.warn('[OfflineUI] UpdateChecker init failed:', e);
  }

  console.log('[OfflineUI] All components initialized');
}

export default { initOfflineUI };
