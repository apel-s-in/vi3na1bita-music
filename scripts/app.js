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
    const C = W.APP_CONFIG || {};

    // 1. Albums Index
    if (!Array.isArray(W.albumsIndex) || !W.albumsIndex.length) {
      try { await W.Utils?.onceEvent?.(W, 'albumsIndex:ready', { timeoutMs: 5000 }); } catch {}
    }
    W.albumsIndex = Array.isArray(W.albumsIndex) ? W.albumsIndex : [];

    // 2. Offline System
    try {
      const boot = await import('./app/offline-ui-bootstrap.js');
      await boot?.initOfflineUI?.();
    } catch (e) { console.error('Offline boot err:', e); }

    // 3. UI Managers
    const run = (n) => W[n]?.initialize();
    if (await waitObj('GalleryManager')) run('GalleryManager');
    if (await waitObj('AlbumsManager')) run('AlbumsManager');
    if (await waitObj('PlayerUI')) run('PlayerUI');

    // 4. Minor Modules
    ['SleepTimer', 'LyricsModal', 'SystemInfoManager'].forEach(m => W[m]?.initialize?.());
    await import('./ui/statistics-modal.js');

    // 5. Navigation (inline, was NavigationManager)
    $('feedback-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      W.Modals?.open?.({
        title: 'Обратная связь', maxWidth: 420,
        bodyHtml: `<p style="margin-bottom:20px;color:#8ab8fd;text-align:center;">Есть предложения или нашли ошибку?<br>Напишите нам!</p><div style="display:flex;flex-direction:column;gap:15px;max-width:300px;margin:0 auto;"><a href="https://t.me/vitrina_razbita" target="_blank" style="background:#0088cc;color:#fff;padding:15px;border-radius:8px;text-decoration:none;text-align:center;">Telegram</a><a href="mailto:${C.SUPPORT_EMAIL||'support@vitrina-razbita.ru'}" target="_blank" style="background:#4daaff;color:#fff;padding:15px;border-radius:8px;text-decoration:none;text-align:center;">Email</a><a href="${C.GITHUB_URL||'https://github.com/apel-s-in/vi3na1bita-music'}" target="_blank" style="background:#333;color:#fff;padding:15px;border-radius:8px;text-decoration:none;text-align:center;">GitHub</a></div>`
      });
    });
    const sl = $('support-link');
    if (sl) sl.href = C.SUPPORT_URL || 'https://example.com/support';

    // Offline Modal button — handled by initOfflineModal() delegate in offline-modal.js

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
