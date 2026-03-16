(function () {
  'use strict';
  const fail = m => { document.body.innerHTML = window.Utils?.profileModals?.failScreen?.(m) || `<div><h2>Ошибка</h2><p>${m}</p></div>`; throw new Error(m); };
  const init = async () => {
    if (!window.fetch || !window.Promise || !window.localStorage) return fail('Ваш браузер устарел.');
    try { localStorage.setItem('_t', '1'); localStorage.removeItem('_t'); } catch { return fail('Включите Storage.'); }
    let l = 0; document.addEventListener('touchstart', e => e.touches.length > 1 && e.preventDefault(), { passive: false });
    document.addEventListener('touchend', e => { const n = Date.now(); if (n - l < 300) e.preventDefault(); l = n; }, { passive: false });
    const ua = navigator.userAgent; document.body.classList.add(/iPad|iPhone|iPod/.test(ua) && !window.MSStream ? 'ios' : (/Android|webOS/i.test(ua) ? 'android' : ''), /Mobi/i.test(ua) ? 'mobile-device' : '');
    if (matchMedia('(display-mode: standalone)').matches) document.body.classList.add('standalone');
    let hwOk = false; for (let i = 0; i < 50 && !hwOk; i++) { if (window.Howler) hwOk = true; else await new Promise(r => setTimeout(r, 100)); }
    if (!hwOk) return fail('Ошибка загрузки аудио-движка.');
    try { window.albumsIndex = (await (await fetch('./albums.json')).json())?.albums || []; } catch { window.albumsIndex = []; }
    window.dispatchEvent(new Event('albumsIndex:ready'));
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
