// scripts/ui/notify.js (ESM)
// Система уведомлений (тостов).

(function(){
  const NotificationSystem = {
    show: function(message, options = {}) {
      const { duration = 3000, type = 'info' } = options;

      let toast = document.createElement('div');
      toast.className = `toast toast-${type}`;

      const emoji = {
        info: 'ℹ️',
        success: '✅',
        error: '❌',
        warning: '⚠️',
        offline: '🌐'
      }[type];

      toast.innerHTML = `
        <div class="toast-content">
          ${emoji ? `<div class="toast-emoji">${emoji}</div>` : ''}
          <span>${message}</span>
        </div>`;
      
      document.body.appendChild(toast);

      // Animate in
      setTimeout(() => {
        toast.classList.add('show');
      }, 10);

      // Animate out and remove
      setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
          toast.remove();
        });
      }, duration);
    },
    info(message, options) { this.show(message, { ...options, type: 'info' }); },
    success(message, options) { this.show(message, { ...options, type: 'success' }); },
    error(message, options) { this.show(message, { ...options, type: 'error' }); },
    warning(message, options) { this.show(message, { ...options, type: 'warning' }); },
    offline(message, options) { this.show(message, { ...options, type: 'offline' }); },
  };

  window.NotificationSystem = NotificationSystem;
})();
