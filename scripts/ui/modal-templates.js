// scripts/ui/modal-templates.js
// Единые шаблоны модалок (IIFE). Источник истины: window.Modals.
// Использует window.Utils.createModal (modal-bg + bigclose).
//
// Цели:
// - убрать копипасту bigclose/обёрток/рядов кнопок;
// - дать маленькие building blocks для OFFLINE/Feedback/Hotkeys/Cloud/Favorites*;
// - НЕ менять внешний вид (используем существующие классы .modal-feedback/.bigclose/.offline-btn).

(function ModalTemplatesModule() {
  'use strict';

  const w = window;

  function esc(s) {
    return w.Utils?.escapeHtml ? w.Utils.escapeHtml(String(s ?? '')) : String(s ?? '');
  }

  function cssText(s) {
    // минимально безопасно для inline-style
    return String(s ?? '').replace(/"/g, '&quot;');
  }

  function createShell({ title, bodyHtml, maxWidth, className } = {}) {
    const t = String(title || '').trim();
    const cls = String(className || '').trim();
    const mw = Number.isFinite(Number(maxWidth)) ? Number(maxWidth) : 520;

    return `
      <div class="modal-feedback${cls ? ` ${cls}` : ''}" style="max-width:${mw}px;">
        <button class="bigclose" title="Закрыть" aria-label="Закрыть">
          <svg viewBox="0 0 48 48">
            <line x1="12" y1="12" x2="36" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
            <line x1="36" y1="12" x2="12" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
          </svg>
        </button>

        ${t ? `<div style="font-size:1.1em;font-weight:900;color:#eaf2ff;margin-bottom:10px;">${esc(t)}</div>` : ''}

        ${bodyHtml || ''}
      </div>
    `;
  }

  function open({ title, bodyHtml, maxWidth, className, onClose } = {}) {
    if (!w.Utils || typeof w.Utils.createModal !== 'function') return null;
    const html = createShell({ title, bodyHtml, maxWidth, className });
    return w.Utils.createModal(html, onClose);
  }

  // ===== UI blocks (small) =====
  function section(title, innerHtml, opts = {}) {
    const t = String(title || '').trim();
    const padTop = opts.padTop === false ? '' : 'padding-top:12px;';
    const mt = opts.marginTop === false ? '' : 'margin-top:12px;';
    const border = opts.border === false ? '' : 'border-top:1px solid rgba(255,255,255,0.08);';
    return `
      <div style="${border}${padTop}${mt}">
        ${t ? `<div style="font-weight:900;color:#eaf2ff;margin-bottom:8px;">${esc(t)}</div>` : ''}
        ${innerHtml || ''}
      </div>
    `;
  }

  function note(html, opts = {}) {
    const mb = opts.marginBottom === false ? '' : 'margin-bottom:14px;';
    return `<div style="color:#9db7dd;line-height:1.45;${mb}">${html || ''}</div>`;
  }

  function row(html, opts = {}) {
    const gap = Number.isFinite(opts.gap) ? opts.gap : 10;
    const justify = opts.justify || 'center';
    const wrap = opts.wrap === false ? 'nowrap' : 'wrap';
    return `<div style="display:flex;gap:${gap}px;justify-content:${cssText(justify)};flex-wrap:${wrap};align-items:center;">${html || ''}</div>`;
  }

  function actionRow(buttons = []) {
    const items = Array.isArray(buttons) ? buttons : [];
    const html = items.map((b) => {
      const id = b.id ? ` id="${esc(String(b.id))}"` : '';
      const act = b.act ? ` data-act="${esc(String(b.act))}"` : '';
      const cls = b.className ? ` ${esc(String(b.className))}` : '';
      const style = b.style ? ` style="${cssText(String(b.style))}"` : '';
      const text = String(b.text || '');
      const disabled = b.disabled ? ' disabled aria-disabled="true"' : '';
      return `<button class="offline-btn${cls}"${id}${act}${style}${disabled}>${esc(text)}</button>`;
    }).join('');

    return row(html);
  }

  function fieldRow({ label, inputHtml } = {}) {
    return `
      <label style="display:flex;gap:10px;align-items:center;justify-content:space-between;">
        <span style="color:#cfe3ff;">${esc(label || '')}</span>
        ${inputHtml || ''}
      </label>
    `;
  }

  function confirm({
    title = 'Подтвердите',
    textHtml = '',
    confirmText = 'ОК',
    cancelText = 'Отмена',
    maxWidth = 420,
    danger = false,
    onConfirm,
    onCancel
  } = {}) {
    const modal = open({
      title,
      maxWidth,
      bodyHtml: `
        ${note(textHtml, { marginBottom: true })}
        ${actionRow([
          { act: 'cancel', text: cancelText, className: '' },
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
    // blocks
    esc,
    section,
    note,
    row,
    fieldRow,
    actionRow
  };
})();
