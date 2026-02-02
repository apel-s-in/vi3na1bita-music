//=================================================
// FILE: /scripts/core/bootstrap.js
// scripts/core/bootstrap.js
// Легковесный загрузчик: проверка env, загрузка config, init.

(function () {
  'use strict';

  const W = window;
  const D = document;

  const fail = (msg) => {
    D.body.innerHTML = `<div style="position:fixed;inset:0;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;font-family:sans-serif"><h2 style="color:#e80100">Ошибка запуска</h2><p>${msg}</p></div>`;
    throw new Error(msg);
  };

  const checkEnv = () => {
    if (!W.fetch || !W.Promise || !W.localStorage) return 'Ваш браузер устарел. Обновите его.';
    try { localStorage.setItem('_t', '1'); localStorage.removeItem('_t'); } catch { return 'Включите Cookies/Storage.'; }
    return null;
  };

  const preventZoom = () => {
    // iOS zoom fix
    D.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    let last = 0;
    D.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - last < 300) e.preventDefault();
      last = now;
    }, { passive: false });
  };

  const loadIndex = async () => {
    try {
      const res = await fetch('./albums.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      W.albumsIndex = (await res.json())?.albums || [];
      W.dispatchEvent(new Event('albumsIndex:ready'));
    } catch (e) {
      console.error(e);
      W.albumsIndex = []; // Не роняем, даём запуститься пустым (для offline кэша)
    }
  };

  const waitForHowler = async () => {
    for (let i = 0; i < 50; i++) { // 5 sec max
      if (W.Howler) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  };

  const init = async () => {
    const err = checkEnv();
    if (err) return fail(err);

    preventZoom();
    
    // Mark env
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !W.MSStream) D.body.classList.add('ios');
    if (matchMedia('(display-mode: standalone)').matches) D.body.classList.add('standalone');

    if (!(await waitForHowler())) return fail('Ошибка загрузки аудио-движка (Howler).');

    await loadIndex();
  };

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init);
  else init();

})();
