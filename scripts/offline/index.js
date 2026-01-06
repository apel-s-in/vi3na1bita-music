// scripts/offline/index.js
// Точка входа для офлайн-системы (ESM)

export * from './cache-db.js';
export * from './track-resolver.js';
export * from './offline-manager.js';
export * from './playback-cache.js';
export * from './net-policy.js';
export * from './network-manager.js';
export * from './offline-ui.js';

import { initOfflineManager, getOfflineManager } from './offline-manager.js';
import { initNetworkManager, getNetworkManager } from './network-manager.js';
import { getPlaybackCache } from './playback-cache.js';
import { initOfflineUI } from './offline-ui.js';

/**
 * initOfflineSystem — полная инициализация офлайн-системы
 */
export async function initOfflineSystem() {
  // 1. Network manager (first, others depend on it)
  initNetworkManager();

  // 2. Offline manager (IndexedDB, etc.)
  await initOfflineManager();

  // 3. UI components
  initOfflineUI();

  // Expose globally for debugging
  if (typeof window !== 'undefined') {
    window.__offline = {
      manager: getOfflineManager(),
      network: getNetworkManager(),
      playbackCache: getPlaybackCache()
    };
  }

  console.log('[Offline] System initialized');
  return {
    manager: getOfflineManager(),
    network: getNetworkManager(),
    playbackCache: getPlaybackCache()
  };
}
