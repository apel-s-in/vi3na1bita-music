//=================================================
// FILE: /scripts/ui/notify.js
class NotificationSystem {
  constructor() {
    this.container = null;
    this.queue = [];
    this.isShowing = false;
    this.U = window.Utils;
    this.init();
  }
  init() {
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:10000;pointer-events:none`;
    document.body.appendChild(this.container);
  }
  show(message, type = 'info', duration = 3000) {
    this.queue.push({ message, type, duration, id: Date.now() });
    this.processQueue();
  }
  processQueue() {
    if (this.isShowing || this.queue.length === 0) return;
    this.isShowing = true;
    this.displayToast(this.queue.shift());
  }
  displayToast(toast) {
    const el = document.createElement('div');
    el.className = `toast toast-${toast.type}`;
    el.innerHTML = `<div class="toast-content"><span class="toast-emoji">${this.getEmoji(toast.type)}</span><span class="toast-message">${this.U.ui.escapeHtml(toast.message)}</span></div>`;
    this.container.appendChild(el);
    this.U.dom.raf(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { if(el.parentNode) el.parentNode.removeChild(el); this.isShowing = false; this.processQueue(); }, 300);
    }, toast.duration);
  }
  getEmoji(type) { return { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️', offline: '📴' }[type] || 'ℹ️'; }
  // Aliases
  info(m, d) { this.show(m, 'info', d); }
  success(m, d) { this.show(m, 'success', d); }
  error(m, d) { this.show(m, 'error', d); }
  warning(m, d) { this.show(m, 'warning', d); }
  offline(m, d) { this.show(m, 'offline', d); }
}
window.NotificationSystem = new NotificationSystem();
