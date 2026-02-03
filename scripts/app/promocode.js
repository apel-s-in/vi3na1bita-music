(function(W, D) {
  'use strict';

  const LS = localStorage, CL = 'classList';
  const KEY_PROMO = 'promocode', KEY_IOS = 'iosInstallDismissed';
  const $ = (id) => D.getElementById(id);

  // Helpers
  const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) && !W.MSStream;
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  // Unlock App Flow
  const unlock = () => {
    const p = $('promocode-block'), m = $('main-block');
    if (p) p[CL].add('hidden');
    if (m) m[CL].remove('hidden');

    // Try init app or wait for it (defer script support)
    const run = () => W.app?.initialize && (W.app.initialize(), true);
    if (!run()) {
      let i = 0, t = setInterval(() => (run() || ++i > 50) && clearInterval(t), 60);
    }
  };

  // iOS Install Prompt Logic
  const showIOS = () => {
    if (!isIOS() || isStandalone() || LS.getItem(KEY_IOS)) return;

    setTimeout(() => {
      const el = D.createElement('div');
      el.className = 'ios-install-prompt';
      el.innerHTML = 
        `<button class="ios-prompt-close" type="button">×</button>` +
        `<div class="ios-prompt-content">` +
          `<img class="ios-prompt-icon" src="icons/apple-touch-icon.png">` +
          `<div style="font-weight:800;font-size:18px;margin-bottom:8px">Установить приложение</div>` +
          `<div style="opacity:.85;margin-bottom:14px">Нажмите <strong>Поделиться</strong> ↗️<br>и выберите <strong>«На экран «Домой»»</strong></div>` +
          `<button class="ios-prompt-button" type="button">Понятно</button>` +
        `</div>`;

      const close = () => {
        el[CL].remove('show');
        try { LS.setItem(KEY_IOS, '1'); } catch {}
        setTimeout(() => el.remove(), 350);
      };

      // Single listener for close/confirm
      el.onclick = (e) => (e.target.closest('button') || e.target.closest('.ios-prompt-close')) && close();
      
      D.body.appendChild(el);
      requestAnimationFrame(() => el[CL].add('show'));
    }, 3000);
  };

  // Main Gate Logic
  W.addEventListener('load', () => {
    if (isIOS()) D.body[CL].add('ios');

    const CFG_CODE = String(W.APP_CONFIG?.PROMOCODE || '').trim();
    const SAVED = LS.getItem(KEY_PROMO);

    // Auto-login if code matches or no code required
    if (!CFG_CODE || (SAVED === CFG_CODE)) {
      unlock();
      showIOS();
      return;
    }

    const inp = $('promo-inp'), btn = $('promo-btn'), err = $('promo-error');
    
    const check = () => {
      const val = inp.value.trim();
      if (val === CFG_CODE) {
        LS.setItem(KEY_PROMO, val);
        unlock();
      } else {
        if (err) err.textContent = '❌ Неверный промокод';
        inp[CL].add('error');
        setTimeout(() => { 
          if (err) err.textContent = ''; 
          inp[CL].remove('error'); 
        }, 2000);
      }
    };

    if (btn) btn.onclick = check;
    if (inp) inp.onkeypress = (e) => e.key === 'Enter' && check();

    showIOS();
  });

})(window, document);
