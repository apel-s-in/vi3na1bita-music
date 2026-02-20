(function(W, D) {
  'use strict';
  const LS = localStorage, KEY = 'promocode', IOS_KEY = 'iosInstallDismissed';
  const $ = id => D.getElementById(id);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !W.MSStream;
  
  const unlock = () => {
    $('promocode-block')?.classList.add('hidden');
    $('main-block')?.classList.remove('hidden');
    const init = () => W.app?.initialize?.();
    if (!init()) { let a = 0, t = setInterval(() => (init() || ++a > 50) && clearInterval(t), 50); }
  };

  const showIOS = () => {
    if (!isIOS || matchMedia('(display-mode: standalone)').matches || navigator.standalone || LS.getItem(IOS_KEY)) return;
    setTimeout(() => {
      const el = D.createElement('div');
      el.className = 'ios-install-prompt';
      el.innerHTML = `<button class="ios-prompt-close" type="button">×</button><div class="ios-prompt-content"><img class="ios-prompt-icon" src="icons/apple-touch-icon.png"><div style="font-weight:800;font-size:18px;margin-bottom:8px">Установить приложение</div><div style="opacity:.85;margin-bottom:14px">Нажмите <strong>Поделиться</strong> ↗️<br>и выберите <strong>«На экран Домой»</strong></div><button class="ios-prompt-button" type="button">Понятно</button></div>`;
      el.onclick = e => { if (e.target.closest('button') || e.target.closest('.ios-prompt-close')) { el.classList.remove('show'); LS.setItem(IOS_KEY, '1'); setTimeout(() => el.remove(), 350); } };
      D.body.appendChild(el);
      requestAnimationFrame(() => el.classList.add('show'));
    }, 2500);
  };

  W.addEventListener('load', () => {
    if (isIOS) D.body.classList.add('ios');
    const code = String(W.APP_CONFIG?.PROMOCODE || '').trim(), inp = $('promo-inp');
    if (!code || LS.getItem(KEY) === code) { unlock(); return showIOS(); }

    const check = () => {
      if (inp?.value.trim() === code) { LS.setItem(KEY, code); unlock(); inp.blur(); }
      else if (inp) {
        const err = $('promo-error');
        if (err) err.textContent = '❌ Неверный промокод';
        inp.classList.add('error');
        setTimeout(() => { if (err) err.textContent = ''; inp.classList.remove('error'); }, 2000);
      }
    };

    $('promo-btn')?.addEventListener('click', check);
    inp?.addEventListener('keydown', e => { if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); check(); } });
    setTimeout(() => { if (inp && !inp.disabled) inp.focus(); }, 100);
    showIOS();
  });
})(window, document);
