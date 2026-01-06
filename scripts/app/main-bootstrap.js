// scripts/app/main-bootstrap.js
// Точка входа для инициализации offline-системы

import { attachOfflineUI } from './offline-ui-bootstrap.js';
import { attachOfflineIndicators } from '../ui/offline-indicators.js';
import { attachPlaybackCache } from './playback-cache-bootstrap.js';
import { NetworkManager } from './network-manager.js';
import { registerTracks } from './track-registry.js';

export function initOfflineSystem() {
  NetworkManager.init();

  attachOfflineUI();

  setTimeout(() => {
    attachOfflineIndicators();
  }, 100);

  setTimeout(() => {
    attachPlaybackCache();
  }, 300);
}

export function registerTracksForOffline(tracks) {
  registerTracks(tracks);
}

// Auto-init if DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initOfflineSystem, 50);
  });
} else {
  setTimeout(initOfflineSystem, 50);
}
