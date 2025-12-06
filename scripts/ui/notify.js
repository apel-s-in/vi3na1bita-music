// scripts/ui/notify.js
// Централизованная система уведомлений

(function() {
  'use strict';

  class NotificationSystem {
    constructor() {
      this.container = null;
      this.queue = [];
      this.isShowing = false;
      this.currentToast = null;
      this.init();
    }

    init() {
      // Создать контейнер для toast'ов если его нет
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.style.cssText = `
          position: fixed;
          bottom: 80px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10000;
          pointer-events: none;
        `;
        document.body.appendChild(this.container);
      }
    }

    show(message, type = 'info', duration = 3000) {
      const toast = {
        message,
        type,
        duration,
        id: Date.now() + Math.random()
      };

      this.queue.push(toast);
      this.processQueue();
    }

    processQueue() {
      if (this.isShowing || this.queue.length === 0) return;

      this.isShowing = true;
      const toast = this.queue.shift();
      this.displayToast(toast);
    }

    displayToast(toast) {
      const toastEl = document.createElement('div');
      toastEl.className = `toast toast-${toast.type}`;
      
      const emoji = this.getEmoji(toast.type);
      
      toastEl.innerHTML = `
        <div class="toast-content">
          <span class="toast-emoji">${emoji}</span>
          <span class="toast-message">${this.escapeHtml(toast.message)}</span>
        </div>
      `;

      this.container.appendChild(toastEl);
      this.currentToast = toastEl;

      // Анимация появления
      requestAnimationFrame(() => {
        toastEl.classList.add('show');
      });

      // Автоматическое скрытие
      setTimeout(() => {
        this.hideToast(toastEl);
      }, toast.duration);
    }

    hideToast(toastEl) {
      if (!toastEl) return;

      toastEl.classList.remove('show');

      setTimeout(() => {
        if (toastEl.parentNode) {
          toastEl.parentNode.removeChild(toastEl);
        }
        
        this.isShowing = false;
        this.currentToast = null;
        this.processQueue();
      }, 300);
    }

    getEmoji(type) {
      const emojis = {
        info: 'ℹ️',
        success: '✅',
        error: '❌',
        warning: '⚠️',
        offline: '📴'
      };
      return emojis[type] || 'ℹ️';
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Публичные методы
    info(message, duration) {
      this.show(message, 'info', duration);
    }

    success(message, duration) {
      this.show(message, 'success', duration);
    }

    error(message, duration) {
      this.show(message, 'error', duration || 4000);
    }

    warning(message, duration) {
      this.show(message, 'warning', duration);
    }

    offline(message, duration) {
      this.show(message, 'offline', duration);
    }

    clear() {
      this.queue = [];
      if (this.currentToast) {
        this.hideToast(this.currentToast);
      }
    }
  }

  // Глобальный экземпляр
  window.NotificationSystem = new NotificationSystem();

  console.log('✅ Notification system initialized');
})();
