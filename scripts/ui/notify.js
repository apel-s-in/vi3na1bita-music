// scripts/ui/notify.js
// Единый модуль уведомлений (тосты) с очередью показа.
// Глобальный API: window.NotificationSystem.{show,info,success,warning,error,offline}

(function initNotificationSystem() {
  if (window.NotificationSystem && window.NotificationSystem.__unified) return;

  const queue = [];
  let isShowing = false;

  const TYPE_DEFAULT_DURATION = {
    info: 3000,
    success: 3000,
    warning: 4000,
    error: 5000,
    offline: 3000
  };

  const EMOJI = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    offline: '🌐'
  };

  function toNumber(n, fallback) {
    const x = Number(n);
    return Number.isFinite(x) && x > 0 ? x : fallback;
  }

  function normalizeShowArgs(message, type, duration) {
    // Поддержка вызова show(options)
    if (typeof message === 'object' && message !== null) {
      const o = message;
      const t = String(o.type || 'info');
      const d = toNumber(o.duration, TYPE_DEFAULT_DURATION[t] || 3000);
      return { message: String(o.message || ''), type: t, duration: d };
    }
    const t = String(type || 'info');
    const d = toNumber(duration, TYPE_DEFAULT_DURATION[t] || 3000);
    return { message: String(message || ''), type: t, duration: d };
  }

  async function processQueue() {
    if (isShowing) return;
    isShowing = true;

    while (queue.length > 0) {
      const { message, type, duration } = queue.shift();

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.innerHTML = `
        <div class="toast-content">
          <span class="toast-emoji" aria-hidden="true">${EMOJI[type] || ''}</span>
          <span class="toast-text">${message}</span>
        </div>
      `;

      document.body.appendChild(toast);
      // Плавное появление
      await new Promise(r => setTimeout(r, 10));
      toast.classList.add('show');

      // Ожидание видимости
      await new Promise(r => setTimeout(r, duration));

      // Скрытие и удаление
      toast.classList.remove('show');
      await new Promise(r => setTimeout(r, 300));
      try { toast.remove(); } catch {}
    }

    isShowing = false;
  }

  function enqueueShow(message, type = 'info', duration) {
    const { message: msg, type: t, duration: dur } = normalizeShowArgs(message, type, duration);
    queue.push({ message: msg, type: t, duration: dur });
    if (!isShowing) processQueue().catch(() => { isShowing = false; });
  }

  const NotificationSystem = {
    __unified: true,
    show: enqueueShow,
    info(msg, duration)    { enqueueShow(msg, 'info', duration); },
    success(msg, duration) { enqueueShow(msg, 'success', duration); },
    warning(msg, duration) { enqueueShow(msg, 'warning', duration); },
    error(msg, duration)   { enqueueShow(msg, 'error', duration); },
    offline(msg, duration) { enqueueShow(msg, 'offline', duration); }
  };

  window.NotificationSystem = NotificationSystem;
})();

