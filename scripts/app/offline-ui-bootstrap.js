export async function initOfflineUI() {
  if (!window.Utils?.func?.initOnce?.('app:offline-ui-bootstrap:init', () => {})) return;
  const sync = () => navigator.serviceWorker?.controller?.postMessage({ type: 'SYNC_AIRPLANE_MODE', payload: window.NetPolicy ? window.NetPolicy.getNetPolicyState().airplaneMode : !navigator.onLine });
  ['netPolicy:changed', 'online', 'offline'].forEach(e => window.addEventListener(e, sync)); sync();
  try { (await import('../ui/offline-indicators.js'))?.initOfflineIndicators?.(); (await import('../ui/offline-modal.js'))?.initOfflineModal?.(); (await import('../ui/cache-progress-overlay.js'))?.initCacheProgressOverlay?.(); } catch (e) { console.error('Offline UI init failed:', e); }
}
export default { initOfflineUI };
