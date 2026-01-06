//=================================================
// FILE: scripts/ui/modal-templates.js
// Единый шаблон всех модалок (кроме Lyrics). Сокращает код в 10+ раз.
(() => {
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.innerHTML = `<div class="vr-modal"></div>`;
  document.body.appendChild(modalOverlay);

  const modalContent = modalOverlay.querySelector('.vr-modal');

  const closeModal = () => {
    modalOverlay.classList.remove('show');
    document.body.style.overflow = '';
  };

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  window.Modal = {
    open({ title = '', content = '', buttons = [], onClose = () => {} }) {
      modalContent.innerHTML = '';

      if (title) {
        const titleEl = document.createElement('h2');
        titleEl.className = 'vr-modal__title';
        titleEl.textContent = title;
        modalContent.appendChild(titleEl);
      }

      const closeBtn = document.createElement('button');
      closeBtn.className = 'vr-modal__close';
      closeBtn.innerHTML = '✕';
      closeBtn.onclick = () => {
        closeModal();
        onClose();
      };
      modalContent.appendChild(closeBtn);

      if (typeof content === 'string') {
        const cnt = document.createElement('div');
        cnt.innerHTML = content;
        modalContent.appendChild(cnt);
      } else if (content) {
        modalContent.appendChild(content);
      }

      if (buttons.length) {
        const row = document.createElement('div');
        row.className = 'vr-modal__btnRow';
        buttons.forEach(btn => {
          const b = document.createElement('button');
          b.className = 'offline-btn'; // переиспользуем стиль
          b.textContent = btn.text;
          b.style.background = btn.danger ? '#ff3333' : '#E80100';
          b.onclick = () => {
            btn.action();
            if (!btn.noClose) closeModal();
          };
          row.appendChild(b);
        });
        modalContent.appendChild(row);
      }

      modalOverlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    },
    close: closeModal
  };
})();
