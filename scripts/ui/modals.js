(function () {
  'use strict';
  const esc = s => window.Utils?.escapeHtml?.(String(s ?? '')) ?? String(s ?? '');
  window.Utils?.dom?.createStyleOnce?.('modals-inline-cleanup', `.modal-feedback--dynamic{width:100%;max-width:var(--modal-max-width,520px)}.modal-confirm-text{color:#9db7dd;line-height:1.45;margin-bottom:14px}.modal-confirm-btn{min-width:130px}`);
  
  const open = ({ title = '', bodyHtml = '', maxWidth = 520, onClose } = {}) => {
    let c = document.getElementById('modals-container');
    if (!c) { c = document.createElement('div'); c.id = 'modals-container'; document.body.appendChild(c); }

    const bg = document.createElement('div');
    bg.className = 'modal-bg active';
    bg.style.setProperty('--modal-max-width', `${maxWidth}px`);
    bg.innerHTML = `<div class="modal-feedback modal-feedback--dynamic"><button class="bigclose" type="button" aria-label="Закрыть"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="icons/ui-sprite.svg#icon-close"></use></svg></button>${title ? `<h2>${esc(title)}</h2>` : ''}<div class="modal-body">${bodyHtml}</div></div>`;
    c.appendChild(bg);

    const close = () => { onClose?.(); bg.remove(); };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };

    bg.onclick = e => { if (e.target === bg || e.target.closest('.bigclose')) close(); };
    window.addEventListener('keydown', onKey);

    const _rem = bg.remove.bind(bg);
    bg.remove = () => { window.removeEventListener('keydown', onKey); _rem(); };

    return bg;
  };

  const confirm = ({ title = 'Подтвердите', textHtml = '', confirmText = 'Ок', cancelText = 'Отмена', maxWidth = 460, onClose, onConfirm, onCancel } = {}) => {
    const m = open({
      title, maxWidth, onClose,
      bodyHtml: `<div class="modal-confirm-text">${textHtml}</div><div class="om-actions"><button type="button" class="modal-action-btn modal-confirm-btn" data-act="cancel">${esc(cancelText)}</button><button type="button" class="modal-action-btn online modal-confirm-btn" data-act="confirm">${esc(confirmText)}</button></div>`
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
})();
