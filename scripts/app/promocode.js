// scripts/app/promocode.js
// Promocode gate + iOS install prompt
// Не трогаем playback. Только UI входа.

(function PromocodeModule() {
  'use strict';

  function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function unlockAppDirectly() {
    const promocodeBlock = document.getElementById('promocode-block');
    const mainBlock = document.getElementById('main-block');

    if (promocodeBlock) promocodeBlock.classList.add('hidden');
    if (mainBlock) mainBlock.classList.remove('hidden');

    const tryInit = () => {
      if (window.app && typeof window.app.initialize === 'function') {
        window.app.initialize();
        return true;
      }
      return false;
    };

    if (!tryInit()) {
      let tries = 0;
      const t = setInterval(() => {
        tries++;
        if (tryInit() || tries > 50) clearInterval(t);
      }, 60);
    }
  }

  function detectIOSAndShowInstallGuide() {
    const ios = isIOS();
    const standalone = isStandalone();
    if (!ios || standalone) return;

    setTimeout(() => {
      if (localStorage.getItem('iosInstallDismissed') === '1') return;

      const el = document.createElement('div');
      el.className = 'ios-install-prompt';
      el.innerHTML = `
        <button class="ios-prompt-close" aria-label="Закрыть" type="button">×</button>
        <div class="ios-prompt-content">
          <img class="ios-prompt-icon" src="icons/apple-touch-icon.png" alt="Иконка">
          <div style="font-weight:800; font-size:18px; margin-bottom:8px;">
            Установить приложение
          </div>
          <div style="opacity:.85; margin-bottom:14px;">
            Нажмите кнопку <strong>Поделиться</strong> ↗️<br>
            и выберите <strong>«На экран «Домой»»</strong>
          </div>
          <button class="ios-prompt-button" type="button">Понятно</button>
        </div>
      `;

      const dismiss = () => {
        el.classList.remove('show');
        try { localStorage.setItem('iosInstallDismissed', '1'); } catch {}
        setTimeout(() => { try { el.remove(); } catch {} }, 350);
      };

      el.querySelector('.ios-prompt-close')?.addEventListener('click', dismiss);
      el.querySelector('.ios-prompt-button')?.addEventListener('click', dismiss);

      document.body.appendChild(el);
      requestAnimationFrame(() => el.classList.add('show'));
    }, 3000);
  }

  function setupPromocodeGate() {
    if (isIOS()) document.body.classList.add('ios');

    const PROMO = String(window.APP_CONFIG?.PROMOCODE || '').trim();

    const savedPromo = localStorage.getItem('promocode');
    if (PROMO && savedPromo === PROMO) {
      unlockAppDirectly();
      detectIOSAndShowInstallGuide();
      return;
    }

    const promoInput = document.getElementById('promo-inp');
    const promoBtn = document.getElementById('promo-btn');
    const promoError = document.getElementById('promo-error');

    const checkPromo = () => {
      const value = String(promoInput?.value || '').trim();
      if (PROMO && value === PROMO) {
        localStorage.setItem('promocode', value);
        unlockAppDirectly();
      } else {
        if (promoError) promoError.textContent = '❌ Неверный промокод';
        promoInput?.classList?.add('error');
        setTimeout(() => {
          if (promoError) promoError.textContent = '';
          promoInput?.classList?.remove('error');
        }, 2000);
      }
    };

    promoBtn?.addEventListener('click', checkPromo);
    promoInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') checkPromo();
    });

    detectIOSAndShowInstallGuide();
  }

  window.addEventListener('load', setupPromocodeGate);
})();
