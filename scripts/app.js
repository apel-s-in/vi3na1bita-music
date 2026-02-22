// scripts/app.js
// Optimized Application Entry Point v2.2 (Removed dead PlayerState code, minimized setup)
(function (W, D) {
  'use strict';

  const $ = (id) => D.getElementById(id);
  const click = (id) => $(id)?.click();
  
  const waitObj = async (name) => {
    const U = W.Utils;
    if (U?.waitFor) return U.waitFor(() => !!W[name]?.initialize, 3000);
    let i = 0; while(!W[name]?.initialize && i++ < 30) await new Promise(r => setTimeout(r, 100));
    return !!W[name];
  };

  const initModules = async () => {
    const C = W.APP_CONFIG || {};

    if (!W.albumsIndex?.length) {
      try { await W.Utils?.onceEvent?.(W, 'albumsIndex:ready', { timeoutMs: 5000 }); } catch {}
    }
    W.albumsIndex = W.albumsIndex || [];

    try {
      // Инициализация оффлайн-ядра и связанных модулей
      const net = await import('./offline/net-policy.js');
      net.initNetPolicy?.();
      
      await (await import('./app/offline-ui-bootstrap.js'))?.initOfflineUI?.();
      
      const offMgr = await import('./offline/offline-manager.js');
      const resolver = await import('./offline/track-resolver.js');
      await offMgr.default.initialize();
      resolver.initTrackResolver(offMgr.default);
      
      await (await import('./app/playback-cache-bootstrap.js'))?.initPlaybackCache?.();
      
      // GlobalStats удален, используется новая UID-Аналитика
    } catch (e) { console.error('Offline/Stats init failed:', e); }

    const run = (n) => W[n]?.initialize();
    // Инициализация UI Кабинета и Прогресс бара (v4.0)
    try {
      const cabUi = await import('./analytics/cabinet-ui.js');
      cabUi.initProgressBar();
    } catch(e) { console.warn('Analytics UI skipped'); }

    if (await waitObj('GalleryManager')) run('GalleryManager');
    // Предзагрузка всех config.json для Витрины до AlbumsManager
    try {
      const showcaseMgr = await import('./app/showcase/index.js');
      await showcaseMgr.default.initialize();
    } catch (e) { console.error('Showcase init failed:', e); }

    if (await waitObj('AlbumsManager')) run('AlbumsManager');
    if (await waitObj('PlayerUI')) run('PlayerUI');

    ['SleepTimer', 'LyricsModal', 'SystemInfoManager'].forEach(m => W[m]?.initialize?.());
    await import('./ui/statistics-modal.js');

    const fb = $('feedback-link');
    if (fb) fb.onclick = (e) => {
      e.preventDefault();
      W.Modals?.open?.({
        title: 'Обратная связь', maxWidth: 420,
        bodyHtml: `<p style="margin-bottom:20px;color:#8ab8fd;text-align:center;">Есть предложения или нашли ошибку?<br>Напишите нам!</p><div style="display:flex;flex-direction:column;gap:15px;max-width:300px;margin:0 auto;"><a href="https://t.me/vitrina_razbita" target="_blank" style="background:#0088cc;color:#fff;padding:15px;border-radius:8px;text-decoration:none;text-align:center;">Telegram</a><a href="mailto:${C.SUPPORT_EMAIL||'support@vitrina-razbita.ru'}" target="_blank" style="background:#4daaff;color:#fff;padding:15px;border-radius:8px;text-decoration:none;text-align:center;">Email</a><a href="${C.GITHUB_URL||'https://github.com/apel-s-in/vi3na1bita-music'}" target="_blank" style="background:#333;color:#fff;padding:15px;border-radius:8px;text-decoration:none;text-align:center;">GitHub</a></div>`
      });
    };
    
    const sl = $('support-link');
    if (sl) sl.href = C.SUPPORT_URL || 'https://example.com/support';
  };

  const setupHotkeys = () => {
    const map = {
      'k': () => W.PlayerUI?.togglePlayPause(),
      ' ': (e) => { e.preventDefault(); W.PlayerUI?.togglePlayPause(); },
      'n': () => W.playerCore?.next(),
      'p': () => W.playerCore?.prev(),
      'x': () => W.playerCore?.stop(),
      'm': () => click('mute-btn'),
      'r': () => click('repeat-btn'),
      'u': () => click('shuffle-btn'),
      'a': () => click('animation-btn'),
      'b': () => click('pulse-btn'),
      'f': () => click('favorites-btn'),
      't': () => W.SleepTimer?.show?.(),
      'y': () => click('lyrics-toggle-btn'),
      'arrowleft': () => W.playerCore?.seek(Math.max(0, (W.playerCore.getPosition() || 0) - 5)),
      'arrowright': () => W.playerCore?.seek(Math.min(W.playerCore.getDuration() || 0, (W.playerCore.getPosition() || 0) + 5)),
      'arrowup': (e) => { e.preventDefault(); W.playerCore?.setVolume(Math.min(100, W.playerCore.getVolume() + 5)); },
      'arrowdown': (e) => { e.preventDefault(); W.playerCore?.setVolume(Math.max(0, W.playerCore.getVolume() - 5)); }
    };

    D.addEventListener('keydown', (e) => {
      if (!['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) map[e.key.toLowerCase()]?.(e);
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
      $('install-pwa-btn') && ($('install-pwa-btn').style.display = 'none');
    });
  };

  const setupSW = () => {
    if (!('serviceWorker' in navigator)) return;
    const h = (e) => {
      if (e.data?.type === 'SW_VERSION') {
        const v = String(e.data.version || '').trim();
        if (v && v !== String(W.VERSION || '')) W.ServiceWorkerManager?.handleVersionMessage?.({ swVer: v });
      }
    };
    navigator.serviceWorker.addEventListener('message', h);
    W.addEventListener('message', h);
  };

  let _init = false;
  W.app = {
    checkShowcaseShare: () => {
      const sp = new URLSearchParams(W.location.search);
      const playlistData = sp.get('playlist');
      if (playlistData && W.ShowcaseManager) {
        W.ShowcaseManager.handleSharedPlaylist(playlistData);
        W.history.replaceState(null, '', W.location.pathname);
      }
    },
    initialize: async () => {
      if (_init) return;
      _init = true;
      try { 
        await initModules(); 
        setupHotkeys(); 
        setupPWA(); 
        setupSW();
        W.app.checkShowcaseShare();
      }
      catch (e) { console.error('App init failed:', e); W.NotificationSystem?.error('Ошибка инициализации'); }
    }
  };
})(window, document);
