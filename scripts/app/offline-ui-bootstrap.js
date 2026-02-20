/**
 * scripts/app/offline-ui-bootstrap.js
 * Optimized Bridge for Network Policy & Service Worker.
 * FIX: Syncs TRUE airplane mode from NetPolicy to SW. Eliminates dead DOM listeners.
 */
export async function initOfflineUI() {
  // 1. Синхронизация Авиарежима с Service Worker
  const sync = () => {
    const isAir = window.NetPolicy ? window.NetPolicy.getNetPolicyState().airplaneMode : !navigator.onLine;
    navigator.serviceWorker?.controller?.postMessage({ type: 'SYNC_AIRPLANE_MODE', payload: isAir });
  };
  ['netPolicy:changed', 'online', 'offline'].forEach(e => window.addEventListener(e, sync));
  sync();

  // 2. Инициализация UI-компонентов оффлайн-системы
  try {
    (await import('../ui/offline-indicators.js'))?.initOfflineIndicators?.();
    (await import('../ui/offline-modal.js'))?.initOfflineModal?.();
    (await import('../ui/cache-progress-overlay.js'))?.initCacheProgressOverlay?.();
  } catch (e) { console.error('Offline UI init failed:', e); }
}

export default { initOfflineUI };
