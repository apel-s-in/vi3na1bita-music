// scripts/ui/modals.js
// Минимальный модальный helper для window.Modals.
// Нужен для offline-modal.js, navigation.js, lyrics-modal.js, sysinfo.js, favorites-data.js.
// Инвариант: не трогаем воспроизведение.

(function () {
  'use strict';

  const U = window.Utils;

  const esc = (s) => {
    const fn = U?.escapeHtml;
    return typeof fn === 'function' ? fn(String(s ?? '')) : String(s ?? '');
  };

  function ensureContainer() {
    let c = document.getElementById('modals-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'modals-container';
      document.body.appendChild(c);
    }
    return c;
  }

  function open(opts = {}) {
    const title = String(opts.title || '');
    const bodyHtml = String(opts.bodyHtml || '');
    const maxWidth = Number(opts.maxWidth || 520) || 520;

    const bg = document.createElement('div');
    bg.className = 'modal-bg active';

    const box = document.createElement('div');
    box.className = 'modal-feedback';
    box.style.maxWidth = `${maxWidth}px`;

    box.innerHTML = `
      <button class="bigclose" type="button" aria-label="Закрыть">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4z"/>
        </svg>
      </button>
      ${title ? `<h2>${esc(title)}</h2>` : ''}
      <div class="modal-body">${bodyHtml}</div>
    `;

    bg.appendChild(box);
    ensureContainer().appendChild(bg);

    const close = () => {
      try { opts.onClose?.(); } catch {}
      try { bg.remove(); } catch {}
    };

    bg.addEventListener('click', (e) => {
      if (e.target === bg) close();
    });

    box.querySelector('.bigclose')?.addEventListener('click', close);

    // ESC
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        window.removeEventListener('keydown', onKey);
        close();
      }
    };
    window.addEventListener('keydown', onKey);

    // Возвращаем элемент модалки (как у тебя ожидается)
    bg.remove = ((orig) => () => {
      window.removeEventListener('keydown', onKey);
      orig.call(bg);
    })(bg.remove);

    return bg;
  }

  function actionRow(actions = []) {
    const arr = Array.isArray(actions) ? actions : [];
    return `
      <div class="om-actions">
        ${arr.map((a) => {
          const act = esc(a?.act || '');
          const text = esc(a?.text || '');
          const cls = esc(a?.className || '');
          const style = esc(a?.style || '');
          return `<button type="button" class="modal-action-btn ${cls}" data-act="${act}" style="${style}">${text}</button>`;
        }).join('')}
      </div>
    `;
  }

  function confirm(opts = {}) {
    const title = String(opts.title || 'Подтвердите');
    const textHtml = String(opts.textHtml || '');
    const confirmText = String(opts.confirmText || 'Ок');
    const cancelText = String(opts.cancelText || 'Отмена');

    const modal = open({
      title,
      maxWidth: Number(opts.maxWidth || 460) || 460,
      bodyHtml: `
        <div style="color:#9db7dd; line-height:1.45; margin-bottom:14px;">
          ${textHtml}
        </div>
        ${actionRow([
          { act: 'cancel', text: cancelText, className: '', style: 'min-width:130px;' },
          { act: 'confirm', text: confirmText, className: 'online', style: 'min-width:130px;' }
        ])}
      `,
      onClose: opts.onClose
    });

    modal.querySelector('[data-act="cancel"]')?.addEventListener('click', () => {
      try { opts.onCancel?.(); } catch {}
      try { modal.remove(); } catch {}
    });

    modal.querySelector('[data-act="confirm"]')?.addEventListener('click', () => {
      try { opts.onConfirm?.(); } catch {}
      try { modal.remove(); } catch {}
    });

    return modal;
  }

  window.Modals = window.Modals || {};
  window.Modals.open = open;
  window.Modals.confirm = confirm;
  window.Modals.actionRow = actionRow;

  // bridge: offlineBody берём из ModalTemplates, если есть
  Object.defineProperty(window.Modals, 'offlineBody', {
    configurable: true,
    get() {
      const fn = window.ModalTemplates?.offlineBody;
      return (typeof fn === 'function') ? fn : null;
    }
  });
})();
