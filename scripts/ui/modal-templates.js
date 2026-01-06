// scripts/ui/modal-templates.js
// Единый шаблон модалок (кроме Lyrics)
// API: window.Modals.open(), .confirm(), .actionRow()

(function ModalsModule() {
  'use strict';

  const esc = (s) => {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  };

  function getContainer() {
    return document.getElementById('modals-container') || document.body;
  }

  /**
   * Создать модалку
   * @param {Object} opts
   * @param {string} opts.title - заголовок
   * @param {string} opts.bodyHtml - HTML содержимого
   * @param {number} opts.maxWidth - макс. ширина (px)
   * @param {Function} opts.onClose - callback при закрытии
   * @returns {HTMLElement} элемент модалки
   */
  function open(opts = {}) {
    const {
      title = '',
      bodyHtml = '',
      maxWidth = 480,
      onClose = null
    } = opts;

    const bg = document.createElement('div');
    bg.className = 'modal-bg active';

    bg.innerHTML = `
      <div class="modal-feedback" style="max-width: ${maxWidth}px;">
        <button class="bigclose" title="Закрыть" aria-label="Закрыть">
          <svg viewBox="0 0 48 48">
            <line x1="12" y1="12" x2="36" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
            <line x1="36" y1="12" x2="12" y2="36" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
          </svg>
        </button>
        ${title ? `<h2 style="margin-top:0; color:#4daaff;">${esc(title)}</h2>` : ''}
        <div class="modal-body">${bodyHtml}</div>
      </div>
    `;

    const close = () => {
      try { bg.remove(); } catch {}
      if (typeof onClose === 'function') onClose();
    };

    bg.addEventListener('click', (e) => {
      if (e.target === bg) close();
    });

    const closeBtn = bg.querySelector('.bigclose');
    if (closeBtn) closeBtn.addEventListener('click', close);

    getContainer().appendChild(bg);
    return bg;
  }

  /**
   * Модалка подтверждения
   * @param {Object} opts
   * @param {string} opts.title
   * @param {string} opts.textHtml
   * @param {string} opts.confirmText
   * @param {string} opts.cancelText
   * @param {boolean} opts.danger - красная кнопка подтверждения
   * @param {Function} opts.onConfirm
   * @param {Function} opts.onCancel
   */
  function confirm(opts = {}) {
    const {
      title = 'Подтверждение',
      textHtml = '',
      confirmText = 'Да',
      cancelText = 'Отмена',
      danger = false,
      onConfirm = null,
      onCancel = null
    } = opts;

    const btnStyle = danger
      ? 'background:#E80100; color:#fff;'
      : 'background:#4daaff; color:#fff;';

    const modal = open({
      title,
      maxWidth: 400,
      bodyHtml: `
        <div style="color:#9db7dd; line-height:1.5; margin-bottom:20px;">
          ${textHtml}
        </div>
        <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
          <button class="offline-btn" data-act="cancel" style="min-width:120px;">${esc(cancelText)}</button>
          <button class="offline-btn" data-act="confirm" style="min-width:120px; ${btnStyle}">${esc(confirmText)}</button>
        </div>
      `,
      onClose: onCancel
    });

    modal.querySelector('[data-act="cancel"]')?.addEventListener('click', () => {
      try { modal.remove(); } catch {}
      if (typeof onCancel === 'function') onCancel();
    });

    modal.querySelector('[data-act="confirm"]')?.addEventListener('click', () => {
      try { modal.remove(); } catch {}
      if (typeof onConfirm === 'function') onConfirm();
    });

    return modal;
  }

  /**
   * Генератор строки кнопок
   * @param {Array} buttons - [{ act, text, className, style }]
   * @returns {string} HTML
   */
  function actionRow(buttons = []) {
    if (!Array.isArray(buttons) || !buttons.length) return '';

    const btns = buttons.map(b => {
      const act = esc(b.act || '');
      const text = esc(b.text || 'Кнопка');
      const cls = b.className || '';
      const style = b.style || '';
      return `<button class="offline-btn ${cls}" data-act="${act}" style="${style}">${text}</button>`;
    }).join('');

    return `<div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap; margin-top:16px;">${btns}</div>`;
  }

  // Публичный API
  window.Modals = {
    open,
    confirm,
    actionRow
  };

  console.log('✅ Modals helper loaded');
})();
