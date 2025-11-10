// scripts/app/pwa.js (ESM)
// PWA: beforeinstallprompt, iOS-подсказка, подсказка про Memory Saver в Chrome.

(function(){
  let deferredPrompt = null;

  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const btn = document.getElementById('install-pwa-btn');
      if (btn) btn.style.display = '';
    });

    const btn = document.getElementById('install-pwa-btn');
    if (btn) {
      btn.onclick = async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          try { await deferredPrompt.userChoice; } catch {}
          btn.style.display = 'none';
          deferredPrompt = null;
        } else {
          window.NotificationSystem && window.NotificationSystem.info('Ваш браузер не поддерживает установку PWA');
        }
      };
    }
  }

  function detectIOSAndShowInstallGuide() {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (!isIOS || isStandalone) return;

    setTimeout(() => {
      if (localStorage.getItem('iosInstallDismissed') === '1') return;
      let el = document.querySelector('.ios-install-prompt');
      if (!el) {
        el = document.createElement('div');
        el.className = 'ios-install-prompt';
        el.innerHTML = `
          <button class="ios-prompt-close" aria-label="Закрыть" onclick="dismissIOSPrompt()">×</button>
          <div class="ios-prompt-content">
            <img class="ios-prompt-icon" src="icons/apple-touch-icon.png" alt="">
            <div style="font-weight:800; font-size:18px; margin-bottom:8px;">Установить приложение</div>
            <div style="opacity:.85;">Нажмите • Поделиться • и выберите «На экран «Домой»»</div>
            <button class="ios-prompt-button" onclick="dismissIOSPrompt()">Понятно</button>
          </div>`;
        document.body.appendChild(el);
      }
      requestAnimationFrame(() => el.classList.add('show'));
    }, 2000);
  }
  function dismissIOSPrompt() {
    const el = document.querySelector('.ios-install-prompt');
    if (el) el.classList.remove('show');
    localStorage.setItem('iosInstallDismissed', '1');
    setTimeout(() => el && el.remove(), 350);
  }

  function setupMemorySaverHelp() {
    try {
      const isChrome = /Chrome\/\d+/.test(navigator.userAgent) && !/Edg\//.test(navigator.userAgent) && !/OPR\//.test(navigator.userAgent);
      const ctr = document.querySelector('.bottom-controls-center');
      if (isChrome && ctr && !document.getElementById('memory-saver-help-btn')) {
        const btn = document.createElement('button');
        btn.id = 'memory-saver-help-btn';
        btn.className = 'offline-btn';
        btn.style.width = '98%';
        btn.style.background = '#273050';
        btn.textContent = 'Как не останавливать музыку в Chrome';
        btn.onclick = showMemorySaverHelpModal;
        ctr.appendChild(btn);
      }
      if (document.wasDiscarded) {
        showMemorySaverHelpModal();
      }
    } catch {}
  }
  function showMemorySaverHelpModal() {
    let modal = document.getElementById('memory-saver-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'memory-saver-modal';
      modal.className = 'modal-bg active';
      modal.innerHTML = `
        <div class="modal-feedback" style="max-width:480px;">
          <button class="bigclose" onclick="this.closest('.modal-bg').remove()" title="Закрыть">
            <svg viewBox="0 0 48 48"><line x1="12" y1="12" x2="36" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><line x1="36" y1="12" x2="12" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg>
          </button>
          <div style="font-size:1.1em; font-weight:800; margin-bottom:8px;">Chrome: как не останавливать музыку</div>
          <div style="color:#cfe3ff; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); border-radius:8px; padding:12px; line-height:1.4;">
            Если в Chrome включён «Экономия памяти», неактивные вкладки выгружаются и музыка может остановиться.<br><br>
            Чтобы добавить сайт в исключения:<br>
            1) Откройте настройки Chrome → Производительность.<br>
            2) В разделе «Экономия памяти» найдите «Сохранять сайты активными».<br>
            3) Нажмите «Добавить» и укажите: <b>${location.origin}</b><br><br>
            Быстрая ссылка: chrome://settings/performance
          </div>
          <div style="display:flex; gap:10px; justify-content:center; margin-top:12px;">
            <button class="offline-btn online" onclick="navigator.clipboard && navigator.clipboard.writeText('chrome://settings/performance').then(()=>{},()=>{}); this.textContent='Ссылка скопирована'">Скопировать ссылку</button>
            <button class="offline-btn" onclick="this.closest('.modal-bg').remove()">Понятно</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    } else {
      modal.classList.add('active');
    }
  }

  // Экспорт
  window.detectIOSAndShowInstallGuide = detectIOSAndShowInstallGuide;
  window.dismissIOSPrompt = dismissIOSPrompt;

  // Автоподключение
  window.addEventListener('load', () => {
    setupInstallPrompt();
    detectIOSAndShowInstallGuide();
    setupMemorySaverHelp();
  });
})();
