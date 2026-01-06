// scripts/ui/modal-templates.js
// Единые шаблоны модалок (IIFE). Источник истины: window.Modals.
// Использует window.Utils.createModal (modal-bg + bigclose).

(function ModalTemplatesModule() {
  'use strict';

  const w = window;

  function esc(s) {
    return w.Utils?.escapeHtml ? w.Utils.escapeHtml(String(s ?? '')) : String(s ?? '');
  }

  function createShell({ title, bodyHtml, maxWidth, className } = {}) {
    const t = String(title || '').trim();
    const cls = String(className || '').trim();
    const mw = Number.isFinite(Number(maxWidth)) ? Number(maxWidth) : 520;

    return `
      <div class="modal-feedback${cls ? ` ${cls}` : ''}" style="max-width: ${mw}px;">
        <button class="bigclose" title="Закрыть" aria-label="Закрыть">
          <svg viewBox="0 0 48 48">
            <line x1="12" y1="12" x2="36" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
            <line x1="36" y1="12" x2="12" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
          </svg>
        </button>

        ${t ? `<div style="font-size: 1.1em; font-weight: 900; color: #eaf2ff; margin-bottom: 10px;">${esc(t)}</div>` : ''}

        ${bodyHtml || ''}
      </div>
    `;
  }

  function open({ title, bodyHtml, maxWidth, className, onClose } = {}) {
    if (!w.Utils || typeof w.Utils.createModal !== 'function') return null;
    const html = createShell({ title, bodyHtml, maxWidth, className });
    return w.Utils.createModal(html, onClose);
  }

  function actionRow(buttons = []) {
    const items = Array.isArray(buttons) ? buttons : [];
    const html = items.map((b) => {
      const id = b.id ? ` id="${String(b.id)}"` : '';
      const act = b.act ? ` data-act="${String(b.act)}"` : '';
      const cls = b.className ? ` ${String(b.className)}` : '';
      const style = b.style ? ` style="${String(b.style)}"` : '';
      const text = String(b.text || '');
      return `<button class="offline-btn${cls}"${id}${act}${style}>${esc(text)}</button>`;
    }).join('');

    return `<div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">${html}</div>`;
  }

  function confirm({
    title = 'Подтвердите',
    textHtml = '',
    confirmText = 'ОК',
    cancelText = 'Отмена',
    maxWidth = 420,
    onConfirm,
    onCancel
  } = {}) {
    const modal = open({
      title,
      maxWidth,
      bodyHtml: `
        <div style="color:#9db7dd; line-height:1.45; margin-bottom: 14px;">
          ${textHtml || ''}
        </div>
        ${actionRow([
          { act: 'cancel', text: cancelText, className: '' },
          { act: 'confirm', text: confirmText, className: 'online' }
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
    actionRow,
    esc
  };
})();
