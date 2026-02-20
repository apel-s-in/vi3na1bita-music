(function () {
  'use strict';
  const esc = s => window.Utils?.escapeHtml?.(String(s ?? '')) ?? String(s ?? '');
  
  const open = ({ title = '', bodyHtml = '', maxWidth = 520, onClose } = {}) => {
    let c = document.getElementById('modals-container');
    if (!c) { c = document.createElement('div'); c.id = 'modals-container'; document.body.appendChild(c); }

    const bg = document.createElement('div');
    bg.className = 'modal-bg active';
    bg.innerHTML = `<div class="modal-feedback" style="max-width:${maxWidth}px"><button class="bigclose" type="button" aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4z"/></svg></button>${title ? `<h2>${esc(title)}</h2>` : ''}<div class="modal-body">${bodyHtml}</div></div>`;
    c.appendChild(bg);

    const close = () => { onClose?.(); bg.remove(); };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    
    bg.onclick = e => { if (e.target === bg || e.target.closest('.bigclose')) close(); };
    window.addEventListener('keydown', onKey);
    
    // Garbage collection protection for external bg.remove() calls
    const _rem = bg.remove.bind(bg);
    bg.remove = () => { window.removeEventListener('keydown', onKey); _rem(); };
    
    return bg;
  };

  const confirm = ({ title = 'Подтвердите', textHtml = '', confirmText = 'Ок', cancelText = 'Отмена', maxWidth = 460, onClose, onConfirm, onCancel } = {}) => {
    const m = open({
      title, maxWidth, onClose,
      bodyHtml: `<div style="color:#9db7dd;line-height:1.45;margin-bottom:14px;">${textHtml}</div><div class="om-actions"><button type="button" class="modal-action-btn" data-act="cancel" style="min-width:130px;">${esc(cancelText)}</button><button type="button" class="modal-action-btn online" data-act="confirm" style="min-width:130px;">${esc(confirmText)}</button></div>`
    });
    
    m.addEventListener('click', e => {
      if (e.target.closest('[data-act="cancel"]')) { onCancel?.(); m.remove(); }
      else if (e.target.closest('[data-act="confirm"]')) { onConfirm?.(); m.remove(); }
    });
    
    return m;
  };

  window.Modals = window.Modals || {};
  window.Modals.open = open;
  window.Modals.confirm = confirm;
  Object.defineProperty(window.Modals, 'offlineBody', {
    configurable: true, get() { return window.ModalTemplates?.offlineBody || null; }
  });
})();
