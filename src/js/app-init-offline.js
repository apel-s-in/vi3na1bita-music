/**
 * App Init Offline v1.0
 * Точка входа — вызывается после загрузки конфига и DOM
 * Подключает integration-bridge к существующему приложению
 */

(function() {
  'use strict';

  function waitForDeps(callback, maxWait) {
    const start = Date.now();
    const check = () => {
      // Check for essential deps
      const hasPlayer = !!(window.PlayerCore || window.playerCore);
      const hasBridge = !!window.OfflineBridge;
      const hasConfig = !!(window.appConfig || window.tracksConfig);
      const domReady = document.readyState !== 'loading';

      if (hasPlayer && hasBridge && domReady) {
        callback();
        return;
      }

      if (Date.now() - start > (maxWait || 10000)) {
        console.warn('[AppInitOffline] Timeout waiting for deps. Proceeding anyway.');
        callback();
        return;
      }

      setTimeout(check, 200);
    };
    check();
  }

  function initOfflineSystem() {
    console.log('[AppInitOffline] Starting...');

    const playerCore = window.PlayerCore || window.playerCore;
    if (!playerCore) {
      console.error('[AppInitOffline] PlayerCore not found!');
      return;
    }

    // Gather tracks from config
    let allTracks = [];
    let albumsData = [];
    let baseUrl = '';

    // Try various config sources
    if (window.appConfig) {
      allTracks = window.appConfig.tracks || window.appConfig.allTracks || [];
      albumsData = window.appConfig.albums || [];
      baseUrl = window.appConfig.baseUrl || window.appConfig.audioBaseUrl || '';
    }

    if (allTracks.length === 0 && window.tracksConfig) {
      allTracks = window.tracksConfig;
    }

    if (allTracks.length === 0) {
      // Try to gather from DOM
      const trackEls = document.querySelectorAll('[data-uid]');
      trackEls.forEach(el => {
        const uid = el.dataset.uid;
        const title = el.dataset.title || el.textContent.trim();
        const audio = el.dataset.audio;
        const audioLow = el.dataset.audioLow;
        if (uid && audio) {
          allTracks.push({ uid, title, audio, audio_low: audioLow });
        }
      });
    }

    // Detect base URL
    if (!baseUrl) {
      // Try to infer from first track URL
      if (allTracks.length > 0 && allTracks[0].audio) {
        const parts = allTracks[0].audio.split('/');
        if (parts.length > 1) {
          // Don't set base — paths are relative
        }
      }
    }

    console.log(`[AppInitOffline] Found ${allTracks.length} tracks, ${albumsData.length} albums`);

    // Initialize
    if (window.OfflineBridge && window.OfflineBridge.initialize) {
      window.OfflineBridge.initialize({
        playerCore,
        allTracks,
        albumsData,
        baseUrl
      });
    }
  }

  // Auto-init when ready
  waitForDeps(initOfflineSystem);
})();
