/**
 * r3-modal.js — Модалка подтверждения включения режима R3 (100% OFFLINE).
 *
 * Показывается когда все треки загружены и система готова к полному офлайну.
 * Кнопки:
 *   - «ОК (включить)» → переход в R3
 *   - «Не сейчас»     → остаёмся в текущем режиме
 *
 * Использование:
 *   import { showR3Modal } from './r3-modal.js';
 *   const accepted = await showR3Modal({ totalTracks: 42 });
 *
 * Зависимости:
 *   - window.Modals (scripts/ui/modals.js) — если доступен
 *   - Fallback на собственный DOM если Modals нет
 */

const MODAL_ID = 'r3-modal';

/* ═══════════════════════════════════════════
   Разметка
   ═══════════════════════════════════════════ */

function buildHTML(totalTracks) {
  return `
    <div class="r3-modal-overlay" id="${MODAL_ID}">
      <div class="r3-modal-box">
        <div class="r3-modal-icon">✅</div>
        <h3 class="r3-modal-title">100% OFFLINE готов</h3>
        <p class="r3-modal-text">
          Все ${totalTracks} треков загружены и доступны без интернета.
          Включить полный офлайн-режим?
        </p>
        <p class="r3-modal-hint">
          В этом режиме приложение не будет обращаться к сети для воспроизведения.
        </p>
        <div class="r3-modal-actions">
          <button class="r3-btn r3-btn--confirm" data-action="confirm">
            ✅ ОК, включить
          </button>
          <button class="r3-btn r3-btn--dismiss" data-action="dismiss">
            Не сейчас
          </button>
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
    .r3-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      animation: r3-fadeIn 0.25s ease;
    }

    @keyframes r3-fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .r3-modal-box {
      background: #1a1a2e;
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 16px;
      padding: 28px 24px;
      max-width: 360px;
      width: 90%;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }

    .r3-modal-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }

    .r3-modal-title {
      color: #10b981;
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 10px;
    }

    .r3-modal-text {
      color: rgba(255, 255, 255, 0.8);
      font-size: 14px;
      margin: 0 0 8px;
      line-height: 1.5;
    }

    .r3-modal-hint {
      color: rgba(255, 255, 255, 0.4);
      font-size: 12px;
      margin: 0 0 20px;
      line-height: 1.4;
    }

    .r3-modal-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .r3-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 13px 16px;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: transform 0.1s, opacity 0.15s;
    }

    .r3-btn:active {
      transform: scale(0.97);
    }

    .r3-btn--confirm {
      background: rgba(16, 185, 129, 0.85);
      color: #fff;
    }

    .r3-btn--confirm:hover {
      background: rgba(16, 185, 129, 1);
    }

    .r3-btn--dismiss {
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.6);
    }

    .r3-btn--dismiss:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }
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
 * Показать модалку подтверждения R3.
 *
 * @param {Object} opts
 * @param {number} opts.totalTracks — количество загруженных треков
 * @returns {Promise<boolean>} true — пользователь согласился, false — отклонил
 */
export function showR3Modal({ totalTracks = 0 } = {}) {
  injectStyles();
  removeModal();

  // Пробуем стилизованный Modals если доступен
  if (window.Modals && typeof window.Modals.confirm === 'function') {
    return window.Modals.confirm(
      `100% OFFLINE готов!\n\nВсе ${totalTracks} треков загружены и доступны без интернета.\nВключить полный офлайн-режим?`,
      {
        title: '✅ 100% OFFLINE готов',
        ok: 'ОК, включить',
        cancel: 'Не сейчас'
      }
    );
  }

  // Fallback на собственную модалку
  return new Promise((resolve) => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildHTML(totalTracks);
    const overlay = wrapper.firstElementChild;
    document.body.appendChild(overlay);

    function handleClick(e) {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      cleanup();
      resolve(action === 'confirm');
    }

    function cleanup() {
      overlay.removeEventListener('click', handleClick);
      removeModal();
    }

    overlay.addEventListener('click', handleClick);
  });
}
