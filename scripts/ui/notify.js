// scripts/ui/notify.js — Система уведомлений (минимизировано)
(function() {
  const EMOJIS = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️', offline: '📴' };
  const DURATIONS = { info: 2000, success: 2500, error: 4000, warning: 3000, offline: 3000 };

  class Notify {
    constructor() {
      this.queue = [];
      this.showing = false;
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      document.body.appendChild(this.container);
    }

    show(msg, type = 'info', dur) {
      this.queue.push({ msg, type, dur: dur || DURATIONS[type] || 2000 });
      this.process();
    }

    process() {
      if (this.showing || !this.queue.length) return;
      this.showing = true;
      const { msg, type, dur } = this.queue.shift();
      const el = document.createElement('div');
      el.className = `toast toast-${type}`;
      el.innerHTML = `<div class="toast-content"><span class="toast-emoji">${EMOJIS[type] || 'ℹ️'}</span><span class="toast-message">${window.Utils?.escapeHtml?.(msg) || msg}</span></div>`;
      this.container.appendChild(el);
      requestAnimationFrame(() => el.classList.add('show'));
      setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => { el.remove(); this.showing = false; this.process(); }, 300);
      }, dur);
    }

    info(m, d) { this.show(m, 'info', d); }
    success(m, d) { this.show(m, 'success', d); }
    error(m, d) { this.show(m, 'error', d); }
    warning(m, d) { this.show(m, 'warning', d); }
    offline(m, d) { this.show(m, 'offline', d); }
    clear() { this.queue = []; }
  }

  window.NotificationSystem = new Notify();
})();
