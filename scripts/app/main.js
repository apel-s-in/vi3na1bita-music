// scripts/app/main.js
import { APP_CONFIG } from '../core/config.js';

// ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
const VERSION = String(APP_CONFIG?.APP_VERSION || '8.0.4');
const BUILD_DATE = String(APP_CONFIG?.BUILD_DATE || '2025-12-07');

// Экспорт (для обратной совместимости)
window.VERSION = VERSION;
window.BUILD_DATE = BUILD_DATE;

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function unlockAppDirectly() {
  const promocodeBlock = document.getElementById('promocode-block');
  const mainBlock = document.getElementById('main-block');
  if (promocodeBlock) promocodeBlock.classList.add('hidden');
  if (mainBlock) mainBlock.classList.remove('hidden');

  const waitForApp = setInterval(() => {
    if (window.app && typeof window.app.initialize === 'function') {
      clearInterval(waitForApp);
      window.app.initialize();
    }
  }, 100);
}

function detectIOSAndShowInstallGuide() {
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if (!isIOS || isStandalone) return;

  setTimeout(() => {
    if (localStorage.getItem('iosInstallDismissed') === '1') return;
    const el = document.createElement('div');
    el.className = 'ios-install-prompt';
    el.innerHTML = `
      <button class="ios-prompt-close" aria-label="Закрыть" onclick="window.dismissIOSPrompt()">×</button>
      <div class="ios-prompt-content">
        <img class="ios-prompt-icon" src="icons/apple-touch-icon.png" alt="Иконка">
        <div style="font-weight:800; font-size:18px; margin-bottom:8px;">Установить приложение</div>
        <div style="opacity:.85; margin-bottom:14px;">
          Нажмите кнопку <strong>Поделиться</strong> ↗️<br>
          и выберите <strong>«На экран «Домой»»</strong>
        </div>
        <button class="ios-prompt-button" onclick="window.dismissIOSPrompt()">Понятно</button>
      </div>
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
  }, 3000);
}

window.dismissIOSPrompt = () => {
  const el = document.querySelector('.ios-install-prompt');
  if (el) {
    el.classList.remove('show');
    localStorage.setItem('iosInstallDismissed', '1');
    setTimeout(() => el.remove(), 350);
  }
};

// ========== ИНИЦИАЛИЗАЦИЯ ==========
window.addEventListener('load', () => {
  // iOS detection
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    document.body.classList.add('ios');
  }

  // Промокод
  const PROMO = String(APP_CONFIG?.PROMOCODE || '').trim();
  const savedPromo = localStorage.getItem('promocode');
  if (PROMO && savedPromo === PROMO) {
    unlockAppDirectly();
  } else {
    // Обработчики ввода
    const promoInput = document.getElementById('promo-inp');
    const promoBtn = document.getElementById('promo-btn');
    const promoError = document.getElementById('promo-error');

    const checkPromo = () => {
      const value = promoInput.value.trim();
      if (PROMO && value === PROMO) {
        localStorage.setItem('promocode', value);
        unlockAppDirectly();
      } else {
        promoError.textContent = '❌ Неверный промокод';
        promoInput.classList.add('error');
        setTimeout(() => {
          promoError.textContent = '';
          promoInput.classList.remove('error');
        }, 2000);
      }
    };

    promoBtn?.addEventListener('click', checkPromo);
    promoInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') checkPromo();
    });
  }

  detectIOSAndShowInstallGuide();
  console.log(`🎵 Витрина Разбита v${VERSION} (${BUILD_DATE})`);
});
