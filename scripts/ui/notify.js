// scripts/ui/notify.js — Система уведомлений
(function() {
  'use strict';

  const CONTAINER_ID = 'notification-container';
  const DEFAULT_DURATION = 4000;
  const MAX_NOTIFICATIONS = 5;

  let container = null;

  function ensureContainer() {
    if (container) return container;
    container = document.getElementById(CONTAINER_ID);
    if (!container) {
      container = document.createElement('div');
      container.id = CONTAINER_ID;
      container.className = 'notification-container';
      document.body.appendChild(container);
    }
    return container;
  }

  function show(message, type = 'info', duration = DEFAULT_DURATION) {
    const cont = ensureContainer();
    
    // Удаляем старые, если превышен лимит
    while (cont.children.length >= MAX_NOTIFICATIONS) {
      cont.firstChild?.remove();
    }

    const el = document.createElement('div');
    el.className = `notification ${type}`;
    el.innerHTML = `
      <div class="notification-content">${escHtml(message)}</div>
      <button class="notification-close">×</button>
    `;

    el.querySelector('.notification-close')?.addEventListener('click', () => remove(el));
    cont.appendChild(el);

    if (duration > 0) {
      setTimeout(() => remove(el), duration);
    }

    return el;
  }

  function remove(el) {
    if (!el?.parentNode) return;
    el.style.opacity = '0';
    el.style.transform = 'translateX(100%)';
    setTimeout(() => el.remove(), 300);
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // Shorthand methods
  const success = (msg, dur) => show(msg, 'success', dur);
  const error = (msg, dur) => show(msg, 'error', dur);
  const warning = (msg, dur) => show(msg, 'warning', dur);
  const info = (msg, dur) => show(msg, 'info', dur);

  window.NotificationSystem = { show, success, error, warning, info };
})();
