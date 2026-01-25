(function () {
  const PROMO = "VITRINA2025";

  function check() {
      const saved = localStorage.getItem('promocode');
      if (saved === PROMO) {
          unlock();
          return;
      }

      const btn = document.getElementById('promo-btn');
      const inp = document.getElementById('promo-inp');
      const err = document.getElementById('promo-error');

      if(btn) btn.onclick = () => {
          if (inp.value.trim() === PROMO) {
              localStorage.setItem('promocode', PROMO);
              unlock();
          } else {
              err.textContent = 'Неверный код';
          }
      };
  }

  function unlock() {
      const p = document.getElementById('promocode-block');
      if (p) p.classList.add('hidden');
      if (window.startApp) window.startApp();
  }

  window.addEventListener('load', check);
})();
