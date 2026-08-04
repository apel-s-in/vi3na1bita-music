(function () {
  'use strict';
  const esc = s => window.Utils?.escapeHtml?.(String(s ?? '')) ?? String(s ?? '');
  const open = ({ title = '', bodyHtml = '', maxWidth = 520, onClose, strictClose = false } = {}) => {
    let c = document.getElementById('modals-container') || Object.assign(document.createElement('div'), { id: 'modals-container' });
    if (!c.isConnected) document.body.appendChild(c);
    const bg = Object.assign(document.createElement('div'), { className: 'modal-bg active', innerHTML: `<div class="modal-feedback modal-feedback--dynamic"><button class="bigclose" type="button" aria-label="Закрыть"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="icons/ui-sprite.svg#icon-close"></use></svg></button>${title ? `<h2>${esc(title)}</h2>` : ''}<div class="modal-body">${bodyHtml}</div></div>` });
    bg.style.setProperty('--modal-max-width', `${maxWidth}px`); c.appendChild(bg);
    const cl = () => { onClose?.(); bg.remove(); };
    const oK = e => { if (!strictClose && e.key === 'Escape') { e.preventDefault(); cl(); } };
    // strictClose: закрытие ТОЛЬКО по крестику (как в Яндексе для критичных модалок)
    bg.onclick = e => {
      if (strictClose) {
        // В strict-режиме закрываем только по крестику, клик вне контента игнорируем
        if (e.target.closest('.bigclose')) cl();
        return;
      }
      if (e.target === bg || e.target.closest('.bigclose')) cl();
    };
    window.addEventListener('keydown', oK);
    const _rem = bg.remove.bind(bg); bg.remove = () => { window.removeEventListener('keydown', oK); _rem(); };
    return bg;
  };
  const confirm = ({ title = 'Подтвердите', textHtml = '', confirmText = 'Ок', cancelText = 'Отмена', maxWidth = 460, onClose, onConfirm, onCancel } = {}) => {
    const m = open({ title, maxWidth, onClose, bodyHtml: `<div class="modal-confirm-text">${textHtml}</div><div class="om-actions"><button type="button" class="modal-action-btn modal-confirm-btn" data-act="cancel">${esc(cancelText)}</button><button type="button" class="modal-action-btn online modal-confirm-btn" data-act="confirm">${esc(confirmText)}</button></div>` });
    m.addEventListener('click', e => { if (e.target.closest('[data-act="cancel"]')) { onCancel?.(); m.remove(); } else if (e.target.closest('[data-act="confirm"]')) { onConfirm?.(); m.remove(); } });
    return m;
  };
  const choice = ({ title = '', textHtml = '', maxWidth = 460, actions = [], onClose } = {}) => {
    const m = open({ title, maxWidth, onClose, bodyHtml: `<div class="modal-confirm-text">${textHtml}</div><div class="modal-choice-actions">${(actions || []).map((a, i) => `<button type="button" class="modal-action-btn modal-confirm-btn ${a.primary ? 'online' : ''}" data-choice="${esc(a.key || String(i))}">${esc(a.text || 'OK')}</button>`).join('')}</div>` });
    m.addEventListener('click', e => { const b = e.target.closest('[data-choice]'); if (!b) return; try { (actions || []).find(x => String(x.key) === String(b.dataset.choice))?.onClick?.(); } finally { m.remove(); } });
    return m;
  };
  window.Modals = { ...window.Modals, open, confirm, choice };
})();
