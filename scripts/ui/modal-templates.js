// -> ФАЙЛ: scripts/ui/modal-templates.js
// (новый файл)
export function modalShell({ title = '', bodyHtml = '', maxWidth = 520, className = '' } = {}) {
  const t = String(title || '').trim();
  const cls = String(className || '').trim();
  const style = `max-width: ${Number(maxWidth) || 520}px;`;
  return `
    <div class="modal-feedback${cls ? ` ${cls}` : ''}" style="${style}">
      <button class="bigclose" title="Закрыть" aria-label="Закрыть">
        <svg viewBox="0 0 48 48">
          <line x1="12" y1="12" x2="36" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
          <line x1="36" y1="12" x2="12" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
        </svg>
      </button>
      ${t ? `<div style="font-size: 1.1em; font-weight: 900; color: #eaf2ff; margin-bottom: 10px;">${t}</div>` : ''}
      ${bodyHtml || ''}
    </div>
  `;
}

export function openModal({ title, bodyHtml, maxWidth, className, onClose } = {}) {
  const html = modalShell({ title, bodyHtml, maxWidth, className });
  if (window.Utils && typeof window.Utils.createModal === 'function') {
    return window.Utils.createModal(html, onClose);
  }
  return null;
}

export function actionRow(buttons = []) {
  const items = Array.isArray(buttons) ? buttons : [];
  const html = items.map((b) => {
    const id = b.id ? ` id="${String(b.id)}"` : '';
    const act = b.act ? ` data-act="${String(b.act)}"` : '';
    const cls = b.className ? ` ${String(b.className)}` : '';
    const style = b.style ? ` style="${String(b.style)}"` : '';
    const text = String(b.text || '');
    return `<button class="offline-btn${cls}"${id}${act}${style}>${text}</button>`;
  }).join('');
  return `<div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">${html}</div>`;
}

export function confirmModal({
  title = 'Подтвердите',
  textHtml = '',
  confirmText = 'ОК',
  cancelText = 'Отмена',
  danger = false,
  maxWidth = 420,
  onConfirm,
  onCancel
} = {}) {
  const bodyHtml = `
    <div style="color:#9db7dd; line-height:1.45; margin-bottom: 14px;">
      ${textHtml || ''}
    </div>
    ${actionRow([
      { act: 'cancel', text: cancelText, className: '' },
      { act: 'confirm', text: confirmText, className: danger ? 'online' : 'online' }
    ])}
  `;

  const modal = openModal({ title, bodyHtml, maxWidth });
  if (!modal) return null;

  modal.querySelector('[data-act="cancel"]')?.addEventListener('click', () => {
    try { onCancel && onCancel(); } catch {}
    try { modal.remove(); } catch {}
  });

  modal.querySelector('[data-act="confirm"]')?.addEventListener('click', async () => {
    try { await onConfirm?.(); } catch {}
    try { modal.remove(); } catch {}
  });

  return modal;
}
