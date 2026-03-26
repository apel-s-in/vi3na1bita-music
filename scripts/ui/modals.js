// UID.038_(Track profile modal)_(дать безопасный host для умных карточек и окон)_(Modals остаётся центральным generic UI-bridge, а не местом бизнес-логики профилей) UID.070_(Linked providers)_(дать profile/provider слою единый способ открытия окон)_(provider/profile UI может использовать Modals как host, не дублируя modal engines) UID.072_(Provider consents)_(позже показывать consent/policy окна через единый слой)_(consent content может приходить из intel/providers, но рендериться через этот generic bridge) UID.073_(Hybrid sync orchestrator)_(позже показывать sync/restore/provider role dialogs)_(Modals только отображает, orchestration logic живёт вне этого файла) UID.080_(Provider actions bridge)_(provider action confirmations/openers не должны плодить свои modal subsystems)_(все optional provider окна лучше вешать на этот central bridge) UID.082_(Local truth vs external telemetry split)_(modals не должны экспортировать наружу raw state сами)_(любая внешняя аналитика modal-actions только через mapper/consent слой) UID.094_(No-paralysis rule)_(generic modal engine должен быть независимым от intel)_(если intel/profile/providers выключены, базовые confirm/open продолжают работать как сейчас)
(function () {
  'use strict';
  const esc = s => window.Utils?.escapeHtml?.(String(s ?? '')) ?? String(s ?? '');
  const open = ({ title = '', bodyHtml = '', maxWidth = 520, onClose } = {}) => {
    let c = document.getElementById('modals-container') || Object.assign(document.createElement('div'), { id: 'modals-container' });
    if (!c.isConnected) document.body.appendChild(c);
    const bg = Object.assign(document.createElement('div'), { className: 'modal-bg active', innerHTML: `<div class="modal-feedback modal-feedback--dynamic"><button class="bigclose" type="button" aria-label="Закрыть"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="icons/ui-sprite.svg#icon-close"></use></svg></button>${title ? `<h2>${esc(title)}</h2>` : ''}<div class="modal-body">${bodyHtml}</div></div>` });
    bg.style.setProperty('--modal-max-width', `${maxWidth}px`); c.appendChild(bg);
    const cl = () => { onClose?.(); bg.remove(); }, oK = e => { if (e.key === 'Escape') { e.preventDefault(); cl(); } };
    bg.onclick = e => { if (e.target === bg || e.target.closest('.bigclose')) cl(); }; window.addEventListener('keydown', oK);
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
