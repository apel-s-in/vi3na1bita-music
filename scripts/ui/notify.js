(function () {
  'use strict';
  const esc = s => String(s || '').replace(/[<>&'"]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&#39;','"':'&quot;'}[m])), em = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️', offline: '📴' };
  let c; const gC = () => c || (c = Object.assign(document.createElement('div'), { id: 'toast-container', style: 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:10000;pointer-events:none' })) && document.body.appendChild(c) && c;
  
  class NotificationSystem {
    show(msg, type = 'info', dur = 3000) {
      const el = Object.assign(document.createElement('div'), { className: `toast toast-${type}`, innerHTML: `<div class="toast-content"><span class="toast-emoji">${em[type]||'ℹ️'}</span><span class="toast-message">${esc(msg)}</span></div>` });
      gC().appendChild(el); requestAnimationFrame(() => el.classList.add('show'));
      setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, Math.max(0, Number(dur) || 0));
    }
  }
  ['info','success','error','warning','offline'].forEach(t => NotificationSystem.prototype[t] = function(m, d) { this.show(m, t, d); });
  window.NotificationSystem = new NotificationSystem();
})();
