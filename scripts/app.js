// scripts/app.js
// Optimized Application Entry Point v2.1
(function (W, D) {
  'use strict';

  const $ = (id) => D.getElementById(id);
  const click = (id) => $(id)?.click();
  
  // Wait helper using new Utils
  const waitObj = async (name) => {
    const U = W.Utils;
    if (U?.waitFor) return U.waitFor(() => !!W[name]?.initialize, 3000);
    let i = 0; while(!W[name]?.initialize && i++ < 30) await new Promise(r => setTimeout(r, 100));
    return !!W[name];
  };

  const initModules = async () => {
    // 1. Albums Index
    if (!Array.isArray(W.albumsIndex) || !W.albumsIndex.length) {
      try { await W.Utils?.onceEvent?.(W, 'albumsIndex:ready', { timeoutMs: 5000 }); } catch {}
    }
    W.albumsIndex = Array.isArray(W.albumsIndex) ? W.albumsIndex : [];

    // 2. Offline System
    try {
      const boot = await import('./app/offline-ui-bootstrap.js');
      boot?.attachOfflineUI?.();
      
      Promise.all([
        import('./ui/offline-indicators.js'),
        import('./ui/cache-progress-overlay.js'),
        import('./app/playback-cache-bootstrap.js')
      ]).then(([ind, ov, pb]) => {
        ind?.initOfflineIndicators?.();
        ov?.initCacheProgressOverlay?.();
        pb?.initPlaybackCache?.();
      });
    } catch (e) { console.error('Offline boot err:', e); }

    // 3. UI Managers
    const run = (n) => W[n]?.initialize();
    if (await waitObj('GalleryManager')) run('GalleryManager');
    if (await waitObj('AlbumsManager')) run('AlbumsManager');
    if (await waitObj('PlayerUI')) run('PlayerUI');

    // 4. Minor Modules
    ['SleepTimer', 'LyricsModal', 'SystemInfoManager'].forEach(m => W[m]?.initialize?.());
    await import('./ui/statistics-modal.js');

    // 5. Offline Modal button
    const offBtn = D.getElementById('offline-btn');
    if (offBtn) {
      offBtn.addEventListener('click', async () => {
        const { showOfflineModal } = await import('./ui/offline-modal.js');
        showOfflineModal();
      });
    }

    // 5. Restore State
    W.PlayerState?.apply?.();
  };

  const setupHotkeys = () => {
    const pc = W.playerCore;
    const map = {
      'k': () => W.PlayerUI?.togglePlayPause(),
      ' ': (e) => { e.preventDefault(); W.PlayerUI?.togglePlayPause(); },
      'n': () => pc?.next(),
      'p': () => pc?.prev(),
      'x': () => pc?.stop(),
      'm': () => click('mute-btn'),
      'r': () => click('repeat-btn'),
      'u': () => click('shuffle-btn'),
      'a': () => click('animation-btn'),
      'b': () => click('pulse-btn'),
      'f': () => click('favorites-btn'),
      't': () => W.SleepTimer?.show?.(),
      'y': () => click('lyrics-toggle-btn'),
      'arrowleft': () => pc?.seek(Math.max(0, (pc.getPosition() || 0) - 5)),
      'arrowright': () => pc?.seek(Math.min(pc.getDuration() || 0, (pc.getPosition() || 0) + 5)),
      'arrowup': (e) => { e.preventDefault(); pc?.setVolume(Math.min(100, pc.getVolume() + 5)); },
      'arrowdown': (e) => { e.preventDefault(); pc?.setVolume(Math.max(0, pc.getVolume() - 5)); }
    };

    D.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;
      const h = map[e.key.toLowerCase()];
      if (h) h(e);
    });
  };

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
    W.addEventListener('message', h);
  };

  let _init = false;
  W.app = {
    initialize: async () => {
      if (_init) return;
      _init = true;
      try { await initModules(); setupHotkeys(); setupPWA(); setupSW(); }
      catch (e) { console.error('App init failed:', e); W.NotificationSystem?.error('Ошибка инициализации'); }
    }
  };
})(window, document);
