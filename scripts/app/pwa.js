// scripts/app/pwa.js (ESM)
// Логика, связанная с Progressive Web App: установка, service worker.

(function(){
  let deferredPrompt;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('install-pwa-btn');
    if (installBtn) installBtn.style.display = 'block';
  });

  async function installPWA() {
    if (!deferredPrompt) {
      // Показываем инструкцию для iOS/Safari
      if (window.isMobileUA && /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.navigator.standalone) {
          showIosInstallPrompt();
      } else {
          window.NotificationSystem?.info('Приложение уже установлено или браузер не поддерживает установку.');
      }
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if(outcome === 'accepted') {
        const installBtn = document.getElementById('install-pwa-btn');
        if (installBtn) installBtn.style.display = 'none';
    }
    deferredPrompt = null;
  }

  function showIosInstallPrompt() {
    let prompt = document.querySelector('.ios-install-prompt');
    if (!prompt) {
      prompt = document.createElement('div');
      prompt.className = 'ios-install-prompt';
      prompt.innerHTML = `
        <div class="ios-prompt-content">
          <button class="ios-prompt-close">&times;</button>
          <img src="icons/apple-touch-icon.png" class="ios-prompt-icon" alt="icon">
          <h3>Установить приложение</h3>
          <p>Нажмите <img src="img/ios-share.png" alt="share icon" style="height:1.3em; vertical-align:middle;">, а затем 'На экран "Домой"'.</p>
        </div>
      `;
      document.body.appendChild(prompt);
      prompt.querySelector('.ios-prompt-close').addEventListener('click', () => {
        prompt.classList.remove('show');
      });
    }
    setTimeout(() => prompt.classList.add('show'), 100);
  }

  // Service Worker Registration
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
          .then(registration => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
            // Логика для отображения кнопки "обновить" при наличии нового SW
            registration.onupdatefound = () => {
              const installingWorker = registration.installing;
              if (installingWorker) {
                installingWorker.onstatechange = () => {
                  if (installingWorker.state === 'installed') {
                    if (navigator.serviceWorker.controller) {
                      // Новый контент доступен, пожалуйста, обновите.
                      window.NotificationSystem?.info('Доступно обновление. Перезагрузите страницу.', { duration: 10000 });
                    }
                  }
                };
              }
            };
          }).catch(error => {
            console.log('ServiceWorker registration failed: ', error);
          });
      });
    }
  }

  registerServiceWorker();

  // Export
  window.installPWA = installPWA;
})();
