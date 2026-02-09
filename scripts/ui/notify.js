//=================================================
// FILE: /scripts/ui/notify.js
(function () {
  'use strict';

  const DOC = document;

  const esc = (s) => {
    const U = window.Utils;
    const fn = U?.ui?.escapeHtml || U?.escapeHtml;
    if (typeof fn === 'function') return fn(String(s ?? ''));
    return String(s ?? '').replace(/[<>&'"]/g, (m) => ({
      '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;'
    }[m]));
  };

  const emoji = (type) => ({
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    offline: '📴'
  }[type] || 'ℹ️');

  const ensureContainer = () => {
    let el = DOC.getElementById('toast-container');
    if (el) return el;
    el = DOC.createElement('div');
    el.id = 'toast-container';
    el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:10000;pointer-events:none';
    DOC.body.appendChild(el);
    return el;
  };

  const showOne = ({ message, type = 'info', duration = 3000 } = {}) => new Promise((resolve) => {
    const cont = ensureContainer();
    const el = DOC.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<div class="toast-content"><span class="toast-emoji">${emoji(type)}</span><span class="toast-message">${esc(message)}</span></div>`;
    cont.appendChild(el);

    const raf = window.Utils?.dom?.raf || ((fn) => requestAnimationFrame(fn));
    raf(() => el.classList.add('show'));

    const ms = Math.max(0, Number(duration) || 0);
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => {
        try { el.remove(); } catch {}
        resolve();
      }, 300);
    }, ms);
  });

  class NotificationSystem {
    constructor() {
      this._chain = Promise.resolve();
      ensureContainer();
    }

    show(message, type = 'info', duration = 3000) {
      // Последовательно (как старая очередь), но без ручных флагов.
      this._chain = this._chain.then(() => showOne({ message, type, duration })).catch(() => {});
    }

    info(m, d) { this.show(m, 'info', d); }
    success(m, d) { this.show(m, 'success', d); }
    error(m, d) { this.show(m, 'error', d); }
    warning(m, d) { this.show(m, 'warning', d); }
    offline(m, d) { this.show(m, 'offline', d); }
  }

  window.NotificationSystem = new NotificationSystem();
})();
