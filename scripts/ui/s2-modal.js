/**
 * s2-modal.js — Модалка сценария S2: потеря сети во время воспроизведения.
 *
 * Показывается после 10 сек ожидания (S1) если сеть не вернулась.
 * Предлагает пользователю:
 *   - «Ждать»   → S3-wait (бесконечное ожидание сети)
 *   - «Пропустить» → skip (PlayerCore переходит к следующему треку)
 *   - «К офлайн-треку» → S3-FOQ (переход к закэшированному треку)
 *       (доступно только в R2/R3)
 *
 * Экспорт:
 *   showS2Modal({ uid, hasFOQ }) → Promise<'wait'|'skip'|'foq'>
 *
 * Зависимости:
 *   - window.Modals (scripts/ui/modals.js) — если доступен
 *   - Fallback на собственный DOM если Modals нет
 */

const MODAL_ID = 's2-modal';

/* ═══════════════════════════════════════════
   Разметка
   ═══════════════════════════════════════════ */

function buildHTML(hasFOQ) {
  const foqBtn = hasFOQ
    ? `<button class="s2-btn s2-btn--foq" data-action="foq">
         📂 К офлайн-треку
       </button>`
    : '';

  return `
    <div class="s2-modal-overlay" id="${MODAL_ID}">
      <div class="s2-modal-box">
        <div class="s2-modal-icon">📡</div>
        <h3 class="s2-modal-title">Нет подключения к сети</h3>
        <p class="s2-modal-text">
          Не удалось загрузить трек. Что хотите сделать?
        </p>
        <div class="s2-modal-actions">
          <button class="s2-btn s2-btn--wait" data-action="wait">
            ⏳ Ждать сеть
          </button>
          <button class="s2-btn s2-btn--skip" data-action="skip">
            ⏭ Пропустить
          </button>
          ${foqBtn}
        </div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════
   Стили (инжектируются один раз)
   ═══════════════════════════════════════════ */

let _stylesInjected = false;

function injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;

  const css = `
    .s2-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      animation: s2-fadeIn 0.2s ease;
    }

    @keyframes s2-fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .s2-modal-box {
      background: #1a1a2e;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 28px 24px;
      max-width: 340px;
      width: 90%;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }

    .s2-modal-icon {
      font-size: 40px;
      margin-bottom: 12px;
    }

    .s2-modal-title {
      color: #fff;
      font-size: 18px;
      font-weight: 600;
      margin: 0 0 8px;
    }

    .s2-modal-text {
      color: rgba(255, 255, 255, 0.6);
      font-size: 14px;
      margin: 0 0 20px;
      line-height: 1.4;
    }

    .s2-modal-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .s2-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 16px;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: transform 0.1s, opacity 0.15s;
    }

    .s2-btn:active {
      transform: scale(0.97);
    }

    .s2-btn--wait {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }

    .s2-btn--skip {
      background: rgba(99, 102, 241, 0.8);
      color: #fff;
    }

    .s2-btn--foq {
      background: rgba(16, 185, 129, 0.8);
      color: #fff;
    }

    .s2-btn--wait:hover { background: rgba(255, 255, 255, 0.15); }
    .s2-btn--skip:hover { background: rgba(99, 102, 241, 1); }
    .s2-btn--foq:hover  { background: rgba(16, 185, 129, 1); }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

/* ═══════════════════════════════════════════
   Показ / скрытие
   ═══════════════════════════════════════════ */

function removeModal() {
  const el = document.getElementById(MODAL_ID);
  if (el) el.remove();
}

/**
 * Показать модалку S2.
 *
 * @param {Object} opts
 * @param {string} opts.uid    — uid текущего трека
 * @param {boolean} opts.hasFOQ — показывать кнопку «К офлайн-треку»
 * @returns {Promise<'wait'|'skip'|'foq'>}
 */
export function showS2Modal({ uid, hasFOQ = false } = {}) {
  injectStyles();
  removeModal();

  return new Promise((resolve) => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildHTML(hasFOQ);
    const overlay = wrapper.firstElementChild;
    document.body.appendChild(overlay);

    function handleClick(e) {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      cleanup();
      resolve(action);
    }

    function handleOnline() {
      cleanup();
      resolve('wait');
    }

    function cleanup() {
      overlay.removeEventListener('click', handleClick);
      window.removeEventListener('online', handleOnline);
      removeModal();
    }

    overlay.addEventListener('click', handleClick);
    window.addEventListener('online', handleOnline, { once: true });
  });
}
