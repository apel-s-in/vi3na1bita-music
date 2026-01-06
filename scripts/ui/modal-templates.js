// scripts/ui/modal-templates.js
(function ModalTemplatesModule() {
  'use strict';

  const w = window;

  function esc(s) {
    return w.Utils?.escapeHtml ? w.Utils.escapeHtml(String(s ?? '')) : String(s ?? '');
  }

  function createShell({ title, bodyHtml, className } = {}) {
    const t = String(title || '').trim();
    const cls = String(className || '').trim();
    return `
      <div class="vr-modal${cls ? ` ${cls}` : ''}">
        <button class="vr-modal__close bigclose" title="Закрыть" aria-label="Закрыть">
          <svg viewBox="0 0 48 48">
            <line x1="12" y1="12" x2="36" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
            <line x1="36" y1="12" x2="12" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
          </svg>
        </button>

        ${t ? `<div class="vr-modal__title">${esc(t)}</div>` : ''}

        ${bodyHtml || ''}
      </div>
    `;
  }

  function open({ title, bodyHtml, className, onClose } = {}) {
    if (!w.Utils || typeof w.Utils.createModal !== 'function') return null;
    const html = createShell({ title, bodyHtml, className });
    return w.Utils.createModal(html, onClose);
  }

  // blocks
  function section(title, innerHtml) {
    const t = String(title || '').trim();
    return `
      <div class="vr-modal__section">
        ${t ? `<div class="vr-modal__sectionTitle">${esc(t)}</div>` : ''}
        ${innerHtml || ''}
      </div>
    `;
  }

  function note(html) {
    return `<div class="vr-modal__note">${html || ''}</div>`;
  }

  function row(html, { align = 'between' } = {}) {
    const cls =
      align === 'center' ? 'vr-modal__row vr-modal__row--center' :
      align === 'start' ? 'vr-modal__row vr-modal__row--start' :
      align === 'end' ? 'vr-modal__row vr-modal__row--end' :
      'vr-modal__row';
    return `<div class="${cls}">${html || ''}</div>`;
  }

  function btnRow(buttons = []) {
    const items = Array.isArray(buttons) ? buttons : [];
    const html = items.map((b) => {
      const id = b.id ? ` id="${esc(String(b.id))}"` : '';
      const act = b.act ? ` data-act="${esc(String(b.act))}"` : '';
      const cls = b.className ? ` ${esc(String(b.className))}` : '';
      const text = String(b.text || '');
      const disabled = b.disabled ? ' disabled aria-disabled="true"' : '';
      return `<button class="offline-btn${cls}"${id}${act}${disabled}>${esc(text)}</button>`;
    }).join('');
    return `<div class="vr-modal__btnRow">${html}</div>`;
  }

  function fieldRow({ label, inputHtml } = {}) {
    return `
      <label class="vr-modal__field">
        <span class="vr-modal__label">${esc(label || '')}</span>
        ${inputHtml || ''}
      </label>
    `;
  }

  function pill(text, kind = 'ok') {
    const k =
      kind === 'warn' ? 'vr-modal__pill vr-modal__pill--warn' :
      kind === 'danger' ? 'vr-modal__pill vr-modal__pill--danger' :
      'vr-modal__pill vr-modal__pill--ok';
    return `<span class="${k}">${esc(text || '')}</span>`;
  }

  function confirm({
    title = 'Подтвердите',
    textHtml = '',
    confirmText = 'ОК',
    cancelText = 'Отмена',
    danger = false,
    onConfirm,
    onCancel
  } = {}) {
    const modal = open({
      title,
      bodyHtml: `
        ${note(textHtml)}
        ${btnRow([
          { act: 'cancel', text: cancelText },
          { act: 'confirm', text: confirmText, className: danger ? '' : 'online' }
        ])}
      `
    });

    if (!modal) return null;

    modal.querySelector('[data-act="cancel"]')?.addEventListener('click', () => {
      try { onCancel?.(); } catch {}
      try { modal.remove(); } catch {}
    });

    modal.querySelector('[data-act="confirm"]')?.addEventListener('click', async () => {
      try { await onConfirm?.(); } catch {}
      try { modal.remove(); } catch {}
    });

    return modal;
  }

  w.Modals = {
    open,
    confirm,
    esc,
    section,
    note,
    row,
    fieldRow,
    btnRow,
    pill
  };
})();
