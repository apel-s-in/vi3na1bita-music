// scripts/ui/notify.js (ESM)
// Модуль уведомлений: очередь + requestIdleCallback, API совместим с прежним NotificationSystem.

(function(){
  const hasRIC = typeof window.requestIdleCallback === 'function';
  const idle = (cb) => hasRIC ? window.requestIdleCallback(cb, { timeout: 1000 }) : setTimeout(cb, 0);

  const queue = [];
  let showing = false;

  async function showToast(message, type = 'info', duration = 3000) {
    queue.push({ message, type, duration });
    if (showing) return;
    showing = true;
    while (queue.length) {
      const { message, type, duration } = queue.shift();
      await new Promise(res => idle(res));
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.innerHTML = `<div class="toast-content"><span class="toast-emoji" aria-hidden="true"></span><span class="toast-text">${message}</span></div>`;
      document.body.appendChild(toast);
      await new Promise(r => setTimeout(r, 50));
      toast.classList.add('show');
      await new Promise(r => setTimeout(r, duration));
      toast.classList.remove('show');
      await new Promise(r => setTimeout(r, 300));
      toast.remove();
    }
    showing = false;
  }

  const NotificationSystem = {
    info(msg){ showToast(msg, 'info'); },
    success(msg){ showToast(msg, 'success'); },
    error(msg){ showToast(msg, 'error', 5000); },
    warning(msg){ showToast(msg, 'warning', 4000); },
    offline(msg){ showToast(msg, 'offline'); }
  };

  window.NotificationSystem = NotificationSystem;
})();
