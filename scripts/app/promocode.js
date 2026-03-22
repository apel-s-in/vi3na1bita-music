(function(W, D) {
  'use strict';
  const $ = id => D.getElementById(id), LS = localStorage, K = 'promocode', isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !W.MSStream;
  const unlock = () => { $('promocode-block')?.classList.add('hidden'); $('main-block')?.classList.remove('hidden'); const init = () => W.app?.initialize?.(); if (!init()) { let a = 0, t = setInterval(() => (init() || ++a > 50) && clearInterval(t), 50); } };
  
  W.addEventListener('load', () => {
    if (isIOS) D.body.classList.add('ios');
    const c = String(W.APP_CONFIG?.PROMOCODE || '').trim(), i = $('promo-inp');
    if (!c || LS.getItem(K) === c) return unlock();
    const chk = () => {
      if (i?.value.trim() === c) { LS.setItem(K, c); unlock(); i.blur(); }
      else if (i) { const e = $('promo-error'); if (e) e.textContent = '❌ Неверный промокод'; i.classList.add('error'); setTimeout(() => { if (e) e.textContent = ''; i.classList.remove('error'); }, 2000); }
    };
    $('promo-btn')?.addEventListener('click', chk);
    i?.addEventListener('keydown', e => (e.key === 'Enter' || e.keyCode === 13) && (e.preventDefault(), chk()));
    setTimeout(() => i && !i.disabled && i.focus(), 100);
  });
})(window, document);
