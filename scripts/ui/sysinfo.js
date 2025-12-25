// scripts/ui/sysinfo.js
(function SysInfoModule() {
  'use strict';
  const w = window;

  function show() {
    const now = new Date();
    const buildDate = w.BUILD_DATE || 'unknown';
    const version = w.VERSION || 'unknown';
    const ua = navigator.userAgent;
    const platform = navigator.platform;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isStandalone = w.Utils?.isStandalone?.() || false;
    const cookies = navigator.cookieEnabled;
    const localStorageEnabled = (() => {
      try {
        localStorage.setItem('test', '1');
        localStorage.removeItem('test');
        return true;
      } catch { return false; }
    })();
    const serviceWorker = 'serviceWorker' in navigator;

    const info = [
      `Версия: ${w.Utils.escapeHtml(version)}`,
      `Дата сборки: ${w.Utils.escapeHtml(buildDate)}`,
      `Текущее время: ${w.Utils.escapeHtml(now.toLocaleString('ru-RU'))}`,
      `User-Agent: ${w.Utils.escapeHtml(ua)}`,
      `Платформа: ${w.Utils.escapeHtml(platform)}`,
      `iOS: ${isIOS ? '✅' : '❌'}`,
      `PWA (standalone): ${isStandalone ? '✅' : '❌'}`,
      `Куки: ${cookies ? '✅' : '❌'}`,
      `localStorage: ${localStorageEnabled ? '✅' : '❌'}`,
      `Service Worker: ${serviceWorker ? '✅' : '❌'}`
    ].join('<br>');

    const modalHtml = `
      <div class="modal-content sysinfo-modal">
        <h3>Системная информация</h3>
        <div class="sysinfo-content">${info}</div>
        <button class="bigclose">Закрыть</button>
      </div>
    `;

    w.Utils.createModal(modalHtml, null);
  }

  w.SysInfo = { show };
})();
