(function(W, D) {
  'use strict';

  // --- Helpers & Optimization ---
  const LS = localStorage;
  const CL = 'classList';
  const KEY_PROMO = 'promocode';
  const KEY_IOS = 'iosInstallDismissed';
  
  // Safe DOM selector
  const $ = (id) => D.getElementById(id);
  
  // Safe Event Listener (Fixes keyboard issues)
  const on = (el, event, handler) => {
    if (el) el.addEventListener(event, handler);
  };

  // Device detection
  const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) && !W.MSStream;
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  // --- Logic: Unlock Application ---
  const unlock = () => {
    const p = $('promocode-block');
    const m = $('main-block');
    
    // Switch Views
    if (p) p[CL].add('hidden');
    if (m) m[CL].remove('hidden');

    // Initialize App (Safely handle race conditions)
    const run = () => {
      if (W.app && typeof W.app.initialize === 'function') {
        W.app.initialize();
        return true;
      }
      return false;
    };

    if (!run()) {
      let attempts = 0;
      const t = setInterval(() => {
        if (run() || ++attempts > 50) clearInterval(t);
      }, 50);
    }
  };

  // --- Logic: iOS Install Prompt ---
  const showIOS = () => {
    // Strict check to ensure it never shows on Windows/Android
    if (!isIOS() || isStandalone() || LS.getItem(KEY_IOS)) return;

    setTimeout(() => {
      const el = D.createElement('div');
      el.className = 'ios-install-prompt';
      // Condensed HTML structure
      el.innerHTML = 
        '<button class="ios-prompt-close" type="button">×</button>' +
        '<div class="ios-prompt-content">' +
          '<img class="ios-prompt-icon" src="icons/apple-touch-icon.png">' +
          '<div style="font-weight:800;font-size:18px;margin-bottom:8px">Установить приложение</div>' +
          '<div style="opacity:.85;margin-bottom:14px">Нажмите <strong>Поделиться</strong> ↗️<br>и выберите <strong>«На экран «Домой»»</strong></div>' +
          '<button class="ios-prompt-button" type="button">Понятно</button>' +
        '</div>';

      const close = () => {
        el[CL].remove('show');
        try { LS.setItem(KEY_IOS, '1'); } catch (e) {}
        setTimeout(() => el.remove(), 350);
      };

      // Delegated event for performance
      el.onclick = (e) => {
        if (e.target.closest('button') || e.target.closest('.ios-prompt-close')) close();
      };
      
      D.body.appendChild(el);
      // Animation frame for smooth transition
      requestAnimationFrame(() => el[CL].add('show'));
    }, 2500);
  };

  // --- Main Execution ---
  W.addEventListener('load', () => {
    // iOS specific styling
    if (isIOS()) D.body[CL].add('ios');

    // Safe Config Reading (No optional chaining for max compatibility)
    const cfg = W.APP_CONFIG || {};
    const cfgCode = (cfg.PROMOCODE || '').toString().trim();
    const savedCode = LS.getItem(KEY_PROMO);

    // 1. Check if already authorized or no code needed
    if (!cfgCode || (savedCode === cfgCode)) {
      unlock();
      showIOS();
      return;
    }

    // 2. Setup Login UI
    const inp = $('promo-inp');
    const btn = $('promo-btn');
    const err = $('promo-error');

    // Validation Logic
    const check = () => {
      const val = inp ? inp.value.trim() : '';
      
      if (val === cfgCode) {
        try { LS.setItem(KEY_PROMO, val); } catch (e) {}
        unlock();
        // Hide keyboard on mobile
        if (inp) inp.blur(); 
      } else {
        if (err) err.textContent = '❌ Неверный промокод';
        if (inp) {
          inp[CL].add('error');
          // Shake/Error animation reset
          setTimeout(() => {
            if (err) err.textContent = '';
            inp[CL].remove('error');
          }, 2000);
        }
      }
    };

    // 3. Attach Listeners (using addEventListener via 'on' helper)
    on(btn, 'click', check);
    
    on(inp, 'keydown', (e) => {
      // Support both modern 'Enter' and legacy keyCode 13
      if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault(); // Prevent form submission quirks
        check();
      }
    });

    // 4. Final UX Polish
    if (inp) {
      inp.disabled = false; // Ensure input is enabled
      // Auto-focus logic (timeout to ensure UI is rendered)
      setTimeout(() => inp.focus(), 100); 
    }

    showIOS();
  });

})(window, document);
