// scripts/app.js
// Optimized Application Entry Point v2.0
(function (W, D) {
  'use strict';

  // --- Helpers ---
  const $ = (id) => D.getElementById(id);
  const click = (id) => $(id)?.click();
  
  // Ленивое ожидание готовности глобальных менеджеров (loaded via defer)
  const waitObj = async (name, t = 3000) => {
    const U = W.Utils;
    if (U?.waitFor) return U.waitFor(() => !!W[name]?.initialize, t);
    // Fallback если Utils еще нет
    let i = 0; while(!W[name]?.initialize && i++ < 30) await new Promise(r => setTimeout(r, 100));
    return !!W[name];
  };

  const initModules = async () => {
    // 1. Albums Index
    if (!Array.isArray(W.albumsIndex) || !W.albumsIndex.length) {
      try { await W.Utils?.onceEvent(W, 'albumsIndex:ready', { timeoutMs: 5000 }); } catch {}
    }
    W.albumsIndex = Array.isArray(W.albumsIndex) ? W.albumsIndex : [];

    // 2. Offline System (Critical Path - Sequential)
    try {
      const boot = await import('./app/offline-ui-bootstrap.js');
      boot?.attachOfflineUI?.();
      
      // Parallel loading of secondary offline UI & logic
      Promise.all([
        import('./ui/offline-indicators.js'),
        import('./ui/cache-progress-overlay.js'),
        import('./app/playback-cache-bootstrap.js'),
        import('./ui/offline-modal.js')
      ]).then(([ind, ov, pb, mod]) => {
        ind?.attachOfflineIndicators?.();
        ov?.attachCacheProgressOverlay?.();
        pb?.attachPlaybackCache?.();
        // Preload track registry once for Offline Modal 100% feature
        if (localStorage.getItem('offline:preloadAllTracksOnce:v1') !== '1' && mod?.preloadAllAlbumsTrackIndex) {
          mod.preloadAllAlbumsTrackIndex().then(() => localStorage.setItem('offline:preloadAllTracksOnce:v1', '1'));
        }
      });
    } catch (e) { console.error('Offline boot err:', e); }

    // 3. Core UI Managers (Wait for defer scripts)
    const run = (n) => W[n]?.initialize();
    if (await waitObj('GalleryManager')) run('GalleryManager');
    if (await waitObj('AlbumsManager')) run('AlbumsManager');
    if (await waitObj('PlayerUI')) run('PlayerUI');

    // 4. Minor Modules
    ['SleepTimer', 'LyricsModal', 'SystemInfoManager'].forEach(m => W[m]?.initialize?.());

    // 5. Restore State
    W.PlayerState?.apply?.();
  };

  // --- Hotkeys ---
  const setupHotkeys = () => {
    const keyMap = {
      'k': () => W.PlayerUI?.togglePlayPause(),
      ' ': (e) => { e.preventDefault(); W.PlayerUI?.togglePlayPause(); }, // Prevent scroll
      'n': () => W.playerCore?.next(),
      'p': () => W.playerCore?.prev(),
      'x': () => W.playerCore?.stop(),
      'm': () => click('mute-btn'),
      'r': () => click('repeat-btn'),
      'u': () => click('shuffle-btn'),
      'a': () => click('animation-btn'),
      'b': () => click('pulse-btn'),
      'f': () => click('favorites-btn'), // Favorites Only
      't': () => W.SleepTimer?.show?.(),
      'y': () => click('lyrics-toggle-btn'),
      'arrowleft': () => W.playerCore?.seek(Math.max(0, (W.playerCore.getPosition() || 0) - 5)),
      'arrowright': () => W.playerCore?.seek(Math.min(W.playerCore.getDuration() || 0, (W.playerCore.getPosition() || 0) + 5)),
      'arrowup': (e) => { e.preventDefault(); W.playerCore?.setVolume(Math.min(100, W.playerCore.getVolume() + 5)); },
      'arrowdown': (e) => { e.preventDefault(); W.playerCore?.setVolume(Math.max(0, W.playerCore.getVolume() - 5)); }
    };

    D.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;
      const h = keyMap[e.key.toLowerCase()];
      if (h) h(e);
    });
  };

  // --- PWA & SW ---
  const setupPWA = () => {
    W.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      const btn = $('install-pwa-btn');
      if (!btn) return;
      btn.style.display = 'block';
      btn.onclick = async () => {
        e.prompt();
        if ((await e.userChoice).outcome === 'accepted') W.NotificationSystem?.success('Приложение установлено!');
        btn.style.display = 'none';
      };
    });
    W.addEventListener('appinstalled', () => {
      W.NotificationSystem?.success('Успешно установлено!');
      const btn = $('install-pwa-btn');
      if (btn) btn.style.display = 'none';
    });
  };

  const setupSW = () => {
    if (!('serviceWorker' in navigator)) return;
    const h = (e) => {
      const d = e.data;
      if (d?.type === 'SW_VERSION') {
        const v = String(d.version || '').trim();
        if (v && v !== String(W.VERSION || '')) W.ServiceWorkerManager?.handleVersionMessage?.({ swVer: v });
      }
    };
    navigator.serviceWorker.addEventListener('message', h);
    W.addEventListener('message', h); // Backup channel
  };

  // --- Main Export ---
  let _init = false;
  W.app = {
    initialize: async () => {
      if (_init) return;
      _init = true;
      try {
        await initModules();
        setupHotkeys();
        setupPWA();
        setupSW();
      } catch (e) {
        console.error('App init failed:', e);
        W.NotificationSystem?.error('Ошибка инициализации');
      }
    }
  };
})(window, document);
