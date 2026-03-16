(function(W, D) {
  'use strict';
  const $ = id => D.getElementById(id), LS = localStorage, K = 'promocode', IK = 'iosInstallDismissed', isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !W.MSStream;
  const unlock = () => { $('promocode-block')?.classList.add('hidden'); $('main-block')?.classList.remove('hidden'); const init = () => W.app?.initialize?.(); if (!init()) { let a = 0, t = setInterval(() => (init() || ++a > 50) && clearInterval(t), 50); } };
  const showIOS = () => {
    if (!isIOS || matchMedia('(display-mode: standalone)').matches || navigator.standalone || LS.getItem(IK)) return;
    W.Utils?.dom?.createStyleOnce?.('ios-prompt-inline-cleanup', `.ios-prompt-title{font-weight:800;font-size:18px;margin-bottom:8px}.ios-prompt-text{opacity:.85;margin-bottom:14px}`);
    setTimeout(() => {
      const el = D.createElement('div'); el.className = 'ios-install-prompt';
      el.innerHTML = `<button class="ios-prompt-close" type="button">×</button><div class="ios-prompt-content"><img class="ios-prompt-icon" src="icons/apple-touch-icon.png"><div class="ios-prompt-title">Установить приложение</div><div class="ios-prompt-text">Нажмите <strong>Поделиться</strong> ↗️<br>и выберите <strong>«На экран Домой»</strong></div><button class="ios-prompt-button" type="button">Понятно</button></div>`;
      el.onclick = e => { if (e.target.closest('button') || e.target.closest('.ios-prompt-close')) { el.classList.remove('show'); LS.setItem(IK, '1'); setTimeout(() => el.remove(), 350); } };
      D.body.appendChild(el); requestAnimationFrame(() => el.classList.add('show'));
    }, 2500);
  };

  W.addEventListener('load', () => {
    if (isIOS) D.body.classList.add('ios');
    const c = String(W.APP_CONFIG?.PROMOCODE || '').trim(), i = $('promo-inp');
    if (!c || LS.getItem(K) === c) return unlock(), showIOS();
    const chk = () => {
      if (i?.value.trim() === c) { LS.setItem(K, c); unlock(); i.blur(); }
      else if (i) { const e = $('promo-error'); if (e) e.textContent = '❌ Неверный промокод'; i.classList.add('error'); setTimeout(() => { if (e) e.textContent = ''; i.classList.remove('error'); }, 2000); }
    };
    $('promo-btn')?.addEventListener('click', chk);
    i?.addEventListener('keydown', e => (e.key === 'Enter' || e.keyCode === 13) && (e.preventDefault(), chk()));
    setTimeout(() => i && !i.disabled && i.focus(), 100);
    showIOS();
  });
})(window, document);
