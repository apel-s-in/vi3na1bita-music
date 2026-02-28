(function () {
  'use strict';
  const esc = s => String(s || '').replace(/[<>&'"]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&#39;','"':'&quot;'}[m]));
  const emojis = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️', offline: '📴' };

  let cont;
  const getCont = () => {
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'toast-container';
      cont.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:10000;pointer-events:none';
      document.body.appendChild(cont);
    }
    return cont;
  };

class NotificationSystem {
    show(msg, type = 'info', dur = 3000) {
      const el = document.createElement('div');
      el.className = `toast toast-${type}`;
      el.innerHTML = `<div class="toast-content"><span class="toast-emoji">${emojis[type]||'ℹ️'}</span><span class="toast-message">${esc(msg)}</span></div>`;
      getCont().appendChild(el);
      
      requestAnimationFrame(() => el.classList.add('show'));
      
      setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
      }, Math.max(0, Number(dur) || 0));
    }

    info(m, d) { this.show(m, 'info', d); }
    success(m, d) { this.show(m, 'success', d); }
    error(m, d) { this.show(m, 'error', d); }
    warning(m, d) { this.show(m, 'warning', d); }
    offline(m, d) { this.show(m, 'offline', d); }
  }

  window.NotificationSystem = new NotificationSystem();
})();
