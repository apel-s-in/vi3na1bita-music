/**
 * scripts/app/offline-ui-bootstrap.js
 * Optimized Bridge for Network Policy & Service Worker.
 * FIX: Syncs TRUE airplane mode from NetPolicy to SW. Eliminates dead DOM listeners.
 */
export function initOfflineUI() {
  const syncAirplaneModeToSW = () => {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;
    
    // The source of truth is NetPolicy (if available), fallback to offline status
    const isAirplane = window.NetPolicy 
      ? window.NetPolicy.getNetPolicyState().airplaneMode 
      : !navigator.onLine;

    navigator.serviceWorker.controller.postMessage({
      type: 'SYNC_AIRPLANE_MODE',
      payload: isAirplane
    });
  };

  // Spec 9.5: Listen to the correct global event emitted by net-policy.js
  window.addEventListener('netPolicy:changed', syncAirplaneModeToSW);
  window.addEventListener('online', syncAirplaneModeToSW);
  window.addEventListener('offline', syncAirplaneModeToSW);

  // Initial sync on load
  if (document.readyState === 'complete') {
    syncAirplaneModeToSW();
  } else {
    window.addEventListener('load', syncAirplaneModeToSW);
  }
}

export default { initOfflineUI };
